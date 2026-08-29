'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';

const ACCEPTED_TYPES = ['.pdf', '.txt', '.docx'];
const MAX_SIZE_MB = 10;

export default function FileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'creating-set' | 'ready'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  function validateFile(f: File): string | null {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      return `Unsupported file type. Please upload ${ACCEPTED_TYPES.join(', ')}`;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File is too large. Max size is ${MAX_SIZE_MB}MB`;
    }
    return null;
  }

  function handleFile(f: File) {
    const err = validateFile(f);
    if (err) {
      setError(err);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
    setStatus('idle');
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  }

  async function handleGenerate() {
    if (!file) return;
    setStatus('creating-set');
    setError(null);

    // Create the flashcard set row now (anonymous, user_id null).
    // AI-generated cards get inserted here in Week 3.
    const { data, error: insertError } = await supabase
      .from('flashcard_sets')
      .insert({
        title: file.name.replace(/\.[^/.]+$/, ''),
        source_filename: file.name,
      })
      .select()
      .single();

    if (insertError) {
      setError(`Could not create flashcard set: ${insertError.message}`);
      setStatus('idle');
      return;
    }

    console.log('Created flashcard set:', data);
    setStatus('ready');
    // Week 3: send `file` to the AI pipeline here, using data.id as set_id
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={onChange}
          className="hidden"
        />
        {file ? (
          <p className="text-sm text-gray-700">
            Selected: <span className="font-medium">{file.name}</span> (
            {(file.size / 1024).toFixed(0)} KB)
          </p>
        ) : (
          <p className="text-sm text-gray-500">
            Drag & drop a file here, or click to browse
            <br />
            <span className="text-xs">Supports PDF, TXT, DOCX — max {MAX_SIZE_MB}MB</span>
          </p>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <button
        onClick={handleGenerate}
        disabled={!file || status === 'creating-set'}
        className="mt-4 w-full py-2 rounded-md bg-black text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {status === 'creating-set' ? 'Creating set…' : 'Generate Flashcards'}
      </button>

      {status === 'ready' && (
        <p className="mt-2 text-sm text-green-600">
          Set created in Supabase. AI generation wires up in Week 3.
        </p>
      )}
    </div>
  );
}
