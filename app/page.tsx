'use client';

import { startTransition, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser, signInWithGoogle } from '@/lib/auth';
import StudyViewer, { StudyItem } from '@/components/StudyViewer';
import { generateErrorText } from '@/lib/generation-limits';
import GenerationProgress from '@/components/GenerationProgress';
import NotesSheet from '@/components/make/NotesSheet';
import MakeCard, { DECK_WORDS } from '@/components/make/MakeCard';
import MakingDeck from '@/components/make/MakingDeck';
import DeskTurn from '@/components/desk/DeskTurn';
import DeckSpread from '@/components/make/DeckSpread';
import { nextProgress, PROGRESS_MIME, readGeneration, START_PROGRESS, type ProgressState } from '@/lib/generation-progress';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_QUESTION_COUNT,
  DIFFICULTY_LABELS,
  STUDY_TYPE_LABELS,
  type Difficulty,
  type StudyType,
} from '@/lib/study-types';
import { shrinkImage } from '@/lib/shrink-image';
import { keepPendingGuide, pendingGuideJson, serverPendingGuideJson, subscribePendingGuide } from '@/lib/pending-guide';
import { planPdfUpload } from '@/lib/prepare-pdf';
import {
  detectSource,
  fileKind,
  isPhoto,
  linkFromInput,
  linkProblem,
  pastedTextProblem,
  pickedFileProblem,
  quoteSourceLabel,
  topicProblem,
  type SourceKind,
} from '@/lib/sources';

interface GeneratedResult {
  title: string;
  // Null for pasted notes (#70).
  sourceFilename: string | null;
  // Credit for a web page or a topic's Wikipedia article (#79).
  source?: { name: string; url: string } | null;
  studyType: StudyType;
  items: StudyItem[];
  // Its entry in History (/history); null or missing when made signed out.
  historyId?: string | null;
}

// The guide kept across the sign-in redirect (lib/pending-guide.ts), or null when
// there is none or it can't be read.
function parsePendingGuide(json: string | null): GeneratedResult | null {
  if (!json) return null;
  try {
    const guide = JSON.parse(json);
    return guide && Array.isArray(guide.items) ? guide : null;
  } catch {
    return null;
  }
}

// How long between one new card and the next landing on the desk while the AI
// sends them.
const CARD_GAP_MS = 300;
// Gemini normally writes 10 questions in under ~12s; longer usually means the
// Gemma backup. Bigger guides (#65) take longer, so wait a second more for
// each question over 10.
const slowNoticeMs = (count: number) => 15_000 + Math.max(0, count - DEFAULT_QUESTION_COUNT) * 1_000;

