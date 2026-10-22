'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import TeacherOnly from '@/components/TeacherOnly';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { CLASS_NAME_MAX_LENGTH, formatJoinCode } from '@/lib/classes-shared';

interface ClassSummary {
  id: string;
  name: string;
  joinCode: string;
  createdAt: string;
  studentCount: number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; classes: ClassSummary[] };

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.';

async function fetchClasses(): Promise<LoadState> {
  try {
    const res = await apiFetch('/api/teacher/classes');
    return res.ok
      ? { status: 'ready', classes: res.data.classes as ClassSummary[] }
      : { status: 'error', message: errorMessage(res.data) };
  } catch {
    return { status: 'error', message: OFFLINE_MESSAGE };
  }
}

const studentCountLabel = (n: number) => `${n} student${n === 1 ? '' : 's'}`;

// Teacher dashboard (#53): create classes and see them with their join codes.
export default function TeacherDashboardPage() {
  return (
    <TeacherOnly>
      <Dashboard />
    </TeacherOnly>
  );
}

function Dashboard() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchClasses().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const retry = async () => {
    setState({ status: 'loading' });
    setState(await fetchClasses());
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await apiFetch('/api/teacher/classes', { method: 'POST', body: { name } });
      if (!res.ok) {
        setCreateError(errorMessage(res.data));
        return;
      }
      const created = res.data.class as ClassSummary;
      setState((prev) => ({
        status: 'ready',
        classes: [created, ...(prev.status === 'ready' ? prev.classes : [])],
      }));
      setName('');
    } catch {
      setCreateError(OFFLINE_MESSAGE);
    } finally {
      setCreating(false);
    }
  };

  return (
    // w-full: the body is a flex column, so without it a long class name would
    // widen the page past a phone screen instead of truncating.
    <main className="min-h-screen w-full p-6 max-w-md mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Teacher dashboard</h1>
        <Link href="/" className="text-sm text-blue-500 hover:underline">
          + New set
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Your classes</h2>

        <form onSubmit={handleCreate} className="flex gap-2">
          <label htmlFor="new-class-name" className="sr-only">
            New class name
          </label>
          <input
            id="new-class-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={CLASS_NAME_MAX_LENGTH}
            placeholder="Class name, e.g. Bio 101"
            disabled={creating}
            className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating ? 'Creating...' : 'Create class'}
          </button>
        </form>
        {createError && (
          <p role="alert" className="text-sm text-red-500">
            {createError}
          </p>
        )}

        {state.status === 'loading' && <p className="text-center text-sm text-gray-500">Loading classes...</p>}

        {state.status === 'error' && (
          <div className="space-y-2 rounded-lg border p-4 text-center text-sm">
            <p role="alert" className="text-red-500">
              {state.message}
            </p>
            <button type="button" onClick={retry} className="text-blue-500 hover:underline">
              Try again
            </button>
          </div>
        )}

        {state.status === 'ready' && state.classes.length === 0 && (
          <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
            No classes yet. Create one above, then share its join code with your students.
          </div>
        )}

        {state.status === 'ready' && state.classes.length > 0 && (
          <ul className="space-y-2">
            {state.classes.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/teacher/classes/${c.id}`}
                  className="block rounded-lg border p-4 transition-colors hover:border-blue-400"
                >
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Code <span className="font-mono font-medium">{formatJoinCode(c.joinCode)}</span> ·{' '}
                    {studentCountLabel(c.studentCount)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-sm">
        <Link href="/my-sets" className="text-blue-500 hover:underline">
          My Sets
        </Link>
      </p>
    </main>
  );
}
