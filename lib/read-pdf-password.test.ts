import { describe, expect, it, vi } from 'vitest';

// A password-protected PDF can't be built by hand, so PDF.js's own error is faked.
vi.mock('unpdf', () => ({
  getDocumentProxy: async () => {
    const error = new Error('No password given');
    error.name = 'PasswordException';
    throw error;
  },
}));

import { PdfReadError, readPdfPages } from '@/lib/read-pdf';

describe('readPdfPages and a password-protected PDF', () => {
  it('says the PDF needs a password, not just that it is unreadable', async () => {
    const error = await readPdfPages(new Blob(['%PDF-1.4'])).catch((e) => e);
    expect(error).toBeInstanceOf(PdfReadError);
    expect(error.reason).toBe('password');
  });
});
