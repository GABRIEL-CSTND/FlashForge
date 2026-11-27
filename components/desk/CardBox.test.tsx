// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

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
      'FlashForge -> /', 'Play live -> /play',
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
      'FlashForge -> /', 'Play live -> /play',
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
      'FlashForge -> /', 'Play live -> /play',
    ]);
  });

  it('shows My Sets and History while the profile is still loading', () => {
    signIn(null);
    render(<CardBox />);
    expect(links()).toEqual(['My Sets -> /my-sets', 'History -> /history', 'Guide -> /guide', 'FlashForge -> /', 'Play live -> /play']);
  });

  it('shows the Guide tab and FlashForge plate when signed out', () => {
    state.user = null;
    state.profile = null;
    render(<CardBox />);
    expect(links()).toEqual(['Guide -> /guide', 'FlashForge -> /', 'Play live -> /play']);
  });

  it('marks the tab of the page you are on, including the pages below it', () => {
    signIn('teacher');
    state.pathname = '/teacher/classes/abc';
    render(<CardBox />);
    expect(screen.getByRole('link', { name: 'Classes' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'My Sets' }).getAttribute('aria-current')).toBeNull();
  });

  it('marks Play live, on the front of the box, while in a live game', () => {
    state.pathname = '/play/K7MQ';
    render(<CardBox />);
    expect(screen.getByRole('link', { name: 'Play live' }).getAttribute('aria-current')).toBe('page');
  });
});

describe('full screen', () => {
  let fullscreenElement: Element | null = null;

  function setFullscreenElement(element: Element | null) {
    fullscreenElement = element;
    document.dispatchEvent(new Event('fullscreenchange'));
  }

  function mockFullscreen() {
    const request = vi.fn(async () => setFullscreenElement(document.documentElement));
    const exit = vi.fn(async () => setFullscreenElement(null));
    Object.defineProperties(document, {
      fullscreenEnabled: { configurable: true, value: true },
      fullscreenElement: { configurable: true, get: () => fullscreenElement },
      exitFullscreen: { configurable: true, value: exit },
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });
    return { request, exit };
  }

  afterEach(() => {
    Reflect.deleteProperty(document, 'fullscreenEnabled');
    Reflect.deleteProperty(document, 'fullscreenElement');
    Reflect.deleteProperty(document, 'exitFullscreen');
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    fullscreenElement = null;
  });

  it('enters full screen for the whole page and exits from the same button', () => {
    const { request, exit } = mockFullscreen();
    render(<CardBox />);

    fireEvent.click(screen.getByRole('button', { name: 'Enter full screen' }));
    expect(request).toHaveBeenCalledOnce();
    expect(document.fullscreenElement).toBe(document.documentElement);

    fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(exit).toHaveBeenCalledOnce();
    expect(document.fullscreenElement).toBeNull();
    expect(screen.getByRole('button', { name: 'Enter full screen' })).toBeTruthy();
  });

  it('updates when the browser exits full screen', () => {
    mockFullscreen();
    render(<CardBox />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter full screen' }));

    act(() => setFullscreenElement(null));
    expect(screen.getByRole('button', { name: 'Enter full screen' })).toBeTruthy();
  });

  it('reports a rejected request and lets the user retry', async () => {
    const { request } = mockFullscreen();
    request.mockRejectedValueOnce(new Error('Full screen denied'));
    render(<CardBox />);

    const button = screen.getByRole('button', { name: 'Enter full screen' });
    fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toBe('Could not enter full screen.');

    fireEvent.click(button);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeTruthy();
  });

  it('hides the control when full screen is unavailable', () => {
    render(<CardBox />);
    expect(screen.queryByRole('button', { name: 'Enter full screen' })).toBeNull();
  });
});
