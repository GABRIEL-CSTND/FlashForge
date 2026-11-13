// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ user: null as unknown, profile: null as unknown, pathname: '/' }));

vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: state.user, loading: false }),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile: state.profile }) }));

import CardBox from '@/components/desk/CardBox';

afterEach(() => {
  cleanup();
  state.pathname = '/';
});

const links = () => screen.queryAllByRole('link').map((a) => `${a.textContent} -> ${a.getAttribute('href')}`);
const signIn = (role: string | null) => {
  state.user = { id: 'u', email: 'u@example.com' };
  state.profile = role ? { role, roleChosenAt: '2026-10-20', displayName: null } : null;
};

describe('card box', () => {
  it('gives students My Sets, History and My Classes', () => {
    signIn('student');
    render(<CardBox />);
    expect(links()).toEqual([
      'My Sets -> /my-sets',
      'History -> /history',
      'My Classes -> /classes',
      'Guide -> /guide',
      'FlashForge -> /',
    ]);
  });

  it('gives teachers Classes instead of My Classes', () => {
    signIn('teacher');
    render(<CardBox />);
    expect(links()).toEqual([
      'My Sets -> /my-sets',
      'History -> /history',
      'Classes -> /teacher',
      'Guide -> /guide',
      'FlashForge -> /',
    ]);
  });

  it('gives admins Classes and the Admin pages', () => {
    signIn('admin');
    render(<CardBox />);
    expect(links()).toEqual([
      'My Sets -> /my-sets',
      'History -> /history',
      'Classes -> /teacher',
      'Admin -> /admin',
      'Guide -> /guide',
      'FlashForge -> /',
    ]);
  });

  it('shows My Sets and History while the profile is still loading', () => {
    signIn(null);
    render(<CardBox />);
    expect(links()).toEqual(['My Sets -> /my-sets', 'History -> /history', 'Guide -> /guide', 'FlashForge -> /']);
  });

  it('shows the Guide tab and FlashForge plate when signed out', () => {
    state.user = null;
    state.profile = null;
    render(<CardBox />);
    expect(links()).toEqual(['Guide -> /guide', 'FlashForge -> /']);
  });

  it('marks the tab of the page you are on, including the pages below it', () => {
    signIn('teacher');
    state.pathname = '/teacher/classes/abc';
    render(<CardBox />);
    expect(screen.getByRole('link', { name: 'Classes' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'My Sets' }).getAttribute('aria-current')).toBeNull();
  });
});
