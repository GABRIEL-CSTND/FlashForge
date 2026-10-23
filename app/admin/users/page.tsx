'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AdminOnly from '@/components/AdminOnly';
import { useProfile } from '@/components/ProfileProvider';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { studentLabel } from '@/lib/classes-shared';
import { ROLES, type Role } from '@/lib/role-types';

interface AdminUser {
  id: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  signedUpAt: string;
  setCount: number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; users: AdminUser[] };

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.';
const ROLE_LABELS: Record<Role, string> = { student: 'Student', teacher: 'Teacher', admin: 'Admin' };

async function fetchUsers(search: string): Promise<LoadState> {
  try {
    const res = await apiFetch(`/api/admin/users?q=${encodeURIComponent(search)}`);
    return res.ok
      ? { status: 'ready', users: res.data.users as AdminUser[] }
      : { status: 'error', message: errorMessage(res.data) };
  } catch {
    return { status: 'error', message: OFFLINE_MESSAGE };
  }
}

// Every user and their role (#60). Changing a role asks first; the server
// refuses to demote the last admin and logs every change.
export default function AdminUsersPage() {
  return (
    <AdminOnly>
      <UsersView />
    </AdminOnly>
  );
}

function UsersView() {
  const { user, refreshProfile } = useProfile();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'status'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUsers(query).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const changeRole = async (target: AdminUser, role: Role) => {
    const name = studentLabel(target);
    const extra = role === 'admin' ? ' Admins can change anyone\'s role.' : '';
    if (!window.confirm(`Make ${name} ${role === 'admin' ? 'an' : 'a'} ${role}?${extra}`)) return;
    setBusyId(target.id);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/admin/users/${target.id}`, { method: 'PATCH', body: { role } });
      if (!res.ok) {
        setMessage({ kind: 'error', text: errorMessage(res.data) });
        return;
      }
      setState((prev) =>
        prev.status === 'ready'
          ? { status: 'ready', users: prev.users.map((u) => (u.id === target.id ? { ...u, role } : u)) }
          : prev
      );
      setMessage({ kind: 'status', text: `${name} is now ${role === 'admin' ? 'an' : 'a'} ${role}.` });
      // Changing your own role changes what you can open.
      if (target.id === user?.id) await refreshProfile();
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
      <h1 className="text-xl font-semibold">Users and roles</h1>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setState({ status: 'loading' });
          setQuery(search.trim());
        }}
        className="flex gap-2"
      >
        <label htmlFor="user-search" className="sr-only">
          Search by email or name
        </label>
        <input
          id="user-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name"
          className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-2"
        />
        <button type="submit" className="rounded-lg border px-4 py-2 text-sm font-medium hover:border-blue-400">
          Search
        </button>
      </form>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'error' ? 'text-red-500' : 'text-green-600'}`}>
          {message.text}
        </p>
      )}

      {state.status === 'loading' && <p className="text-sm text-gray-500">Loading users...</p>}
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-red-500">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && state.users.length === 0 && (
        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">No users match that search.</div>
      )}
      {state.status === 'ready' && state.users.length > 0 && (
        <ul aria-label="Users" className="divide-y rounded-lg border">
          {state.users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {studentLabel(u)}
                  {u.id === user?.id && <span className="ml-1 text-xs font-normal text-gray-400">(you)</span>}
                </p>
                <p className="truncate text-xs text-gray-400">
                  {u.displayName && u.email ? `${u.email} · ` : ''}
                  Joined {new Date(u.signedUpAt).toLocaleDateString()} · {u.setCount} set{u.setCount === 1 ? '' : 's'}
                </p>
              </div>
              <select
                aria-label={`Role for ${studentLabel(u)}`}
                value={u.role}
                disabled={busyId !== null}
                onChange={(e) => changeRole(u, e.target.value as Role)}
                className="shrink-0 rounded-lg border bg-background px-2 py-1.5 text-sm disabled:opacity-40"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
