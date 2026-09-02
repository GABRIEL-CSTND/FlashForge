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

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    supabase
      .from('flashcard_sets')
      .select('id, title, study_type, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setSets(data || []);
        setLoading(false);
      });
  }, [user, userLoading]);

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
            <Link
              key={s.id}
              href={`/sets/${s.id}`}
              className="block border rounded-lg p-4 hover:border-blue-400 transition-colors"
            >
              <p className="font-medium">{s.title}</p>
              <p className="text-xs text-gray-400 mt-1">
                {s.study_type === 'multiple_choice' ? 'Multiple Choice' : 'Flashcards'} ·{' '}
                {new Date(s.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
