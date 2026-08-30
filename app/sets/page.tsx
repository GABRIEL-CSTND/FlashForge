'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface FlashcardSetRow {
  id: string;
  title: string;
  source_filename: string | null;
  study_type: 'flashcard' | 'multiple_choice';
  created_at: string;
  flashcards: { count: number }[];
}

export default function DashboardPage() {
  const [sets, setSets] = useState<FlashcardSetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('flashcard_sets')
      .select('id, title, source_filename, study_type, created_at, flashcards(count)')
      .order('created_at', { ascending: false });
    setSets((data as FlashcardSetRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadSets();
  }, []);

  const startRename = (set: FlashcardSetRow) => {
    setRenamingId(set.id);
    setRenameValue(set.title);
  };

  const saveRename = async (id: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    await supabase.from('flashcard_sets').update({ title: trimmed }).eq('id', id);
    setRenamingId(null);
    loadSets();
  };

  const deleteSet = async (id: string) => {
    if (!confirm('Delete this set and all its cards? This cannot be undone.')) return;
    setDeletingId(id);
    await supabase.from('flashcard_sets').delete().eq('id', id);
    setDeletingId(null);
    loadSets();
  };

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Sets</h1>
        <Link
          href="/"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium"
        >
          + New Set
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-10">Loading...</p>
      ) : sets.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-gray-500">
          No sets yet.{' '}
          <Link href="/" className="text-blue-600 underline">
            Upload a file
          </Link>{' '}
          to create your first one.
        </div>
      ) : (
        <div className="space-y-3">
          {sets.map((set) => {
            const cardCount = set.flashcards?.[0]?.count ?? 0;
            const typeLabel =
              set.study_type === 'multiple_choice' ? 'Multiple Choice' : 'Flashcards';

            return (
              <div
                key={set.id}
                className="border rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  {renamingId === set.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => saveRename(set.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(set.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      className="w-full px-2 py-1 border rounded-md text-sm font-medium"
                    />
                  ) : (
                    <Link href={`/sets/${set.id}`} className="block">
                      <p className="font-medium truncate hover:underline">{set.title}</p>
                    </Link>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {typeLabel} · {cardCount} card{cardCount === 1 ? '' : 's'}
                    {set.source_filename ? ` · ${set.source_filename}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => startRename(set)}
                    className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1"
                    aria-label="Rename set"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => deleteSet(set.id)}
                    disabled={deletingId === set.id}
                    className="text-sm text-red-500 hover:text-red-700 px-2 py-1 disabled:opacity-40"
                    aria-label="Delete set"
                  >
                    {deletingId === set.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
