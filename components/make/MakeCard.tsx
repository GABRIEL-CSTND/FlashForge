'use client';

import SlipMenu from '@/components/desk/SlipMenu';
import {
  DIFFICULTIES,
  DIFFICULTY_HINTS,
  DIFFICULTY_LABELS,
  QUESTION_COUNTS,
  STUDY_TYPE_HINTS,
  STUDY_TYPE_LABELS,
  STUDY_TYPES,
  type Difficulty,
  type StudyType,
} from '@/lib/study-types';

// What the last word of "Make me 10 medium …" says for each kind of deck.
export const DECK_WORDS: Record<StudyType, string> = {
  flashcard: 'flashcards',
  multiple_choice: 'multiple-choice questions',
  true_false: 'true-or-false statements',
  mixed: 'mixed-quiz questions',
};

const COUNT_OPTIONS = QUESTION_COUNTS.map((n) => ({ value: n as number, label: String(n) }));
const LEVEL_OPTIONS = DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d], hint: DIFFICULTY_HINTS[d] }));
const TYPE_OPTIONS = STUDY_TYPES.map((t) => ({ value: t, label: STUDY_TYPE_LABELS[t], hint: STUDY_TYPE_HINTS[t] }));

// The "Make me 10 medium flashcards" card (desk redesign, phase 3): each of the
// three words opens paper slips, the line under it says where the deck comes
// from, and the brass button makes it.
export default function MakeCard({
  count,
  onCount,
  difficulty,
  onDifficulty,
  studyType,
  onStudyType,
  sourceLine,
  canMake,
  making,
  onMake,
  waitNote,
  error,
}: {
  count: number;
  onCount: (count: number) => void;
  difficulty: Difficulty;
  onDifficulty: (difficulty: Difficulty) => void;
  studyType: StudyType;
  onStudyType: (studyType: StudyType) => void;
  sourceLine: string;
  canMake: boolean;
  making: boolean;
  onMake: () => void;
  // While making: how long it can take.
  waitNote: string;
  error: string;
}) {
  return (
    <section aria-label="What to make" className="paper paper-shadow rounded-lg px-6 pb-6 pt-6 text-ink sm:px-8 sm:pt-7 lg:rotate-[1.2deg]">
      <p className="font-serif text-[28px] leading-[1.35] tracking-[-0.01em] sm:text-[34px]">
        Make me <SlipMenu name="How many" word={String(count)} options={COUNT_OPTIONS} value={count} onChange={onCount} disabled={making} />{' '}
        <SlipMenu name="How hard" word={DIFFICULTY_LABELS[difficulty].toLowerCase()} options={LEVEL_OPTIONS} value={difficulty} onChange={onDifficulty} disabled={making} />{' '}
        <SlipMenu name="What kind" word={DECK_WORDS[studyType]} options={TYPE_OPTIONS} value={studyType} onChange={onStudyType} disabled={making} />
      </p>
      <p className="mt-2 break-words text-[15px] text-muted">{sourceLine}</p>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-pencil">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={onMake} disabled={!canMake || making} className="btn btn-primary btn-lg rounded-full px-6">
          {making ? 'Making your deck…' : 'Make my deck'}
          {!making && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          )}
        </button>
        {making && <span className="text-sm text-muted">{waitNote}</span>}
      </div>
    </section>
  );
}
