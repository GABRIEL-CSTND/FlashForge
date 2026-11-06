'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import LibraryDeck, { DESK_TEXT_BUTTON } from '@/components/desk/LibraryDeck';
import { DeskNote } from '@/components/desk/LibraryDesk';
import type { TagTone } from '@/components/desk/PaperTag';
import { shortDate } from '@/lib/library';
import { STUDY_TYPE_LABELS, toStudyType } from '@/lib/study-types';
import { useParams, useRouter } from 'next/navigation';
import TeacherOnly from '@/components/TeacherOnly';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { CLASS_NAME_MAX_LENGTH, formatJoinCode, studentLabel } from '@/lib/classes-shared';
import { formatDueDate, fromLocalInputValue, isOverdue, parseDueAt, toLocalInputValue } from '@/lib/due-dates';

interface Student {
  studentId: string;
  displayName: string | null;
  email: string | null;
  joinedAt: string;
}

interface Assignment {
  id: string;
  setId: string;
  setTitle: string;
  studyType: string;
  dueAt: string | null;
  createdAt: string;
}

interface ClassDetail {
  id: string;
  name: string;
  joinCode: string;
  createdAt: string;
  studentCount: number;
  students: Student[];
  assignments: Assignment[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; cls: ClassDetail };

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.';

async function fetchClass(id: string): Promise<LoadState> {
  try {
    const res = await apiFetch(`/api/teacher/classes/${id}`);
    if (res.status === 404) return { status: 'not-found' };
    return res.ok
      ? { status: 'ready', cls: res.data.class as ClassDetail }
      : { status: 'error', message: errorMessage(res.data) };
  } catch {
    return { status: 'error', message: OFFLINE_MESSAGE };
  }
}

// One class (#53): its join code, assigned sets (#56), roster, rename/delete,
// and a link to the students' results (#58).
export default function TeacherClassPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <TeacherOnly>
      <ClassView id={id} />
    </TeacherOnly>
  );
}

