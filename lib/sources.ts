// Where a study guide's material comes from (#20): an uploaded file (PDF,
// Word, PowerPoint, TXT #71, or a photo #72), pasted text (#70), a link to a
// web page (#74) or a topic to look up (#79). Shared by the upload page and
// /api/generate.

import { MAX_PDF_BYTES } from '@/lib/pdf-pages';

export const SOURCE_KINDS = ['file', 'text', 'link', 'topic'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_LABELS: Record<SourceKind, string> = {
  file: 'Upload a file',
  text: 'Paste text',
  link: 'Web link',
  topic: 'Topic',
};

// A topic (#79) is a few words, like "Photosynthesis".
export const MAX_TOPIC_CHARS = 100;

export function topicProblem(input: string): string | null {
  const topic = input.trim();
  if (topic.length < 2) return 'Type a topic, like “Photosynthesis”.';
  if (topic.length > MAX_TOPIC_CHARS) return `Keep the topic under ${MAX_TOPIC_CHARS} characters.`;
  return null;
}

// What's wrong with a typed link, before it's sent; null if it looks usable.
// The server checks much more (lib/web-page.ts).
export function linkProblem(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol === 'http:' || url.protocol === 'https:') return null;
  } catch {
    // not a URL
  }
  return 'Paste a full link, starting with https://';
}

// What can be typed on the notes sheet (desk redesign, phase 3).
export type TypedSource = Exclude<SourceKind, 'file'>;

// Endings a web address typed without https:// may have. Kept short on purpose,
// and lower case only, so "Node.js" or "ASP.NET" read as topics.
const WEB_ENDINGS = 'com|org|net|edu|gov|io|co|uk|us|ca|au|de|fr|es|it|nl|ph|in|info|dev|app|ai|me|ly';
const BARE_ADDRESS = new RegExp(`^[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*\\.(${WEB_ENDINGS})(\\/\\S*)?$`);

// The notes sheet takes notes, a link or a topic in one box, and says which it
// thinks it was given (the student can switch it if that's wrong):
// - a link: one web address, with or without https://
// - a topic: a short name on one line, at most 6 words and not a sentence
// - notes: anything else
export function detectSource(input: string): TypedSource | null {
  const text = input.trim();
  if (!text) return null;
  if (/^https?:\/\/\S+$/i.test(text) || /^www\.\S+\.\S+$/i.test(text) || BARE_ADDRESS.test(text)) return 'link';
  if (!text.includes('\n') && text.length <= 60 && text.split(/\s+/).length <= 6 && !/[.!?]$/.test(text)) return 'topic';
  return 'text';
}

// A link typed without https:// gets it, so "example.org/notes" works.
export function linkFromInput(input: string): string {
  const text = input.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
}

// What the quote under a card (#80) says it's from, going by the guide's source:
// `sourceFilename` is the file's name, the web page's or Wikipedia article's link,
// or null for pasted notes. Never "your": the viewer may not be the one who made it.
export function quoteSourceLabel(sourceFilename: string | null | undefined): string {
  if (!sourceFilename) return 'From the notes';
  try {
    const url = new URL(sourceFilename);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return /(^|\.)wikipedia\.org$/.test(url.hostname) ? 'From Wikipedia' : 'From the web page';
    }
  } catch {
    // a file name, not a link
  }
  return 'From the document';
}

// How much of the material the AI reads; longer documents are sampled to fit
// (#38, lib/source-quotes.ts).
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

// Files the upload page takes, by extension and MIME type. Photos (#72) go to
// the AI as they are; the others are turned into text first.
export const FILE_TYPES = {
  pdf: { exts: ['.pdf'], mime: 'application/pdf' },
  docx: { exts: ['.docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pptx: { exts: ['.pptx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  txt: { exts: ['.txt'], mime: 'text/plain' },
  jpeg: { exts: ['.jpg', '.jpeg'], mime: 'image/jpeg' },
  png: { exts: ['.png'], mime: 'image/png' },
  webp: { exts: ['.webp'], mime: 'image/webp' },
} as const;
export type FileKind = keyof typeof FILE_TYPES;
export const FILE_ACCEPT = Object.values(FILE_TYPES)
  .flatMap((t) => t.exts)
  .join(',');
// What the drop zone says it takes.
export const FILE_TYPES_TEXT = 'PDF, Word, PowerPoint, TXT or a photo';

export function isPhoto(kind: FileKind | null): kind is 'jpeg' | 'png' | 'webp' {
  return kind === 'jpeg' || kind === 'png' || kind === 'webp';
}

// A PDF with less text than this (not counting spaces) is taken to be scanned
// pages (#73), so the PDF itself goes to the AI, which reads the pictures.
export const SCANNED_PDF_TEXT_CHARS = 100;

// Vercel refuses requests over about 4.5 MB, so a file sent to the server is
// limited to this. A PDF is the exception: the browser reads it and sends only
// its text (#44), so see pickedFileProblem for what a student may pick.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const extensionOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '');

export function fileKind(name: string, type: string): FileKind | null {
  const ext = extensionOf(name);
  for (const [kind, t] of Object.entries(FILE_TYPES) as [FileKind, (typeof FILE_TYPES)[FileKind]][]) {
    if ((t.exts as readonly string[]).includes(ext) || t.mime === type) return kind;
  }
  return null;
}

// What's wrong with a file, before it's uploaded; null if it can be used.
export function fileProblem(name: string, type: string, size: number): string | null {
  const ext = extensionOf(name);
  if (ext === '.doc' || ext === '.ppt') {
    return `Older ${ext === '.doc' ? 'Word (.doc)' : 'PowerPoint (.ppt)'} files can't be read. Save it as ${
      ext === '.doc' ? '.docx' : '.pptx'
    } or PDF first.`;
  }
  if (!fileKind(name, type)) return 'Upload a PDF, Word, PowerPoint or TXT file, or a photo (JPG, PNG or WebP).';
  if (size > MAX_UPLOAD_BYTES) {
    return `This file is ${(size / 1024 / 1024).toFixed(1)} MB. Files can be up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB; try a smaller file or paste the text instead.`;
  }
  return null;
}

// What's wrong with a file the student picked, before anything is sent. The same
// as fileProblem, except that a PDF may be big (#44): the browser reads it and
// sends only its text, so only an enormous one is turned away. /api/generate still
// uses fileProblem for a file that is actually sent to it.
export function pickedFileProblem(name: string, type: string, size: number): string | null {
  if (fileKind(name, type) === 'pdf' && size > MAX_UPLOAD_BYTES) {
    if (size <= MAX_PDF_BYTES) return null;
    return `This PDF is ${(size / 1024 / 1024).toFixed(0)} MB. PDFs can be up to ${MAX_PDF_BYTES / 1024 / 1024} MB; try splitting it, or paste the text instead.`;
  }
  return fileProblem(name, type, size);
}

// A title for pasted notes: their first line if it's short (often a heading),
// otherwise its first few words. Owners can rename the set after saving.
export function titleFromText(text: string): string {
  const firstLine = text.trim().split(/\r?\n/)[0]?.trim() ?? '';
  const title = firstLine.length <= 60 ? firstLine : firstLine.split(/\s+/).slice(0, 8).join(' ');
  if (!title) return 'Pasted notes';
  return title.length <= 60 ? title : `${title.slice(0, 59).trimEnd()}…`;
}
