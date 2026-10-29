// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ user: null as unknown, profile: null as unknown }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: state.user, loading: false }),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile: state.profile }) }));

import UploadPage from '@/app/page';

afterEach(cleanup);

const links = () => screen.queryAllByRole('link').map((a) => `${a.textContent} -> ${a.getAttribute('href')}`);

describe('upload page header', () => {
  it('shows students My Classes, My Sets and History', () => {
    state.user = { id: 's', email: 'sam@example.com' };
    state.profile = { role: 'student', roleChosenAt: '2026-10-20' };
    render(<UploadPage />);
    expect(links()).toEqual(['My Classes -> /classes', 'My Sets -> /my-sets', 'History -> /history']);
  });

  it.each([['teacher']])('shows a %s the Teacher dashboard instead of My Classes', (role) => {
    state.user = { id: 't', email: 't@example.com' };
    state.profile = { role, roleChosenAt: '2026-10-20' };
    render(<UploadPage />);
    expect(links()).toEqual(['Teacher dashboard -> /teacher', 'My Sets -> /my-sets', 'History -> /history']);
  });

  it('shows an admin the Admin pages and the Teacher dashboard', () => {
    state.user = { id: 'a', email: 'a@example.com' };
    state.profile = { role: 'admin', roleChosenAt: '2026-10-20' };
    render(<UploadPage />);
    expect(links()).toEqual(['Admin -> /admin', 'Teacher dashboard -> /teacher', 'My Sets -> /my-sets', 'History -> /history']);
  });

  it('shows only the sign-in button when signed out', () => {
    state.user = null;
    state.profile = null;
    render(<UploadPage />);
    expect(links()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
  });
});
