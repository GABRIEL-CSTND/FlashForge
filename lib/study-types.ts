// Kinds of study guide and how many questions to generate, shared by the
// upload page, the API routes and the AI pipeline.

export const STUDY_TYPES = ['flashcard', 'multiple_choice'] as const;
export type StudyType = (typeof STUDY_TYPES)[number];

export function isStudyType(value: unknown): value is StudyType {
  return typeof value === 'string' && (STUDY_TYPES as readonly string[]).includes(value);
}

export const STUDY_TYPE_LABELS: Record<StudyType, string> = {
  flashcard: 'Flashcards',
  multiple_choice: 'Multiple choice',
};

// Ways to study a flashcard set (#66). Flip is the original way, marked by
// the student ("Got it / Missed it"); typed answers are checked against the
// real answer. Other study types have one way each.
export const FLASHCARD_MODES = ['flip', 'type'] as const;
export type FlashcardMode = (typeof FLASHCARD_MODES)[number];
// What an attempt stores: null for the study type's normal way (flipping, for
// flashcards), so attempts saved before modes existed need no change.
export type StudyMode = Exclude<FlashcardMode, 'flip'>;

export const FLASHCARD_MODE_LABELS: Record<FlashcardMode, string> = {
  flip: 'Flip',
  type: 'Type',
};

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
