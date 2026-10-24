'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AdminOnly from '@/components/AdminOnly';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { STUDY_TYPE_LABELS, toStudyType } from '@/lib/study-types';

interface AdminSet {
  id: string;
  title: string;
  studyType: string;
  createdAt: string;
  ownerId: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  cardCount: number;
  assignmentCount: number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; sets: AdminSet[] };

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.';

async function fetchSets(search: string): Promise<LoadState> {
  try {
    const res = await apiFetch(`/api/admin/sets?q=${encodeURIComponent(search)}`);
    return res.ok
      ? { status: 'ready', sets: res.data.sets as AdminSet[] }
      : { status: 'error', message: errorMessage(res.data) };
  } catch {
    return { status: 'error', message: OFFLINE_MESSAGE };
  }
}

const ownerLabel = (s: AdminSet) => s.ownerName || s.ownerEmail || (s.ownerId ? 'Unknown user' : 'No owner (old set)');

function deleteWarning(set: AdminSet): string {
  const classes = set.assignmentCount;
  const assigned =
    classes > 0
      ? ` It's assigned to ${classes} class${classes === 1 ? '' : 'es'}, so it will disappear for those students, and their saved scores on it will be deleted.`
      : '';
  return `Delete "${set.title}" by ${ownerLabel(set)}?${assigned} This can't be undone.`;
}

// Every study set (#61): open any of them, or delete one after confirming.
// Deletions are logged.
export default function AdminSetsPage() {
  return (
    <AdminOnly>
      <SetsView />
    </AdminOnly>
  );
}

function SetsView() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'status'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSets(query).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const remove = async (set: AdminSet) => {
    if (!window.confirm(deleteWarning(set))) return;
    setBusyId(set.id);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/admin/sets/${set.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setMessage({ kind: 'error', text: errorMessage(res.data) });
        return;
      }
      setState((prev) => (prev.status === 'ready' ? { status: 'ready', sets: prev.sets.filter((s) => s.id !== set.id) } : prev));
      setMessage({ kind: 'status', text: `Deleted "${set.title}".` });
    } catch {
      setMessage({ kind: 'error', text: OFFLINE_MESSAGE });
    } finally {
      setBusyId(null);
    }
  };

  return (
    // w-full: the body is a flex column (see the class results page).
    <main className="min-h-screen w-full p-6 max-w-2xl mx-auto space-y-6">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        ← Admin
      </Link>
      <h1 className="text-xl font-semibold">Study sets</h1>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setState({ status: 'loading' });
          setQuery(search.trim());
        }}
        className="flex gap-2"
      >
        <label htmlFor="set-search" className="sr-only">
          Search by title or owner
        </label>
        <input
          id="set-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or owner"
          className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-2"
        />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'error' ? 'text-red-500' : 'text-green-600'}`}>
          {message.text}
        </p>
      )}

      {state.status === 'loading' && <p className="text-sm text-gray-500">Loading sets...</p>}
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-red-500">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && state.sets.length === 0 && (
        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">No sets match that search.</div>
      )}
      {state.status === 'ready' && state.sets.length > 0 && (
        <ul aria-label="Study sets" className="divide-y rounded-lg border">
          {state.sets.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <Link href={`/sets/${s.id}`} className="block truncate font-medium hover:underline">
                  {s.title}
                </Link>
                <p className="truncate text-xs text-gray-400">
                  {ownerLabel(s)} · {new Date(s.createdAt).toLocaleDateString()} · {s.cardCount} card
                  {s.cardCount === 1 ? '' : 's'} · {STUDY_TYPE_LABELS[toStudyType(s.studyType)]}
                </p>
                {s.assignmentCount > 0 && (
                  <p className="mt-1 text-xs">
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600">
                      Assigned to {s.assignmentCount} class{s.assignmentCount === 1 ? '' : 'es'}
                    </span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(s)}
                disabled={busyId !== null}
                aria-label={`Delete ${s.title}`}
                className="shrink-0 text-sm text-red-500 hover:underline disabled:opacity-40"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