function ClassView({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingDueId, setEditingDueId] = useState<string | null>(null);
  const [dueDraft, setDueDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchClass(id).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  if (state.status === 'not-found' || state.status === 'error') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className={state.status === 'error' ? 'text-red-500' : 'text-gray-500'}>
          {state.status === 'error' ? state.message : 'Class not found.'}
        </p>
        <Link href="/teacher" className="text-link hover:underline">
          ← All classes
        </Link>
      </main>
    );
  }

  const cls = state.cls;
  const update = (patch: Partial<ClassDetail>) =>
    setState((prev) => (prev.status === 'ready' ? { status: 'ready', cls: { ...prev.cls, ...patch } } : prev));

  // Runs one change against the API; shows its error, or the offline message.
  const run = async (action: () => Promise<{ ok: boolean; data: Record<string, unknown> }>) => {
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const res = await action();
      if (!res.ok) setActionError(errorMessage(res.data));
      return res.ok ? res.data : null;
    } catch {
      setActionError(OFFLINE_MESSAGE);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    const data = await run(() =>
      apiFetch(`/api/teacher/classes/${id}`, { method: 'PATCH', body: { name: nameDraft } })
    );
    if (data) {
      update({ name: data.name as string });
      setEditingName(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(formatJoinCode(cls.joinCode));
      setNotice('Code copied.');
    } catch {
      setNotice('Could not copy. Select the code and copy it instead.');
    }
  };

  const newCode = async () => {
    const ok = window.confirm(
      'Get a new join code? The current code will stop working. Students already in the class stay in it.'
    );
    if (!ok) return;
    const data = await run(() => apiFetch(`/api/teacher/classes/${id}/join-code`, { method: 'POST' }));
    if (data) {
      update({ joinCode: data.joinCode as string });
      setNotice('New code ready. The old one no longer works.');
    }
  };

  const removeStudent = async (student: Student) => {
    if (!window.confirm(`Remove ${studentLabel(student)} from ${cls.name}?`)) return;
    const data = await run(() =>
      apiFetch(`/api/teacher/classes/${id}/students/${student.studentId}`, { method: 'DELETE' })
    );
    if (data) {
      const students = cls.students.filter((s) => s.studentId !== student.studentId);
      update({ students, studentCount: students.length });
    }
  };

  const saveDue = async (assignment: Assignment, value: string | null) => {
    const checked = parseDueAt(value);
    if (!checked.ok) {
      setActionError(checked.error);
      return;
    }
    const data = await run(() =>
      apiFetch(`/api/teacher/classes/${id}/assignments/${assignment.id}`, { method: 'PATCH', body: { dueAt: checked.dueAt } })
    );
    if (data) {
      update({
        assignments: cls.assignments.map((a) => (a.id === assignment.id ? { ...a, dueAt: data.dueAt as string | null } : a)),
      });
      setEditingDueId(null);
    }
  };

  const unassign = async (assignment: Assignment) => {
    if (!window.confirm(`Unassign "${assignment.setTitle}" from ${cls.name}? Students will no longer see it.`)) return;
    const data = await run(() =>
      apiFetch(`/api/teacher/classes/${id}/assignments/${assignment.id}`, { method: 'DELETE' })
    );
    if (data) update({ assignments: cls.assignments.filter((a) => a.id !== assignment.id) });
  };

  const deleteClass = async () => {
    const count = cls.students.length;
    const who = count === 0 ? '' : ` Its ${count} student${count === 1 ? '' : 's'} will be removed from it.`;
    if (!window.confirm(`Delete "${cls.name}"?${who} This can't be undone.`)) return;
    const data = await run(() => apiFetch(`/api/teacher/classes/${id}`, { method: 'DELETE' }));
    if (data) router.push('/teacher');
  };

  const assignmentTag = (a: Assignment): { text: string; tone: TagTone } => {
    if (!a.dueAt) return { text: 'No due date', tone: 'muted' };
    if (isOverdue(a.dueAt)) return { text: `Overdue · was due ${formatDueDate(a.dueAt)}`, tone: 'pencil' };
    return { text: `Due ${formatDueDate(a.dueAt)}`, tone: 'brass' };
  };
  const studentLine = cls.students.length === 0 ? 'No students yet' : `${cls.students.length} student${cls.students.length === 1 ? '' : 's'}`;

  return (
    // A class on the desk (desk redesign, phase 6): its name, the brass join-code
    // plate, the assigned sets as decks, and the roster on a sheet of paper.
    <main className="on-desk w-full pb-12">
      <Link href="/teacher" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-on-desk/80 hover:text-on-desk">
        ← Your classes
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="paper paper-shadow max-w-md space-y-2 rounded-md px-5 py-4 text-ink">
              <label htmlFor="class-name" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brass-ink">
                Class name
              </label>
              <input
                id="class-name"
                autoFocus
                value={nameDraft}
                maxLength={CLASS_NAME_MAX_LENGTH}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                disabled={busy}
                className="min-h-11 w-full border-0 border-b-[1.5px] border-[#8c8270] bg-transparent px-0.5 font-serif text-2xl text-[#1f2a44]"
              />
              <div className="flex gap-4 text-sm">
                <button type="button" onClick={saveName} disabled={busy || !nameDraft.trim()} className="btn btn-primary min-h-11 rounded-full px-5">
                  {busy ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditingName(false)} disabled={busy} className="min-h-11 font-semibold text-muted hover:underline disabled:opacity-40">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-4">
              <h1 className="break-words text-[34px] font-normal leading-tight text-[#f3ecdd]">{cls.name}</h1>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(cls.name);
                  setEditingName(true);
                }}
                className={DESK_TEXT_BUTTON}
              >
                Rename
              </button>
            </div>
          )}
          <p className="mt-1 text-[14.5px] text-on-desk/85">{studentLine}</p>
          <Link href={`/teacher/classes/${id}/results`} className="btn btn-primary mt-4 min-h-11 rounded-full px-5">
            Open the grade book
          </Link>
        </div>

        <section aria-labelledby="join-code-heading" className="paper paper-shadow w-full max-w-[300px] -rotate-1 rounded-md px-4 pb-1.5 pt-3 text-ink">
          <div className="flex items-center justify-between gap-2.5">
            <h2 id="join-code-heading" className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-brass-ink">
              Join code
            </h2>
            <span className="brass rounded px-3 py-1 font-serif text-xl tracking-[0.16em]" data-testid="join-code">
              {formatJoinCode(cls.joinCode)}
            </span>
          </div>
          <p className="mt-2 text-[13px] text-muted">Students sign in, open My Classes and type this code.</p>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={copyCode} className="min-h-11 text-[13.5px] font-semibold text-brass-ink hover:underline">
              Copy code
            </button>
            <button type="button" onClick={newCode} disabled={busy} className="min-h-11 text-[13.5px] font-semibold text-muted hover:underline disabled:opacity-40">
              Get a new code
            </button>
          </div>
          {notice && (
            <p role="status" className="pb-2 text-xs text-muted">
              {notice}
            </p>
          )}
        </section>
      </div>

      {actionError && (
        <p role="alert" className="mt-4 text-sm font-medium text-[#efb2a8]">
          {actionError}
        </p>
      )}

      <section aria-labelledby="assigned-heading" className="mt-10">
        <h2 id="assigned-heading" className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-on-desk/85">
          Assigned sets ({cls.assignments.length})
        </h2>
        {cls.assignments.length === 0 ? (
          <div className="mt-4">
            <DeskNote>
              Nothing assigned yet. To assign a set, open it from{' '}
              <Link href="/my-sets" className="font-semibold text-link hover:underline">
                My Sets
              </Link>{' '}
              and choose <span className="font-medium">Assign to class</span>.
            </DeskNote>
          </div>
        ) : (
          <ul className="mt-5 grid gap-x-10 gap-y-12 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {cls.assignments.map((a, i) => (
              <LibraryDeck
                key={a.id}
                index={i}
                href={`/sets/${a.setId}`}
                morph={`deck-${a.setId}`}
                kind={STUDY_TYPE_LABELS[toStudyType(a.studyType)]}
                title={a.setTitle}
                meta={`Assigned ${shortDate(a.createdAt)}`}
                tag={assignmentTag(a)}
                actions={
                  <div className="flex flex-col items-start">
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDueId(a.id);
                          setDueDraft(a.dueAt ? toLocalInputValue(a.dueAt) : '');
                        }}
                        disabled={busy}
                        aria-label={`Change due date for ${a.setTitle}`}
                        className={DESK_TEXT_BUTTON}
                      >
                        Due date
                      </button>
                      <button type="button" onClick={() => unassign(a)} disabled={busy} aria-label={`Unassign ${a.setTitle}`} className={DESK_TEXT_BUTTON}>
                        Unassign
                      </button>
                    </div>
                    {editingDueId === a.id && (
                      <div className="paper paper-shadow mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-sm text-ink">
                        <label htmlFor={`due-${a.id}`} className="sr-only">
                          New due date for {a.setTitle}
                        </label>
                        <input
                          id={`due-${a.id}`}
                          type="datetime-local"
                          value={dueDraft}
                          onChange={(e) => setDueDraft(e.target.value)}
                          disabled={busy}
                          className="min-h-11 rounded border bg-transparent px-2"
                        />
                        <button type="button" onClick={() => saveDue(a, fromLocalInputValue(dueDraft))} disabled={busy || !dueDraft} className="min-h-11 font-semibold text-link hover:underline disabled:opacity-40">
                          Save
                        </button>
                        {a.dueAt && (
                          <button type="button" onClick={() => saveDue(a, null)} disabled={busy} className="min-h-11 text-muted hover:underline disabled:opacity-40">
                            Remove due date
                          </button>
                        )}
                        <button type="button" onClick={() => setEditingDueId(null)} disabled={busy} className="min-h-11 text-muted hover:underline disabled:opacity-40">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="students-heading" className="sheet paper-shadow mt-12 max-w-3xl rotate-[-0.3deg] rounded-md px-6 pb-4 pt-5 text-ink">
        <h2 id="students-heading" className="text-[22px] font-normal">
          Students ({cls.students.length})
        </h2>
        {cls.students.length === 0 ? (
          <p className="mt-2 pb-2 text-sm text-muted">No students yet. Share the join code above.</p>
        ) : (
          <ul className="mt-2 divide-y divide-ink/10">
            {cls.students.map((s) => (
              <li key={s.studentId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{studentLabel(s)}</p>
                  <p className="truncate text-xs text-muted">
                    {s.displayName && s.email ? `${s.email} · ` : ''}
                    Joined {new Date(s.joinedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeStudent(s)}
                  disabled={busy}
                  aria-label={`Remove ${studentLabel(s)}`}
                  className="min-h-11 shrink-0 text-sm font-semibold text-pencil hover:underline disabled:opacity-40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8">
        <button type="button" onClick={deleteClass} disabled={busy} className={DESK_TEXT_BUTTON}>
          Delete this class
        </button>
      </div>
    </main>
  );
}
