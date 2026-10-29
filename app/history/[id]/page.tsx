'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/auth';
import StudyViewer, { type StudyItem } from '@/components/StudyViewer';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { isUuid } from '@/lib/ids';
import { quoteSourceLabel } from '@/lib/sources';
import { toStudyType } from '@/lib/study-types';

// One study guide from History (lib/history.ts): study it again, or save it to
// My Sets if it wasn't saved.
interface HistoryGuide {
  id: string;
  title: string;
  study_type: string;
  source_filename: string | null;
  // Credit for a web page or Wikipedia article.
  source_credit: { name: string; url: string } | null;
  items: StudyItem[];
  // The set it was saved as; null if it wasn't saved.
  set_id: string | null;
}

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'error'; message: string };

export default function HistoryGuidePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const validId = isUuid(params.id);
  const [guide, setGuide] = useState<HistoryGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });

  useEffect(() => {
    if (!userId || !validId) return;
    let cancelled = false;
    // Only the owner can read an entry (RLS), so anyone else finds nothing.
    supabase
      .from('guide_history')
      .select('id, title, study_type, source_filename, source_credit, items, set_id')
      .eq('id', params.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setGuide((data as HistoryGuide | null) ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, validId, params.id]);

  const handleSave = async () => {
    if (!guide) return;
    setSaveState({ status: 'saving' });
    try {
      const res = await apiFetch('/api/save-set', {
        method: 'POST',
        body: {
          title: guide.title,
          sourceFilename: guide.source_filename,
          studyType: guide.study_type,
          items: guide.items,
          historyId: guide.id,
        },
      });
      if (!res.ok) {
        setSaveState({ status: 'error', message: errorMessage(res.data, "Couldn't save it. Please try again.") });
        return;
      }
      router.push(`/sets/${res.data.id}`);
    } catch {
      setSaveState({ status: 'error', message: 'Could not reach the server. Check your connection and try again.' });
    }
  };

  if (userLoading || (user && validId && loading)) {
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

  if (!guide) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-gray-500">Study guide not found.</p>
        <Link href="/history" className="text-link hover:underline">
          ← Back to History
        </Link>
      </main>
    );
  }

  const credit = guide.source_credit;
  const saveSlot = (
    <div className="text-center space-y-2">
      {credit && /^https?:\/\//.test(credit.url) && (
        <p className="text-xs text-gray-500">
          From{' '}
          <a href={credit.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
            {credit.name}
          </a>
        </p>
      )}
      {guide.set_id ? (
        <p className="text-sm">
          <span className="text-green-600 font-medium">Saved ✓</span>{' '}
          <Link href={`/sets/${guide.set_id}`} className="text-link hover:underline">
            Open it in My Sets
          </Link>
        </p>
      ) : (
        <button
          onClick={handleSave}
          disabled={saveState.status === 'saving'}
          className="text-sm border rounded-lg px-4 py-2 font-medium hover:border-accent disabled:opacity-40"
        >
          {saveState.status === 'saving' ? 'Saving...' : '💾 Save to My Sets'}
        </button>
      )}
      {saveState.status === 'error' && (
        <p role="alert" className="text-xs text-red-500">
          {saveState.message}
        </p>
      )}
    </div>
  );

  return (
    <StudyViewer
      title={guide.title}
      studyType={toStudyType(guide.study_type)}
      cards={guide.items}
      onExit={() => router.push('/history')}
      onFinish={() => router.push('/history')}
      saveSlot={saveSlot}
      quoteLabel={quoteSourceLabel(guide.source_filename)}
    />
  );
}
