import { extractText } from 'unpdf';
import { describe, expect, it, vi } from 'vitest';
import { makePdf } from '@/test-utils/make-pdf';
import { MAX_PDF_PAGES } from '@/lib/pdf-pages';
import { PdfReadError, readPdfPages } from '@/lib/read-pdf';

const PAGES = [
  'The Calvin cycle takes place in the stroma of the chloroplast.',
  'Mitochondria make most of the ATP that a cell uses (via respiration).',
  'The nucleus stores the cell’s DNA \\ and controls its activity.',
];
const blob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' });

describe('readPdfPages', () => {
  it('reads each page, in order', async () => {
    const pages = await readPdfPages(blob(makePdf(PAGES)));
    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain('The Calvin cycle takes place in the stroma of the chloroplast.');
    expect(pages[1]).toContain('Mitochondria make most of the ATP that a cell uses (via respiration).');
    expect(pages[2]).toContain('and controls its activity.');
  });

  it('gives exactly the page text the server reads from the same PDF', async () => {
    const bytes = makePdf(PAGES);
    const onServer = await extractText(new Uint8Array(bytes), { mergePages: false });
    expect(await readPdfPages(blob(bytes))).toEqual(onServer.text);
  });

  it('reports its progress, from none to all of the pages', async () => {
    const progress: [number, number][] = [];
    await readPdfPages(blob(makePdf(PAGES)), (done, total) => progress.push([done, total]));
    expect(progress).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('reads a PDF bigger than a request can carry (10+ MB), and the text is tiny by comparison', async () => {
    const bytes = makePdf(PAGES, { padBytes: 12 * 1024 * 1024 });
    expect(bytes.length).toBeGreaterThan(10 * 1024 * 1024);
    const pages = await readPdfPages(blob(bytes));
    expect(pages).toHaveLength(3);
    // What would be sent is a few hundred bytes, not twelve megabytes.
    expect(JSON.stringify(pages).length).toBeLessThan(1000);
  });

  it('reads a long PDF', async () => {
    const long = Array.from({ length: 150 }, (_, i) => `Lecture page number ${i + 1} about cells.`);
    const pages = await readPdfPages(blob(makePdf(long)));
    expect(pages).toHaveLength(150);
    expect(pages[149]).toContain('Lecture page number 150 about cells.');
  });

  it('says so when the file is not a PDF', async () => {
    const error = await readPdfPages(new Blob(['this is not a pdf'])).catch((e) => e);
    expect(error).toBeInstanceOf(PdfReadError);
    expect(error.reason).toBe('unreadable');
  });

  it('refuses a PDF with too many pages, saying how many it has', async () => {
    const tooMany = Array.from({ length: MAX_PDF_PAGES + 1 }, () => 'x');
    const progress = vi.fn();
    const error = await readPdfPages(blob(makePdf(tooMany)), progress).catch((e) => e);
    expect(error).toBeInstanceOf(PdfReadError);
    expect(error.reason).toBe('too-many-pages');
    expect(error.pageCount).toBe(MAX_PDF_PAGES + 1);
    expect(progress).not.toHaveBeenCalled();
  });
});
