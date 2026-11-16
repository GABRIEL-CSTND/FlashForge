'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LibraryDeck, { DESK_TEXT_BUTTON, NewDeckSpot } from '@/components/desk/LibraryDeck';
import LibraryDesk, { DeskNote } from '@/components/desk/LibraryDesk';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/auth';
import { bestByDeck, shortDate, type AttemptScore, type BestScore } from '@/lib/library';
import { STUDY_TYPE_LABELS, toStudyType } from '@/lib/study-types';

interface FlashcardSet {
  id: string;
  title: string;
  study_type: string;
  created_at: string;
}

const TIP = 'Click a deck to pick it up and study it. Your best score is on its tag.';

// My Sets on the desk (desk redesign, phase 5): every saved set is a deck with
// its best score on a paper tag. Picking one up opens it on /sets/[id].
export default function MySetsPage() {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [best, setBest] = useState<Record<string, BestScore>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([
      supabase.from('flashcard_sets').select('id, title, study_type, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
      // The user's own scores (RLS lets a student read only their own), for each deck's best.
      supabase.from('attempts').select('set_id, score, total').eq('user_id', userId),
    ]).then(([setsRes, attemptsRes]) => {
      if (cancelled) return;
      setLoadFailed(Boolean(setsRes.error));
      setSets((setsRes.data as FlashcardSet[] | null) ?? []);
      setBest(bestByDeck((attemptsRes.data as AttemptScore[] | null) ?? []));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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

  if (userLoading || (user && loading)) {
    return (
      <LibraryDesk title="My Sets">
        <p role="status" className="desk-wait text-on-desk/85">
          Loading your decks…
        </p>
      </LibraryDesk>
    );
  }

  if (!user) {
    return (
      <LibraryDesk title="My Sets">
        <DeskNote>
          <p>Sign in to view your saved sets.</p>
          <Link href="/" className="mt-2 inline-block font-semibold text-link hover:underline">
            Make a deck
          </Link>
        </DeskNote>
      </LibraryDesk>
    );
  }

  const count = sets.length;
  const subline = loadFailed
    ? undefined
    : count === 0
      ? 'No saved decks yet. Save one after you make it, and it lands here.'
      : `${count} saved deck${count === 1 ? '' : 's'}. Pick one up to study it.`;

  return (
    <LibraryDesk title="My Sets" subline={subline} tip={TIP}>
      {loadFailed ? (
        <DeskNote role="alert">Couldn&apos;t load your sets. Please try again.</DeskNote>
      ) : (
        <ul aria-label="Your saved decks" className="grid gap-x-10 gap-y-12 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {sets.map((s, i) => {
            const score = best[s.id];
            return (
              <LibraryDeck
                key={s.id}
                index={i}
                href={`/sets/${s.id}`}
                morph={`deck-${s.id}`}
                kind={STUDY_TYPE_LABELS[toStudyType(s.study_type)]}
                title={s.title}
                meta={`Saved ${shortDate(s.created_at)}`}
                tag={score ? { text: `Best ${score.score} of ${score.total}`, tone: 'ink' } : { text: 'Not studied yet', tone: 'muted' }}
                actions={
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id, s.title)}
                    disabled={deletingId === s.id}
                    aria-label={`Delete ${s.title}`}
                    className={DESK_TEXT_BUTTON}
                  >
                    {deletingId === s.id ? 'Deleting…' : 'Delete'}
                  </button>
                }
              />
            );
          })}
          <NewDeckSpot index={sets.length} />
        </ul>
      )}
    </LibraryDesk>
  );
}
