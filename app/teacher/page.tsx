'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import KraftFolder from '@/components/desk/KraftFolder';
import LibraryDesk, { DeskNote } from '@/components/desk/LibraryDesk';
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
const TIP = 'Each folder is a class. Share its join code with your students, then open it for the grade book.';

// Teacher dashboard (#53): create classes and see them with their join codes.
// On the desk since redesign phase 6: each class is a kraft folder, and a new
// one is named in the empty folder at the end.
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

  const classes = state.status === 'ready' ? state.classes : [];
  const totalStudents = classes.reduce((sum, c) => sum + c.studentCount, 0);
  const subline =
    state.status !== 'ready'
      ? undefined
      : classes.length === 0
        ? 'No classes yet. Make one, then share its join code with your students.'
        : `${classes.length} class${classes.length === 1 ? '' : 'es'} · ${studentCountLabel(totalStudents)}`;

  // The empty folder at the end: name a class and FlashForge makes its code.
  // After the folders, so it arrives last.
  const newClass = (
    <li className="desk-arrive" style={{ '--i': classes.length } as CSSProperties}>
      <section aria-labelledby="new-class-heading" className="new-deck mt-[30px] flex w-full max-w-[420px] flex-col gap-2.5 rounded-[10px] px-6 py-5">
        <h2 id="new-class-heading" className="flex items-center gap-2.5 font-serif text-[23px] font-normal text-[#f3ecdd]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e2c887" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          New class
        </h2>
        <p className="text-sm text-on-desk/85">Name it, and FlashForge makes a join code for your students.</p>
        <form onSubmit={handleCreate} className="flex items-end gap-3">
          <label
            htmlFor="new-class-name"
            className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e2c887]"
          >
            New class name
            <input
              id="new-class-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={CLASS_NAME_MAX_LENGTH}
              placeholder="e.g. Bio 101"
              disabled={creating}
              className="min-h-11 w-full min-w-0 border-0 border-b-[1.5px] border-on-desk/60 bg-transparent px-0.5 font-serif text-xl font-normal normal-case tracking-normal text-on-desk placeholder:text-on-desk/50"
            />
          </label>
          <button type="submit" disabled={!name.trim() || creating} className="btn btn-primary min-h-11 shrink-0 rounded-full px-5">
            {creating ? 'Creating...' : 'Create class'}
          </button>
        </form>
        {createError && (
          <p role="alert" className="text-sm font-medium text-[#efb2a8]">
            {createError}
          </p>
        )}
      </section>
    </li>
  );

  return (
    <LibraryDesk title="Your classes" subline={subline} tip={TIP}>
      {state.status === 'loading' && <p className="desk-wait text-sm text-on-desk/85">Loading classes...</p>}

      {state.status === 'error' && (
        <DeskNote>
          <p role="alert" className="text-pencil">
            {state.message}
          </p>
          <button type="button" onClick={retry} className="mt-2 min-h-11 font-semibold text-link hover:underline">
            Try again
          </button>
        </DeskNote>
      )}

      {state.status === 'ready' && (
        <ul aria-label="Your classes" className="grid gap-x-10 gap-y-10 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {classes.map((c, i) => (
            <li key={c.id}>
              <KraftFolder
                index={i}
                href={`/teacher/classes/${c.id}`}
                name={c.name}
                lines={[studentCountLabel(c.studentCount)]}
                code={formatJoinCode(c.joinCode)}
              />
            </li>
          ))}
          {newClass}
        </ul>
      )}
    </LibraryDesk>
  );
}
