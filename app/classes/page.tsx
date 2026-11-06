'use client';

import { useEffect, useState } from 'react';
import LibraryDeck, { DESK_TEXT_BUTTON } from '@/components/desk/LibraryDeck';
import LibraryDesk, { DeskNote } from '@/components/desk/LibraryDesk';
import type { TagTone } from '@/components/desk/PaperTag';
import RoleGate from '@/components/RoleGate';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { normalizeJoinCode } from '@/lib/classes-shared';
import { shortDate } from '@/lib/library';
import { STUDENT_ROLES } from '@/lib/role-types';
import { formatDueDate, isOverdue } from '@/lib/due-dates';
import { STUDY_TYPE_LABELS, toStudyType } from '@/lib/study-types';

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
const TIP = 'Sets your teachers assign show up in each class, with their due dates.';

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
// what's assigned in each (#56), leave. On the desk since redesign phase 5:
// each class is a tray of decks, each tagged with when it's due or its best
// score, and joining is a paper card.
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

  const feedbackColor = { success: 'text-green-800', info: 'text-muted', error: 'text-pencil' } as const;
  // A set assigned in two classes lies on the desk twice; only the first one
  // carries the morph name, as names must be unique on a page.
  const morphed = new Set<string>();

  return (
    <LibraryDesk title="My Classes" subline="Sets your teachers assigned, with their due dates." tip={TIP}>
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="classes-heading" className="min-w-0">
          <h2 id="classes-heading" className="sr-only">
            Your classes{state.status === 'ready' ? ` (${state.classes.length})` : ''}
          </h2>

          {state.status === 'loading' && <p className="text-sm text-on-desk/85">Loading classes...</p>}

          {state.status === 'error' && (
            <DeskNote>
              <p className="text-pencil">{state.message}</p>
              <button
                type="button"
                onClick={async () => {
                  setState({ status: 'loading' });
                  await reload();
                }}
                className="mt-2 min-h-11 font-semibold text-link hover:underline"
              >
                Try again
              </button>
            </DeskNote>
          )}

          {state.status === 'ready' && state.classes.length === 0 && (
            <DeskNote>You haven&apos;t joined any classes yet. Ask your teacher for a class code.</DeskNote>
          )}

          {state.status === 'ready' && state.classes.length > 0 && (
            <ul className="flex flex-col gap-12">
              {state.classes.map((c, k) => (
                // Each class is a tray in the leather, its name on a paper label.
                <li key={c.id} aria-label={c.name}>
                  <div className="relative z-10 -mb-[18px] ml-4 flex flex-wrap items-center gap-x-4">
                    <h3
                      className={`paper rounded px-3.5 py-1.5 text-ink shadow-[0_6px_12px_-8px_rgb(0_0_0/0.6)] ${k % 2 ? 'rotate-1' : '-rotate-[1.5deg]'}`}
                    >
                      <span className="font-serif text-[17px] font-normal">{c.name}</span>
                      {c.teacherName && <span className="ml-2 font-sans text-[12.5px] text-muted">{c.teacherName}</span>}
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleLeave(c)}
                      disabled={leavingId !== null}
                      aria-label={`Leave ${c.name}`}
                      className={DESK_TEXT_BUTTON}
                    >
                      {leavingId === c.id ? 'Leaving...' : 'Leave'}
                    </button>
                  </div>
                  <div className="desk-tray rounded-[18px] px-6 pb-10 pt-11">
                    {c.assignments.length === 0 ? (
                      <p className="text-sm text-on-desk/85">No assigned sets yet.</p>
                    ) : (
                      <ul aria-label={`Assigned in ${c.name}`} className="grid gap-x-8 gap-y-12 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                        {c.assignments.map((a, i) => {
                          const morph = morphed.has(a.setId) ? undefined : `deck-${a.setId}`;
                          morphed.add(a.setId);
                          return (
                            <LibraryDeck
                              key={a.id}
                              index={i + k}
                              href={`/sets/${a.setId}?assignment=${a.id}`}
                              morph={morph}
                              kind={STUDY_TYPE_LABELS[toStudyType(a.studyType)]}
                              title={a.setTitle}
                              meta={`Assigned ${shortDate(a.createdAt)}`}
                              tag={assignmentTag(a)}
                            />
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="join-heading" className="paper paper-shadow -rotate-1 rounded-lg px-6 pb-5 pt-6 text-ink">
          <h2 id="join-heading" className="text-[25px] font-normal leading-tight">
            Join a class
          </h2>
          <p className="mt-1 text-sm text-muted">Type the code your teacher gave you.</p>
          <form onSubmit={handleJoin} className="mt-3 flex items-end gap-3">
            <label
              htmlFor="join-code"
              className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-brass-ink"
            >
              Class code
              <input
                id="join-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. K7M-2QX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={12}
                disabled={joining}
                className="min-h-11 w-full min-w-0 border-0 border-b-[1.5px] border-[#8c8270] bg-transparent px-0.5 font-serif text-2xl font-normal uppercase tracking-[0.14em] text-[#1f2a44] placeholder:text-lg placeholder:normal-case placeholder:tracking-normal placeholder:text-[#9a907e]"
              />
            </label>
            <button type="submit" disabled={!code.trim() || joining} className="btn btn-primary min-h-11 shrink-0 rounded-full px-5">
              {joining ? 'Joining...' : 'Join'}
            </button>
          </form>
          <p className="mt-3 text-xs text-muted">{JOIN_NOTICE}</p>
          {feedback && (
            <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={`mt-2 text-sm ${feedbackColor[feedback.kind]}`}>
              {feedback.text}
            </p>
          )}
        </section>
      </div>
    </LibraryDesk>
  );
}

// An assignment's tag: done with its best score, overdue, when it's due, or no date.
function assignmentTag(a: AssignedSet): { text: string; tone: TagTone } {
  if (a.myProgress) return { text: `Done · best ${a.myProgress.bestScore}/${a.myProgress.bestTotal}`, tone: 'ink' };
  if (!a.dueAt) return { text: 'No due date', tone: 'muted' };
  if (isOverdue(a.dueAt)) return { text: `Overdue · was due ${shortDate(a.dueAt)}`, tone: 'pencil' };
  return { text: `Due ${formatDueDate(a.dueAt)}`, tone: 'brass' };
}
