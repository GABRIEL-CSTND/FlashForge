import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { CleanCard, StudyType } from '@/lib/card-rules';

// SERVER-ONLY (service-role client). Study sets, scoped to their owner.

export interface OwnedSet {
  id: string;
  studyType: StudyType;
}

export interface SavedCard {
  id: string;
  question: string;
  answer: string;
  options: string[] | null;
  position: number;
}

// Null if the set doesn't exist, belongs to someone else, or is a legacy set
// with no owner (those can't be edited).
export async function getOwnedSet(
  ownerId: string,
  setId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<OwnedSet | null> {
  const { data, error } = await client
    .from('flashcard_sets')
    .select('id, study_type')
    .eq('id', setId)
    .eq('user_id', ownerId)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, studyType: data.study_type as StudyType } : null;
}

export class SetCardsError extends Error {
  kind: 'not-found' | 'stale';

  constructor(kind: 'not-found' | 'stale', message: string) {
    super(message);
    this.name = 'SetCardsError';
    this.kind = kind;
  }
}

// Saves the whole edited list in one transaction (public.replace_set_cards):
// cards with an id are updated, cards without one are added, the rest are
// deleted, and positions follow the list order. Returns the saved cards.
export async function replaceSetCards(
  ownerId: string,
  setId: string,
  cards: CleanCard[],
  client: SupabaseClient = supabaseAdmin
): Promise<SavedCard[]> {
  const payload = cards.map((c) => ({
    ...(c.id ? { id: c.id } : {}),
    question: c.question,
    answer: c.answer,
    options: c.options,
  }));
  const { data, error } = await client.rpc('replace_set_cards', {
    p_set_id: setId,
    p_owner_id: ownerId,
    p_cards: payload,
  });
  if (error) {
    // Raised by the function: P0002 = not this owner's set; 22023 = a card id
    // that isn't in this set (e.g. the page is out of date).
    if (error.code === 'P0002') throw new SetCardsError('not-found', error.message);
    if (error.code === '22023') throw new SetCardsError('stale', error.message);
    throw error;
  }
  return (data ?? []) as SavedCard[];
}
