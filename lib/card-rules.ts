import { isUuid } from '@/lib/ids';

// Card rules shared by the editor (client) and PUT /api/sets/[id]/cards
// (server), so both give the same messages (#55).

export type StudyType = 'flashcard' | 'multiple_choice';

export const CARD_LIMITS = {
  maxCards: 50,
  question: 500,
  answer: 200,
  choice: 200,
  choices: 4,
} as const;

// How multiple-choice text is compared: ignores case, extra spaces and
// trailing periods. AI generation (lib/gemini.ts) uses the same rule.
export function normalizeChoice(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[.]+$/, '').toLowerCase();
}

export interface CleanCard {
  // Null for a card that doesn't exist yet.
  id: string | null;
  question: string;
  answer: string;
  options: string[] | null;
}

export type CardsResult =
  | { ok: true; cards: CleanCard[] }
  // cardIndex is 0-based; null when the problem is with the list as a whole.
  | { ok: false; error: string; cardIndex: number | null };

const fail = (error: string, cardIndex: number | null = null): CardsResult => ({ ok: false, error, cardIndex });

function text(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

// Checks a whole set's cards for its study type and returns them trimmed. For
// multiple choice, `answer` must match exactly one of the 4 different choices
// and is stored as that choice's text.
export function validateCards(raw: unknown, studyType: StudyType): CardsResult {
  if (!Array.isArray(raw)) return fail('Send the cards as a list.');
  if (raw.length === 0) return fail('A set needs at least one card. Delete the set instead if you no longer need it.');
  if (raw.length > CARD_LIMITS.maxCards) return fail(`A set can have up to ${CARD_LIMITS.maxCards} cards.`);

  const cards: CleanCard[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const label = `Card ${i + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return fail(`${label} is not valid.`, i);
    const card = item as Record<string, unknown>;

    const id = card.id ?? null;
    if (id !== null) {
      if (!isUuid(id)) return fail(`${label} has an invalid id.`, i);
      if (seenIds.has(id)) return fail(`${label} appears twice.`, i);
      seenIds.add(id);
    }

    const question = text(card.question);
    if (!question) return fail(`${label}: write a question.`, i);
    if (question.length > CARD_LIMITS.question) {
      return fail(`${label}: the question is too long (up to ${CARD_LIMITS.question} characters).`, i);
    }

    if (studyType === 'flashcard') {
      if (card.options != null) return fail(`${label}: flashcards don't have choices.`, i);
      const answer = text(card.answer);
      if (!answer) return fail(`${label}: write an answer.`, i);
      if (answer.length > CARD_LIMITS.answer) {
        return fail(`${label}: the answer is too long (up to ${CARD_LIMITS.answer} characters).`, i);
      }
      cards.push({ id, question, answer, options: null });
      continue;
    }

    if (!Array.isArray(card.options) || card.options.length !== CARD_LIMITS.choices) {
      return fail(`${label}: a multiple-choice card needs exactly ${CARD_LIMITS.choices} choices.`, i);
    }
    const options = card.options.map(text);
    if (options.some((o) => !o)) return fail(`${label}: fill in all ${CARD_LIMITS.choices} choices.`, i);
    if (options.some((o) => o!.length > CARD_LIMITS.choice)) {
      return fail(`${label}: a choice is too long (up to ${CARD_LIMITS.choice} characters).`, i);
    }
    if (new Set(options.map((o) => normalizeChoice(o!))).size !== options.length) {
      return fail(`${label}: two choices are the same.`, i);
    }
    const answer = text(card.answer);
    const correct = answer ? options.filter((o) => normalizeChoice(o!) === normalizeChoice(answer)) : [];
    if (correct.length !== 1) return fail(`${label}: pick the correct choice.`, i);

    cards.push({ id, question, answer: correct[0]!, options: options as string[] });
  }

  return { ok: true, cards };
}
