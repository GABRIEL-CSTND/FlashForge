// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  profileRow: null as Record<string, unknown> | null,
  profileError: null as Error | null,
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      getSession: async () => ({ data: { session: state.user ? { access_token: 'test-token' } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: vi.fn(async () => {}),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.profileRow, error: state.profileError }),
        }),
      }),
    }),
  },
}));

import { ProfileProvider } from '@/components/ProfileProvider';
import RoleChooser from '@/components/RoleChooser';

const fetchMock = vi.fn();

function renderChooser() {
  return render(
    <ProfileProvider>
      <RoleChooser />
    </ProfileProvider>
  );
}

// Mimics /api/profile/role: on success the stored profile changes, so the
// provider's refresh sees the new role.
function respondWith(status: number, body: Record<string, unknown>) {
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    if (status === 200) {
      const { role } = JSON.parse(String(init.body));
      state.profileRow = { role, role_chosen_at: '2026-10-20T12:00:00Z', display_name: null };
    }
    return new Response(JSON.stringify(body), { status });
  });
}

const dialog = () => screen.queryByRole('dialog');

beforeEach(() => {
  state.user = { id: 'u1', email: 'new@example.com' };
  state.profileRow = { role: 'student', role_chosen_at: null, display_name: 'New User' };
  state.profileError = null;
  state.push.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RoleChooser', () => {
  it('asks a signed-in student who has not chosen yet', async () => {
    renderChooser();
    expect(await screen.findByRole('dialog', { name: 'Welcome to FlashForge!' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true);
  });

  it('sends the teacher choice with the session token, then goes to the teacher dashboard', async () => {
    respondWith(200, { role: 'teacher' });
    renderChooser();
    fireEvent.click(await screen.findByLabelText(/I'm a teacher/));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(dialog()).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile/role',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        body: JSON.stringify({ role: 'teacher' }),
      })
    );
    expect(state.push).toHaveBeenCalledWith('/teacher');
  });

  it('keeps a student on the current page after choosing student', async () => {
    respondWith(200, { role: 'student' });
    renderChooser();
    fireEvent.click(await screen.findByLabelText(/I'm a student/));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(dialog()).toBeNull());
    expect(state.push).not.toHaveBeenCalled();
  });

  it('shows the server error and lets the user try again', async () => {
    respondWith(500, { error: 'Something went wrong while saving your choice. Please try again.' });
    renderChooser();
    fireEvent.click(await screen.findByLabelText(/I'm a teacher/));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Something went wrong/);
    expect(dialog()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(false);
    expect(state.push).not.toHaveBeenCalled();
  });

  it('closes without navigating when the role was already chosen elsewhere (409)', async () => {
    fetchMock.mockImplementation(async () => {
      state.profileRow = { role: 'student', role_chosen_at: '2026-10-20T12:00:00Z', display_name: null };
      return new Response(JSON.stringify({ error: 'already set' }), { status: 409 });
    });
    renderChooser();
    fireEvent.click(await screen.findByLabelText(/I'm a teacher/));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(dialog()).toBeNull());
    expect(state.push).not.toHaveBeenCalled();
  });

  it('asks a user whose profile row is missing (treated as a new student)', async () => {
    state.profileRow = null;
    renderChooser();
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it.each([
    ['signed out', () => (state.user = null)],
    ['already chose', () => (state.profileRow = { role: 'student', role_chosen_at: '2026-10-01T00:00:00Z' })],
    ['an admin', () => (state.profileRow = { role: 'admin', role_chosen_at: '2026-10-20T00:00:00Z' })],
    ['a teacher assigned by an admin', () => (state.profileRow = { role: 'teacher', role_chosen_at: null })],
    ['the profile failed to load', () => (state.profileError = new Error('network'))],
  ])('does not ask when %s', async (_label, setup) => {
    setup();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderChooser();
    // Let the user and profile requests settle before checking.
    await new Promise((r) => setTimeout(r, 20));
    expect(dialog()).toBeNull();
    errorLog.mockRestore();
  });
});
