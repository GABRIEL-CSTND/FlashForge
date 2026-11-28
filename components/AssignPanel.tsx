'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { CLASS_CONTENT, isClassContentCategory, type ClassContentCategory } from '@/lib/classes-shared';
import { formatDueDate, fromLocalInputValue, parseDueAt } from '@/lib/due-dates';
import { TEACHER_POST_EVENT } from '@/lib/student-notifications';

interface ClassOption {
  classId: string;
  className: string;
  assignmentId: string | null;
  category?: ClassContentCategory | null;
  allowSourceMaterial?: boolean;
  allowBack?: boolean;
  dueAt: string | null;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; classes: ClassOption[] };

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.';

async function fetchOptions(setId: string): Promise<LoadState> {
  try {
    const res = await apiFetch(`/api/teacher/sets/${setId}/assignments`);
    return res.ok
      ? { status: 'ready', classes: res.data.classes as ClassOption[] }
      : { status: 'error', message: errorMessage(res.data) };
  } catch {
    return { status: 'error', message: OFFLINE_MESSAGE };
  }
}

const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// "Assign to class" dialog on a set the teacher owns (#56): pick classes and an
// optional due date. Classes that already have the set are shown as assigned;
// unassigning and due-date changes happen on the class page.
export default function AssignPanel({ setId, setTitle, onClose }: { setId: string; setTitle: string; onClose: () => void }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState<ClassContentCategory>('assignment');
  const [allowSourceMaterial, setAllowSourceMaterial] = useState(false);
  const [allowBack, setAllowBack] = useState(true);
  const [dueLocal, setDueLocal] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOptions(setId).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [setId]);

  const toggle = (classId: string) =>
    setSelected((prev) => (prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]));

  const handleAssign = async () => {
    if (state.status !== 'ready' || selected.length === 0) return;
    const dueAt = category === 'material' ? null : fromLocalInputValue(dueLocal);
    const checked = parseDueAt(dueAt);
    if (!checked.ok) {
      setMessage({ kind: 'error', text: checked.error });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/teacher/sets/${setId}/assignments`, {
        method: 'POST',
        body: { classIds: selected, category, dueAt: checked.dueAt, allowSourceMaterial, ...(category !== 'material' && { allowBack }) },
      });
      if (!res.ok) {
        setMessage({ kind: 'error', text: errorMessage(res.data) });
        return;
      }
      const nameOf = (id: string) => state.classes.find((c) => c.classId === id)?.className ?? 'a class';
      const assigned = (res.data.assigned as string[]).map(nameOf);
      const already = (res.data.alreadyAssigned as string[]).map(nameOf);
      setMessage({
        kind: 'success',
        text: [
          assigned.length ? `Assigned to ${listNames(assigned)}.` : '',
          already.length ? `${listNames(already)} already had it.` : '',
        ]
          .filter(Boolean)
          .join(' '),
      });
      setSelected([]);
      setDueLocal('');
      setAllowSourceMaterial(false);
      setAllowBack(true);
      if (typeof window !== 'undefined' && assigned.length > 0) {
        window.dispatchEvent(new Event(TEACHER_POST_EVENT));
      }
      setState(await fetchOptions(setId));
    } catch {
      setMessage({ kind: 'error', text: OFFLINE_MESSAGE });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-6"
    >
      <div className="max-h-[calc(100dvh-3rem)] w-full max-w-md space-y-4 overflow-y-auto sheet paper-shadow rounded-lg p-6 shadow-xl">
        <div className="space-y-1">
          <h2 id="assign-title" className="text-lg font-semibold">
            Assign to class
          </h2>
          <p className="truncate text-sm text-muted">{setTitle}</p>
        </div>

        {state.status === 'loading' && <p className="text-sm text-muted">Loading your classes...</p>}

        {state.status === 'error' && (
          <p role="alert" className="text-sm text-pencil">
            {state.message}
          </p>
        )}

        {state.status === 'ready' && state.classes.length === 0 && (
          <p className="text-sm text-muted">
            You don&apos;t have any classes yet.{' '}
            <Link href="/teacher" className="text-link hover:underline">
              Create one on the Teacher dashboard
            </Link>
            , then come back to assign this set.
          </p>
        )}

        {state.status === 'ready' && state.classes.length > 0 && (
          <>
            <label className="block space-y-1 text-sm">
              <span className="block text-xs uppercase tracking-wide text-muted">Category</span>
              <select
                value={category}
                onChange={(event) => {
                  if (isClassContentCategory(event.target.value)) setCategory(event.target.value);
                }}
                disabled={saving}
                className="w-full rounded-lg border bg-transparent px-3 py-2"
              >
                {CLASS_CONTENT.map((item) => <option key={item.category} value={item.category}>{item.label}</option>)}
              </select>
            </label>
            <fieldset className="space-y-2" disabled={saving}>
              <legend className="text-xs uppercase tracking-wide text-muted">Classes</legend>
              {state.classes.map((c) => {
                const assigned = c.assignmentId !== null;
                const sharedAs = CLASS_CONTENT.find((item) => item.category === c.category) ?? CLASS_CONTENT[0];
                return (
                  <label
                    key={c.classId}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                      assigned ? 'opacity-60' : 'cursor-pointer hover:border-accent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={assigned || selected.includes(c.classId)}
                      disabled={assigned}
                      onChange={() => toggle(c.classId)}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.className}</span>
                      {assigned && (
                        <span className="block text-xs text-muted">
                          {sharedAs.label}{sharedAs.category !== 'material' && ` · ${c.dueAt ? `due ${formatDueDate(c.dueAt)}` : 'no due date'}`}
                          {' · '}{c.allowSourceMaterial ? 'Source shared' : 'Source hidden'}
                          {sharedAs.category !== 'material' && c.allowBack === false && ' · Forward-only'}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={allowSourceMaterial} onChange={(event) => setAllowSourceMaterial(event.target.checked)} disabled={saving} className="mt-0.5 size-4 shrink-0" />
              <span>
                Share source material with students
                <span className="block text-xs text-muted">Students can view available source files and excerpts while studying this set.</span>
              </span>
            </label>

            {category !== 'material' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allowBack} onChange={(event) => setAllowBack(event.target.checked)} disabled={saving} className="size-4 shrink-0" />
                Allow going back
              </label>
            )}

            {category !== 'material' && <div className="space-y-1">
              <label htmlFor="assign-due" className="text-xs uppercase tracking-wide text-muted">
                Due date (optional)
              </label>
              <input
                id="assign-due"
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
                disabled={saving}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted">Students see it in their own time zone.</p>
            </div>}
          </>
        )}

        {message && (
          <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'error' ? 'text-pencil' : 'text-green-800'}`}>
            {message.text}
          </p>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
            Close
          </button>
          {state.status === 'ready' && state.classes.length > 0 && (
            <button
              type="button"
              onClick={handleAssign}
              disabled={selected.length === 0 || saving}
              className="btn btn-primary flex-1"
            >
              {saving ? 'Assigning...' : 'Assign'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
