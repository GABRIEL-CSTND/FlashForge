import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PAGES_BYTES } from '@/lib/pdf-pages';

const reader = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/read-pdf', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/read-pdf')>()), readPdfPages: reader.read }));

import { planPdfUpload } from '@/lib/prepare-pdf';
import { PdfReadError } from '@/lib/read-pdf';

const MB = 1024 * 1024;
const pdfOf = (megabytes: number) => ({ name: 'lecture.pdf', size: megabytes * MB }) as File;
const TEXT_PAGES = Array.from({ length: 40 }, (_, i) => `Page ${i + 1}. The Calvin cycle takes place in the stroma of the chloroplast.`);
const PICTURE_PAGES = ['', '  ', '3'];

beforeEach(() => {
  reader.read.mockReset();
});

describe('planPdfUpload: a PDF with text', () => {
  it('sends only its text, however big the file is', async () => {
    reader.read.mockResolvedValue(TEXT_PAGES);
    for (const size of [1, 4, 12, 80]) {
      expect(await planPdfUpload(pdfOf(size))).toEqual({ kind: 'pages', pages: TEXT_PAGES });
    }
  });

  it('passes the reading progress on', async () => {
    reader.read.mockImplementation(async (_file, onProgress) => {
      onProgress(1, 40);
      onProgress(40, 40);
      return TEXT_PAGES;
    });
    const progress = vi.fn();
    await planPdfUpload(pdfOf(12), progress);
    expect(progress.mock.calls).toEqual([
      [1, 40],
      [40, 40],
    ]);
  });

  it('thins the pages of a PDF with more text than a request can hold', async () => {
    reader.read.mockResolvedValue(Array.from({ length: 2000 }, (_, i) => `Page ${i + 1}. ` + 'dense text '.repeat(400)));
    const plan = await planPdfUpload(pdfOf(60));
    expect(plan.kind).toBe('pages');
    if (plan.kind === 'pages') {
      expect(plan.pages).toHaveLength(2000);
      expect(JSON.stringify(plan.pages).length).toBeLessThanOrEqual(MAX_PAGES_BYTES);
    }
  });
});

describe('planPdfUpload: a scanned PDF (pictures of pages)', () => {
  it('sends the file itself when it is small enough, so the AI can look at it', async () => {
    reader.read.mockResolvedValue(PICTURE_PAGES);
    expect(await planPdfUpload(pdfOf(3))).toEqual({ kind: 'file' });
  });

  it('explains when it is too big to send', async () => {
    reader.read.mockResolvedValue(PICTURE_PAGES);
    const plan = await planPdfUpload(pdfOf(20));
    expect(plan).toEqual({ kind: 'problem', message: expect.stringMatching(/mostly scanned pictures.*over 4 MB/) });
  });
});

describe('planPdfUpload: a PDF the browser can’t read', () => {
  it('lets the server try a small one', async () => {
    reader.read.mockRejectedValue(new PdfReadError('unreadable', 'broken'));
    expect(await planPdfUpload(pdfOf(2))).toEqual({ kind: 'file' });
    reader.read.mockRejectedValue(new Error('something unexpected'));
    expect(await planPdfUpload(pdfOf(2))).toEqual({ kind: 'file' });
  });

  it('explains when a big one can’t be sent for the server to try', async () => {
    reader.read.mockRejectedValue(new PdfReadError('unreadable', 'broken'));
    expect(await planPdfUpload(pdfOf(30))).toEqual({ kind: 'problem', message: expect.stringContaining("couldn't read this PDF") });
  });

  it('tells the student when it is password protected, even a small one', async () => {
    reader.read.mockRejectedValue(new PdfReadError('password', 'locked'));
    for (const size of [1, 30]) {
      expect(await planPdfUpload(pdfOf(size))).toEqual({ kind: 'problem', message: expect.stringContaining('password protected') });
    }
  });

  it('says how many pages it has when there are too many', async () => {
    reader.read.mockRejectedValue(new PdfReadError('too-many-pages', 'long', 3500));
    expect(await planPdfUpload(pdfOf(60))).toEqual({
      kind: 'problem',
      message: expect.stringMatching(/3,500 pages.*2,000/),
    });
  });
});
