'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/auth';
import { STUDY_TYPE_LABELS, toStudyType } from '@/lib/study-types';

// Every study guide the user made while signed in, saved or not (lib/history.ts).
// My Sets lists only the saved ones.
interface HistoryEntry {
  id: string;
  title: string;
  study_type: string;
  item_count: number;
  // The set it was saved as; null if it wasn't saved.
  set_id: string | null;
  created_at: string;
}

export default function HistoryPage() {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from('guide_history')
      .select('id, title, study_type, item_count, set_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadFailed(Boolean(error));
        setEntries((data as HistoryEntry[] | null) || []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleRemove = async (entry: HistoryEntry) => {
    const confirmed = window.confirm(
      entry.set_id
        ? `Remove "${entry.title}" from your history? The saved set stays in My Sets.`
        : `Remove "${entry.title}" from your history? It was never saved, so it will be gone for good.`
    );
    if (!confirmed) return;

    setRemovingId(entry.id);
    const { error } = await supabase.from('guide_history').delete().eq('id', entry.id);
    setRemovingId(null);

    if (error) {
      alert("Couldn't remove it. Please try again.");
      return;
    }

    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  };

  if (userLoading || (user && loading)) {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-gray-500">Sign in to see the study guides you&apos;ve made.</p>
        <Link href="/" className="text-link hover:underline">
          ← Back to upload
        </Link>
      </main>
    );
  }

  return (
    // w-full: the body is a flex column, so without it a long title would
    // widen the page past a phone screen instead of truncating.
    <main className="min-h-screen w-full p-6 max-w-md mx-auto space-y-6">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">History</h1>
          <Link href="/" className="text-sm text-link hover:underline">
            + New study guide
          </Link>
        </div>
        <p className="text-sm text-gray-500">
          Every study guide you&apos;ve made while signed in, saved or not. The ones you saved are also in{' '}
          <Link href="/my-sets" className="text-link hover:underline">
            My Sets
          </Link>
          .
        </p>
      </div>

      {loadFailed ? (
        <p role="alert" className="text-sm text-red-500">
          Couldn&apos;t load your history. Please try again.
        </p>
      ) : entries.length === 0 ? (
        <div className="border rounded-lg p-6 text-center text-gray-500">
          No study guides yet. The ones you make while signed in will show up here.
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Your study guides">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between border rounded-lg p-4 hover:border-accent transition-colors"
            >
              <Link href={`/history/${e.id}`} className="flex-1 min-w-0">
                <p className="font-medium truncate">{e.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                  <span>
                    {STUDY_TYPE_LABELS[toStudyType(e.study_type)]} · {e.item_count}{' '}
                    {e.item_count === 1 ? 'question' : 'questions'} ·{' '}
                    {new Date(e.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  {e.set_id && (
                    <span className="rounded bg-green-500/10 px-1.5 py-0.5 font-medium text-green-600">Saved</span>
                  )}
                </p>
              </Link>
              <button
                onClick={() => handleRemove(e)}
                disabled={removingId === e.id}
                aria-label={`Remove ${e.title} from history`}
                className="text-red-500 text-sm hover:underline disabled:opacity-40 ml-3 shrink-0"
              >
                {removingId === e.id ? '...' : '🗑'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
