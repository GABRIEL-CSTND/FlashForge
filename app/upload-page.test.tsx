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
// jsdom can't decode images; the real shrinking is checked in the browser.
const shrink = vi.hoisted(() => ({ to: null as null | File }));
vi.mock('@/lib/shrink-image', () => ({ shrinkImage: vi.fn(async (file: File) => shrink.to ?? file) }));

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
    expect(buttonsIn('What kind of study guide?')).toEqual(['Flashcards', 'Multiple choice', 'True or false', 'Mixed quiz']);
    expect(screen.getByText(/Flip, type or match them/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'True or false' }));
    expect(pressed('What kind of study guide?')).toEqual(['True or false']);
    expect(screen.getByText(/Decide whether each statement is true or false/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mixed quiz' }));
    expect(screen.getByText(/Part I multiple choice, Part II true or false, Part III identification/)).toBeTruthy();
  });

  it('takes Word and PowerPoint files, and explains the ones it cannot take (#71)', () => {
    render(<UploadPage />);
    const input = document.getElementById('file-input') as HTMLInputElement;
    expect(input.accept).toBe('.pdf,.docx,.pptx,.txt,.jpg,.jpeg,.png,.webp');
    expect(screen.getByText('or click to browse (PDF, Word, PowerPoint, TXT or a photo)')).toBeTruthy();
    const choose = (file: File) => fireEvent.change(input, { target: { files: [file] } });

    choose(new File(['x'], 'lecture.ppt'));
    expect(screen.getByText("Older PowerPoint (.ppt) files can't be read. Save it as .pptx or PDF first.")).toBeTruthy();
    choose(new File([new Uint8Array(5 * 1024 * 1024)], 'scan.pdf', { type: 'application/pdf' }));
    expect(screen.getByText(/This file is 5.0 MB/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Generate Study Guide' }) as HTMLButtonElement).disabled).toBe(true);

    choose(new File(['x'], 'Lecture 3.pptx'));
    expect(screen.getByText('Lecture 3.pptx')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Generate Study Guide' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shrinks a photo before checking its size and sending it (#72)', async () => {
    render(<UploadPage />);
    const input = document.getElementById('file-input') as HTMLInputElement;
    shrink.to = new File([new Uint8Array(900 * 1024)], 'IMG_2034.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(6 * 1024 * 1024)], 'IMG_2034.HEIC.png', { type: 'image/png' })] } });
    expect(await screen.findByText('IMG_2034.jpg')).toBeTruthy();
    expect(screen.queryByText(/This file is/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Study Guide' }));
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(sentForms[0].file).toBe('file:IMG_2034.jpg');
    shrink.to = null;
  });

  it('sends a link to a web page (#74)', async () => {
    render(<UploadPage />);
    expect(buttonsIn('Where are your notes?')).toEqual(['Upload a file', 'Paste text', 'Web link']);
    fireEvent.click(screen.getByRole('button', { name: 'Web link' }));
    const box = screen.getByRole('textbox', { name: 'Link to a web page' });
    fireEvent.change(box, { target: { value: 'example.org/notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Study Guide' }));
    expect(screen.getByText('Paste a full link, starting with https://')).toBeTruthy();
    expect(sentForms).toEqual([]);

    fireEvent.change(box, { target: { value: ' https://example.org/notes ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Study Guide' }));
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(sentForms).toEqual([{ url: 'https://example.org/notes', studyType: 'flashcard', count: '10' }]);
  });

  it('sends pasted notes instead of a file (#70)', async () => {
    render(<UploadPage />);
    expect(pressed('Where are your notes?')).toEqual(['Upload a file']);
    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    const box = screen.getByRole('textbox', { name: 'Your notes' });
    const generate = screen.getByRole('button', { name: 'Generate Study Guide' }) as HTMLButtonElement;
    expect(generate.disabled).toBe(true);

    fireEvent.change(box, { target: { value: 'Stroma' } });
    fireEvent.click(generate);
    expect(screen.getByText('Paste at least a sentence or two of your notes.')).toBeTruthy();
    expect(sentForms).toEqual([]);

    fireEvent.change(box, { target: { value: 'x'.repeat(30_001) } });
    expect(screen.getByText('30,001 / 30,000 characters').className).toContain('text-red-500');
    fireEvent.click(generate);
    expect(screen.getByText(/That's 30,001 characters/)).toBeTruthy();
    expect(sentForms).toEqual([]);

    fireEvent.change(box, { target: { value: 'The stroma is the fluid inside the chloroplast.' } });
    fireEvent.click(generate);
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(sentForms).toEqual([
      { text: 'The stroma is the fluid inside the chloroplast.', studyType: 'flashcard', count: '10' },
    ]);
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
