import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { CARD_LIMITS, cardKind, normalizeChoice, type StudyType } from '@/lib/card-rules';
import { checkTypedAnswer } from '@/lib/answer-check';
import { isStudyMode, toStudyType, type StudyMode } from '@/lib/study-types';
import { isUuid } from '@/lib/ids';

// SERVER-ONLY (service-role client). Recording and reading study results (#57).
// The browser only sends what the student chose; the score is worked out here
// from the set's real cards.

export type FlashcardMark = 'got' | 'missed';

export interface AnswerInput {
  cardId: string;
  // Multiple choice: the option picked (null if skipped). Matching (#67): the
  // term picked for this card's clue.
  chosen?: string | null;
  // Flashcards: the student's own mark (null if not marked).
  result?: FlashcardMark | null;
  // Typed answers (#66): what the student typed (null for "I don't know").
  typed?: string | null;
}

export interface StoredAnswer extends AnswerInput {
  correct: boolean;
}

export interface AttemptSummary {
  id: string;
  setId: string;
  assignmentId: string | null;
  studyType: StudyType;
  // How the set was studied; null for the study type's normal way (#66).
  mode: StudyMode | null;
  score: number;
  total: number;
  completedAt: string;
}

export const MAX_ANSWERS = 200;

type ParseResult = { ok: true; answers: AnswerInput[] } | { ok: false; error: string };

// Checks the shape of the answers for the set's study type and how it was
// studied (not the scoring).
export function parseAnswers(raw: unknown, studyType: StudyType, mode: StudyMode | null = null): ParseResult {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'Send at least one answer.' };
  if (raw.length > MAX_ANSWERS) return { ok: false, error: `Send at most ${MAX_ANSWERS} answers.` };

  const seen = new Set<string>();
  const answers: AnswerInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, error: 'An answer is not valid.' };
    const { cardId, chosen, result, typed } = item as Record<string, unknown>;
    if (!isUuid(cardId) || seen.has(cardId)) return { ok: false, error: 'An answer has a missing or repeated card id.' };
    seen.add(cardId);

    if (mode === 'type') {
      if (typed != null && (typeof typed !== 'string' || typed.length > CARD_LIMITS.answer)) {
        return { ok: false, error: 'A typed answer is too long.' };
      }
      answers.push({ cardId, typed: typeof typed === 'string' && typed.trim() ? typed.trim() : null });
    } else if (mode === 'match') {
      if (chosen != null && (typeof chosen !== 'string' || chosen.length > CARD_LIMITS.answer)) {
        return { ok: false, error: 'An answer has an invalid term.' };
      }
      answers.push({ cardId, chosen: (chosen as string | null | undefined) ?? null });
    } else if (studyType === 'mixed') {
      // Each card is answered by its own kind (#69): a pick, or typed text.
      if (chosen != null && (typeof chosen !== 'string' || chosen.length > 500)) {
        return { ok: false, error: 'An answer has an invalid choice.' };
      }
      if (typed != null && (typeof typed !== 'string' || typed.length > CARD_LIMITS.answer)) {
        return { ok: false, error: 'A typed answer is too long.' };
      }
      answers.push({
        cardId,
        chosen: (chosen as string | null | undefined) ?? null,
        typed: typeof typed === 'string' && typed.trim() ? typed.trim() : null,
      });
    } else if (studyType === 'multiple_choice' || studyType === 'true_false') {
      if (chosen != null && (typeof chosen !== 'string' || chosen.length > 500)) {
        return { ok: false, error: 'An answer has an invalid choice.' };
      }
      answers.push({ cardId, chosen: (chosen as string | null | undefined) ?? null });
    } else {
      if (result != null && result !== 'got' && result !== 'missed') {
        return { ok: false, error: 'A flashcard mark must be "got" or "missed".' };
      }
      answers.push({ cardId, result: (result as FlashcardMark | null | undefined) ?? null });
    }
  }
  return { ok: true, answers };
}

