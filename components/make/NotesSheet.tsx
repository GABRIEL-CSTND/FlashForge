'use client';

import { useState } from 'react';
import { FILE_ACCEPT, FILE_TYPES_TEXT, fileKind, MAX_SOURCE_CHARS, type TypedSource } from '@/lib/sources';

const FILE_KIND_NAMES = {
  pdf: 'PDF',
  docx: 'Word document',
  pptx: 'PowerPoint slides',
  txt: 'Text file',
  jpeg: 'Photo of your notes',
  png: 'Photo of your notes',
  webp: 'Photo of your notes',
} as const;

function fileMeta(file: File): string {
  const kind = fileKind(file.name, file.type);
  const kb = Math.max(1, Math.round(file.size / 1024));
  const size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  return `${kind ? FILE_KIND_NAMES[kind] : 'File'} · ${size}`;
}

// The notes sheet (desk redesign, phase 3): one sheet of paper that takes
// anything. Drop or choose a file, or type or paste notes, a link or a topic;
// the line at the bottom says what it found, with a switch if that's wrong.
export default function NotesSheet({
  text,
  onText,
  file,
  onFile,
  onRemoveFile,
  detected,
  asNotes,
  onAsNotes,
  disabled,
}: {
  text: string;
  onText: (text: string) => void;
  file: File | null;
  onFile: (file: File) => void;
  onRemoveFile: () => void;
  // What the typed text looks like (lib/sources.ts detectSource).
  detected: TypedSource | null;
  // The student said to use it as notes anyway.
  asNotes: boolean;
  onAsNotes: (asNotes: boolean) => void;
  disabled: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const kind = asNotes ? 'text' : detected;
  const over = text.length > MAX_SOURCE_CHARS;

  const sentence =
    kind === 'link'
      ? 'Looks like a link. We’ll read the page.'
      : kind === 'topic'
        ? 'Looks like a topic. We’ll look it up on Wikipedia.'
        : asNotes
          ? 'Using it as notes'
          : 'Looks like notes';

  return (
    <section
      aria-label="Your notes"
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped && !disabled) onFile(dropped);
      }}
      className={`notes-sheet sheet relative flex min-h-[19rem] flex-col rounded-md text-ink sm:min-h-[22rem] ${dragging ? 'is-dragging' : ''}`}
    >
      {file ? (
        <div className="flex flex-1 flex-col gap-3 px-6 pb-4 pt-6 sm:px-8 sm:pt-7">
          <div className="flex items-start justify-between gap-3 rounded border border-ink/15 bg-paper/60 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-serif text-lg">{file.name}</p>
              <p className="text-sm text-muted">{fileMeta(file)}</p>
            </div>
            <button
              type="button"
              onClick={onRemoveFile}
              disabled={disabled}
              aria-label="Take the file off the sheet"
              className="-mr-2 -mt-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded text-muted hover:text-ink disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-muted">Ready to read. FlashForge reads it when you make the deck.</p>
        </div>
      ) : (
        <div className="relative flex flex-1 flex-col px-6 pt-5 sm:px-8 sm:pt-6">
          <label htmlFor="notes-sheet" className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">
            Your notes, a link or a topic
          </label>
          <textarea
            id="notes-sheet"
            value={text}
            onChange={(e) => onText(e.target.value)}
            disabled={disabled}
            className="mt-2 min-h-48 w-full flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-ink outline-none"
          />
          {!text && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1.5 text-center sm:inset-x-8">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-brass-ink">
                <path d="M12 15V4" />
                <path d="m7 9 5-5 5 5" />
                <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
              </svg>
              <span className="font-serif text-xl">Drop your notes here</span>
              <span className="text-sm text-muted">or click and type or paste notes, a link or a topic</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-ink/10 px-6 py-2.5 text-[13px] text-muted sm:px-8">
        <p className="min-w-0">
          {file || !kind ? (
            FILE_TYPES_TEXT
          ) : (
            <>
              <span aria-live="polite">{sentence}</span>
              {kind === 'text' && (
                <>
                  {' · '}
                  <span className={over ? 'font-semibold text-pencil' : ''}>
                    {text.length.toLocaleString('en-US')} / {MAX_SOURCE_CHARS.toLocaleString('en-US')} characters
                  </span>
                </>
              )}
              {(asNotes ? detected !== 'text' : kind !== 'text') && (
                <>
                  {' '}
                  <button type="button" onClick={() => onAsNotes(!asNotes)} disabled={disabled} className="min-h-11 font-semibold text-brass-ink underline-offset-2 hover:underline">
                    {!asNotes ? 'Use it as notes' : detected === 'link' ? 'Read it as a link' : 'Look it up as a topic'}
                  </button>
                </>
              )}
            </>
          )}
        </p>
        <label className="relative inline-flex min-h-11 cursor-pointer items-center font-semibold text-brass-ink focus-within:underline hover:underline">
          {file ? 'Choose another file' : 'Choose a file'}
          <input id="file-input" type="file" accept={FILE_ACCEPT} disabled={disabled} onChange={(e) => {
            const chosen = e.target.files?.[0];
            if (chosen) onFile(chosen);
            e.target.value = '';
          }} className="sr-only" />
        </label>
      </div>
    </section>
  );
}
