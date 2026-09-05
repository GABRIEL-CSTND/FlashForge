'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useUser, signInWithGoogle, signOut } from '@/lib/auth';
import StudyViewer, { StudyItem } from '@/components/StudyViewer';

const ACCEPTED_TYPES = ['application/pdf', 'text/plain'];
const ACCEPTED_EXT = ['.pdf', '.txt'];

type StudyType = 'flashcard' | 'multiple_choice';

const STUDY_TYPE_OPTIONS: { value: StudyType; label: string }[] = [
  { value: 'flashcard', label: 'Flashcards' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
];

interface GeneratedResult {
  title: string;
  sourceFilename: string;
  studyType: StudyType;
  items: StudyItem[];
}

const PENDING_RESULT_KEY = 'flashforge_pending_result';

export default function UploadPage() {
  const router = useRouter();
  const { user } = useUser();
  const [file, setFile] = useState<File | null>(null);
  const [studyType, setStudyType] = useState<StudyType>('flashcard');
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'needs-auth'>('idle');
  const [resumeAfterAuth, setResumeAfterAuth] = useState(false);

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

  const handleSubmit = async () => {
    if (!file) return;
    setStatus('generating');
    setErrorMsg('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('studyType', studyType);

    const res = await fetch('/api/generate', { method: 'POST', body: formData });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErrorMsg(body.error || 'Failed to generate study guide.');
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
              className="text-sm border rounded-lg px-4 py-2 font-medium hover:border-blue-400"
            >
              Sign in with Google
            </button>
          </div>
        ) : (
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="text-sm border rounded-lg px-4 py-2 font-medium hover:border-blue-400 disabled:opacity-40"
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
              <Link href="/my-sets" className="text-blue-500 hover:underline">
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
              className="text-sm border rounded-lg px-3 py-1.5 font-medium hover:border-blue-400"
            >
              Sign in with Google
            </button>
          )}
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">FlashForge</h1>
          <p className="text-sm text-gray-500">
            Upload a file and get an AI-generated study guide.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-center">What kind of study guide?</p>
          <div className="grid grid-cols-2 gap-2">
            {STUDY_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStudyType(opt.value)}
                className={`py-2 px-2 rounded-lg border text-sm font-medium transition-colors ${
                  studyType === opt.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                    : 'border-gray-300 text-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            dragActive ? 'border-blue-500 bg-blue-50/10' : 'border-gray-300'
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

        {status === 'error' && (
          <p className="text-sm text-red-500 text-center">{errorMsg}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!file || status === 'generating'}
          className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'generating' && 'Generating (this can take ~20s)...'}
          {(status === 'idle' || status === 'error') && 'Generate Study Guide'}
        </button>
      </div>
    </main>
  );
}