// Scores answers against the set's current cards. Answers for cards that no
// longer exist (e.g. the owner edited the set mid-study) are dropped. Typed
// answers use the same check as the study screen (lib/answer-check.ts), where
// one typo still counts as correct.
export function scoreAnswers(
  answers: AnswerInput[],
  cards: { id: string; answer: string; options?: unknown }[],
  studyType: StudyType,
  mode: StudyMode | null = null
): { score: number; total: number; stored: StoredAnswer[] } {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const stored: StoredAnswer[] = [];
  for (const a of answers) {
    const card = byId.get(a.cardId);
    if (!card) continue;
    if (studyType === 'mixed') {
      // Identification is typed and checked like #66; the other parts are picks.
      const typedPart = cardKind(card.options) === 'identification';
      const correct = typedPart
        ? checkTypedAnswer(a.typed, card.answer) !== 'wrong'
        : a.chosen != null && normalizeChoice(a.chosen) === normalizeChoice(card.answer);
      stored.push({ cardId: a.cardId, ...(typedPart ? { typed: a.typed ?? null } : { chosen: a.chosen ?? null }), correct });
      continue;
    }
    // Matching picks another card's term, so it's compared like a multiple-choice
    // pick. True or false (#68) is a pick between two options.
    const correct =
      mode === 'type'
        ? checkTypedAnswer(a.typed, card.answer) !== 'wrong'
        : mode === 'match' || studyType === 'multiple_choice' || studyType === 'true_false'
          ? a.chosen != null && normalizeChoice(a.chosen) === normalizeChoice(card.answer)
          : a.result === 'got';
    stored.push({ ...a, correct });
  }
  return { score: stored.filter((a) => a.correct).length, total: stored.length, stored };
}

interface StudySet {
  id: string;
  studyType: StudyType;
}

