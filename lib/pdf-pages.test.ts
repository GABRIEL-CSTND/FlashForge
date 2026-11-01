import { describe, expect, it } from 'vitest';
import {
  cleanFileName,
  fitPages,
  MAX_PAGES_BYTES,
  MAX_PDF_PAGES,
  pagesBytes,
  parsePages,
  UNREADABLE_PAGES,
} from '@/lib/pdf-pages';

const page = (n: number, chars: number) => `Page ${n}. ` + 'lecture words '.repeat(Math.ceil(chars / 14)).slice(0, chars);

describe('fitPages', () => {
  it('sends a normal PDF whole, untouched', () => {
    const pages = Array.from({ length: 300 }, (_, i) => page(i + 1, 2500));
    expect(pagesBytes(pages)).toBeLessThan(MAX_PAGES_BYTES);
    expect(fitPages(pages)).toBe(pages);
  });

  it('trims every page to the same length when there is more text than a request can hold', () => {
    const pages = Array.from({ length: 2000, }, (_, i) => page(i + 1, 4000)); // ~8 MB of text
    expect(pagesBytes(pages)).toBeGreaterThan(MAX_PAGES_BYTES);
    const fitted = fitPages(pages);
    expect(pagesBytes(fitted)).toBeLessThanOrEqual(MAX_PAGES_BYTES);
    // Every page is still there, and each starts as it did.
    expect(fitted).toHaveLength(2000);
    expect(fitted[1999].startsWith('Page 2000.')).toBe(true);
    expect(new Set(fitted.map((p) => p.length)).size).toBe(1);
  });

  it('never trims a page below a useful length, even if that is still too big', () => {
    const fitted = fitPages(Array.from({ length: 2000 }, () => '漢字'.repeat(5000)));
    expect(fitted.every((p) => p.length >= 300)).toBe(true);
  });
});

describe('parsePages', () => {
  const ok = (pages: unknown) => parsePages(JSON.stringify(pages));

  it('accepts the pages a browser sends', () => {
    expect(ok(['First page.', 'Second page.'])).toEqual({ pages: ['First page.', 'Second page.'] });
    expect(ok(['', 'a page after a blank one'])).toEqual({ pages: ['', 'a page after a blank one'] });
  });

  it('rejects anything that is not a list of text', () => {
    for (const bad of ['not json', '{"a":1}', '"just text"', '42', 'null', '[]', '[1,2]', '["ok", 3]', '[["nested"]]']) {
      expect(parsePages(bad)).toEqual({ error: UNREADABLE_PAGES });
    }
  });

  it('rejects more pages than a PDF is read to', () => {
    const result = ok(Array.from({ length: MAX_PDF_PAGES + 1 }, () => 'x'));
    expect(result).toEqual({ error: expect.stringContaining('2,001 pages') });
    expect(ok(Array.from({ length: MAX_PDF_PAGES }, () => 'x'))).toHaveProperty('pages');
  });

  it('rejects more text than a request can carry', () => {
    const result = ok(['x'.repeat(MAX_PAGES_BYTES + 1)]);
    expect(result).toEqual({ error: expect.stringContaining('too long to send') });
  });
});

describe('cleanFileName', () => {
  it('keeps a normal name', () => {
    expect(cleanFileName('Week 4 – Cell Biology.pdf')).toBe('Week 4 – Cell Biology.pdf');
  });

  it('removes path pieces and control characters, and caps the length', () => {
    expect(cleanFileName('..\\..\\secret/notes\u0000.pdf')).toBe('....secretnotes.pdf');
    expect(cleanFileName('a'.repeat(500))).toHaveLength(200);
  });

  it('falls back to a plain name', () => {
    for (const value of [undefined, null, 42, '', '   ', '///']) expect(cleanFileName(value)).toBe('document.pdf');
  });
});
