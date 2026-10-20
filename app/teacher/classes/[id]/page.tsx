'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import TeacherOnly from '@/components/TeacherOnly';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { CLASS_NAME_MAX_LENGTH, formatJoinCode } from '@/lib/classes-shared';

interface Student {
  studentId: string;
  displayName: string | null;
  email: string | null;
  joinedAt: string;
}

interface ClassDetail {
  id: string;
  name: string;
  joinCode: string;
  createdAt: string;
  studentCount: number;
  students: Student[];
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

const studentLabel = (s: Student) => s.displayName || s.email || 'Unnamed student';

// One class (#53): its join code, its roster, and rename/delete.
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
        <Link href="/teacher" className="text-blue-500 hover:underline">
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

  const deleteClass = async () => {
    const count = cls.students.length;
    const who = count === 0 ? '' : ` Its ${count} student${count === 1 ? '' : 's'} will be removed from it.`;
    if (!window.confirm(`Delete "${cls.name}"?${who} This can't be undone.`)) return;
    const data = await run(() => apiFetch(`/api/teacher/classes/${id}`, { method: 'DELETE' }));
    if (data) router.push('/teacher');
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto space-y-6">
      <Link href="/teacher" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        ← All classes
      </Link>

      <div className="space-y-2">
        {editingName ? (
          <div className="space-y-2">
            <label htmlFor="class-name" className="sr-only">
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
              className="w-full rounded-lg border bg-transparent px-3 py-2"
            />
            <div className="flex gap-3 text-sm">
              <button
                type="button"
                onClick={saveName}
                disabled={busy || !nameDraft.trim()}
                className="text-blue-600 hover:underline disabled:opacity-40"
              >
                {busy ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                disabled={busy}
                className="text-gray-500 hover:underline disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <h1 className="break-words text-xl font-semibold">{cls.name}</h1>
            <button
              type="button"
              onClick={() => {
                setNameDraft(cls.name);
                setEditingName(true);
              }}
              className="shrink-0 text-sm text-gray-500 hover:underline"
            >
              Rename
            </button>
          </div>
        )}
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-red-500">
          {actionError}
        </p>
      )}

      <section className="space-y-3 rounded-xl border p-5 text-center" aria-labelledby="join-code-heading">
        <h2 id="join-code-heading" className="text-xs uppercase tracking-wide text-gray-400">
          Join code
        </h2>
        <p className="font-mono text-3xl font-bold tracking-widest" data-testid="join-code">
          {formatJoinCode(cls.joinCode)}
        </p>
        <p className="text-sm text-gray-500">Students enter this code on FlashForge to join your class.</p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={copyCode}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:border-blue-400"
          >
            Copy code
          </button>
          <button
            type="button"
            onClick={newCode}
            disabled={busy}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:border-blue-400 disabled:opacity-40"
          >
            Get a new code
          </button>
        </div>
        {notice && (
          <p role="status" className="text-xs text-gray-500">
            {notice}
          </p>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="students-heading">
        <h2 id="students-heading" className="font-medium">
          Students ({cls.students.length})
        </h2>
        {cls.students.length === 0 ? (
          <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
            No students yet. Share the join code above.
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {cls.students.map((s) => (
              <li key={s.studentId} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{studentLabel(s)}</p>
                  <p className="truncate text-xs text-gray-400">
                    {s.displayName && s.email ? `${s.email} · ` : ''}
                    Joined {new Date(s.joinedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeStudent(s)}
                  disabled={busy}
                  aria-label={`Remove ${studentLabel(s)}`}
                  className="shrink-0 text-sm text-red-500 hover:underline disabled:opacity-40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="border-t pt-4 text-center">
        <button
          type="button"
          onClick={deleteClass}
          disabled={busy}
          className="text-sm text-red-500 hover:underline disabled:opacity-40"
        >
          Delete this class
        </button>
      </div>
    </main>
  );
}