// The home page is the desk where a deck is made (desk redesign, phase 3): the
// notes sheet takes a file, notes, a link or a topic; the "Make me …" card says
// how many cards, how hard and what kind; the new cards land in a spread; and
// Start studying gathers them into the deck on the study desk.
export default function UploadPage() {
  const router = useRouter();
  const { user } = useUser();
  const [file, setFile] = useState<File | null>(null);
  // Whatever is typed on the notes sheet: notes, a link or a topic.
  const [notes, setNotes] = useState('');
  // The student said to use the typed text as notes, whatever it looks like.
  const [asNotes, setAsNotes] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [studyType, setStudyType] = useState<StudyType>('flashcard');
  const [count, setCount] = useState<number>(DEFAULT_QUESTION_COUNT);
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  // The guide just made here, or else one made before signing in to save it,
  // brought back after the Google redirect reloaded the page.
  const [generated, setGenerated] = useState<GeneratedResult | null>(null);
  const pendingJson = useSyncExternalStore(subscribePendingGuide, pendingGuideJson, serverPendingGuideJson);
  const pending = useMemo(() => parsePendingGuide(pendingJson), [pendingJson]);
  const result = generated ?? pending;
  // The first cards, while the AI is still writing the rest. They can be studied
  // right away, and the study desk takes each new card as it arrives; `generated`
  // replaces them when the whole deck is ready.
  const [live, setLive] = useState<GeneratedResult | null>(null);
  // Cards the AI sends while it writes are put on the desk one at a time (`shown` so
  // far). A deck that arrives whole, or comes back after signing in, is all there
  // at once, and DeckSpread lays it out.
  const [paced, setPaced] = useState(false);
  const [shown, setShown] = useState(0);
  // Changes when the finished deck is not the one that was on the desk (the AI had
  // to start again), so the study desk starts over with the new cards.
  const [batchNo, setBatchNo] = useState(0);
  // The AI stopped before the end, so the deck is what had been written by then.
  const [cutShort, setCutShort] = useState(false);
  // Which generation is current, so one the student has left is ignored.
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // A new deck lies in a spread until Start studying.
  const [view, setView] = useState<'spread' | 'study'>('spread');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'needs-auth'>('idle');
  const [slowGeneration, setSlowGeneration] = useState(false);
  const [progress, setProgress] = useState<ProgressState>(START_PROGRESS);
  // How far the browser has got reading a PDF (#44); null when it isn't.
  const [pdfRead, setPdfRead] = useState<{ done: number; total: number } | null>(null);

  const validateAndSetFile = async (chosen: File) => {
    // Photos (#72) are shrunk first, so a big phone photo still fits.
    let f = chosen;
    if (isPhoto(fileKind(chosen.name, chosen.type))) {
      try {
        f = await shrinkImage(chosen);
      } catch {
        setErrorMsg("We couldn't open this photo. Try a JPG or PNG.");
        setStatus('error');
        return;
      }
    }
    // A big PDF is fine (#44): it is read here and only its text is sent.
    const problem = pickedFileProblem(f.name, f.type, f.size);
    if (problem) {
      setErrorMsg(problem);
      setStatus('error');
      return;
    }
    setErrorMsg('');
    setStatus('idle');
    setFile(f);
  };

  const editNotes = (text: string) => {
    setNotes(text);
    if (!text.trim()) setAsNotes(false);
    if (status === 'error') {
      setErrorMsg('');
      setStatus('idle');
    }
  };

  // What the deck is made from: the file on the sheet, or what the typed text
  // looks like (lib/sources.ts detectSource), unless the student switched it.
  const typed = asNotes ? 'text' : detectSource(notes);
  const source: SourceKind | null = file ? 'file' : typed;
  const sendingPhoto = source === 'file' && file !== null && isPhoto(fileKind(file.name, file.type));

  const handleSubmit = async () => {
    if (!source) return;
    // Notes (#70), links (#74) and topics (#79) are checked here, before anything is sent.
    const problem =
      source === 'text'
        ? pastedTextProblem(notes)
        : source === 'link'
          ? linkProblem(linkFromInput(notes))
          : source === 'topic'
            ? topicProblem(notes)
            : null;
    if (problem) {
      setErrorMsg(problem);
      setStatus('error');
      return;
    }
    // The notes sheet turns into the deck being made, and the new cards (or the
    // notes sheet again, with the problem) turn in after it (DeskTurn).
    const fail = (message: string) =>
      startTransition(() => {
        setErrorMsg(message);
        setStatus('error');
      });
    const run = ++runRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    startTransition(() => {
      setStatus('generating');
      setProgress(START_PROGRESS);
      setPdfRead(null);
      setErrorMsg('');
      setLive(null);
      setPaced(false);
      setShown(0);
      setCutShort(false);
      setView('spread');
    });
    // The first cards sent while the AI is still writing; the rest of the deck follows.
    const previewed: { current: GeneratedResult | null } = { current: null };

    const formData = new FormData();
    if (source === 'file' && file && fileKind(file.name, file.type) === 'pdf') {
      // A PDF is read here, in the browser, and only its text is sent (#44): a big
      // lecture file can't fail the request-size limit or take long to upload.
      // Opening a big PDF takes a moment before the first page is counted.
      setPdfRead({ done: 0, total: 0 });
      const plan = await planPdfUpload(file, (done, total) => setPdfRead({ done, total }));
      if (plan.kind === 'problem') {
        setPdfRead(null);
        fail(plan.message);
        return;
      }
      if (plan.kind === 'pages') {
        formData.append('pages', JSON.stringify(plan.pages));
        formData.append('fileName', file.name);
      } else {
        // Scanned, or not readable here: the server reads the file itself.
        setPdfRead(null);
        formData.append('file', file);
      }
    } else if (source === 'file') formData.append('file', file!);
    else if (source === 'text') formData.append('text', notes);
    else if (source === 'link') formData.append('url', linkFromInput(notes));
    else formData.append('topic', notes.trim());
    formData.append('studyType', studyType);
    formData.append('count', String(count));
    formData.append('difficulty', difficulty);

    // Past this point the main AI is probably out of quota and the slower
    // backup model is answering, so tell the user it can take up to a minute.
    // Photos (#72) take longer to read anyway.
    const slowTimer = setTimeout(() => setSlowGeneration(true), slowNoticeMs(count) + (sendingPhoto ? 15_000 : 0));
    let outcome: { status: number; body: Record<string, unknown> };
    let unreachable = false;
    try {
      // When signed in, send the session token so the usage log (#62) knows who
      // generated it. Generating still works signed out.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        // Asking for progress: the server then reports each step as it starts.
        headers: { Accept: PROGRESS_MIME, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      // The answer arrives step by step, so this keeps going until the guide is ready.
      // The first cards come along the way, so they can be studied while it does.
      outcome = await readGeneration(
        res,
        (step) => setProgress((p) => nextProgress(p, step)),
        (event) => {
          if (runRef.current !== run) return;
          const cards: GeneratedResult = {
            title: event.title,
            sourceFilename: event.sourceFilename,
            source: event.source,
            studyType: event.studyType as StudyType,
            items: event.items as unknown as StudyItem[],
          };
          const first = previewed.current === null;
          previewed.current = cards;
          // The first cards turn the deck being made into the spread (DeskTurn).
          startTransition(() => {
            setLive(cards);
            if (first) {
              setPaced(true);
              setShown(1);
            }
          });
        }
      );
    } catch {
      unreachable = true;
      outcome = { status: 0, body: {} };
    } finally {
      clearTimeout(slowTimer);
      setSlowGeneration(false);
      setPdfRead(null);
    }
    // The student left while this was running.
    if (runRef.current !== run) return;

    if (outcome.status < 200 || outcome.status >= 300) {
      // Cards already on the desk stay: the deck is just shorter than planned.
      const kept = previewed.current;
      if (kept) {
        startTransition(() => {
          setGenerated(kept);
          setLive(null);
          setCutShort(true);
          setStatus('idle');
        });
        return;
      }
      fail(
        unreachable
          ? 'Could not reach the server. Check your connection and try again.'
          : generateErrorText(outcome.status, outcome.body)
      );
      return;
    }

    const final = outcome.body as unknown as GeneratedResult;
    // The deck the AI ended with starts with the cards already shown, unless it
    // had to start again; then the study desk starts over with the new deck.
    const before = previewed.current;
    const restarted =
      before !== null &&
      !before.items.every((card, i) => final.items[i]?.question === card.question && final.items[i]?.answer === card.answer);
    startTransition(() => {
      if (restarted) setBatchNo((k) => k + 1);
      setGenerated(final);
      setLive(null);
      setStatus('idle');
    });
  };

  const handleSave = async () => {
    if (!result) return;

    if (!user) {
      setSaveStatus('needs-auth');
      return;
    }

    setSaveStatus('saving');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch('/api/save-set', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        title: result.title,
        sourceFilename: result.sourceFilename,
        studyType: result.studyType,
        items: result.items,
        historyId: result.historyId ?? null,
      }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setSaveStatus('error');
      return;
    }

    // Hold on to it (a guide brought back after signing in, too) so the page
    // shows Saved until the set page opens.
    setGenerated(result);
    keepPendingGuide(null);
    setSaveStatus('saved');
    router.push(`/sets/${body.id}`);
  };

  // The study guide is rendered on this same page, so exiting means clearing it
  // rather than navigating to "/". A guide in History isn't lost by leaving it.
  const handleExit = () => {
    if (
      saveStatus !== 'saved' &&
      !result?.historyId &&
      !window.confirm("Leave this study guide? It hasn't been saved and will be lost.")
    ) {
      return;
    }
    // Stop a deck that is still being written; its answer is no longer wanted.
    runRef.current += 1;
    abortRef.current?.abort();
    setGenerated(null);
    keepPendingGuide(null);
    setLive(null);
    setPaced(false);
    setShown(0);
    setCutShort(false);
    setView('spread');
    setFile(null);
    setSaveStatus('idle');
    setStatus('idle');
    setErrorMsg('');
  };

  // A guide brought back after signing in to save it: once the user is signed
  // in, save it without making them click Save again. Once per page load; if it
  // fails, the Save button is there to try again.
  const autoSaveTried = useRef(false);
  useEffect(() => {
    if (!pending || generated || !user || autoSaveTried.current) return;
    autoSaveTried.current = true;
    handleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, generated, user]);

  // What is on the desk: the whole deck, or the first cards while the rest are written.
  // Cards arrive in quick bursts, so they are put on the desk one at a time, a
  // moment apart, and the count goes up 4, 5, 6… instead of jumping.
  const full = result ?? live;
  const target = full?.items.length ?? 0;
  useEffect(() => {
    if (!paced || shown >= target) return;
    const id = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 0 : CARD_GAP_MS);
    return () => clearTimeout(id);
  }, [paced, shown, target]);
  // A deck that arrived whole, or came back after signing in, is all there at once.
  const visible = paced ? Math.min(shown, target) : target;
  const deck = useMemo(
    () => (full && visible > 0 ? { ...full, items: full.items.slice(0, visible) } : null),
    [full, visible]
  );
  if (deck) {
    // Still being written, or still being put on the desk one card at a time.
    const writing = !result || visible < target;
    const startStudying = () => setView('study');
    const saveSlot = writing ? (
      <p className="text-center text-sm text-muted">
        The rest of the cards are still being written. You can save the deck when it is done.
      </p>
    ) : (
      <div className="text-center space-y-2">
        {cutShort && (
          <p className="text-xs text-pencil">
            We couldn&apos;t write the rest of your cards, so this deck has {deck.items.length}.
          </p>
        )}
        {deck.source && (
          <p className="text-xs text-muted">
            From{' '}
            <a href={deck.source.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              {deck.source.name}
            </a>
          </p>
        )}
        {saveStatus === 'saved' ? (
          <p className="text-sm text-green-800 font-medium">Saved ✓</p>
        ) : saveStatus === 'needs-auth' ? (
          <div className="space-y-2">
            <p className="text-sm text-brass-ink">Sign in to save this study guide.</p>
            <button
              onClick={() => {
                keepPendingGuide(JSON.stringify(result));
                signInWithGoogle();
              }}
              className="text-sm border rounded-lg px-4 py-2 font-medium hover:border-accent"
            >
              Sign in with Google
            </button>
          </div>
        ) : (
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="text-sm border rounded-lg px-4 py-2 font-medium hover:border-accent disabled:opacity-40"
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Save this study guide'}
          </button>
        )}
        {saveStatus === 'error' && <p className="text-xs text-pencil">Failed to save. Try again.</p>}
      </div>
    );
    // On the finish screen, if the student got through every card written so far.
    const continueSlot = writing ? (
      <p className="text-sm">More cards are still being written. They will show up here as soon as they are ready.</p>
    ) : null;

    if (view === 'study') {
      return (
        <StudyViewer
          key={batchNo}
          title={deck.title}
          studyType={deck.studyType}
          cards={deck.items}
          expected={writing ? count : undefined}
          onExit={handleExit}
          saveSlot={saveSlot}
          completionSlot={continueSlot}
          quoteLabel={quoteSourceLabel(deck.sourceFilename)}
        />
      );
    }

    const n = deck.items.length;
    return (
      <DeskTurn view="spread">
        <DeckSpread
          title={deck.title}
          meta={`${STUDY_TYPE_LABELS[deck.studyType] ?? 'Flashcards'} · ${writing && count > n ? `${n} of ${count} cards` : `${n} card${n === 1 ? '' : 's'}`}`}
          items={deck.items}
          onStart={startStudying}
          onExit={handleExit}
          saveSlot={saveSlot}
          savedToHistory={!!deck.historyId}
          writing={writing}
          expected={writing ? count : undefined}
        />
      </DeskTurn>
    );
  }

  const generating = status === 'generating';
  const sourceLine = file
    ? `from ${file.name}`
    : source === 'topic'
      ? `about “${notes.trim()}”`
      : source === 'link'
        ? 'from the web page you linked'
        : source === 'text'
          ? 'from the notes on the sheet'
          : 'Put your notes, a link or a topic on the sheet first.';
  const waitNote = sendingPhoto
    ? 'Reading a photo can take about 30 seconds.'
    : count > DEFAULT_QUESTION_COUNT
      ? `${count} cards can take about 30 seconds.`
      : 'This can take about 20 seconds.';

  // While the AI writes the guide: the deck being made, what it's making, and
  // the steps so far (GenerationProgress, which screen readers follow).
  if (generating) {
    return (
      <DeskTurn view="making">
        <main className="on-desk w-full pb-10 pt-4 sm:pt-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <MakingDeck label={studyType === 'flashcard' ? 'Clue' : STUDY_TYPE_LABELS[studyType]} />
            <div className="max-w-xl">
              <h1 className="text-[28px] font-normal leading-tight text-[#f3ecdd]">
                Making {count} {DIFFICULTY_LABELS[difficulty].toLowerCase()} {DECK_WORDS[studyType]}
              </h1>
              <p className="mt-1 break-words text-[14.5px] text-on-desk/85">{sourceLine}</p>
              <p className="mt-0.5 text-[13px] text-on-desk/80">{waitNote}</p>
            </div>
            {source && (
              <div className="w-full max-w-sm text-left">
                <GenerationProgress progress={progress} source={source} photo={sendingPhoto} pdfRead={pdfRead} />
              </div>
            )}
            {slowGeneration && progress.attempt <= 1 && (
              <p className="max-w-sm text-sm text-on-desk/85">
                Our AI is extra busy right now, so we&apos;re using a slower backup. This can take up to a minute.
              </p>
            )}
          </div>
        </main>
      </DeskTurn>
    );
  }

  return (
    <DeskTurn view="setup">
      <main className="on-desk w-full pb-8 pt-1">
        <h1 className="sr-only">Make a deck</h1>
        <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="paper-shadow rounded-md lg:-rotate-[0.6deg]">
            <NotesSheet
              text={notes}
              onText={editNotes}
              file={file}
              onFile={validateAndSetFile}
              onRemoveFile={() => setFile(null)}
              detected={detectSource(notes)}
              asNotes={asNotes}
              onAsNotes={setAsNotes}
              disabled={generating}
            />
          </div>
          <div className="flex flex-col gap-5">
            <aside aria-label="Tip" className="sticky-note paper-shadow hidden max-w-xs rotate-[2.5deg] self-end rounded-sm px-4 py-3 text-[13.5px] leading-snug text-ink lg:block">
              <p>Drop a PDF, Word file, slides or a photo on the sheet. Or click it and type notes, a link or a topic.</p>
              <p className="mt-2 border-t border-ink/10 pt-1.5 text-xs">
                New here?{' '}
                <Link href="/guide" className="font-semibold text-brass-ink hover:underline">
                  Read the User Guide →
                </Link>
              </p>
            </aside>
            <MakeCard
              count={count}
              onCount={setCount}
              difficulty={difficulty}
              onDifficulty={setDifficulty}
              studyType={studyType}
              onStudyType={setStudyType}
              sourceLine={sourceLine}
              canMake={source !== null}
              making={generating}
              onMake={handleSubmit}
              waitNote={waitNote}
              error={status === 'error' ? errorMsg : ''}
            />
          </div>
        </div>
      </main>
    </DeskTurn>
  );
}
