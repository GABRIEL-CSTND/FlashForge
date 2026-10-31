// Reads a PDF's text in the browser (#44), so only the text is sent to the server,
// not a file that may be tens of MB. Uses the same PDF.js (through unpdf) as the
// server, and builds each page's text the same way unpdf does there (each text
// piece, with a line break where PDF.js says a line ends), so a PDF reads the same
// either way.

import { MAX_PDF_PAGES } from '@/lib/pdf-pages';

export type PdfReadFailure = 'password' | 'too-many-pages' | 'unreadable';

export class PdfReadError extends Error {
  constructor(
    readonly reason: PdfReadFailure,
    message: string,
    readonly pageCount?: number
  ) {
    super(message);
  }
}

// Let the page repaint (and the progress number change) between pages; reading a
// long PDF in one go would freeze the tab.
const REPAINT_EVERY = 4;
const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function readPdfPages(file: Blob, onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const { getDocumentProxy } = await import('unpdf');
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    const password = err instanceof Error && err.name === 'PasswordException';
    throw new PdfReadError(password ? 'password' : 'unreadable', password ? 'The PDF needs a password.' : 'The PDF could not be opened.');
  }

  try {
    const total = pdf.numPages;
    if (total > MAX_PDF_PAGES) throw new PdfReadError('too-many-pages', 'The PDF has too many pages.', total);
    const pages: string[] = [];
    onProgress?.(0, total);
    for (let n = 1; n <= total; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .flatMap((item) => ('str' in item && item.str != null ? [item.str + (item.hasEOL ? '\n' : '')] : []))
          .join('')
      );
      page.cleanup();
      onProgress?.(n, total);
      if (n % REPAINT_EVERY === 0) await nextTick();
    }
    return pages;
  } catch (err) {
    if (err instanceof PdfReadError) throw err;
    throw new PdfReadError('unreadable', 'The PDF could not be read.');
  } finally {
    // Free the PDF's memory, as unpdf does for the documents it opens itself.
    await pdf.loadingTask.destroy().catch(() => {});
  }
}
