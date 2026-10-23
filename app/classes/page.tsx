'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import RoleGate from '@/components/RoleGate';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { normalizeJoinCode } from '@/lib/classes-shared';
import { STUDENT_ROLES } from '@/lib/role-types';
import { formatDueDate, isOverdue } from '@/lib/due-dates';

interface AssignedSet {
  id: string;
  setId: string;
  setTitle: string;
  studyType: string;
  dueAt: string | null;
  createdAt: string;
  // The student's own results on this assignment, or null if not done (#57).
  myProgress: { attempts: number; bestScore: number; bestTotal: number; lastCompletedAt: string } | null;
}

interface JoinedClass {
  id: string;
  name: string;
  teacherName: string | null;
  joinedAt: string;
  // Soonest due first (#56).
  assignments: AssignedSet[];
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

// Students' classes (#54): join with a code, see the classes they're in and
// what's assigned in each (#56), leave.
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
    // w-full: the body is a flex column, so without it a long class name or set
    // title would widen the page past a phone screen instead of truncating.
    <main className="min-h-screen w-full p-6 max-w-md mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My classes</h1>
        <Link href="/" className="text-sm text-link hover:underline">
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
            className="btn btn-primary shrink-0"
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
              className="text-link hover:underline"
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
              <li key={c.id} aria-label={c.name} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
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
                </div>
                {c.assignments.length === 0 ? (
                  <p className="text-xs text-gray-400">No assigned sets yet.</p>
                ) : (
                  <ul className="space-y-1" aria-label={`Assigned in ${c.name}`}>
                    {c.assignments.map((a) => (
                      <li key={a.id}>
                        <Link
                          href={`/sets/${a.setId}?assignment=${a.id}`}
                          className="block rounded-lg bg-gray-500/5 px-3 py-2 text-sm hover:bg-gray-500/10"
                        >
                          <span className="block truncate font-medium">{a.setTitle}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                            {a.dueAt ? `Due ${formatDueDate(a.dueAt)}` : 'No due date'}
                            {a.myProgress ? (
                              <span className="rounded bg-green-500/10 px-1.5 py-0.5 font-medium text-green-600">
                                Done · best {a.myProgress.bestScore}/{a.myProgress.bestTotal}
                              </span>
                            ) : (
                              isOverdue(a.dueAt) && (
                                <span className="rounded bg-red-500/10 px-1.5 py-0.5 font-medium text-red-500">Overdue</span>
                              )
                            )}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-sm">
        <Link href="/my-sets" className="text-link hover:underline">
          My Sets
        </Link>
      </p>
    </main>
  );
}
