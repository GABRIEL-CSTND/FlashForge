// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
// Reading a PDF needs PDF.js and a real PDF; that is tested in lib/read-pdf.test.ts.
// Here the page is given the outcome, and sends the file itself unless told otherwise.
type PdfPlan = { kind: 'pages'; pages: string[] } | { kind: 'file' } | { kind: 'problem'; message: string };
const pdf = vi.hoisted(() => ({
  plan: null as null | ((file: File, onProgress?: (done: number, total: number) => void) => Promise<PdfPlan>),
}));
vi.mock('@/lib/prepare-pdf', () => ({
  planPdfUpload: vi.fn((file: File, onProgress?: (done: number, total: number) => void) =>
    pdf.plan ? pdf.plan(file, onProgress) : Promise.resolve({ kind: 'file' })
  ),
}));

import UploadPage from '@/app/page';
import { planPdfUpload } from '@/lib/prepare-pdf';
import { encodeEvent, PROGRESS_MIME, type ProgressEvent } from '@/lib/generation-progress';

// What the page sent to /api/generate, as plain fields.
let sentForms: Record<string, string>[];

beforeEach(() => {
  sentForms = [];
  pdf.plan = null;
  vi.mocked(planPdfUpload).mockClear();
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

// The "Make me 10 medium flashcards" card: each word opens paper slips.
const word = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}: `) });
const slips = (name: string) => {
  fireEvent.click(word(name));
  return within(screen.getByRole('group', { name }));
};
const pick = (name: string, option: string) => fireEvent.click(slips(name).getByRole('button', { name: new RegExp(`^${option}`) }));
const make = () => fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));
const makeButton = () => screen.getByRole('button', { name: 'Make my deck' }) as HTMLButtonElement;
const typeOnSheet = (text: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: 'Your notes, a link or a topic' }), { target: { value: text } });

function chooseFile() {
  const input = document.getElementById('file-input') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['Photosynthesis notes'], 'notes.txt', { type: 'text/plain' })] } });
}

describe('upload page options', () => {
  it('starts with 10 medium flashcards', () => {
    render(<UploadPage />);
    expect(word('How many').textContent).toBe('10');
    expect(word('How hard').textContent).toBe('medium');
    expect(word('What kind').textContent).toBe('flashcards');
    const counts = slips('How many');
    expect(counts.getAllByRole('button').map((b) => b.textContent)).toEqual(['5', '10', '15', '20', '30']);
    expect(counts.getByRole('button', { name: '10' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('offers true or false, and says what each kind of deck is (#68)', () => {
    render(<UploadPage />);
    const kinds = slips('What kind');
    expect(kinds.getAllByRole('button').map((b) => b.querySelector('.font-semibold')?.textContent)).toEqual([
      'Flashcards',
      'Multiple choice',
      'True or false',
      'Mixed quiz',
    ]);
    expect(kinds.getByRole('button', { name: /^Flashcards/ }).textContent).toContain('Flip, type or match them');
    expect(kinds.getByRole('button', { name: /^True or false/ }).textContent).toContain('Decide whether each statement is true or false');
    expect(kinds.getByRole('button', { name: /^Mixed quiz/ }).textContent).toContain(
      'Part I multiple choice, Part II true or false, Part III identification'
    );
    fireEvent.click(kinds.getByRole('button', { name: /^True or false/ }));
    expect(screen.queryByRole('group', { name: 'What kind' })).toBeNull();
    expect(word('What kind').textContent).toBe('true-or-false statements');
  });

  it('closes the slips with Escape and gives focus back to the word', () => {
    render(<UploadPage />);
    slips('How hard');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'How hard' })).toBeNull();
    expect(document.activeElement).toBe(word('How hard'));
  });

  it('takes Word and PowerPoint files, and explains the ones it cannot take (#71)', () => {
    render(<UploadPage />);
    const input = document.getElementById('file-input') as HTMLInputElement;
    expect(input.accept).toBe('.pdf,.docx,.pptx,.txt,.jpg,.jpeg,.png,.webp');
    expect(screen.getByText('PDF, Word, PowerPoint, TXT or a photo')).toBeTruthy();
    const choose = (file: File) => fireEvent.change(input, { target: { files: [file] } });

    choose(new File(['x'], 'lecture.ppt'));
    expect(screen.getByText("Older PowerPoint (.ppt) files can't be read. Save it as .pptx or PDF first.")).toBeTruthy();
    // Only a PDF may be big (#44); every other file keeps the 4 MB limit.
    choose(new File([new Uint8Array(5 * 1024 * 1024)], 'big deck.pptx'));
    expect(screen.getByText(/This file is 5.0 MB/)).toBeTruthy();
    expect(makeButton().disabled).toBe(true);

    choose(new File(['x'], 'Lecture 3.pptx'));
    expect(screen.getByText('Lecture 3.pptx')).toBeTruthy();
    expect(screen.getByText('PowerPoint slides · 1 KB')).toBeTruthy();
    expect(screen.getByText('from Lecture 3.pptx')).toBeTruthy();
    expect(makeButton().disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Take the file off the sheet' }));
    expect(screen.queryByText('Lecture 3.pptx')).toBeNull();
    expect(makeButton().disabled).toBe(true);
  });

  it('shrinks a photo before checking its size and sending it (#72)', async () => {
    render(<UploadPage />);
    const input = document.getElementById('file-input') as HTMLInputElement;
    shrink.to = new File([new Uint8Array(900 * 1024)], 'IMG_2034.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(6 * 1024 * 1024)], 'IMG_2034.HEIC.png', { type: 'image/png' })] } });
    expect(await screen.findByText('IMG_2034.jpg')).toBeTruthy();
    expect(screen.queryByText(/This file is/)).toBeNull();
    make();
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(sentForms[0].file).toBe('file:IMG_2034.jpg');
    shrink.to = null;
  });

  it('makes a deck from a typed topic at the chosen difficulty, and credits the article (#79)', async () => {
    render(<UploadPage />);
    expect(slips('How hard').getByRole('button', { name: /^Hard/ }).textContent).toContain(
      'Specific details and how ideas connect, with tricky choices.'
    );
    fireEvent.click(screen.getByRole('button', { name: /^Hard/ }));
    expect(word('How hard').textContent).toBe('hard');
    typeOnSheet('x');
    expect(screen.getByText('Looks like a topic. We’ll look it up on Wikipedia.')).toBeTruthy();
    make();
    expect(screen.getByText('Type a topic, like “Photosynthesis”.')).toBeTruthy();
    expect(sentForms).toEqual([]);

    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
      sentForms.push(Object.fromEntries([...(init!.body as FormData).entries()].map(([k, v]) => [k, String(v)])));
      return new Response(
        JSON.stringify({
          title: 'Photosynthesis',
          sourceFilename: 'https://en.wikipedia.org/wiki/Photosynthesis',
          source: { name: 'Wikipedia: Photosynthesis', url: 'https://en.wikipedia.org/wiki/Photosynthesis' },
          studyType: 'flashcard',
          items: [{ question: 'Pigment that absorbs light', answer: 'Chlorophyll' }],
        }),
        { status: 200 }
      );
    });
    typeOnSheet(' photosynthesis ');
    expect(screen.queryByText('Type a topic, like “Photosynthesis”.')).toBeNull();
    expect(screen.getByText('about “photosynthesis”')).toBeTruthy();
    make();
    expect(await screen.findByText('Pigment that absorbs light')).toBeTruthy();
    expect(sentForms).toEqual([{ topic: 'photosynthesis', studyType: 'flashcard', count: '10', difficulty: 'hard' }]);
    const credit = screen.getByRole('link', { name: 'Wikipedia: Photosynthesis' });
    expect(credit.getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Photosynthesis');
  });

  it('sends a link to a web page, adding https:// when it was left off (#74)', async () => {
    render(<UploadPage />);
    typeOnSheet('example.org/notes');
    expect(screen.getByText('Looks like a link. We’ll read the page.')).toBeTruthy();
    expect(screen.getByText('from the web page you linked')).toBeTruthy();
    make();
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(sentForms).toEqual([{ url: 'https://example.org/notes', studyType: 'flashcard', count: '10', difficulty: 'medium' }]);
  });

  it('sends pasted notes, with a switch for short notes that look like a topic (#70)', async () => {
    render(<UploadPage />);
    expect(makeButton().disabled).toBe(true);

    typeOnSheet('Stroma');
    expect(screen.getByText('Looks like a topic. We’ll look it up on Wikipedia.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use it as notes' }));
    expect(screen.getByText('Using it as notes')).toBeTruthy();
    expect(screen.getByText('from the notes on the sheet')).toBeTruthy();
    make();
    expect(screen.getByText('Paste at least a sentence or two of your notes.')).toBeTruthy();
    expect(sentForms).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Look it up as a topic' }));
    expect(screen.getByText('about “Stroma”')).toBeTruthy();

    typeOnSheet('x'.repeat(30_001));
    expect(screen.getByText('30,001 / 30,000 characters').className).toContain('text-pencil');
    make();
    expect(screen.getByText(/That's 30,001 characters/)).toBeTruthy();
    expect(sentForms).toEqual([]);

    typeOnSheet('The stroma is the fluid inside the chloroplast.');
    expect(screen.getByText('Looks like notes')).toBeTruthy();
    make();
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(sentForms).toEqual([
      { text: 'The stroma is the fluid inside the chloroplast.', studyType: 'flashcard', count: '10', difficulty: 'medium' },
    ]);
  });

  it('sends the chosen kind of deck and number of cards with the file (#65)', async () => {
    render(<UploadPage />);
    pick('What kind', 'Multiple choice');
    pick('How many', '20');
    expect(word('How many').textContent).toBe('20');
    expect(word('What kind').textContent).toBe('multiple-choice questions');
    chooseFile();
    make();
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(sentForms).toEqual([{ file: 'file:notes.txt', studyType: 'multiple_choice', count: '20', difficulty: 'medium' }]);
  });
});

describe('the new deck (desk redesign, phase 3)', () => {
  it('lays the cards out with Start studying, which gathers them onto the study desk', async () => {
    render(<UploadPage />);
    chooseFile();
    make();
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Your new cards' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'notes' })).toBeTruthy();
    expect(screen.getByText('Flashcards · 1 card')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start studying' }));
    expect(await screen.findByRole('button', { name: 'Flip the card' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Your new cards' })).toBeNull();
  });
});

describe('progress while generating', () => {
  const encoder = new TextEncoder();
  const currentStep = () => document.querySelector('[aria-current="step"]')?.textContent ?? null;
  const RESULT: ProgressEvent = {
    type: 'result',
    status: 200,
    body: {
      title: 'notes',
      sourceFilename: 'notes.txt',
      studyType: 'flashcard',
      items: [{ question: 'Fluid inside the chloroplast', answer: 'Stroma' }],
    },
  };

  // A server whose steps the test sends one at a time.
  function serverYouControl() {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, { status: 200, headers: { 'Content-Type': PROGRESS_MIME } }));
    vi.stubGlobal('fetch', fetchMock);
    return {
      fetchMock,
      send: (event: ProgressEvent) => controller.enqueue(encoder.encode(encodeEvent(event))),
      end: () => controller.close(),
    };
  }

  it('shows each step as the server reaches it, then the study guide', async () => {
    const server = serverYouControl();
    render(<UploadPage />);
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));

    // Nothing from the server yet: the upload is the step under way.
    await waitFor(() => expect(currentStep()).toBe('Uploading your file'));
    expect(screen.getByText('Reading your file')).toBeTruthy();

    server.send({ type: 'step', step: 'reading' });
    await waitFor(() => expect(currentStep()).toBe('Reading your file'));

    server.send({ type: 'step', step: 'writing' });
    await waitFor(() => expect(currentStep()).toBe('Writing your study guide with AI'));
    expect(screen.getByText('Working for 0s')).toBeTruthy();

    server.send({ type: 'step', step: 'writing', attempt: 2 });
    expect(await screen.findByText("That try didn't work out, so we're trying again (try 2).")).toBeTruthy();
    // The server's real news replaces the time-based guess.
    expect(screen.queryByText(/extra busy right now/)).toBeNull();

    server.send(RESULT);
    server.end();
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Progress' })).toBeNull();
  });

  it('asks the server for progress', async () => {
    const server = serverYouControl();
    render(<UploadPage />);
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));
    await waitFor(() => expect(server.fetchMock).toHaveBeenCalled());
    const init = (server.fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Accept).toBe(PROGRESS_MIME);
    server.send(RESULT);
    server.end();
    await screen.findByText('Fluid inside the chloroplast');
  });

  it('shows the deck being made in place of the notes sheet until the cards arrive', async () => {
    const server = serverYouControl();
    render(<UploadPage />);
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));

    expect(await screen.findByRole('heading', { name: 'Making 10 medium flashcards' })).toBeTruthy();
    expect(screen.getByText('from notes.txt')).toBeTruthy();
    // The pencil and the shuffling deck are only for the eyes; the steps are read out.
    expect(document.querySelector('.making-scene')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('list', { name: 'Progress' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make my deck' })).toBeNull();

    server.send(RESULT);
    server.end();
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(document.querySelector('.making-scene')).toBeNull();
  });

  // Cards the AI sends while it writes (#94): a "cards" event carries the deck so far.
  const CARD_LIST = [
    { question: 'Fluid inside the chloroplast', answer: 'Stroma' },
    { question: 'Green pigment that absorbs light', answer: 'Chlorophyll' },
    { question: 'Pores that let gases in and out of a leaf', answer: 'Stomata' },
  ];
  const cardsSoFar = (n: number): ProgressEvent => ({
    type: 'cards',
    title: 'notes',
    sourceFilename: 'notes.txt',
    source: null,
    studyType: 'flashcard',
    items: CARD_LIST.slice(0, n),
  });
  const WHOLE_DECK: ProgressEvent = {
    type: 'result',
    status: 200,
    body: { title: 'notes', sourceFilename: 'notes.txt', studyType: 'flashcard', items: CARD_LIST, historyId: null },
  };

  it('puts the first cards on the desk while the AI writes the rest (#94)', async () => {
    const server = serverYouControl();
    render(<UploadPage />);
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));
    await screen.findByRole('heading', { name: 'Making 10 medium flashcards' });

    // The first cards turn the deck being made into the spread, landing one at a time.
    server.send(cardsSoFar(2));
    expect(await screen.findByText(CARD_LIST[0].question)).toBeTruthy();
    expect(await screen.findByText(CARD_LIST[1].question)).toBeTruthy();
    expect(document.querySelector('.making-scene')).toBeNull();
    expect(screen.getByText('2 of 10 cards written…')).toBeTruthy();
    // A deck still being written can be studied, not saved yet.
    expect(screen.getByText(/still being written/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save this study guide' })).toBeNull();

    // The whole deck arrives: the rest of the cards land, and it can be saved.
    server.send(WHOLE_DECK);
    server.end();
    expect(await screen.findByText(CARD_LIST[2].question)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Save this study guide' })).toBeTruthy();
  });

  it('keeps the cards already on the desk when the AI stops partway (#94)', async () => {
    const server = serverYouControl();
    render(<UploadPage />);
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));
    server.send(cardsSoFar(2));
    await screen.findByText(CARD_LIST[1].question);

    server.send({ type: 'result', status: 503, body: { error: 'The AI is busy right now. Please try again.' } });
    server.end();
    expect(await screen.findByText(/so this deck has 2/)).toBeTruthy();
    expect(screen.queryByText('The AI is busy right now. Please try again.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save this study guide' })).toBeTruthy();
  });

  it('stops a deck still being written when the student leaves it (#94)', async () => {
    const server = serverYouControl();
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<UploadPage />);
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));
    server.send(cardsSoFar(1));
    await screen.findByText(CARD_LIST[0].question);

    fireEvent.click(screen.getByRole('button', { name: '← Exit' }));
    const init = (server.fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal?.aborted).toBe(true);
    expect(await screen.findByRole('button', { name: 'Make my deck' })).toBeTruthy();

    // Its answer, if it still comes, is ignored.
    server.send(WHOLE_DECK);
    server.end();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(CARD_LIST[2].question)).toBeNull();
    expect(screen.getByRole('button', { name: 'Make my deck' })).toBeTruthy();
  });

  it('shows what went wrong, and clears the steps, when the server fails', async () => {
    const server = serverYouControl();
    render(<UploadPage />);
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));
    server.send({ type: 'step', step: 'reading' });
    server.send({ type: 'result', status: 503, body: { error: 'The AI is busy right now. Please try again.' } });
    server.end();
    expect(await screen.findByText('The AI is busy right now. Please try again.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Progress' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Make my deck' })).toBeTruthy();
  });

  it('tells the user when the connection drops mid-way', async () => {
    const server = serverYouControl();
    render(<UploadPage />);
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));
    server.send({ type: 'step', step: 'writing' });
    server.end();
    expect(await screen.findByText(/connection was interrupted/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Progress' })).toBeNull();
  });

  it('starts from the first step again on the next try', async () => {
    const first = serverYouControl();
    render(<UploadPage />);
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));
    first.send({ type: 'step', step: 'writing' });
    await waitFor(() => expect(currentStep()).toBe('Writing your study guide with AI'));
    first.send({ type: 'result', status: 503, body: { error: 'The AI is busy right now. Please try again.' } });
    first.end();
    await screen.findByText('The AI is busy right now. Please try again.');

    const second = serverYouControl();
    fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));
    await waitFor(() => expect(currentStep()).toBe('Uploading your file'));
    second.send(RESULT);
    second.end();
    await screen.findByText('Fluid inside the chloroplast');
  });
});

describe('big PDFs (#44)', () => {
  const MB = 1024 * 1024;
  const choosePdf = (name = 'lecture.pdf', megabytes = 12) => {
    const input = document.getElementById('file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(megabytes * MB)], name, { type: 'application/pdf' })] } });
  };
  const generate = () => fireEvent.click(screen.getByRole('button', { name: 'Make my deck' }));
  const currentStep = () => document.querySelector('[aria-current="step"]')?.textContent ?? null;
  const PAGES = ['The Calvin cycle takes place in the stroma.', 'Mitochondria make most of the cell’s ATP.'];

  it('accepts a PDF far over 4 MB, and sends only its text, not the file', async () => {
    pdf.plan = async () => ({ kind: 'pages', pages: PAGES });
    render(<UploadPage />);
    choosePdf('Week 4 lecture.pdf', 12);
    // Picked without complaint, so the button is ready.
    expect(screen.getByText('Week 4 lecture.pdf')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Make my deck' }) as HTMLButtonElement).disabled).toBe(false);

    generate();
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();

    expect(sentForms).toHaveLength(1);
    expect(sentForms[0]).not.toHaveProperty('file');
    expect(JSON.parse(sentForms[0].pages)).toEqual(PAGES);
    expect(sentForms[0].fileName).toBe('Week 4 lecture.pdf');
    expect(sentForms[0].studyType).toBe('flashcard');
    // Twelve megabytes became a few dozen bytes.
    expect(sentForms[0].pages.length).toBeLessThan(200);
  });

  it('reads even a small PDF in the browser', async () => {
    pdf.plan = async () => ({ kind: 'pages', pages: PAGES });
    render(<UploadPage />);
    choosePdf('short.pdf', 1);
    generate();
    await screen.findByText('Fluid inside the chloroplast');
    expect(planPdfUpload).toHaveBeenCalledTimes(1);
    expect(sentForms[0]).toHaveProperty('pages');
  });

  it('shows how far the reading has got, then moves on to sending', async () => {
    let finish!: () => void;
    pdf.plan = (_file, onProgress) =>
      new Promise((resolve) => {
        onProgress?.(0, 0);
        onProgress?.(12, 140);
        finish = () => resolve({ kind: 'pages', pages: PAGES });
      });
    render(<UploadPage />);
    choosePdf();
    generate();

    // Reading on this device is the step under way: it is not an upload.
    await waitFor(() => expect(currentStep()).toBe('Reading your PDF on this device (12 of 140 pages)'));
    expect(screen.queryByText('Uploading your file')).toBeNull();
    expect(sentForms).toHaveLength(0);

    finish();
    expect(await screen.findByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(sentForms).toHaveLength(1);
  });

  it('sends the file itself when it is scanned pictures and small enough', async () => {
    pdf.plan = async () => ({ kind: 'file' });
    render(<UploadPage />);
    choosePdf('scan.pdf', 3);
    generate();
    await screen.findByText('Fluid inside the chloroplast');
    expect(sentForms[0]).toEqual(expect.objectContaining({ file: 'file:scan.pdf' }));
    expect(sentForms[0]).not.toHaveProperty('pages');
  });

  it('explains why a PDF cannot be used, sends nothing, and lets the student try again', async () => {
    const message = "This PDF is mostly scanned pictures, and it's over 4 MB, which is too big to send.";
    pdf.plan = async () => ({ kind: 'problem', message });
    render(<UploadPage />);
    choosePdf('scan.pdf', 30);
    generate();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(sentForms).toHaveLength(0);
    expect(screen.queryByRole('list', { name: 'Progress' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Make my deck' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('turns away an enormous PDF as soon as it is picked', () => {
    render(<UploadPage />);
    const input = document.getElementById('file-input') as HTMLInputElement;
    const huge = new File(['x'], 'book.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: 150 * MB });
    fireEvent.change(input, { target: { files: [huge] } });
    expect(screen.getByText(/This PDF is 150 MB. PDFs can be up to 100 MB/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Make my deck' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not read anything that is not a PDF', async () => {
    render(<UploadPage />);
    chooseFile();
    generate();
    await screen.findByText('Fluid inside the chloroplast');
    expect(planPdfUpload).not.toHaveBeenCalled();
    expect(sentForms[0]).toEqual(expect.objectContaining({ file: 'file:notes.txt' }));
  });
});
