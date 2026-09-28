'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

interface FlashcardSet {
  id: string;
  title: string;
  study_type: 'flashcard' | 'multiple_choice';
  created_at: string;
}

interface SetsState {
  userId: string;
  sets: FlashcardSet[];
  error: string;
}

export default function MySetsPage() {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const [state, setState] = useState<SetsState>({ userId: '', sets: [], error: '' });

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    void supabase
      .from('flashcard_sets')
      .select('id, title, study_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;

        setState({
          userId,
          sets: data ?? [],
          error: error?.message ?? '',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loading = userLoading || Boolean(userId && state.userId !== userId);

  if (loading) {
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

      {state.error ? (
        <div className="border border-red-300 rounded-lg p-6 text-center text-red-500">
          Failed to load saved sets: {state.error}
        </div>
      ) : state.sets.length === 0 ? (
        <div className="border rounded-lg p-6 text-center text-gray-500">
          No saved sets yet. Save a study guide to see it here.
        </div>
      ) : (
        <div className="space-y-2">
          {state.sets.map((set) => (
            <Link
              key={set.id}
              href={`/sets/${set.id}`}
              className="block border rounded-lg p-4 hover:border-blue-400 transition-colors"
            >
              <p className="font-medium truncate">{set.title}</p>
              <p className="text-xs text-gray-400 mt-1">
                {set.study_type === 'multiple_choice' ? 'Multiple Choice' : 'Flashcards'} ·{' '}
                {new Date(set.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
