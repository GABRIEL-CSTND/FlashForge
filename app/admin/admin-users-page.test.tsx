// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const state = vi.hoisted(() => ({
  role: 'admin',
  refreshProfile: vi.fn(async () => {}),
  calls: [] as { method: string; path: string; body?: unknown }[],
  patchReply: null as null | { ok: boolean; status: number; data: Record<string, unknown> },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ProfileProvider', () => ({
  useProfile: () => ({
    user: { id: 'u-admin' },
    profile: { role: state.role, roleChosenAt: '2026-10-20', displayName: null },
    loading: false,
    refreshProfile: state.refreshProfile,
  }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init: { method?: string; body?: unknown } = {}) => {
      const method = init.method ?? 'GET';
      state.calls.push({ method, path, body: init.body });
      if (method === 'PATCH') return state.patchReply ?? { ok: true, status: 200, data: { from: 'student', role: (init.body as { role: string }).role } };
      const users = [
        { id: 'u-admin', email: 'me@example.com', displayName: 'Gabriel', role: 'admin', signedUpAt: '2026-09-01T00:00:00Z', setCount: 12 },
        { id: 'u-sam', email: 'sam@example.com', displayName: null, role: 'student', signedUpAt: '2026-10-01T00:00:00Z', setCount: 1 },
      ];
      return { ok: true, status: 200, data: { users: path.includes('q=nobody') ? [] : users } };
    }),
  };
});

import AdminUsersPage from '@/app/admin/users/page';

const confirmMock = vi.fn(() => true);
beforeEach(() => {
  state.role = 'admin';
  state.calls = [];
  state.patchReply = null;
  state.refreshProfile.mockClear();
  confirmMock.mockReset().mockReturnValue(true);
  vi.stubGlobal('confirm', confirmMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const roleSelect = (name: string) => screen.findByRole('combobox', { name: `Role for ${name}` }) as Promise<HTMLSelectElement>;

describe('admin users page', () => {
  it('lists users with their role, sign-up date and set count', async () => {
    render(<AdminUsersPage />);
    const rows = within(await screen.findByRole('list', { name: 'Users' })).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Gabriel(you)');
    expect(rows[0].textContent).toContain('12 sets');
    expect(rows[1].textContent).toContain('sam@example.com');
    expect(rows[1].textContent).toContain('1 set');
    expect((await roleSelect('sam@example.com')).value).toBe('student');
  });

  it('searches by email or name', async () => {
    render(<AdminUsersPage />);
    await screen.findByRole('list', { name: 'Users' });
    fireEvent.change(screen.getByLabelText('Search by email or name'), { target: { value: ' nobody ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No users match that search.')).toBeTruthy();
    expect(state.calls.map((c) => c.path)).toEqual(['/api/admin/users?q=', '/api/admin/users?q=nobody']);
  });

  it('changes a role after confirming', async () => {
    render(<AdminUsersPage />);
    fireEvent.change(await roleSelect('sam@example.com'), { target: { value: 'teacher' } });
    expect(confirmMock).toHaveBeenCalledWith('Make sam@example.com a teacher?');
    expect((await screen.findByRole('status')).textContent).toBe('sam@example.com is now a teacher.');
    expect((await roleSelect('sam@example.com')).value).toBe('teacher');
    expect(state.calls.at(-1)).toEqual({ method: 'PATCH', path: '/api/admin/users/u-sam', body: { role: 'teacher' } });
    expect(state.refreshProfile).not.toHaveBeenCalled();
  });

  it('does nothing when the admin cancels', async () => {
    confirmMock.mockReturnValue(false);
    render(<AdminUsersPage />);
    fireEvent.change(await roleSelect('sam@example.com'), { target: { value: 'admin' } });
    expect(confirmMock).toHaveBeenCalledWith("Make sam@example.com an admin? Admins can change anyone's role.");
    expect((await roleSelect('sam@example.com')).value).toBe('student');
    expect(state.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it("shows the server's refusal and keeps the old role", async () => {
    state.patchReply = { ok: false, status: 409, data: { error: "The last admin can't be removed. Make someone else an admin first." } };
    render(<AdminUsersPage />);
    fireEvent.change(await roleSelect('Gabriel'), { target: { value: 'teacher' } });
    expect((await screen.findByRole('alert')).textContent).toBe("The last admin can't be removed. Make someone else an admin first.");
    expect((await roleSelect('Gabriel')).value).toBe('admin');
  });

  it('reloads your own profile when you change your own role', async () => {
    render(<AdminUsersPage />);
    fireEvent.change(await roleSelect('Gabriel'), { target: { value: 'teacher' } });
    await waitFor(() => expect(state.refreshProfile).toHaveBeenCalledTimes(1));
  });

  it.each([['teacher'], ['student']])('shows a %s a message instead of loading anything', async (role) => {
    state.role = role;
    render(<AdminUsersPage />);
    expect(await screen.findByText('The admin pages are only for admins.')).toBeTruthy();
    expect(state.calls).toEqual([]);
  });
});
