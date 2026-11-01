// Large PDFs (#44). A PDF over the request-size limit can't be uploaded (Vercel
// refuses about 4.5 MB), and a big upload is slow on mobile data. So the browser
// reads the PDF and sends only its pages' text: a few hundred KB for a long
// lecture. This is the part shared by the browser and the server: how much is
// allowed, how the text is kept under the request limit, and how the server checks
// what it receives. Safe for both (no Node-only imports).

// The biggest PDF the browser will read, and the most pages it will read from one.
export const MAX_PDF_BYTES = 100 * 1024 * 1024;
export const MAX_PDF_PAGES = 2000;

// The most page text sent at once. The request limit is about 4.5 MB; the rest is
// left for the other form fields.
export const MAX_PAGES_BYTES = 3_500_000;

// Page text is only ever thinned down to this much per page.
const LEAST_CHARS_PER_PAGE = 300;

const encoder = new TextEncoder();

// How big the pages are once sent.
export const pagesBytes = (pages: string[]): number => encoder.encode(JSON.stringify(pages)).length;

// The pages to send. Usually all of them, whole: the server samples a long PDF by
// whole pages spread over the document, and that works best on the full text. Only
// a PDF with more text than a request can hold (thousands of dense pages) has each
// page trimmed to the same length, which keeps every page in the document.
export function fitPages(pages: string[]): string[] {
  if (pagesBytes(pages) <= MAX_PAGES_BYTES) return pages;
  let limit = Math.max(...pages.map((p) => p.length));
  let fitted = pages;
  while (pagesBytes(fitted) > MAX_PAGES_BYTES && limit > LEAST_CHARS_PER_PAGE) {
    limit = Math.max(LEAST_CHARS_PER_PAGE, Math.floor(limit * 0.8));
    fitted = pages.map((p) => p.slice(0, limit));
  }
  return fitted;
}

export const UNREADABLE_PAGES = "We couldn't read that PDF's text. Please try again.";

// The pages a browser sent, or what is wrong with them. Anyone can send this
// field, so it is checked like any other input.
export function parsePages(raw: string): { pages: string[] } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: UNREADABLE_PAGES };
  }
  if (!Array.isArray(value) || value.length === 0 || !value.every((p) => typeof p === 'string')) {
    return { error: UNREADABLE_PAGES };
  }
  if (value.length > MAX_PDF_PAGES) {
    return { error: `That PDF has ${value.length.toLocaleString('en-US')} pages. The most we can read is ${MAX_PDF_PAGES.toLocaleString('en-US')}; try splitting it.` };
  }
  const pages = value as string[];
  if (pagesBytes(pages) > MAX_PAGES_BYTES) {
    return { error: "That PDF's text is too long to send. Try a shorter PDF, or paste the part you want." };
  }
  return { pages };
}

// The name of the PDF for the guide's title: only what is safe to show and store.
export function cleanFileName(value: unknown): string {
  if (typeof value !== 'string') return 'document.pdf';
  const name = value.replace(/[\\/\u0000-\u001f]/g, '').trim().slice(0, 200);
  return name || 'document.pdf';
}
