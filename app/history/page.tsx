'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LibraryDeck, { DESK_TEXT_BUTTON } from '@/components/desk/LibraryDeck';
import LibraryDesk, { DeskNote } from '@/components/desk/LibraryDesk';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/auth';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { questionsWord, shortDate } from '@/lib/library';
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

type Notice = { kind: 'success' | 'error'; text: string } | null;

const TIP = 'Every guide you make lands here, saved or not. Save the ones you want to keep.';
const SAVE_FAILED = "Couldn't save it. Please try again.";

// History on the desk (desk redesign, phase 5): every guide is a deck whose tag
// says when it was made and whether it's saved. One that isn't can be saved to
// My Sets from here; picking a deck up opens it on /history/[id].
export default function HistoryPage() {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

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

  // The same save as on the guide's own page (/history/[id]): the guide's cards
  // go to /api/save-set with its History entry, which then points at the set.
  const handleSave = async (entry: HistoryEntry) => {
    setSavingId(entry.id);
    setNotice(null);
    try {
      const { data, error } = await supabase
        .from('guide_history')
        .select('title, study_type, source_filename, items')
        .eq('id', entry.id)
        .maybeSingle();
      const guide = data as { title: string; study_type: string; source_filename: string | null; items: unknown[] } | null;
      if (error || !guide) {
        setNotice({ kind: 'error', text: SAVE_FAILED });
        return;
      }
      const res = await apiFetch('/api/save-set', {
        method: 'POST',
        body: { title: guide.title, sourceFilename: guide.source_filename, studyType: guide.study_type, items: guide.items, historyId: entry.id },
      });
      if (!res.ok) {
        setNotice({ kind: 'error', text: errorMessage(res.data, SAVE_FAILED) });
        return;
      }
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, set_id: res.data.id as string } : e)));
      setNotice({ kind: 'success', text: `Saved ${entry.title} to My Sets.` });
    } catch {
      setNotice({ kind: 'error', text: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setSavingId(null);
    }
  };

  if (userLoading || (user && loading)) {
    return (
      <LibraryDesk title="History">
        <p role="status" className="text-on-desk/85">
          Loading your guides…
        </p>
      </LibraryDesk>
    );
  }

  if (!user) {
    return (
      <LibraryDesk title="History">
        <DeskNote>
          <p>Sign in to see the study guides you&apos;ve made.</p>
          <Link href="/" className="mt-2 inline-block font-semibold text-link hover:underline">
            Make a deck
          </Link>
        </DeskNote>
      </LibraryDesk>
    );
  }

  return (
    <LibraryDesk title="History" subline="Every guide you've made, saved or not." tip={TIP}>
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`mb-6 text-sm font-medium ${notice.kind === 'error' ? 'text-[#efb2a8]' : 'text-[#e2c887]'}`}>
          {notice.text}
        </p>
      )}
      {loadFailed ? (
        <DeskNote role="alert">Couldn&apos;t load your history. Please try again.</DeskNote>
      ) : entries.length === 0 ? (
        <DeskNote>No study guides yet. The ones you make while signed in will show up here.</DeskNote>
      ) : (
        <ul aria-label="Your study guides" className="grid gap-x-10 gap-y-12 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {entries.map((e, i) => (
            <LibraryDeck
              key={e.id}
              index={i}
              href={`/history/${e.id}`}
              morph={`deck-h-${e.id}`}
              kind={STUDY_TYPE_LABELS[toStudyType(e.study_type)]}
              title={e.title}
              meta={questionsWord(e.item_count)}
              tag={
                e.set_id
                  ? { text: `${shortDate(e.created_at)} · saved`, tone: 'ink' }
                  : { text: `${shortDate(e.created_at)} · not saved`, tone: 'pencil' }
              }
              actions={
                <>
                  {!e.set_id && (
                    <button
                      type="button"
                      onClick={() => handleSave(e)}
                      disabled={savingId !== null}
                      className="btn btn-primary min-h-11 rounded-full px-4 text-[13px] font-semibold"
                    >
                      {savingId === e.id ? 'Saving…' : 'Save to My Sets'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(e)}
                    disabled={removingId === e.id}
                    aria-label={`Remove ${e.title} from history`}
                    className={DESK_TEXT_BUTTON}
                  >
                    {removingId === e.id ? 'Removing…' : 'Remove'}
                  </button>
                </>
              }
            />
          ))}
        </ul>
      )}
    </LibraryDesk>
  );
}
