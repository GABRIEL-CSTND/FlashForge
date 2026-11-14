// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  loading: false,
  profile: null as null | { displayName: string | null; role: string },
}));
const auth = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));
const router = vi.hoisted(() => ({
  push: vi.fn(),
}));
const api = vi.hoisted(() => ({
  calls: [] as { path: string; method?: string; body?: unknown }[],
  fail: false,
  failMessage: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: state.user, loading: state.loading }),
  signInWithGoogle: auth.signInWithGoogle,
  signOut: auth.signOut,
}));
vi.mock('@/components/ProfileProvider', () => ({
  useProfile: () => ({ profile: state.profile }),
}));
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(async (path: string, init: { method?: string; body?: unknown } = {}) => {
    api.calls.push({ path, method: init.method, body: init.body });
    if (api.fail) {
      return { ok: false, status: 500, data: { error: api.failMessage || 'Server failure' } };
    }
    return { ok: true, status: 200, data: { deleted: true } };
  }),
}));

import PrivacyPage from '@/app/privacy/page';

beforeEach(() => {
  state.user = null;
  state.loading = false;
  state.profile = null;
  api.calls = [];
  api.fail = false;
  api.failMessage = '';
  router.push.mockReset();
  auth.signInWithGoogle.mockReset();
  auth.signOut.mockReset();
});

afterEach(cleanup);

describe('Privacy page (#88)', () => {
  it('renders privacy explanations and back link', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { name: 'Privacy & Your Data', level: 1 })).toBeTruthy();
    expect(screen.getByRole('link', { name: '← Back to Desk' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('heading', { name: '1. What We Store' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '2. Who Can See Your Data' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '3. Retention & Deletion Policy' })).toBeTruthy();
  });

  // Facts an earlier draft got wrong. Check them against the code (RLS policies,
  // the admin pages, lib/user-data.ts, lib/generation-logs.ts) before changing them.
  it('says who else can see your data and what deleting an account takes with it', () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? '';
    // Admins can open or delete any saved deck (#61), with its owner's email.
    expect(text).toMatch(/They can open or delete any saved deck, and they see its owner's email/);
    // The Gemini free tier lets Google use what's sent to improve its products.
    expect(text).toMatch(/free tier/);
    expect(text).toMatch(/Google may use what's sent, and the cards it writes, to improve its products/);
    expect(text).not.toMatch(/solely/);
    // A teacher's sets take every student's attempts on them along (attempts.set_id cascades).
    expect(text).toMatch(/their students' scores on those decks are deleted/);
    // Guests' generations are logged with a hashed address for the daily limit.
    expect(text).toMatch(/scrambled \(hashed\) form of your internet address/);
  });

  it('shows sign-in prompt in the deletion section when signed out', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/For guests, FlashForge keeps no account, decks, or History/)).toBeTruthy();
    const btn = screen.getByRole('button', { name: 'Sign in with Google' });
    fireEvent.click(btn);
    expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it('shows user details and deletion button when signed in', () => {
    state.user = { id: 'u1', email: 'sam@example.com' };
    state.profile = { displayName: 'Sam Student', role: 'student' };

    render(<PrivacyPage />);
    expect(screen.getByText(/Signed in as:/)).toBeTruthy();
    expect(screen.getByText('Sam Student')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete my account and data' })).toBeTruthy();
  });

  it('confirms and calls delete API, signs out, and redirects to home on success', async () => {
    state.user = { id: 'u1', email: 'sam@example.com' };
    state.profile = { displayName: 'Sam Student', role: 'student' };

    render(<PrivacyPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account and data' }));

    expect(screen.getByText(/Are you absolutely sure\?/)).toBeTruthy();
    const confirmBtn = screen.getByRole('button', { name: 'Yes, delete everything' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.calls).toEqual([
        {
          path: '/api/profile/data',
          method: 'DELETE',
          body: { confirm: true },
        },
      ]);
      expect(auth.signOut).toHaveBeenCalledOnce();
      expect(router.push).toHaveBeenCalledWith('/');
    });
  });

  it('displays an error if account deletion fails', async () => {
    state.user = { id: 'u1', email: 'sam@example.com' };
    state.profile = { displayName: 'Sam Student', role: 'student' };
    api.fail = true;
    api.failMessage = "The last admin account can't be deleted.";

    render(<PrivacyPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account and data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete everything' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe("The last admin account can't be deleted.");
    });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
