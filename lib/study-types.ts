// Kinds of study guide and how many questions to generate, shared by the
// upload page, the API routes and the AI pipeline.

export const STUDY_TYPES = ['flashcard', 'multiple_choice', 'true_false', 'mixed'] as const;
export type StudyType = (typeof STUDY_TYPES)[number];

export function isStudyType(value: unknown): value is StudyType {
  return typeof value === 'string' && (STUDY_TYPES as readonly string[]).includes(value);
}

// Sets saved before study types were checked can say something else (one
// legacy set says "identification"); they have always been shown as
// flashcards.
export function toStudyType(value: unknown): StudyType {
  return isStudyType(value) ? value : 'flashcard';
}

export const STUDY_TYPE_LABELS: Record<StudyType, string> = {
  flashcard: 'Flashcards',
  multiple_choice: 'Multiple choice',
  true_false: 'True or false',
  mixed: 'Mixed quiz',
};

// One line under the choice on the upload page.
export const STUDY_TYPE_HINTS: Record<StudyType, string> = {
  flashcard: 'A clue on the front and a short term on the back. Flip, type or match them.',
  multiple_choice: 'Pick the right answer out of 4.',
  true_false: 'Decide whether each statement is true or false, and see the correction.',
  mixed: 'Like a school exam: Part I multiple choice, Part II true or false, Part III identification.',
};

// The parts of a mixed quiz (#69), in order. Each card's kind comes from its
// options (cardKind() in lib/card-rules.ts).
export const MIXED_PARTS = [
  { kind: 'multiple_choice', label: 'Multiple choice', numeral: 'I' },
  { kind: 'true_false', label: 'True or false', numeral: 'II' },
  { kind: 'identification', label: 'Identification', numeral: 'III' },
] as const;
export type MixedPartKind = (typeof MIXED_PARTS)[number]['kind'];

// How many questions of each part a mixed quiz of `count` gets: about 40%
// multiple choice, 30% true or false and 30% identification (10 -> 4, 3, 3).
export function mixedSplit(count: number): Record<MixedPartKind, number> {
  const multipleChoice = Math.round(count * 0.4);
  const trueFalse = Math.round(count * 0.3);
  return { multiple_choice: multipleChoice, true_false: trueFalse, identification: count - multipleChoice - trueFalse };
}

// Ways to study a flashcard set (#66, #67). Flip is the original way, marked
// by the student ("Got it / Missed it"); typed and matched answers are checked
// against the real answers. Other study types have one way each.
export const FLASHCARD_MODES = ['flip', 'type', 'match'] as const;
export type FlashcardMode = (typeof FLASHCARD_MODES)[number];
// What an attempt stores: null for the study type's normal way (flipping, for
// flashcards), so attempts saved before modes existed need no change.
export type StudyMode = Exclude<FlashcardMode, 'flip'>;

export const FLASHCARD_MODE_LABELS: Record<FlashcardMode, string> = {
  flip: 'Flip',
  type: 'Type',
  match: 'Match',
};

// Matching (#67) is played in rounds of up to this many cards.
export const MATCH_ROUND_SIZE = 5;

// Splits a set into matching rounds as evenly as possible, so a 12-card set is
// 4 + 4 + 4 rather than 5 + 5 + 2. Returns [start, end) card positions.
export function matchRounds(cardCount: number): [number, number][] {
  const roundCount = Math.ceil(cardCount / MATCH_ROUND_SIZE);
  const rounds: [number, number][] = [];
  let start = 0;
  for (let r = 0; r < roundCount; r++) {
    const size = Math.floor(cardCount / roundCount) + (r < cardCount % roundCount ? 1 : 0);
    rounds.push([start, start + size]);
    start += size;
  }
  return rounds;
}

export function isStudyMode(value: unknown): value is StudyMode {
  return value !== 'flip' && (FLASHCARD_MODES as readonly unknown[]).includes(value);
}

// How many questions to generate (#65). The upload page offers these; the API
// accepts any whole number from MIN to MAX.
export const QUESTION_COUNTS = [5, 10, 15, 20, 30] as const;
export const DEFAULT_QUESTION_COUNT = 10;
export const MIN_QUESTION_COUNT = 5;
export const MAX_QUESTION_COUNT = 30;

// A missing, non-numeric or out-of-range count falls back to the default.
export function parseQuestionCount(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isInteger(n) && n >= MIN_QUESTION_COUNT && n <= MAX_QUESTION_COUNT ? n : DEFAULT_QUESTION_COUNT;
}
