'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import RoleGate from '@/components/RoleGate';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { normalizeJoinCode } from '@/lib/classes-shared';
import { STUDENT_ROLES } from '@/lib/role-types';

interface JoinedClass {
  id: string;
  name: string;
  teacherName: string | null;
  joinedAt: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; classes: JoinedClass[] };

type Feedback = { kind: 'success' | 'info' | 'error'; text: string } | null;

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.';
const BAD_CODE_MESSAGE = "That doesn't look like a class code. Codes have 6 letters and numbers, like K7M-2QX.";
// Shown before joining (#54). Teachers see names and emails on the roster
// (#53) and will see assignment scores (#58).
const JOIN_NOTICE = "Your teacher will see your name, email, and your scores on this class's assignments.";

async function fetchMyClasses(): Promise<LoadState> {
  try {
    const res = await apiFetch('/api/student/classes');
    return res.ok
      ? { status: 'ready', classes: res.data.classes as JoinedClass[] }
      : { status: 'error', message: errorMessage(res.data) };
  } catch {
    return { status: 'error', message: OFFLINE_MESSAGE };
  }
}

// Students' classes (#54): join with a code, see the classes they're in, leave.
export default function MyClassesPage() {
  return (
    <RoleGate
      allow={STUDENT_ROLES}
      signedOutMessage="Sign in to join a class."
      deniedMessage="Joining classes is for students. You can manage the classes you teach on the Teacher dashboard."
      deniedLink={{ href: '/teacher', label: 'Go to the Teacher dashboard' }}
    >
      <MyClasses />
    </RoleGate>
  );
}

function MyClasses() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyClasses().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = async () => setState(await fetchMyClasses());

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeJoinCode(code);
    if (!normalized) {
      setFeedback({ kind: 'error', text: BAD_CODE_MESSAGE });
      return;
    }
    setJoining(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/student/classes', { method: 'POST', body: { code: normalized } });
      if (!res.ok) {
        setFeedback({ kind: 'error', text: errorMessage(res.data) });
        return;
      }
      const joined = res.data.class as { name: string };
      setFeedback(
        res.data.alreadyMember
          ? { kind: 'info', text: `You're already in ${joined.name}.` }
          : { kind: 'success', text: `You joined ${joined.name}.` }
      );
      setCode('');
      await reload();
    } catch {
      setFeedback({ kind: 'error', text: OFFLINE_MESSAGE });
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async (cls: JoinedClass) => {
    const ok = window.confirm(
      `Leave ${cls.name}? Your teacher will no longer see your scores for it, and you'll need the class code to join again.`
    );
    if (!ok) return;
    setLeavingId(cls.id);
    setFeedback(null);
    try {
      const res = await apiFetch(`/api/student/classes/${cls.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setFeedback({ kind: 'error', text: errorMessage(res.data) });
        return;
      }
      setState((prev) =>
        prev.status === 'ready' ? { status: 'ready', classes: prev.classes.filter((c) => c.id !== cls.id) } : prev
      );
      setFeedback({ kind: 'success', text: `You left ${cls.name}.` });
    } catch {
      setFeedback({ kind: 'error', text: OFFLINE_MESSAGE });
    } finally {
      setLeavingId(null);
    }
  };

  const feedbackColor = { success: 'text-green-600', info: 'text-gray-500', error: 'text-red-500' } as const;

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My classes</h1>
        <Link href="/" className="text-sm text-blue-500 hover:underline">
          + New set
        </Link>
      </div>

      <section className="space-y-3" aria-labelledby="join-heading">
        <h2 id="join-heading" className="font-medium">
          Join a class
        </h2>
        <form onSubmit={handleJoin} className="flex gap-2">
          <label htmlFor="join-code" className="sr-only">
            Class code
          </label>
          <input
            id="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Class code, e.g. K7M-2QX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            disabled={joining}
            className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-2 font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
          />
          <button
            type="submit"
            disabled={!code.trim() || joining}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {joining ? 'Joining...' : 'Join'}
          </button>
        </form>
        <p className="text-xs text-gray-500">{JOIN_NOTICE}</p>
        {feedback && (
          <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${feedbackColor[feedback.kind]}`}>
            {feedback.text}
          </p>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="classes-heading">
        <h2 id="classes-heading" className="font-medium">
          Your classes{state.status === 'ready' ? ` (${state.classes.length})` : ''}
        </h2>

        {state.status === 'loading' && <p className="text-center text-sm text-gray-500">Loading classes...</p>}

        {state.status === 'error' && (
          <div className="space-y-2 rounded-lg border p-4 text-center text-sm">
            <p className="text-red-500">{state.message}</p>
            <button
              type="button"
              onClick={async () => {
                setState({ status: 'loading' });
                await reload();
              }}
              className="text-blue-500 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {state.status === 'ready' && state.classes.length === 0 && (
          <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
            You haven&apos;t joined any classes yet. Ask your teacher for a class code.
          </div>
        )}

        {state.status === 'ready' && state.classes.length > 0 && (
          <ul className="space-y-2">
            {state.classes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {c.teacherName ? `${c.teacherName} · ` : ''}Joined {new Date(c.joinedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleLeave(c)}
                  disabled={leavingId !== null}
                  aria-label={`Leave ${c.name}`}
                  className="shrink-0 text-sm text-red-500 hover:underline disabled:opacity-40"
                >
                  {leavingId === c.id ? 'Leaving...' : 'Leave'}
                </button>
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