// The set if this user may study it: they own it, it's a legacy set with no
// owner, or it's assigned to a class they're in. Otherwise null.
export async function findStudySet(
  userId: string,
  setId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<StudySet | null> {
  const { data: set, error } = await client
    .from('flashcard_sets')
    .select('id, user_id, study_type')
    .eq('id', setId)
    .maybeSingle();
  if (error) throw error;
  if (!set) return null;
  const result = { id: set.id as string, studyType: toStudyType(set.study_type) };
  if (set.user_id === null || set.user_id === userId) return result;

  const { data: assigned, error: assignedError } = await client
    .from('assignments')
    .select('class_id')
    .eq('set_id', setId);
  if (assignedError) throw assignedError;
  if (!assigned || assigned.length === 0) return null;

  const { data: memberships, error: memberError } = await client
    .from('class_members')
    .select('class_id')
    .eq('student_id', userId)
    .in(
      'class_id',
      assigned.map((a) => a.class_id)
    );
  if (memberError) throw memberError;
  return memberships && memberships.length > 0 ? result : null;
}

// The assignment id to attach, or null if it doesn't belong to this set or
// the user isn't in its class (then the attempt is simply private).
export async function resolveAssignment(
  userId: string,
  setId: string,
  assignmentId: unknown,
  client: SupabaseClient = supabaseAdmin
): Promise<string | null> {
  if (!isUuid(assignmentId)) return null;
  const { data: assignment, error } = await client
    .from('assignments')
    .select('id, set_id, class_id')
    .eq('id', assignmentId)
    .maybeSingle();
  if (error) throw error;
  if (!assignment || assignment.set_id !== setId) return null;

  const { data: member, error: memberError } = await client
    .from('class_members')
    .select('class_id')
    .eq('class_id', assignment.class_id)
    .eq('student_id', userId)
    .maybeSingle();
  if (memberError) throw memberError;
  return member ? (assignment.id as string) : null;
}

export type RecordResult =
  | { kind: 'created' | 'duplicate'; attempt: AttemptSummary }
  | { kind: 'not-found' }
  | { kind: 'invalid'; error: string }
  | { kind: 'stale' }
  | { kind: 'conflict' };

const SUMMARY_COLUMNS = 'id, user_id, set_id, assignment_id, study_type, mode, score, total, completed_at';

interface AttemptRow {
  id: string;
  user_id: string;
  set_id: string;
  assignment_id: string | null;
  study_type: StudyType;
  mode: StudyMode | null;
  score: number;
  total: number;
  completed_at: string;
}

function toSummary(row: AttemptRow): AttemptSummary {
  return {
    id: row.id,
    setId: row.set_id,
    assignmentId: row.assignment_id,
    studyType: row.study_type,
    mode: row.mode ?? null,
    score: row.score,
    total: row.total,
    completedAt: row.completed_at,
  };
}

// Records one finished study session. `attemptId` comes from the browser
// (one per finish), so retrying the same request can't create a second row.
export async function recordAttempt(
  userId: string,
  input: { attemptId: string; setId: string; assignmentId?: unknown; mode?: unknown; answers: unknown },
  client: SupabaseClient = supabaseAdmin
): Promise<RecordResult> {
  const set = await findStudySet(userId, input.setId, client);
  if (!set) return { kind: 'not-found' };

  // Only flashcard sets can be studied another way (#66).
  const mode = input.mode ?? null;
  if (mode !== null && !(isStudyMode(mode) && set.studyType === 'flashcard')) {
    return { kind: 'invalid', error: "This set can't be studied that way." };
  }
  const parsed = parseAnswers(input.answers, set.studyType, mode);
  if (!parsed.ok) return { kind: 'invalid', error: parsed.error };

  const { data: cards, error: cardsError } = await client
    .from('flashcards')
    .select('id, answer, options')
    .eq('set_id', set.id);
  if (cardsError) throw cardsError;
  const { score, total, stored } = scoreAnswers(parsed.answers, cards ?? [], set.studyType, mode);
  if (total === 0) return { kind: 'stale' };

  const assignmentId = await resolveAssignment(userId, set.id, input.assignmentId, client);

  const { data: inserted, error } = await client
    .from('attempts')
    .insert({
      id: input.attemptId,
      user_id: userId,
      set_id: set.id,
      assignment_id: assignmentId,
      study_type: set.studyType,
      mode,
      score,
      total,
      answers: stored,
    })
    .select(SUMMARY_COLUMNS)
    .single();
  if (!error) return { kind: 'created', attempt: toSummary(inserted as AttemptRow) };
  if (error.code !== '23505') throw error;

  // Same id again: a retry of a request that already worked.
  const { data: existing, error: existingError } = await client
    .from('attempts')
    .select(SUMMARY_COLUMNS)
    .eq('id', input.attemptId)
    .maybeSingle();
  if (existingError) throw existingError;
  return existing && existing.user_id === userId
    ? { kind: 'duplicate', attempt: toSummary(existing as AttemptRow) }
    : { kind: 'conflict' };
}

// The user's own recent attempts on one set, newest first.
export async function listMyAttempts(
  userId: string,
  setId: string,
  limit = 10,
  client: SupabaseClient = supabaseAdmin
): Promise<AttemptSummary[]> {
  const { data, error } = await client
    .from('attempts')
    .select(SUMMARY_COLUMNS)
    .eq('user_id', userId)
    .eq('set_id', setId)
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as AttemptRow[]).map(toSummary);
}

export interface AssignmentProgress {
  attempts: number;
  bestScore: number;
  bestTotal: number;
  lastCompletedAt: string;
}

// For "done / not done" on My classes: the student's own attempts per
// assignment, with the best result (by percentage).
export async function progressForAssignments(
  studentId: string,
  assignmentIds: string[],
  client: SupabaseClient = supabaseAdmin
): Promise<Map<string, AssignmentProgress>> {
  const progress = new Map<string, AssignmentProgress>();
  if (assignmentIds.length === 0) return progress;
  const { data, error } = await client
    .from('attempts')
    .select('assignment_id, score, total, completed_at')
    .eq('user_id', studentId)
    .in('assignment_id', assignmentIds);
  if (error) throw error;
  for (const row of data ?? []) {
    const current = progress.get(row.assignment_id);
    const better = !current || row.score / row.total > current.bestScore / current.bestTotal;
    progress.set(row.assignment_id, {
      attempts: (current?.attempts ?? 0) + 1,
      bestScore: better ? row.score : current!.bestScore,
      bestTotal: better ? row.total : current!.bestTotal,
      lastCompletedAt:
        !current || Date.parse(row.completed_at) > Date.parse(current.lastCompletedAt)
          ? row.completed_at
          : current.lastCompletedAt,
    });
  }
  return progress;
}
