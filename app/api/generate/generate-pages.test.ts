import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePdf } from '@/test-utils/make-pdf';

// after() needs a Next.js request scope; the usage log isn't what is tested here.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: () => {} };
});
const gate = vi.hoisted(() => ({ refuse: false }));
vi.mock('@/lib/generation-logs', () => ({
  identifyCaller: async () => null,
  startGeneration: async () =>
    gate.refuse ? { allowed: false, limit: 5, resetsAt: '2026-11-02T07:00:00+00:00' } : { allowed: true, id: 1 },
  recordGeneration: async () => {},
}));
// A signed-in user's History entry isn't what is tested here (this caller is signed out).
vi.mock('@/lib/history', () => ({ addToHistory: async () => null }));
// The AI: what it was given.
const ai = vi.hoisted(() => ({ calls: [] as { text: string; units: unknown }[] }));
vi.mock('@/lib/gemini', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gemini')>();
  return {
    ...actual,
    generateStudyItems: vi.fn(async (text: string, _type: string, opts: { units?: unknown; onRequest: (m: string) => void }) => {
      ai.calls.push({ text, units: opts.units });
      opts.onRequest('gemini-3.5-flash');
      return { items: [{ question: 'Q', answer: 'A' }], model: 'gemini-3.5-flash' };
    }),
  };
});

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/generate/route';
import { MAX_PAGES_BYTES, MAX_PDF_PAGES } from '@/lib/pdf-pages';
import { readPdfPages } from '@/lib/read-pdf';

const MB = 1024 * 1024;
const LECTURE = [
  'The Calvin cycle takes place in the stroma of the chloroplast, where it builds sugar from carbon dioxide.',
  'Mitochondria make most of the ATP that a cell uses, by breaking down sugar in a process called respiration.',
  'The nucleus stores the cell’s DNA and controls its activity, including when the cell divides.',
];

async function generate(fields: Record<string, string | File>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (!form.has('studyType')) form.append('studyType', 'flashcard');
  const res = await POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: form }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const pdfFile = (bytes: Uint8Array, name = 'lecture.pdf') => new File([bytes as BlobPart], name, { type: 'application/pdf' });

beforeEach(() => {
  ai.calls = [];
  gate.refuse = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('/api/generate with a PDF read in the browser (#44)', () => {
  it('makes a guide from the pages’ text, titled after the file', async () => {
    const { status, body } = await generate({ pages: JSON.stringify(LECTURE), fileName: 'Week 4 – Cell Biology.pdf' });
    expect(status).toBe(200);
    expect(body).toMatchObject({ title: 'Week 4 – Cell Biology', sourceFilename: 'Week 4 – Cell Biology.pdf', studyType: 'flashcard' });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0].text).toContain('The Calvin cycle takes place in the stroma');
  });

  it('gives the AI exactly what it gets when the same PDF is sent whole', async () => {
    const bytes = makePdf(LECTURE);
    const whole = await generate({ file: pdfFile(bytes) });
    const pages = await readPdfPages(new Blob([bytes as BlobPart]));
    const inBrowser = await generate({ pages: JSON.stringify(pages), fileName: 'lecture.pdf' });
    expect(whole.status).toBe(200);
    expect(inBrowser.status).toBe(200);
    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1].text).toBe(ai.calls[0].text);
    // So the quotes still name the right page.
    expect(ai.calls[1].units).toEqual(ai.calls[0].units);
    expect(whole.body).toEqual(inBrowser.body);
  });

  it('works for a PDF too big to send whole, which the server alone would refuse', async () => {
    const bytes = makePdf(LECTURE, { padBytes: 12 * MB });
    expect(bytes.length).toBeGreaterThan(10 * MB);

    // Sent whole, as before: over the request limit.
    const whole = await generate({ file: pdfFile(bytes) });
    expect(whole.status).toBe(422);
    expect(String(whole.body.error)).toContain('Files can be up to 4 MB');

    // Read in the browser: only a few hundred bytes of text go up.
    const pages = await readPdfPages(new Blob([bytes as BlobPart]));
    const payload = JSON.stringify(pages);
    expect(payload.length).toBeLessThan(2000);
    const inBrowser = await generate({ pages: payload, fileName: 'big-lecture.pdf' });
    expect(inBrowser.status).toBe(200);
    expect(inBrowser.body.title).toBe('big-lecture');
  });

  it('still refuses a PDF over 4 MB sent whole (the server limit is unchanged)', async () => {
    const { status } = await generate({ file: pdfFile(makePdf(LECTURE, { padBytes: 5 * MB })) });
    expect(status).toBe(422);
    expect(ai.calls).toHaveLength(0);
  });

  it('checks what it is sent, and never reaches the AI with something unusable', async () => {
    const bad = [
      'not json',
      '{"a":1}',
      '[]',
      '[1,2,3]',
      JSON.stringify(Array.from({ length: MAX_PDF_PAGES + 1 }, () => 'x')),
      JSON.stringify(['x'.repeat(MAX_PAGES_BYTES + 1)]),
    ];
    for (const pages of bad) {
      const { status, body } = await generate({ pages, fileName: 'lecture.pdf' });
      expect(status).toBe(422);
      expect(typeof body.error).toBe('string');
    }
    expect(ai.calls).toHaveLength(0);
  });

  it('says there is not enough text when the pages are empty', async () => {
    const { status, body } = await generate({ pages: JSON.stringify(['', '  ', '3']), fileName: 'scan.pdf' });
    expect(status).toBe(422);
    expect(body.error).toBe('Could not extract enough readable text from this file.');
    expect(ai.calls).toHaveLength(0);
  });

  it('keeps only a safe file name', async () => {
    const odd = await generate({ pages: JSON.stringify(LECTURE), fileName: '..\\..\\secret/notes\u0000.pdf' });
    expect(odd.body.sourceFilename).toBe('....secretnotes.pdf');
    const none = await generate({ pages: JSON.stringify(LECTURE) });
    expect(none.body).toMatchObject({ title: 'document', sourceFilename: 'document.pdf' });
  });

  it('still applies the daily limit', async () => {
    gate.refuse = true;
    const { status, body } = await generate({ pages: JSON.stringify(LECTURE), fileName: 'lecture.pdf' });
    expect(status).toBe(429);
    expect(body).toMatchObject({ limit: 5 });
    expect(ai.calls).toHaveLength(0);
  });
});
