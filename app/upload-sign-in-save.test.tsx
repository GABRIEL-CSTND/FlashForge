// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Saving a guide made while signed out: the page keeps it in sessionStorage,
// Google sign-in reloads the page, and the guide comes back and is saved (#89).

const SET = '00000000-0000-4000-8000-0000000000d2';
const KEY = 'flashforge_pending_result';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
const auth = vi.hoisted(() => ({ user: null as null | { id: string; email: string }, signIn: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'sam-token' } } }) } },
}));
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: auth.user, loading: false }),
  signInWithGoogle: auth.signIn,
  signOut: vi.fn(),
}));
vi.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile: null }) }));

import UploadPage from '@/app/page';

const GUIDE = {
  title: 'notes',
  sourceFilename: 'notes.txt',
  studyType: 'flashcard',
  items: [{ question: 'Fluid inside the chloroplast', answer: 'Stroma' }],
  historyId: null,
};

let saves: Record<string, unknown>[];
let saveFails: boolean;

beforeEach(() => {
  auth.user = null;
  auth.signIn.mockClear();
  nav.push.mockClear();
  saves = [];
  saveFails = false;
  sessionStorage.clear();
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/save-set') {
        saves.push(JSON.parse(init.body as string));
        return saveFails
          ? new Response(JSON.stringify({ error: 'Database error' }), { status: 500 })
          : new Response(JSON.stringify({ id: SET }), { status: 200 });
      }
      return new Response(JSON.stringify(GUIDE), { status: 200 });
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

async function generateGuide() {
  render(<UploadPage />);
  const input = document.getElementById('file-input') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['Photosynthesis notes'], 'notes.txt', { type: 'text/plain' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));
  expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
}

describe('saving a guide made while signed out', () => {
  it('keeps the guide before sending the user to sign in', async () => {
    await generateGuide();
    fireEvent.click(screen.getByRole('button', { name: 'Save this study guide' }));
    expect(screen.getByText('Sign in to save this study guide.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(auth.signIn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual(GUIDE);
    // Nothing is saved yet, and the guide is still on screen.
    expect(saves).toEqual([]);
    expect(screen.getByText('Fluid inside the chloroplast')).toBeTruthy();
  });

  it('brings the guide back after signing in and saves it once, without another click', async () => {
    sessionStorage.setItem(KEY, JSON.stringify(GUIDE));
    auth.user = { id: 'sam', email: 'sam@example.com' };
    render(<UploadPage />);

    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/sets/${SET}`));
    expect(saves).toEqual([expect.objectContaining({ title: 'notes', studyType: 'flashcard', items: GUIDE.items })]);
    // Saved, so it isn't brought back again; the page still shows it until the set opens.
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(screen.getByText('Saved ✓')).toBeTruthy();
  });

  it('shows the guide again without saving when the user came back still signed out', async () => {
    sessionStorage.setItem(KEY, JSON.stringify(GUIDE));
    render(<UploadPage />);

    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(saves).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Save this study guide' }));
    expect(screen.getByText('Sign in to save this study guide.')).toBeTruthy();
  });

  it('tries the automatic save only once, and keeps the guide when it fails', async () => {
    saveFails = true;
    sessionStorage.setItem(KEY, JSON.stringify(GUIDE));
    auth.user = { id: 'sam', email: 'sam@example.com' };
    const { rerender } = render(<UploadPage />);

    await waitFor(() => expect(saves).toHaveLength(1));
    rerender(<UploadPage />);
    await act(async () => {});
    expect(saves).toHaveLength(1);
    expect(nav.push).not.toHaveBeenCalled();
    // Still kept, and the user can try again.
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    expect(screen.getByText('Fluid inside the chloroplast')).toBeTruthy();
  });

  it('forgets the kept guide when the user leaves it', async () => {
    sessionStorage.setItem(KEY, JSON.stringify(GUIDE));
    render(<UploadPage />);
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '← Exit' }));
    expect(window.confirm).toHaveBeenCalledWith("Leave this study guide? It hasn't been saved and will be lost.");
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Make my deck' })).toBeTruthy();
    expect(screen.queryByText('Fluid inside the chloroplast')).toBeNull();
  });

  it('ignores a kept guide it cannot read', async () => {
    sessionStorage.setItem(KEY, '{not json');
    render(<UploadPage />);
    expect(screen.getByRole('button', { name: 'Make my deck' })).toBeTruthy();
    sessionStorage.setItem(KEY, JSON.stringify({ title: 'old shape' }));
    cleanup();
    render(<UploadPage />);
    expect(screen.getByRole('button', { name: 'Make my deck' })).toBeTruthy();
  });
});
