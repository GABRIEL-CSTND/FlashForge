'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/auth';
import StudyViewer, { type StudyResult } from '@/components/StudyViewer';
import { newId } from '@/lib/ids';
import CardEditor, { type CardPayload, type SaveResult } from '@/components/CardEditor';
import { apiFetch, errorMessage } from '@/lib/api-client';
import AssignPanel from '@/components/AssignPanel';
import { useProfile } from '@/components/ProfileProvider';
import { canUseTeacherTools } from '@/lib/role-types';

interface FlashcardSet {
  id: string;
  title: string;
  source_filename: string | null;
  study_type: 'flashcard' | 'multiple_choice';
  user_id: string | null;
}

interface AttemptSummary {
  id: string;
  assignmentId: string | null;
  studyType: string;
  score: number;
  total: number;
  completedAt: string;
}

type SaveState =
  | { status: 'idle' }
  | { status: 'signed-out' }
  | { status: 'saving' }
  | { status: 'saved'; forAssignment: boolean }
  | { status: 'error'; message: string };

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
  const { profile } = useProfile();
  const [set, setSet] = useState<FlashcardSet | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState('');
  const [editingCards, setEditingCards] = useState(false);
  // Bumped after saving edited cards so the study view starts over on the new cards.
  const [viewerVersion, setViewerVersion] = useState(0);
  const [assigning, setAssigning] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [history, setHistory] = useState<AttemptSummary[]>([]);

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

  const saveCards = async (payload: CardPayload[]): Promise<SaveResult> => {
    if (!set) return { ok: false, error: 'Set not found.', cardIndex: null };
    try {
      const res = await apiFetch(`/api/sets/${set.id}/cards`, { method: 'PUT', body: { cards: payload } });
      if (!res.ok) {
        const cardIndex = typeof res.data.cardIndex === 'number' ? res.data.cardIndex : null;
        return { ok: false, error: errorMessage(res.data), cardIndex };
      }
      setCards(res.data.cards as Flashcard[]);
      setEditingCards(false);
      setViewerVersion((v) => v + 1);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server. Check your connection and try again.', cardIndex: null };
    }
  };

  // Saves each finished run as an attempt (#57). The id is made once per
  // finish, so a retried request can't create a second attempt.
  const recordAttempt = async (result: StudyResult) => {
    if (!set) return;
    if (!user) {
      setSaveState({ status: 'signed-out' });
      return;
    }
    setSaveState({ status: 'saving' });
    // Opened from My classes: /sets/[id]?assignment=<id>
    const assignmentId = new URLSearchParams(window.location.search).get('assignment');
    try {
      const res = await apiFetch('/api/attempts', {
        method: 'POST',
        body: { id: newId(), setId: set.id, assignmentId, answers: result.answers },
      });
      if (!res.ok) {
        setSaveState({ status: 'error', message: errorMessage(res.data, "Couldn't save your score.") });
        return;
      }
      const attempt = res.data.attempt as AttemptSummary;
      setSaveState({ status: 'saved', forAssignment: attempt.assignmentId !== null });
      const recent = await apiFetch(`/api/attempts?setId=${set.id}`);
      if (recent.ok) setHistory(recent.data.attempts as AttemptSummary[]);
    } catch {
      setSaveState({ status: 'error', message: "Couldn't reach the server, so your score wasn't saved." });
    }
  };

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  if (notFound || !set) {
    return <main className="min-h-screen flex items-center justify-center">Set not found.</main>;
  }

  const isOwner = user && set.user_id === user.id;

  if (isOwner && editingCards) {
    return (
      <CardEditor
        studyType={set.study_type}
        cards={cards}
        onSave={saveCards}
        onCancel={() => setEditingCards(false)}
      />
    );
  }

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
        <div className="flex justify-center gap-4">
          <button
            onClick={() => setEditingCards(true)}
            className="text-sm text-gray-500 hover:underline"
          >
            ✏️ Edit cards
          </button>
          <button
            onClick={startEditingTitle}
            className="text-sm text-gray-500 hover:underline"
          >
            Rename this set
          </button>
          {canUseTeacherTools(profile?.role) && (
            <button
              onClick={() => setAssigning(true)}
              className="text-sm text-gray-500 hover:underline"
            >
              📌 Assign to class
            </button>
          )}
        </div>
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

  const scoreLabel = (a: AttemptSummary) =>
    `${a.score} / ${a.total}${a.studyType === 'flashcard' ? ' got it' : ''}`;

  const completionSlot =
    saveState.status === 'idle' ? null : (
      <div className="space-y-3 rounded-xl border p-4 text-left text-sm">
        <p
          role={saveState.status === 'error' ? 'alert' : 'status'}
          className={
            saveState.status === 'error' ? 'text-red-500' : saveState.status === 'saved' ? 'text-green-600' : 'text-gray-500'
          }
        >
          {saveState.status === 'signed-out' && 'Sign in to save your scores.'}
          {saveState.status === 'saving' && 'Saving your score...'}
          {saveState.status === 'saved' &&
            (saveState.forAssignment
              ? '✓ Saved to your scores. Your teacher can see it.'
              : '✓ Saved to your scores. Only you can see this one.')}
          {saveState.status === 'error' && saveState.message}
        </p>
        {history.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-gray-400">Your recent scores</p>
            <ul className="space-y-1" aria-label="Your recent scores">
              {history.map((a) => (
                <li key={a.id} className="flex justify-between gap-3">
                  <span className="text-gray-500">{new Date(a.completedAt).toLocaleString()}</span>
                  <span className="font-medium">{scoreLabel(a)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );

  return (
    <>
    <StudyViewer
      key={viewerVersion}
      title={set.title}
      studyType={set.study_type}
      cards={cards}
      onFinish={() => router.push('/')}
      saveSlot={deleteSlot}
      onComplete={recordAttempt}
      completionSlot={completionSlot}
    />
    {isOwner && assigning && (
      <AssignPanel setId={set.id} setTitle={set.title} onClose={() => setAssigning(false)} />
    )}
    </>
  );
}
