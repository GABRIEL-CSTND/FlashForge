'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/auth';

interface FlashcardSet {
  id: string;
  title: string;
  study_type: 'flashcard' | 'multiple_choice';
  created_at: string;
}

export default function MySetsPage() {
  const { user, loading: userLoading } = useUser();
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSets = async (userId: string) => {
    const { data } = await supabase
      .from('flashcard_sets')
      .select('id, title, study_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setSets(data || []);
  };

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    loadSets(user.id).then(() => setLoading(false));
  }, [user, userLoading]);

  const handleDelete = async (id: string, title: string) => {
    const confirmed = window.confirm(`Delete "${title}"? This can't be undone.`);
    if (!confirmed) return;

    setDeletingId(id);
    const { error } = await supabase.from('flashcard_sets').delete().eq('id', id);
    setDeletingId(null);

    if (error) {
      alert('Failed to delete: ' + error.message);
      return;
    }

    setSets((prev) => prev.filter((s) => s.id !== id));
  };

  if (userLoading || loading) {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-gray-500">Sign in to view your saved sets.</p>
        <Link href="/" className="text-blue-500 hover:underline">
          ← Back to upload
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My Sets</h1>
        <Link href="/" className="text-sm text-blue-500 hover:underline">
          + New set
        </Link>
      </div>

      {sets.length === 0 ? (
        <div className="border rounded-lg p-6 text-center text-gray-500">
          No saved sets yet. Upload a file to create one.
        </div>
      ) : (
        <div className="space-y-2">
          {sets.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between border rounded-lg p-4 hover:border-blue-400 transition-colors"
            >
              <Link href={`/sets/${s.id}`} className="flex-1 min-w-0">
                <p className="font-medium truncate">{s.title}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {s.study_type === 'multiple_choice' ? 'Multiple Choice' : 'Flashcards'} ·{' '}
                  {new Date(s.created_at).toLocaleDateString()}
                </p>
              </Link>
              <button
                onClick={() => handleDelete(s.id, s.title)}
                disabled={deletingId === s.id}
                className="text-red-500 text-sm hover:underline disabled:opacity-40 ml-3 shrink-0"
              >
                {deletingId === s.id ? '...' : '🗑'}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
