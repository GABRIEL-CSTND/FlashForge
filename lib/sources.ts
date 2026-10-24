// Where a study guide's material comes from (#20): an uploaded file or pasted
// text (#70). Shared by the upload page and /api/generate.

export const SOURCE_KINDS = ['file', 'text'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_LABELS: Record<SourceKind, string> = {
  file: 'Upload a file',
  text: 'Paste text',
};

// How much of the material the AI reads (#38 tracks covering longer documents).
export const MAX_SOURCE_CHARS = 30_000;
// Less than this isn't enough to write questions from.
export const MIN_SOURCE_CHARS = 20;

// What's wrong with pasted text, shown before anything is sent; null if fine.
export function pastedTextProblem(text: string): string | null {
  if (text.trim().length < MIN_SOURCE_CHARS) return 'Paste at least a sentence or two of your notes.';
  if (text.length > MAX_SOURCE_CHARS) {
    return `That's ${text.length.toLocaleString('en-US')} characters. Paste up to ${MAX_SOURCE_CHARS.toLocaleString('en-US')}, or upload it as a file.`;
  }
  return null;
}

// A title for pasted notes: their first line if it's short (often a heading),
// otherwise its first few words. Owners can rename the set after saving.
export function titleFromText(text: string): string {
  const firstLine = text.trim().split(/\r?\n/)[0]?.trim() ?? '';
  const title = firstLine.length <= 60 ? firstLine : firstLine.split(/\s+/).slice(0, 8).join(' ');
  if (!title) return 'Pasted notes';
  return title.length <= 60 ? title : `${title.slice(0, 59).trimEnd()}…`;
}
