// What to send for a PDF the student picked (#44).
//
//   pages    The browser read its text: send only that. Fast, and no size limit.
//   file     Send the PDF itself and let the server read it. Used when the browser
//            can't read it, or when it is pictures of pages (scanned, #73) that the
//            AI has to look at. Only possible for a PDF small enough to send.
//   problem  Can't be done; the message says why.

import { fitPages, MAX_PDF_PAGES } from '@/lib/pdf-pages';
import { PdfReadError, readPdfPages } from '@/lib/read-pdf';
import { MAX_UPLOAD_BYTES, SCANNED_PDF_TEXT_CHARS } from '@/lib/sources';

export type PdfPlan = { kind: 'pages'; pages: string[] } | { kind: 'file' } | { kind: 'problem'; message: string };

const problem = (message: string): PdfPlan => ({ kind: 'problem', message });
const MB = MAX_UPLOAD_BYTES / 1024 / 1024;

export async function planPdfUpload(file: File, onProgress?: (done: number, total: number) => void): Promise<PdfPlan> {
  const canSendFile = file.size <= MAX_UPLOAD_BYTES;

  let pages: string[];
  try {
    pages = await readPdfPages(file, onProgress);
  } catch (err) {
    if (err instanceof PdfReadError && err.reason === 'password') {
      return problem('This PDF is password protected. Remove the password and try again.');
    }
    if (err instanceof PdfReadError && err.reason === 'too-many-pages') {
      return problem(
        `This PDF has ${err.pageCount?.toLocaleString('en-US')} pages. The most we can read is ${MAX_PDF_PAGES.toLocaleString('en-US')}; try splitting it.`
      );
    }
    return canSendFile
      ? { kind: 'file' }
      : problem(`We couldn't read this PDF. Try a different one, or paste the text. (PDFs over ${MB} MB have to be read on your device.)`);
  }

  if (pages.join('').replace(/\s+/g, '').length >= SCANNED_PDF_TEXT_CHARS) {
    return { kind: 'pages', pages: fitPages(pages) };
  }
  // Pictures of pages: the AI has to see the PDF itself.
  return canSendFile
    ? { kind: 'file' }
    : problem(
        `This PDF is mostly scanned pictures, and it's over ${MB} MB, which is too big to send. Try a smaller PDF, a photo of a page, or paste the text.`
      );
}
