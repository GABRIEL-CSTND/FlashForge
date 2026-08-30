'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const ACCEPTED_TYPES = [
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ACCEPTED_EXT = ['.pdf', '.txt', '.docx'];

type StudyType = 'flashcard' | 'multiple_choice';

const STUDY_TYPE_OPTIONS: { value: StudyType; label: string }[] = [
  { value: 'flashcard', label: 'Flashcards' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
];

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [studyType, setStudyType] = useState<StudyType>('flashcard');
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'generating' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const validateAndSetFile = (f: File) => {
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPTED_TYPES.includes(f.type) && !ACCEPTED_EXT.includes(ext)) {
      setErrorMsg('Only PDF, TXT, and DOCX files are supported right now.');
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
    setErrorMsg('');

    const { data, error } = await supabase
      .from('flashcard_sets')
      .insert({
        title: file.name.replace(/\.[^/.]+$/, ''),
        source_filename: file.name,
        study_type: studyType,
      })
      .select()
      .single();

    if (error) {
      setErrorMsg(error.message);
      setStatus('error');
      return;
    }

    setStatus('generating');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('setId', data.id);
    formData.append('studyType', studyType);

    const genRes = await fetch('/api/generate', {
      method: 'POST',
      body: formData,
    });

    if (!genRes.ok) {
      const body = await genRes.json().catch(() => ({}));
      setErrorMsg(body.error || 'Failed to generate flashcards.');
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
            Upload a file and get an AI-generated study guide.
          </p>
          <Link href="/sets" className="inline-block text-sm text-blue-600 underline">
            View my sets
          </Link>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-center">What kind of study guide?</p>
          <div className="grid grid-cols-2 gap-2">
            {STUDY_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStudyType(opt.value)}
                className={`py-2 px-2 rounded-lg border text-sm font-medium transition-colors ${
                  studyType === opt.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                    : 'border-gray-300 text-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
            accept=".pdf,.txt,.docx"
            onChange={handleFileInput}
            className="hidden"
          />
          <label htmlFor="file-input" className="cursor-pointer block">
            {file ? (
              <p className="font-medium">{file.name}</p>
            ) : (
              <>
                <p className="font-medium">Drag & drop a file here</p>
                <p className="text-sm text-gray-500 mt-1">or click to browse (PDF, TXT, or DOCX)</p>
              </>
            )}
          </label>
        </div>

        {status === 'error' && (
          <p className="text-sm text-red-500 text-center">{errorMsg}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!file || status === 'uploading' || status === 'generating'}
          className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'uploading' && 'Uploading...'}
          {status === 'generating' && 'Generating (this can take ~20s)...'}
          {(status === 'idle' || status === 'error') && 'Generate Study Guide'}
        </button>
      </div>
    </main>
  );
}
