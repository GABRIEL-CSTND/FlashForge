'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { FILE_ACCEPT, FILE_TYPES_TEXT, MAX_UPLOAD_BYTES } from '@/lib/sources';

interface ClassFile {
  id: string;
  name: string;
  size_bytes: number;
}

const FILE_COLUMNS = 'id, name, size_bytes';
const MAX_MB = MAX_UPLOAD_BYTES / 1024 / 1024;
// The database's limit for all of a teacher's classes (private.class_file_room()).
const ROOM_MB = 50;

// Why a post was refused: PT413 means the room is full; its hint says whose.
function postProblem(error: unknown) {
  const { code, hint } = (error ?? {}) as { code?: string; hint?: string };
  if (code !== 'PT413') return 'Could not post this file. Try again.';
  return hint === 'everyone'
    ? 'FlashForge has no room for more class files right now. Try again later.'
    : `Your classes' files are full (${ROOM_MB} MB in all). Remove a file to post another.`;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result;
      const content = typeof result === 'string' ? result.split(',', 2)[1] : undefined;
      if (content) resolve(content);
      else reject(new Error('Missing file content'));
    };
    reader.readAsDataURL(file);
  });
}

function downloadFile(name: string, content: string) {
  const bytes = Uint8Array.from(atob(content), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(URL.revokeObjectURL.bind(URL, url), 1000);
}

function FileList({ classId, canPost }: { classId: string; canPost: boolean }) {
  const [files, setFiles] = useState<ClassFile[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [selected, setSelected] = useState<File | null>(null);
  const [busy, setBusy] = useState<'posting' | 'downloading' | 'removing' | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const chooser = useRef<HTMLInputElement>(null);
  const chooserId = useId();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await supabase.from('class_files').select(FILE_COLUMNS)
          .eq('class_id', classId).order('created_at', { ascending: false }).order('id', { ascending: false })
          .abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) setFiles(data);
      } catch {
        if (!controller.signal.aborted) setLoadFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [classId, loadVersion]);

  const post = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || busy) return;
    const name = selected.name.trim();
    const validName = Array.from(name).length <= 200 && !/[\\/\u0000-\u001f\u007f]/.test(name)
      && FILE_ACCEPT.split(',').some((extension) => name.toLowerCase().endsWith(extension));
    if (!validName || selected.size === 0 || selected.size > MAX_UPLOAD_BYTES) {
      setFeedback({ error: true, text: `Choose a non-empty ${FILE_TYPES_TEXT} up to ${MAX_MB} MB, with a file name up to 200 characters.` });
      return;
    }
    setBusy('posting');
    setFeedback(null);
    try {
      const content = await readBase64(selected);
      const { data, error } = await supabase.from('class_files')
        .insert({ class_id: classId, name, content_base64: content }).select(FILE_COLUMNS).single();
      if (error || !data) throw error;
      setFiles((current) => [data, ...(current ?? [])]);
      if (chooser.current) chooser.current.value = '';
      setSelected(null);
      setFeedback({ error: false, text: `${data.name} was posted.` });
    } catch (error) {
      setFeedback({ error: true, text: postProblem(error) });
    } finally {
      setBusy(null);
    }
  };

  const download = async (file: ClassFile) => {
    setBusy('downloading');
    setFeedback(null);
    try {
      const { data, error } = await supabase.from('class_files').select('name, content_base64')
        .eq('class_id', classId).eq('id', file.id).maybeSingle();
      if (error || !data) throw error;
      downloadFile(data.name, data.content_base64);
    } catch {
      setFeedback({ error: true, text: 'Could not download this file. It may no longer be available.' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (file: ClassFile) => {
    if (!window.confirm(`Remove "${file.name}" from this class?`)) return;
    setBusy('removing');
    setFeedback(null);
    try {
      const { data, error } = await supabase.from('class_files').delete()
        .eq('class_id', classId).eq('id', file.id).select('id').maybeSingle();
      if (error || !data) throw error;
      setFiles((current) => current?.filter(({ id }) => id !== file.id) ?? []);
      setFeedback({ error: false, text: `${file.name} was removed.` });
    } catch {
      setFeedback({ error: true, text: 'Could not remove this file. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {canPost && (
        <form onSubmit={post} className="flex flex-wrap items-end gap-3 border-b border-ink/15 pb-4">
          <div className="min-w-0 flex-1 basis-52 space-y-1">
            <label htmlFor={chooserId} className="block text-sm font-semibold">Choose a class file</label>
            <p id={`${chooserId}-help`} className="text-xs text-muted">{FILE_TYPES_TEXT}. Up to {MAX_MB} MB per file, and {ROOM_MB} MB for all your classes.</p>
            <input ref={chooser} id={chooserId} type="file" accept={FILE_ACCEPT} aria-describedby={`${chooserId}-help`}
              disabled={busy !== null} onChange={(event) => setSelected(event.target.files?.[0] ?? null)}
              className="block min-h-11 w-full text-sm file:mr-2 file:min-h-11 file:rounded-md file:border file:border-ink/20 file:bg-transparent file:px-2 file:font-medium" />
          </div>
          <button type="submit" disabled={!selected || !files || busy !== null} className="btn btn-primary min-h-11">{busy === 'posting' ? 'Posting…' : 'Post file'}</button>
        </form>
      )}
      {feedback && <p role={feedback.error ? 'alert' : 'status'} className={`text-sm ${feedback.error ? 'text-pencil' : 'text-green-800'}`}>{feedback.text}</p>}
      {loadFailed ? (
        <div className="flex flex-wrap items-center gap-x-3 text-sm">
          <p role="alert" className="text-pencil">Could not load class files.</p>
          <button type="button" className="min-h-11 text-link underline" onClick={() => { setLoadFailed(false); setLoadVersion((version) => version + 1); }}>Try again</button>
        </div>
      ) : files === null ? (
        <p role="status" className="text-sm text-muted">Loading class files…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted">No class files yet.</p>
      ) : (
        <ul className="divide-y divide-ink/10" aria-label="Posted files">
          {files.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center justify-between gap-x-4 py-1">
              <div className="min-w-0 flex-1 basis-40">
                <p className="break-words text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted">{Math.max(1, Math.round(file.size_bytes / 1024))} KB</p>
              </div>
              <div className="flex gap-4">
                <button type="button" aria-label={`Download ${file.name}`} onClick={() => download(file)} disabled={busy !== null} className="min-h-11 text-sm font-semibold text-link hover:underline disabled:opacity-40">Download</button>
                {canPost && <button type="button" aria-label={`Remove ${file.name}`} onClick={() => remove(file)} disabled={busy !== null} className="min-h-11 text-sm font-semibold text-pencil hover:underline disabled:opacity-40">Remove</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ClassFiles({ classId, canPost = false }: { classId: string; canPost?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const heading = useId();
  return (
    <section aria-labelledby={heading} className={`paper paper-shadow rounded-md px-4 py-3 text-ink sm:px-6 ${canPost ? 'mt-12 max-w-3xl' : 'mt-7'}`}>
      {canPost ? (
        <h2 id={heading} className="mb-3 text-[22px] font-normal">Class files</h2>
      ) : (
        <h4 id={heading} className="text-lg font-normal">
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="min-h-11 text-left hover:underline">
            Class files <span aria-hidden="true" className="text-sm text-muted">{expanded ? '▴' : '▾'}</span>
          </button>
        </h4>
      )}
      {(canPost || expanded) && <FileList key={classId} classId={classId} canPost={canPost} />}
    </section>
  );
}
