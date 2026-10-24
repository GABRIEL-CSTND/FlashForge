// Single source of truth for which upload types a study guide can be made from.
// Safe to import from client and server code (no Node-only imports here).

export type FileKind = 'pdf' | 'txt' | 'docx' | 'pptx';

interface FileTypeInfo {
  kind: FileKind;
  ext: string;
  mime: string[];
  label: string;
}

export const FILE_TYPES: FileTypeInfo[] = [
  { kind: 'pdf', ext: '.pdf', mime: ['application/pdf'], label: 'PDF' },
  { kind: 'txt', ext: '.txt', mime: ['text/plain'], label: 'TXT' },
  {
    kind: 'docx',
    ext: '.docx',
    mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    label: 'Word (DOCX)',
  },
  {
    kind: 'pptx',
    ext: '.pptx',
    mime: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    label: 'PowerPoint (PPTX)',
  },
];

// Value for <input accept="...">
export const ACCEPT_ATTR = FILE_TYPES.map((t) => t.ext).join(',');

// e.g. "PDF, TXT, Word (DOCX) or PowerPoint (PPTX)"
export const SUPPORTED_LABEL = (() => {
  const labels = FILE_TYPES.map((t) => t.label);
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
})();

// Decide what kind of file this is. The extension wins over the browser-reported
// MIME type because browsers often report an empty or generic type for Office files.
export function getFileKind(name: string, mimeType = ''): FileKind | null {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  const byExt = FILE_TYPES.find((t) => t.ext === ext);
  if (byExt) return byExt.kind;
  const byMime = FILE_TYPES.find((t) => t.mime.includes(mimeType));
  return byMime ? byMime.kind : null;
}
