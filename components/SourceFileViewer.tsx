'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FILE_TYPES, fileKind, isPhoto, MAX_SOURCE_CHARS, type FileKind } from '@/lib/sources';

type SourceFile = File | { name: string; historyId: string } | { name: string; setId: string; classItemId: string | null };
type SourceKind = FileKind | 'pdf-text';
type Preview = { kind: SourceKind; blob: Blob; text: string | null };
type OpenPreview = Omit<Preview, 'blob'> & { url: string };

async function loadFile(source: SourceFile, signal: AbortSignal): Promise<Preview> {
  let kind: SourceKind | null;
  let bytes: BlobPart;
  if (source instanceof File) {
    kind = fileKind(source.name, source.type);
    bytes = source;
  } else {
    const { data, error } = 'historyId' in source
      ? await supabase.from('guide_source_files').select('kind, content_base64').eq('history_id', source.historyId).abortSignal(signal).maybeSingle()
      : await supabase.rpc('study_set_source', {
        p_set_id: source.setId,
        p_class_item_id: source.classItemId,
        p_include_file: true,
      }).abortSignal(signal);
    if (error || !data) throw new Error('Source file unavailable');
    kind = data.kind as SourceKind;
    bytes = Uint8Array.from(atob(data.content_base64), (character) => character.charCodeAt(0));
  }

  const mime = kind === 'pdf-text' ? FILE_TYPES.txt.mime : kind && FILE_TYPES[kind]?.mime;
  if (!kind || !mime) throw new Error('Unsupported source file type');
  const blob = new Blob([bytes], { type: mime });
  let text = kind === 'txt' || kind === 'pdf-text' ? await blob.text() : null;
  if (kind === 'docx' || kind === 'pptx') {
    const { docxText, pptxText } = await import('@/lib/office-text');
    const read = kind === 'docx' ? docxText : pptxText;
    text = read(new Uint8Array(await blob.arrayBuffer()));
  }
  return { kind, blob, text };
}

function FilePreview({ name, preview }: { name: string; preview: OpenPreview }) {
  const { kind, url, text } = preview;
  return (
    <div className="mt-4 space-y-3">
      {kind === 'pdf-text' && <p className="text-sm text-muted">Text extracted from {name}.</p>}
      {(kind === 'docx' || kind === 'pptx') && <p className="text-sm text-muted">Text preview</p>}
      {text !== null && (
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded border p-3 text-sm">
          {text.length > MAX_SOURCE_CHARS ? `${text.slice(0, MAX_SOURCE_CHARS)}\n\n[Preview shortened]` : text}
        </pre>
      )}
      {kind === 'pdf' && <iframe src={url} title={name} className="h-[60vh] w-full rounded border" />}
      {kind !== 'pdf-text' && isPhoto(kind) && (
        // eslint-disable-next-line @next/next/no-img-element -- A private, local object URL.
        <img src={url} alt={name} className="mx-auto max-h-[60vh] max-w-full object-contain" />
      )}
      <a href={url} download={kind === 'pdf-text' ? `${name}.txt` : name} className="text-sm text-link hover:underline">
        {kind === 'pdf-text' ? 'Download extracted text' : 'Download source file'}
      </a>
    </div>
  );
}

export default function SourceFileViewer({ source }: { source: SourceFile }) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController>(null);
  const objectUrl = useRef<string>(null);
  const [state, setState] = useState<OpenPreview | 'loading' | 'error' | null>(null);

  const releaseFile = () => {
    request.current?.abort();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  };
  useEffect(() => releaseFile, []);

  const open = async () => {
    const controller = new AbortController();
    request.current = controller;
    setState('loading');
    dialog.current?.showModal();
    try {
      const { kind, blob, text } = await loadFile(source, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      objectUrl.current = url;
      setState({ kind, text, url });
    } catch {
      if (!controller.signal.aborted) setState('error');
    }
  };

  return (
    <div>
      <button type="button" onClick={open} className="text-sm text-link hover:underline">
        View source file
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onKeyDown={(event) => event.stopPropagation()}
        onClose={() => {
          releaseFile();
          setState(null);
        }}
        className="paper m-auto max-h-[90vh] w-[min(92vw,50rem)] overflow-auto rounded-xl p-4 text-left text-ink shadow-xl backdrop:bg-black/60 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="min-w-0 break-words font-serif text-xl">{source.name}</h2>
          <form method="dialog">
            <button type="submit" className="rounded border px-3 py-1 text-sm hover:border-accent">Close</button>
          </form>
        </div>
        {state === 'loading' && <p role="status" className="mt-3 text-sm text-muted">Loading source file…</p>}
        {state === 'error' && <p role="alert" className="mt-3 text-sm text-pencil">Couldn&apos;t open this source file. Close this window and try again.</p>}
        {state && typeof state === 'object' && <FilePreview name={source.name} preview={state} />}
      </dialog>
    </div>
  );
}
