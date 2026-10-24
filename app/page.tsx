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
import {
  DEFAULT_QUESTION_COUNT,
  QUESTION_COUNTS,
  STUDY_TYPE_HINTS,
  STUDY_TYPE_LABELS,
  STUDY_TYPES,
  type StudyType,
} from '@/lib/study-types';
import { MAX_SOURCE_CHARS, pastedTextProblem, SOURCE_KINDS, SOURCE_LABELS, type SourceKind } from '@/lib/sources';

const ACCEPTED_TYPES = ['application/pdf', 'text/plain'];
const ACCEPTED_EXT = ['.pdf', '.txt'];

interface GeneratedResult {
  title: string;
  // Null for pasted notes (#70).
  sourceFilename: string | null;
  studyType: StudyType;
  items: StudyItem[];
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
  const [studyType, setStudyType] = useState<StudyType>('flashcard');
  const [count, setCount] = useState<number>(DEFAULT_QUESTION_COUNT);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'needs-auth'>('idle');
  const [resumeAfterAuth, setResumeAfterAuth] = useState(false);
  const [slowGeneration, setSlowGeneration] = useState(false);

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

  const validateAndSetFile = (f: File) => {
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPTED_TYPES.includes(f.type) && !ACCEPTED_EXT.includes(ext)) {
      setErrorMsg('Only PDF and TXT files are supported right now.');
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

  const handleSubmit = async () => {
    if (source === 'file' && !file) return;
    // Pasted notes (#70) are checked here, before anything is sent.
    const problem = source === 'text' ? pastedTextProblem(pasted) : null;
    if (problem) {
      setErrorMsg(problem);
      setStatus('error');
      return;
    }
    setStatus('generating');
    setErrorMsg('');

    const formData = new FormData();
    if (source === 'file') formData.append('file', file!);
    else formData.append('text', pasted);
    formData.append('studyType', studyType);
    formData.append('count', String(count));

    // Past this point the main AI is probably out of quota and the slower
    // backup model is answering, so tell the user it can take up to a minute.
    const slowTimer = setTimeout(() => setSlowGeneration(true), slowNoticeMs(count));
    let res: Response;
    try {
      // When signed in, send the session token so the usage log (#62) knows who
      // generated it. Generating still works signed out.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      res = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      setErrorMsg('Could not reach the server. Check your connection and try again.');
      setStatus('error');
      return;
    } finally {
      clearTimeout(slowTimer);
      setSlowGeneration(false);
    }
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErrorMsg(generateErrorText(res.status, body));
      setStatus('error');
      return;
    }

    setResult(body);
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
  // rather than navigating to "/".
  const handleExit = () => {
    if (
      saveStatus !== 'saved' &&
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
      />
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-end">
          {user ? (
            <div className="flex items-center gap-3 text-sm">
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
            Upload a file or paste your notes, and get an AI-generated study guide.
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

        <div role="group" aria-label="Where are your notes?" className="grid grid-cols-2 gap-1 rounded-lg border p-1">
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

        {source === 'text' ? (
          <div className="space-y-1">
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
            accept=".pdf,.txt"
            onChange={handleFileInput}
            className="hidden"
          />
          <label htmlFor="file-input" className="cursor-pointer block">
            {file ? (
              <p className="font-medium">{file.name}</p>
            ) : (
              <>
                <p className="font-medium">Drag & drop a file here</p>
                <p className="text-sm text-gray-500 mt-1">or click to browse (PDF or TXT)</p>
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
          disabled={(source === 'file' ? !file : !pasted.trim()) || status === 'generating'}
          className="btn btn-primary btn-lg w-full"
        >
          {status === 'generating' &&
            (count > DEFAULT_QUESTION_COUNT
              ? `Generating ${count} questions (this can take ~30s)...`
              : 'Generating (this can take ~20s)...')}
          {(status === 'idle' || status === 'error') && 'Generate Study Guide'}
        </button>

        {status === 'generating' && slowGeneration && (
          <p className="text-sm text-gray-500 text-center">
            Our AI is extra busy right now, so we&apos;re using a slower backup. This can take up
            to a minute.
          </p>
        )}
      </div>
    </main>
  );
}
