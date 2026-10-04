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
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState('');

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

  const startEditingTitle = () => {
    if (!set) return;
    setTitleDraft(set.title);
    setTitleError('');
    setIsEditingTitle(true);
  };

  const cancelEditingTitle = () => {
    setIsEditingTitle(false);
    setTitleError('');
  };

  const saveTitle = async () => {
    if (!set) return;

    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleError('Name cannot be empty.');
      return;
    }
    if (trimmed === set.title) {
      setIsEditingTitle(false);
      return;
    }

    setSavingTitle(true);
    setTitleError('');

    const { error } = await supabase
      .from('flashcard_sets')
      .update({ title: trimmed })
      .eq('id', set.id);

    setSavingTitle(false);

    if (error) {
      setTitleError(error.message);
      return;
    }

    setSet({ ...set, title: trimmed });
    setIsEditingTitle(false);
  };

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  if (notFound || !set) {
    return <main className="min-h-screen flex items-center justify-center">Set not found.</main>;
  }

  const isOwner = user && set.user_id === user.id;

  const deleteSlot = isOwner ? (
    <div className="text-center space-y-2">
      {isEditingTitle ? (
        <div className="flex flex-col items-center gap-2">
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle();
              if (e.key === 'Escape') cancelEditingTitle();
            }}
            disabled={savingTitle}
            className="w-full max-w-xs text-center px-3 py-1.5 rounded-lg border text-sm"
            placeholder="Study guide name"
          />
          {titleError && <p className="text-xs text-red-500">{titleError}</p>}
          <div className="flex gap-3 text-sm">
            <button
              onClick={saveTitle}
              disabled={savingTitle}
              className="text-blue-600 hover:underline disabled:opacity-40"
            >
              {savingTitle ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={cancelEditingTitle}
              disabled={savingTitle}
              className="text-gray-500 hover:underline disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={startEditingTitle}
          className="text-sm text-gray-500 hover:underline"
        >
          ✏️ Rename this set
        </button>
      )}
      <div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-sm text-red-500 hover:underline disabled:opacity-40"
        >
          {deleting ? 'Deleting...' : '🗑 Delete this set'}
        </button>
      </div>
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
