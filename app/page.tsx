'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useUser, signInWithGoogle, signOut } from '@/lib/auth';
import StudyViewer, { StudyItem } from '@/components/StudyViewer';
import { useProfile } from '@/components/ProfileProvider';
import { canUseTeacherTools } from '@/lib/role-types';
import { generateErrorText } from '@/lib/generation-limits';
import GenerationProgress from '@/components/GenerationProgress';
import { nextProgress, PROGRESS_MIME, readGeneration, START_PROGRESS, type ProgressState } from '@/lib/generation-progress';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_QUESTION_COUNT,
  DIFFICULTIES,
  DIFFICULTY_HINTS,
  DIFFICULTY_LABELS,
  QUESTION_COUNTS,
  STUDY_TYPE_HINTS,
  STUDY_TYPE_LABELS,
  STUDY_TYPES,
  type Difficulty,
  type StudyType,
} from '@/lib/study-types';
import { shrinkImage } from '@/lib/shrink-image';
import {
  FILE_ACCEPT,
  FILE_TYPES_TEXT,
  fileKind,
  fileProblem,
  isPhoto,
  linkProblem,
  MAX_SOURCE_CHARS,
  MAX_TOPIC_CHARS,
  pastedTextProblem,
  quoteSourceLabel,
  SOURCE_KINDS,
  SOURCE_LABELS,
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

const PENDING_RESULT_KEY = 'flashforge_pending_result';
// Gemini normally writes 10 questions in under ~12s; longer usually means the
// Gemma backup. Bigger guides (#65) take longer, so wait a second more for
// each question over 10.
const slowNoticeMs = (count: number) => 15_000 + Math.max(0, count - DEFAULT_QUESTION_COUNT) * 1_000;

export default function UploadPage() {
  const router = useRouter();
  const { user } = useUser();
  const { profile } = useProfile();
  const [source, setSource] = useState<SourceKind>('file');
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState('');
  const [link, setLink] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [studyType, setStudyType] = useState<StudyType>('flashcard');
  const [count, setCount] = useState<number>(DEFAULT_QUESTION_COUNT);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'needs-auth'>('idle');
  const [resumeAfterAuth, setResumeAfterAuth] = useState(false);
  const [slowGeneration, setSlowGeneration] = useState(false);
  const [progress, setProgress] = useState<ProgressState>(START_PROGRESS);

  // Restore a generated-but-unsaved result after a Google sign-in redirect,
  // since the OAuth flow does a full page reload and would otherwise lose it.
  useEffect(() => {
    const pending = sessionStorage.getItem(PENDING_RESULT_KEY);
    if (pending) {
      sessionStorage.removeItem(PENDING_RESULT_KEY);
      try {
        setResult(JSON.parse(pending));
        setResumeAfterAuth(true);
      } catch {
        // ignore malformed/stale data
      }
    }
  }, []);

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
    const problem = fileProblem(f.name, f.type, f.size);
    if (problem) {
      setErrorMsg(problem);
      setStatus('error');
      return;
    }
    setErrorMsg('');
    setStatus('idle');
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  };

  const chooseSource = (kind: SourceKind) => {
    setSource(kind);
    setErrorMsg('');
    setStatus('idle');
  };

  const sendingPhoto = source === 'file' && file !== null && isPhoto(fileKind(file.name, file.type));

  const handleSubmit = async () => {
    if (source === 'file' && !file) return;
    // Pasted notes (#70) and links (#74) are checked here, before anything is sent.
    const problem =
      source === 'text'
        ? pastedTextProblem(pasted)
        : source === 'link'
          ? linkProblem(link)
          : source === 'topic'
            ? topicProblem(topic)
            : null;
    if (problem) {
      setErrorMsg(problem);
      setStatus('error');
      return;
    }
    setStatus('generating');
    setProgress(START_PROGRESS);
    setErrorMsg('');

    const formData = new FormData();
    if (source === 'file') formData.append('file', file!);
    else if (source === 'text') formData.append('text', pasted);
    else if (source === 'link') formData.append('url', link.trim());
    else formData.append('topic', topic.trim());
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
      setErrorMsg('Could not reach the server. Check your connection and try again.');
      setStatus('error');
      return;
    } finally {
      clearTimeout(slowTimer);
      setSlowGeneration(false);
    }

    if (outcome.status < 200 || outcome.status >= 300) {
      setErrorMsg(generateErrorText(outcome.status, outcome.body));
      setStatus('error');
      return;
    }

    setResult(outcome.body as unknown as GeneratedResult);
    setStatus('idle');
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
    setResult(null);
    setFile(null);
    setSaveStatus('idle');
    setStatus('idle');
    setErrorMsg('');
  };

  // If we restored a pending result after an auth redirect and the user is
  // now signed in, finish the save automatically instead of making them
  // click twice.
  useEffect(() => {
    if (resumeAfterAuth && user && result) {
      setResumeAfterAuth(false);
      handleSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeAfterAuth, user, result]);

  if (result) {
    const saveSlot = (
      <div className="text-center space-y-2">
        {result.source && (
          <p className="text-xs text-gray-500">
            From{' '}
            <a href={result.source.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              {result.source.name}
            </a>
          </p>
        )}
        {saveStatus === 'saved' ? (
          <p className="text-sm text-green-600 font-medium">Saved ✓</p>
        ) : saveStatus === 'needs-auth' ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-500">Sign in to save this study guide.</p>
            <button
              onClick={() => {
                sessionStorage.setItem(PENDING_RESULT_KEY, JSON.stringify(result));
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
            {saveStatus === 'saving' ? 'Saving...' : '💾 Save this study guide'}
          </button>
        )}
        {saveStatus === 'error' && (
          <p className="text-xs text-red-500">Failed to save. Try again.</p>
        )}
      </div>
    );

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

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-end">
          {user ? (
            // Wraps on phones, where all the links don't fit on one line.
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm">
              {profile?.role === 'admin' && (
                <Link href="/admin" className="text-link hover:underline">
                  Admin
                </Link>
              )}
              {canUseTeacherTools(profile?.role) && (
                <Link href="/teacher" className="text-link hover:underline">
                  Teacher dashboard
                </Link>
              )}
              {profile?.role === 'student' && (
                <Link href="/classes" className="text-link hover:underline">
                  My Classes
                </Link>
              )}
              <Link href="/my-sets" className="text-link hover:underline">
                My Sets
              </Link>
              <Link href="/history" className="text-link hover:underline">
                History
              </Link>
              <span className="text-gray-400">{user.email}</span>
              <button onClick={() => signOut()} className="text-gray-500 hover:underline">
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => signInWithGoogle()}
              className="text-sm border rounded-lg px-3 py-1.5 font-medium hover:border-accent"
            >
              Sign in with Google
            </button>
          )}
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">FlashForge</h1>
          <p className="text-sm text-gray-500">
            Upload a file, paste your notes or a link, or type a topic, and get an AI-generated study guide.
          </p>
        </div>

        <div className="space-y-2">
          <p id="study-type-label" className="text-sm font-medium text-center">
            What kind of study guide?
          </p>
          <div role="group" aria-labelledby="study-type-label" className="grid grid-cols-2 gap-2">
            {STUDY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setStudyType(type)}
                aria-pressed={studyType === type}
                className={`py-2 px-2 rounded-lg border text-sm font-medium transition-colors ${
                  studyType === type ? 'border-accent bg-accent/10 text-link' : 'border-border text-gray-500'
                }`}
              >
                {STUDY_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 text-center">{STUDY_TYPE_HINTS[studyType]}</p>
        </div>

        <div className="space-y-2">
          <p id="question-count-label" className="text-sm font-medium text-center">
            How many questions?
          </p>
          <div role="group" aria-labelledby="question-count-label" className="grid grid-cols-5 gap-2">
            {QUESTION_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                aria-pressed={count === n}
                className={`py-2 rounded-lg border text-sm font-medium tabular-nums transition-colors ${
                  count === n ? 'border-accent bg-accent/10 text-link' : 'border-border text-gray-500'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p id="difficulty-label" className="text-sm font-medium text-center">
            How hard?
          </p>
          <div role="group" aria-labelledby="difficulty-label" className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setDifficulty(level)}
                aria-pressed={difficulty === level}
                className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                  difficulty === level ? 'border-accent bg-accent/10 text-link' : 'border-border text-gray-500'
                }`}
              >
                {DIFFICULTY_LABELS[level]}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 text-center">{DIFFICULTY_HINTS[difficulty]}</p>
        </div>

        <div
          role="group"
          aria-label="Where are your notes?"
          className="grid grid-cols-2 gap-1 rounded-lg border p-1 sm:grid-cols-4"
        >
          {SOURCE_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => chooseSource(kind)}
              aria-pressed={source === kind}
              className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                source === kind ? 'bg-accent text-white' : 'text-gray-500 hover:text-foreground'
              }`}
            >
              {SOURCE_LABELS[kind]}
            </button>
          ))}
        </div>

        {/* Keys: each kind of input is its own element, so React never turns the
            file input into the link box. */}
        {source === 'topic' ? (
          <div key="topic" className="space-y-1">
            <input
              aria-label="Topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Photosynthesis or the OSI model"
              maxLength={MAX_TOPIC_CHARS}
              autoComplete="off"
              className="w-full rounded-xl border bg-transparent p-3 text-sm"
            />
            <p className="text-xs text-gray-400">
              We look the topic up on Wikipedia and make the questions from that article.
            </p>
          </div>
        ) : source === 'link' ? (
          <div key="link" className="space-y-1">
            <input
              type="url"
              aria-label="Link to a web page"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
              autoComplete="off"
              className="w-full rounded-xl border bg-transparent p-3 text-sm"
            />
            <p className="text-xs text-gray-400">
              Articles and other public pages work. Pages that need signing in can&apos;t be read.
            </p>
          </div>
        ) : source === 'text' ? (
          <div key="text" className="space-y-1">
            <textarea
              aria-label="Your notes"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={8}
              placeholder="Paste your notes here, from Google Docs, a website, or a chat."
              className="w-full rounded-xl border bg-transparent p-3 text-sm"
            />
            <p
              className={`text-right text-xs tabular-nums ${pasted.length > MAX_SOURCE_CHARS ? 'text-red-500' : 'text-gray-400'}`}
            >
              {pasted.length.toLocaleString('en-US')} / {MAX_SOURCE_CHARS.toLocaleString('en-US')} characters
            </p>
          </div>
        ) : (
        <div
          key="file"
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            dragActive ? 'border-accent bg-accent/10' : 'border-border'
          }`}
        >
          <input
            id="file-input"
            type="file"
            accept={FILE_ACCEPT}
            onChange={handleFileInput}
            className="hidden"
          />
          <label htmlFor="file-input" className="cursor-pointer block">
            {file ? (
              <p className="font-medium">{file.name}</p>
            ) : (
              <>
                <p className="font-medium">Drag & drop a file here</p>
                <p className="text-sm text-gray-500 mt-1">or click to browse ({FILE_TYPES_TEXT})</p>
              </>
            )}
          </label>
        </div>
        )}

        {status === 'error' && (
          <p className="text-sm text-red-500 text-center">{errorMsg}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={
            (source === 'file'
              ? !file
              : source === 'text'
                ? !pasted.trim()
                : source === 'link'
                  ? !link.trim()
                  : !topic.trim()) || status === 'generating'
          }
          className="btn btn-primary btn-lg w-full"
        >
          {status === 'generating' &&
            (sendingPhoto
              ? 'Reading your photo (this can take ~30s)...'
              : count > DEFAULT_QUESTION_COUNT
                ? `Generating ${count} questions (this can take ~30s)...`
                : 'Generating (this can take ~20s)...')}
          {(status === 'idle' || status === 'error') && 'Generate Study Guide'}
        </button>

        {status === 'generating' && <GenerationProgress progress={progress} source={source} photo={sendingPhoto} />}

        {status === 'generating' && slowGeneration && progress.attempt <= 1 && (
          <p className="text-sm text-gray-500 text-center">
            Our AI is extra busy right now, so we&apos;re using a slower backup. This can take up
            to a minute.
          </p>
        )}
      </div>
    </main>
  );
}
