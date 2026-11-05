// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ user: null as unknown, loading: false, profile: null as unknown }));
const auth = vi.hoisted(() => ({ signInWithGoogle: vi.fn(), signOut: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: state.user, loading: state.loading }),
  signInWithGoogle: auth.signInWithGoogle,
  signOut: auth.signOut,
}));
vi.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile: state.profile }) }));

import LibraryCard from '@/components/desk/LibraryCard';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.user = null;
  state.loading = false;
  state.profile = null;
});

describe('library card', () => {
  it('offers Google sign-in when signed out', () => {
    render(<LibraryCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it('shows the name and role, and signs out', () => {
    state.user = { id: 't', email: 't@example.com' };
    state.profile = { role: 'teacher', roleChosenAt: '2026-10-20', displayName: 'Daniel Alvarez' };
    render(<LibraryCard />);
    expect(screen.getByText('Daniel Alvarez')).toBeTruthy();
    expect(screen.getByText('Teacher')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it('falls back to the email when there is no display name', () => {
    state.user = { id: 's', email: 'sam@example.com' };
    state.profile = { role: 'student', roleChosenAt: '2026-10-20', displayName: null };
    render(<LibraryCard />);
    expect(screen.getByText('sam@example.com')).toBeTruthy();
    expect(screen.getByText('Student')).toBeTruthy();
  });

  it('shows no sign-in button while the session is loading', () => {
    state.loading = true;
    render(<LibraryCard />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
