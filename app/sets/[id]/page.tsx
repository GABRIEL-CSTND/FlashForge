'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import StudyViewer, { StudyItem } from '@/components/StudyViewer';
import { useUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

interface FlashcardSet {
  id: string;
  title: string;
  study_type: 'flashcard' | 'multiple_choice';
}

interface SetState {
  requestKey: string;
  set: FlashcardSet | null;
  cards: StudyItem[];
  error: string;
}

export default function SetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const requestKey = userId ? `${userId}:${id}` : '';
  const [state, setState] = useState<SetState>({
    requestKey: '',
    set: null,
    cards: [],
    error: '',
  });
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const loadSet = async () => {
      const { data: setData, error: setError } = await supabase
        .from('flashcard_sets')
        .select('id, title, study_type')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (setError || !setData) {
        if (!cancelled) {
          setState({ requestKey, set: null, cards: [], error: 'Saved set not found.' });
        }
        return;
      }

      const { data: cardData, error: cardsError } = await supabase
        .from('flashcards')
        .select('id, question, answer, options')
        .eq('set_id', id)
        .order('position', { ascending: true });

      if (!cancelled) {
        setState({
          requestKey,
          set: setData,
          cards: cardData ?? [],
          error: cardsError?.message ?? '',
        });
      }
    };

    void loadSet();

    return () => {
      cancelled = true;
    };
  }, [id, requestKey, userId]);

  const loading = userLoading || Boolean(userId && state.requestKey !== requestKey);

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-gray-500">Sign in to view this saved set.</p>
        <Link href="/" className="text-blue-500 hover:underline">
          ← Back to upload
        </Link>
      </main>
    );
  }

  if (state.error || !state.set) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-red-500">{state.error || 'Saved set not found.'}</p>
        <Link href="/my-sets" className="text-blue-500 hover:underline">
          ← Back to My Sets
        </Link>
      </main>
    );
  }

  const returnToSets = () => router.push('/my-sets');

  const handleDelete = async () => {
    if (!state.set || deleting) return;

    const confirmed = window.confirm(`Delete "${state.set.title}"? This can't be undone.`);
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError('');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch('/api/delete-set', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ id: state.set.id }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDeleteError(body.error || 'Failed to delete. Try again.');
      setDeleting(false);
      return;
    }

    router.push('/my-sets');
  };

  const deleteSlot = (
    <div className="text-center space-y-1">
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="text-sm text-red-500 hover:underline disabled:opacity-40"
      >
        {deleting ? 'Deleting...' : '🗑 Delete this set'}
      </button>
      {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
    </div>
  );

  return (
    <StudyViewer
      title={state.set.title}
      studyType={state.set.study_type}
      cards={state.cards}
      onExit={returnToSets}
      onFinish={returnToSets}
      saveSlot={deleteSlot}
    />
  );
}
