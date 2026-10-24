// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: null, loading: false }),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile: null }) }));

import UploadPage from '@/app/page';

// What the page sent to /api/generate, as plain fields.
let sentForms: Record<string, string>[];

beforeEach(() => {
  sentForms = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      sentForms.push(
        Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `file:${v.name}`]))
      );
      return new Response(
        JSON.stringify({
          title: 'notes',
          sourceFilename: 'notes.txt',
          studyType: form.get('studyType'),
          items: [{ question: 'Fluid inside the chloroplast', answer: 'Stroma' }],
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

const buttonsIn = (group: string, selector = 'button') =>
  Array.from(screen.getByRole('group', { name: group }).querySelectorAll(selector), (b) => b.textContent);
const pressed = (group: string) => buttonsIn(group, '[aria-pressed="true"]');

function chooseFile() {
  const input = document.getElementById('file-input') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['Photosynthesis notes'], 'notes.txt', { type: 'text/plain' })] } });
}

describe('upload page options', () => {
  it('starts with flashcards and 10 questions', () => {
    render(<UploadPage />);
    expect(pressed('What kind of study guide?')).toEqual(['Flashcards']);
    expect(pressed('How many questions?')).toEqual(['10']);
    expect(buttonsIn('How many questions?')).toEqual(['5', '10', '15', '20', '30']);
  });

  it('offers true or false, and says what each kind of guide is (#68)', () => {
    render(<UploadPage />);
    expect(buttonsIn('What kind of study guide?')).toEqual(['Flashcards', 'Multiple choice', 'True or false']);
    expect(screen.getByText(/Flip, type or match them/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'True or false' }));
    expect(pressed('What kind of study guide?')).toEqual(['True or false']);
    expect(screen.getByText(/Decide whether each statement is true or false/)).toBeTruthy();
  });

  it('sends the chosen study type and question count with the file (#65)', async () => {
    render(<UploadPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Multiple choice' }));
    fireEvent.click(screen.getByRole('button', { name: '20' }));
    expect(pressed('How many questions?')).toEqual(['20']);
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Study Guide' }));
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(sentForms).toEqual([{ file: 'file:notes.txt', studyType: 'multiple_choice', count: '20' }]);
  });
});
