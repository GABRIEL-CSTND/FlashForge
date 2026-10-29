// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const ENTRY = '00000000-0000-4000-8000-0000000000c1';
const SET = '00000000-0000-4000-8000-0000000000c2';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'sam-token' } } }) } },
}));
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: { id: 'sam', email: 'sam@example.com' }, loading: false }),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile: { role: 'student', roleChosenAt: '2026-10-20' } }) }));

import UploadPage from '@/app/page';

// What /api/generate answers with, and the save requests the page sent.
let historyId: string | null;
let saves: Record<string, unknown>[];

beforeEach(() => {
  historyId = ENTRY;
  saves = [];
  nav.push.mockClear();
  vi.stubGlobal('confirm', vi.fn(() => false));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/save-set') {
        saves.push(JSON.parse(init.body as string));
        return new Response(JSON.stringify({ id: SET }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          title: 'notes',
          sourceFilename: 'notes.txt',
          studyType: 'flashcard',
          items: [{ question: 'Fluid inside the chloroplast', answer: 'Stroma' }],
          historyId,
        }),
        { status: 200 }
      );
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function generateGuide() {
  render(<UploadPage />);
  const input = document.getElementById('file-input') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['Photosynthesis notes'], 'notes.txt', { type: 'text/plain' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate Study Guide' }));
  expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
}

describe('a new guide and History', () => {
  it('saves the guide with its History entry, so History shows it as saved', async () => {
    await generateGuide();
    fireEvent.click(screen.getByRole('button', { name: '💾 Save this study guide' }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/sets/${SET}`));
    expect(saves).toEqual([expect.objectContaining({ title: 'notes', studyType: 'flashcard', historyId: ENTRY })]);
  });

  it("doesn't warn that a guide in History will be lost when leaving it", async () => {
    await generateGuide();
    fireEvent.click(screen.getByRole('button', { name: '← Exit' }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Generate Study Guide' })).toBeTruthy();
  });

  it("still warns when the guide couldn't be kept in History", async () => {
    historyId = null;
    await generateGuide();
    fireEvent.click(screen.getByRole('button', { name: '← Exit' }));
    expect(window.confirm).toHaveBeenCalledWith("Leave this study guide? It hasn't been saved and will be lost.");
    // Cancelled, so the guide is still open.
    expect(screen.getByText('Fluid inside the chloroplast')).toBeTruthy();
  });
});
