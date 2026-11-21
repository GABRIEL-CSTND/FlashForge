'use client';

import { useEffect, useRef, useState } from 'react';
import MakeCard from '@/components/make/MakeCard';
import NotesSheet from '@/components/make/NotesSheet';
import { useUser } from '@/lib/auth';
import { guideForm, guideSourceProblem, requestGuide } from '@/lib/guide-request';
import { isUuid } from '@/lib/ids';
import { toLiveCards, type DeckCard, type DeckInfo, type LiveDeck } from '@/lib/live-game';
import { shrinkImage } from '@/lib/shrink-image';
import { detectSource, fileKind, isPhoto, pickedFileProblem, type SourceKind } from '@/lib/sources';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_QUESTION_COUNT,
  isStudyType,
  STUDY_TYPE_LABELS,
  type Difficulty,
  type StudyType,
} from '@/lib/study-types';
import { supabase } from '@/lib/supabase';

type Tab = 'new' | 'sets' | 'history';
interface SavedDeck {
  id: string;
  title: string;
  studyType: StudyType;
  count: number | null;
}

// A deck picked before the room opened: "Play live with friends" on a set's page.
export type Preselect = { kind: 'set' | 'guide'; id: string } | null;

// What players are told about where the deck came from.
export const sourceNote = (source: DeckInfo['source']) =>
  source === 'new'
    ? 'A new deck, made for this game: nobody has seen the cards, the host included.'
    : 'From the host’s saved decks: the host may know the answers.';

async function loadSet(id: string): Promise<LiveDeck | null> {
  if (!isUuid(id)) return null;
  const [{ data: set }, { data: cards }] = await Promise.all([
    supabase.from('flashcard_sets').select('title, study_type').eq('id', id).maybeSingle(),
    supabase.from('flashcards').select('question, answer, options, explanation, position').eq('set_id', id).order('position'),
  ]);
  if (!set || !cards || !isStudyType(set.study_type)) return null;
  const live = toLiveCards(set.study_type, cards as DeckCard[]);
  return live.length ? { title: set.title, studyType: set.study_type, source: 'saved', cards: live } : null;
}

async function loadGuide(id: string): Promise<LiveDeck | null> {
  if (!isUuid(id)) return null;
  const { data } = await supabase.from('guide_history').select('title, study_type, items').eq('id', id).maybeSingle();
  if (!data || !isStudyType(data.study_type) || !Array.isArray(data.items)) return null;
  const live = toLiveCards(data.study_type, data.items as DeckCard[]);
  return live.length ? { title: data.title, studyType: data.study_type, source: 'saved', cards: live } : null;
}

