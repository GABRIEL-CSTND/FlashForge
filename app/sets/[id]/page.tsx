'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/auth';
import StudyViewer from '@/components/StudyViewer';

interface FlashcardSet {
  id: string;
  title: string;
  source_filename: string | null;
  study_type: 'flashcard' | 'multiple_choice';
  user_id: string | null;
}

interface Flashcard {
  id: string;
  question: string;
  answer: string;
  options: string[] | null;
  position: number;
}

export default function SetPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const [set, setSet] = useState<FlashcardSet | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: setData, error: setError } = await supabase
        .from('flashcard_sets')
        .select('*')
        .eq('id', params.id)
        .single();

      if (setError || !setData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setSet(setData);

      const { data: cardData } = await supabase
        .from('flashcards')
        .select('*')
        .eq('set_id', params.id)
        .order('position', { ascending: true });

      setCards(cardData || []);
      setLoading(false);
    };
    load();
  }, [params.id]);

  const handleDelete = async () => {
    if (!set) return;
    const confirmed = window.confirm(
      `Delete "${set.title}"? This can't be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    const { error } = await supabase.from('flashcard_sets').delete().eq('id', set.id);
    setDeleting(false);

    if (error) {
      alert('Failed to delete: ' + error.message);
      return;
    }

    router.push('/my-sets');
  };

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  if (notFound || !set) {
    return <main className="min-h-screen flex items-center justify-center">Set not found.</main>;
  }

  const isOwner = user && set.user_id === user.id;

  const deleteSlot = isOwner ? (
    <div className="text-center">
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="text-sm text-red-500 hover:underline disabled:opacity-40"
      >
        {deleting ? 'Deleting...' : '🗑 Delete this set'}
      </button>
    </div>
  ) : null;

  return (
    <StudyViewer
      title={set.title}
      studyType={set.study_type}
      cards={cards}
      onFinish={() => router.push('/')}
      saveSlot={deleteSlot}
    />
  );
}
