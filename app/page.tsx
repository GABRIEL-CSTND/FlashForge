'use client';

import { startTransition, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
    startTransition(() => {
      setStatus('generating');
      setProgress(START_PROGRESS);
      setPdfRead(null);
      setErrorMsg('');
    });

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
    try {
      // When signed in, send the session token so the usage log (#62) knows who
      // generated it. Generating still works signed out.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
        // Asking for progress: the server then reports each step as it starts.
        headers: { Accept: PROGRESS_MIME, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      // The answer arrives step by step, so this keeps going until the guide is ready.
      outcome = await readGeneration(res, (step) => setProgress((p) => nextProgress(p, step)));
    } catch {
      fail('Could not reach the server. Check your connection and try again.');
      return;
    } finally {
      clearTimeout(slowTimer);
      setSlowGeneration(false);
      setPdfRead(null);
    }

    if (outcome.status < 200 || outcome.status >= 300) {
      fail(generateErrorText(outcome.status, outcome.body));
      return;
    }

    startTransition(() => {
      setGenerated(outcome.body as unknown as GeneratedResult);
      setView('spread');
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
    setGenerated(null);
    keepPendingGuide(null);
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

  if (result) {
    const saveSlot = (
      <div className="text-center space-y-2">
        {result.source && (
          <p className="text-xs text-muted">
            From{' '}
            <a href={result.source.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              {result.source.name}
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

    if (view === 'study') {
      return (
        <StudyViewer
          title={result.title}
          studyType={result.studyType}
          cards={result.items}
          onExit={handleExit}
          saveSlot={saveSlot}
          quoteLabel={quoteSourceLabel(result.sourceFilename)}
        />
      );
    }

    const n = result.items.length;
    return (
      <DeskTurn view="spread">
        <DeckSpread
          title={result.title}
          meta={`${STUDY_TYPE_LABELS[result.studyType] ?? 'Flashcards'} · ${n} card${n === 1 ? '' : 's'}`}
          items={result.items}
          onStart={() => setView('study')}
          onExit={handleExit}
          saveSlot={saveSlot}
          savedToHistory={!!result.historyId}
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
              Drop a PDF, Word file, slides or a photo on the sheet. Or click it and type notes, a link or a topic.
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
