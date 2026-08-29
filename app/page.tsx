'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const ACCEPTED_TYPES = ['application/pdf', 'text/plain'];
const ACCEPTED_EXT = ['.pdf', '.txt'];

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const validateAndSetFile = (f: File) => {
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPTED_TYPES.includes(f.type) && !ACCEPTED_EXT.includes(ext)) {
      setErrorMsg('Only PDF and TXT files are supported right now.');
      setStatus('error');
      return;
    }
    setErrorMsg('');
    setStatus('idle');
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setStatus('uploading');

    const { data, error } = await supabase
      .from('flashcard_sets')
      .insert({
        title: file.name.replace(/\.[^/.]+$/, ''),
        source_filename: file.name,
      })
      .select()
      .single();

    if (error) {
      setErrorMsg(error.message);
      setStatus('error');
      return;
    }

    router.push(`/sets/${data.id}`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">FlashForge</h1>
          <p className="text-sm text-gray-500">
            Upload a file and get AI-generated flashcards for studying.
          </p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            dragActive ? 'border-blue-500 bg-blue-50/10' : 'border-gray-300'
          }`}
        >
          <input
            id="file-input"
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileInput}
            className="hidden"
          />
          <label htmlFor="file-input" className="cursor-pointer block">
            {file ? (
              <p className="font-medium">{file.name}</p>
            ) : (
              <>
                <p className="font-medium">Drag & drop a file here</p>
                <p className="text-sm text-gray-500 mt-1">or click to browse (PDF or TXT)</p>
              </>
            )}
          </label>
        </div>

        {status === 'error' && (
          <p className="text-sm text-red-500 text-center">{errorMsg}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!file || status === 'uploading'}
          className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'uploading' ? 'Uploading...' : 'Generate Flashcards'}
        </button>
      </div>
    </main>
  );
}
