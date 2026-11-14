'use client';

import type { ReactNode } from 'react';
import { isStudyType, type StudyType } from '@/lib/study-types';
import FlashcardDesk from './study/FlashcardDesk';
import QuizDesk from './study/QuizDesk';
import { ExitButton } from './study/parts';
import type { StudyItem, StudyResult } from './study/logic';

export type { FlashcardMark, StudyAnswer, StudyItem, StudyResult } from './study/logic';

interface StudyViewerProps {
  title: string;
  studyType: StudyType;
  cards: StudyItem[];
  onFinish?: () => void;
  // Called by the Exit button instead of navigating home. Needed when the viewer
  // is already rendered on "/" (a freshly generated guide), where a link to "/"
  // would do nothing.
  onExit?: () => void;
  // Opens the card editor (the pencil on the desk). Only for the set's owner.
  onEdit?: () => void;
  // Called once each time the student finishes the set (#57).
  onComplete?: (result: StudyResult) => void;
  // Shown on the finish screen, e.g. "Saved to your scores" and past scores.
  completionSlot?: ReactNode;
  saveSlot?: ReactNode;
  // What a card's quote says it's from, e.g. "From Wikipedia" (quoteSourceLabel()
  // in lib/sources.ts).
  quoteLabel?: string;
  // The desk arrives (fades and rises in) when it mounts: on a set's page,
  // after the deck that opened it. Not on the home page, where the new cards
  // gather into the deck first.
  arrive?: boolean;
  // How many cards the deck will have, while the AI is still writing it.
  expected?: number;
}

// The study screen, on the desk: flashcards in components/study/
// FlashcardDesk.tsx (desk redesign phase 2), and multiple choice, true or false
// and mixed quizzes in components/study/QuizDesk.tsx (phase 4).
export default function StudyViewer(props: StudyViewerProps) {
  if (props.cards.length === 0) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center space-y-6">
        <div className="flex justify-start">
          <ExitButton onExit={props.onExit} className="text-sm text-muted hover:text-ink inline-flex items-center gap-1" />
        </div>
        <div className="border rounded-lg p-6 text-center text-muted">No items in this set.</div>
      </main>
    );
  }
  // A set saved with an old study type (one legacy set says "identification")
  // has always been shown as flashcards.
  const isFlashcards = props.studyType === 'flashcard' || !isStudyType(props.studyType);
  return isFlashcards ? <FlashcardDesk {...props} /> : <QuizDesk {...props} />;
}