// Where the host's deck comes from (#26): a new one made right here in the
// lobby, exactly as on the home page, or one from their My Sets or History.
// A new deck's cards are never shown, only how many there are, so the host
// can play it fairly.
export default function DeckPicker({
  deck,
  making,
  preselect,
  onDeck,
  onMaking,
}: {
  deck: DeckInfo | null;
  making: { done: number; total: number } | null;
  preselect: Preselect;
  onDeck: (deck: LiveDeck | null) => void;
  onMaking: (making: { done: number; total: number } | null) => void;
}) {
  const { user, loading: userLoading } = useUser();
  const [tab, setTab] = useState<Tab>('new');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [asNotes, setAsNotes] = useState(false);
  const [studyType, setStudyType] = useState<StudyType>('multiple_choice');
  const [count, setCount] = useState<number>(DEFAULT_QUESTION_COUNT);
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<{ tab: Tab; decks: SavedDeck[] } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const preselected = useRef(false);

  // A deck picked on a set's page is loaded as the room opens.
  useEffect(() => {
    if (!preselect || preselected.current || deck) return;
    preselected.current = true;
    void (preselect.kind === 'set' ? loadSet(preselect.id) : loadGuide(preselect.id)).then((loaded) => {
      if (loaded) onDeck(loaded);
      else setError("We couldn't open that deck. Pick one below.");
    });
  }, [preselect, deck, onDeck]);

  // My Sets and History are read when their tab opens.
  useEffect(() => {
    if (tab === 'new' || !user || saved?.tab === tab) return;
    let stale = false;
    const read =
      tab === 'sets'
        ? supabase.from('flashcard_sets').select('id, title, study_type').eq('user_id', user.id).order('created_at', { ascending: false })
        : supabase
            .from('guide_history')
            .select('id, title, study_type, item_count')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
    void read.then(({ data, error: failed }) => {
      if (stale) return;
      if (failed) {
        setError("We couldn't load your decks. Try again in a moment.");
        return;
      }
      const decks = ((data ?? []) as { id: string; title: string; study_type: string; item_count?: number | null }[])
        .filter((d) => isStudyType(d.study_type))
        .map((d) => ({ id: d.id, title: d.title, studyType: d.study_type as StudyType, count: d.item_count ?? null }));
      setSaved({ tab, decks });
    });
    return () => {
      stale = true;
    };
  }, [tab, user, saved]);

  // Cancels a deck still being made when the room closes.
  useEffect(() => () => abort.current?.abort(), []);

  const typedSource = asNotes ? 'text' : detectSource(notes);
  const source: SourceKind | null = file ? 'file' : typedSource;

  const pickFile = async (chosen: File) => {
    let f = chosen;
    if (isPhoto(fileKind(chosen.name, chosen.type))) {
      try {
        f = await shrinkImage(chosen);
      } catch {
        setError("We couldn't open this photo. Try a JPG or PNG.");
        return;
      }
    }
    const problem = pickedFileProblem(f.name, f.type, f.size);
    setError(problem ?? '');
    if (!problem) setFile(f);
  };

  const make = async () => {
    if (!source) return;
    const what = { kind: source, notes, file };
    const problem = guideSourceProblem(what);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setNote('');
    onMaking({ done: 0, total: count });
    const made = await guideForm(what, { studyType, count, difficulty });
    if (made.kind === 'problem') {
      onMaking(null);
      setError(made.message);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    const outcome = await requestGuide(made.form, {
      signal: controller.signal,
      cards: (guide) => onMaking({ done: guide.items.length, total: count }),
    });
    abort.current = null;
    if (controller.signal.aborted) return;
    const guide = outcome.ok ? outcome.guide : outcome.partial;
    const cards = guide ? toLiveCards(guide.studyType, guide.items) : [];
    if (!guide || cards.length === 0) {
      onMaking(null);
      setError(outcome.ok ? 'The deck came back empty. Try again.' : outcome.message);
      return;
    }
    onDeck({ title: guide.title, studyType: guide.studyType, source: 'new', cards });
    if (!outcome.ok) setNote(`The AI stopped early, so the deck has ${cards.length} questions.`);
  };

  const stop = () => {
    abort.current?.abort();
    abort.current = null;
    onMaking(null);
  };

  const pickSaved = async (d: SavedDeck) => {
    setOpening(d.id);
    setError('');
    const loaded = tab === 'sets' ? await loadSet(d.id) : await loadGuide(d.id);
    setOpening(null);
    if (loaded) onDeck(loaded);
    else setError("We couldn't open that deck. Try another one.");
  };

  const card = 'paper paper-shadow rounded-md px-6 py-5 text-ink';

  if (making) {
    return (
      <section aria-label="The deck" className={`${card} space-y-3`}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">The deck</p>
        <p className="font-serif text-2xl">Making a new deck…</p>
        <p className="text-[15px] text-muted" role="status">
          {making.done > 0 ? `${making.done} of ${making.total} questions written.` : 'The AI is reading and writing.'} You won&apos;t see them
          until they come up in the game.
        </p>
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-brass transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${Math.max(4, (making.done / Math.max(1, making.total)) * 100)}%` }}
          />
        </div>
        <button type="button" onClick={stop} className="text-sm font-semibold text-muted hover:underline">
          Stop making it
        </button>
      </section>
    );
  }

  if (deck) {
    return (
      <section aria-label="The deck" className={`${card} space-y-2 lg:rotate-[0.6deg]`}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">The deck is ready</p>
        <p className="font-serif text-2xl leading-tight">{deck.title}</p>
        <p className="text-[15px] text-muted">
          {deck.count} {deck.count === 1 ? 'question' : 'questions'} · {STUDY_TYPE_LABELS[deck.studyType]}
        </p>
        <p className="text-[14.5px] text-ink/80">{sourceNote(deck.source)}</p>
        {note && <p className="text-sm text-pencil">{note}</p>}
        <button
          type="button"
          onClick={() => {
            setNote('');
            onDeck(null);
          }}
          className="text-sm font-semibold text-brass-ink hover:underline"
        >
          Pick another deck
        </button>
      </section>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'new', label: 'Make a new one' },
    { id: 'sets', label: 'My Sets' },
    { id: 'history', label: 'History' },
  ];
  const signedOut = !userLoading && !user;
  const list = saved?.tab === tab ? saved.decks : null;

  return (
    <section aria-labelledby="deck-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="deck-heading" className="text-xs font-semibold uppercase tracking-[0.16em] text-on-desk/80">
          Pick the deck
        </h2>
        <div role="tablist" aria-label="Where the deck comes from" className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setError('');
              }}
              className={`min-h-9 rounded-full px-3.5 text-sm font-semibold ${tab === t.id ? 'brass' : 'brass-ring'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'new' ? (
        <div className="space-y-5" role="tabpanel" aria-label="Make a new one">
          <p className="text-[14.5px] text-on-desk/85">Nobody sees the cards before they come up, you included, so you can play too.</p>
          <div className="paper-shadow rounded-md">
            <NotesSheet
              text={notes}
              onText={(text) => {
                setNotes(text);
                if (!text.trim()) setAsNotes(false);
                setError('');
              }}
              file={file}
              onFile={pickFile}
              onRemoveFile={() => setFile(null)}
              detected={detectSource(notes)}
              asNotes={asNotes}
              onAsNotes={setAsNotes}
              disabled={false}
            />
          </div>
          <MakeCard
            count={count}
            onCount={setCount}
            difficulty={difficulty}
            onDifficulty={setDifficulty}
            studyType={studyType}
            onStudyType={setStudyType}
            sourceLine={
              file
                ? `from ${file.name}`
                : source === 'topic'
                  ? `about “${notes.trim()}”`
                  : source === 'link'
                    ? 'from the web page you linked'
                    : source === 'text'
                      ? 'from the notes on the sheet'
                      : 'Put your notes, a link or a topic on the sheet first.'
            }
            canMake={source !== null}
            making={false}
            onMake={make}
            waitNote=""
            error={error}
          />
        </div>
      ) : (
        <div role="tabpanel" aria-label={tab === 'sets' ? 'My Sets' : 'History'} className={`${card} space-y-3`}>
          {signedOut ? (
            <p className="text-[15px] text-muted">Sign in to play one of your saved decks.</p>
          ) : !list ? (
            <p className="text-[15px] text-muted">{error || 'Loading your decks…'}</p>
          ) : list.length === 0 ? (
            <p className="text-[15px] text-muted">{tab === 'sets' ? 'No saved sets yet.' : 'No guides in your History yet.'}</p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {list.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => pickSaved(d)}
                    disabled={opening !== null}
                    className="flex w-full items-baseline justify-between gap-3 rounded-md border border-ink/15 px-3.5 py-2.5 text-left hover:border-brass disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1 truncate font-serif text-lg">{d.title}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {opening === d.id ? 'Opening…' : `${d.count ? `${d.count} · ` : ''}${STUDY_TYPE_LABELS[d.studyType]}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list && error && (
            <p role="alert" className="text-sm text-pencil">
              {error}
            </p>
          )}
          <p className="text-[13.5px] text-muted">Players are told you may already know these answers.</p>
        </div>
      )}
    </section>
  );
}
