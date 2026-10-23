'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface StudyItem {
  id?: string;
  question: string;
  answer: string;
  options?: string[] | null;
}

export type FlashcardMark = 'got' | 'missed';

// What the student did with one card, in study order (#57).
export interface StudyAnswer {
  cardId?: string;
  // Multiple choice: the option picked, or null if skipped.
  chosen?: string | null;
  // Flashcards: the student's own mark, or null if not marked.
  result?: FlashcardMark | null;
}

export interface StudyResult {
  answers: StudyAnswer[];
  correct: number;
  total: number;
}

interface StudyViewerProps {
  title: string;
  studyType: 'flashcard' | 'multiple_choice';
  cards: StudyItem[];
  onFinish?: () => void;
  // Called by the Exit button instead of navigating home. Needed when the viewer
  // is already rendered on "/" (a freshly generated guide), where a link to "/"
  // would do nothing.
  onExit?: () => void;
  // Called once each time the student finishes the set (#57).
  onComplete?: (result: StudyResult) => void;
  // Shown on the finish screen, e.g. "Saved to your scores" and past scores.
  completionSlot?: React.ReactNode;
  saveSlot?: React.ReactNode;
}

const EXIT_CLASSES = 'text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1';

function ExitButton({ onExit }: { onExit?: () => void }) {
  if (onExit) {
    return (
      <button type="button" onClick={onExit} className={EXIT_CLASSES}>
        ← Exit
      </button>
    );
  }
  return (
    <Link href="/" className={EXIT_CLASSES}>
      ← Exit
    </Link>
  );
}

export default function StudyViewer({
  title,
  studyType,
  cards,
  onFinish,
  onExit,
  onComplete,
  completionSlot,
  saveSlot,
}: StudyViewerProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  // Multiple choice: the option picked for each card, by index.
  const [choices, setChoices] = useState<Record<number, string>>({});
  // Flashcards: the student's own "got it / missed it" marks, by index.
  const [marks, setMarks] = useState<Record<number, FlashcardMark>>({});
  const [view, setView] = useState<'card' | 'summary' | 'complete'>('card');

  const isMultipleChoice = studyType === 'multiple_choice';
  const isLast = index === cards.length - 1;
  const card = cards[index];

  const resetCardState = () => {
    setFlipped(false);
    setSelectedOption(null);
  };

  const advance = () => {
    resetCardState();
    setIndex((i) => i + 1);
  };

  // Reports the run once (from the click that finishes it) and shows the
  // finish screen.
  const finish = (finalMarks: Record<number, FlashcardMark> = marks) => {
    const answers: StudyAnswer[] = cards.map((c, i) =>
      isMultipleChoice
        ? { cardId: c.id, chosen: choices[i] ?? null }
        : { cardId: c.id, result: finalMarks[i] ?? null }
    );
    const correct = isMultipleChoice
      ? cards.filter((c, i) => choices[i] === c.answer).length
      : Object.values(finalMarks).filter((m) => m === 'got').length;
    onComplete?.({ answers, correct, total: cards.length });
    setView(isMultipleChoice ? 'summary' : 'complete');
  };

  const goNext = () => {
    if (index < cards.length - 1) advance();
    else finish();
  };

  const goPrev = () => {
    if (index > 0) {
      resetCardState();
      setIndex((i) => i - 1);
    }
  };

  const restart = () => {
    setChoices({});
    setMarks({});
    setIndex(0);
    resetCardState();
    setView('card');
  };

  const selectMcOption = (opt: string) => {
    if (selectedOption !== null) return;
    setSelectedOption(opt);
    setChoices((c) => ({ ...c, [index]: opt }));
  };

  // Marking a flashcard moves on to the next one (or finishes on the last).
  const markCard = (mark: FlashcardMark) => {
    const next = { ...marks, [index]: mark };
    setMarks(next);
    if (isLast) finish(next);
    else advance();
  };

  if (cards.length === 0) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center space-y-6">
        <div className="flex justify-start">
          <ExitButton onExit={onExit} />
        </div>
        <div className="border rounded-lg p-6 text-center text-gray-500">
          No items in this set.
        </div>
      </main>
    );
  }

  if (view === 'summary') {
    const answered = Object.keys(choices).length;
    const correct = cards.filter((c, i) => choices[i] === c.answer).length;
    const pct = cards.length > 0 ? Math.round((correct / cards.length) * 100) : 0;

    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="flex justify-start">
            <ExitButton onExit={onExit} />
          </div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <div className="border rounded-xl p-8 space-y-2">
            <p className="text-4xl font-bold">
              {correct} / {cards.length}
            </p>
            <p className="text-gray-500">{pct}% correct</p>
            {answered < cards.length && (
              <p className="text-xs text-gray-400 mt-2">
                {cards.length - answered} card{cards.length - answered === 1 ? '' : 's'} skipped without answering
              </p>
            )}
          </div>
          {completionSlot}
          {saveSlot}
          <button
            onClick={restart}
            className="btn btn-secondary btn-lg w-full"
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  if (view === 'complete') {
    const got = Object.values(marks).filter((m) => m === 'got').length;
    const missed = Object.values(marks).filter((m) => m === 'missed').length;
    const unmarked = cards.length - got - missed;

    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="flex justify-start">
            <ExitButton onExit={onExit} />
          </div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <div className="border rounded-xl p-8 space-y-2">
            {got + missed > 0 ? (
              <>
                <p className="text-4xl font-bold">
                  {got} / {cards.length}
                </p>
                <p className="text-gray-500">got it</p>
                <p className="text-xs text-gray-400 mt-2">
                  {missed} missed{unmarked > 0 ? ` · ${unmarked} not marked` : ''}
                </p>
              </>
            ) : (
              <p className="text-2xl font-bold">You&apos;ve reviewed all {cards.length} cards! 🎉</p>
            )}
          </div>
          {completionSlot}
          {saveSlot}
          <button
            onClick={restart}
            className="btn btn-secondary btn-lg w-full"
          >
            Review Again
          </button>
          {onFinish && (
            <button
              onClick={onFinish}
              className="btn btn-primary btn-lg w-full"
            >
              Done
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center min-h-screen space-y-6">
      <div className="flex justify-start">
        <ExitButton onExit={onExit} />
      </div>

      <div className="text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Card {index + 1} of {cards.length}
        </p>
      </div>

      {saveSlot}

      {isMultipleChoice ? (
        <>
          <div className="w-full min-h-[220px] border rounded-xl p-8 flex flex-col justify-center space-y-4">
            <p className="text-lg font-medium text-center">{card.question}</p>
            <div className="space-y-2">
              {(card.options ?? []).map((opt) => {
                const isSelected = selectedOption === opt;
                const isCorrect = opt === card.answer;
                const showState = selectedOption !== null;
                return (
                  <button
                    key={opt}
                    onClick={() => selectMcOption(opt)}
                    disabled={selectedOption !== null}
                    className={`w-full text-left px-4 py-2 rounded-lg border transition-colors ${
                      showState && isCorrect
                        ? 'border-green-500 bg-green-500/10'
                        : showState && isSelected && !isCorrect
                        ? 'border-red-500 bg-red-500/10'
                        : 'border-border'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between items-center gap-4">
            <button
              onClick={goPrev}
              disabled={index === 0}
              className="btn btn-secondary btn-lg flex-1"
            >
              ← Prev
            </button>
            <button
              onClick={goNext}
              disabled={selectedOption === null}
              className="btn btn-primary btn-lg flex-1"
            >
              {isLast ? 'Finish' : 'Next →'}
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            onClick={() => setFlipped((f) => !f)}
            className="w-full min-h-[220px] border rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-accent transition-colors"
          >
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-3">
              {flipped ? 'Answer' : 'Question'}
            </p>
            <p className="text-lg font-medium">{flipped ? card.answer : card.question}</p>
            {!flipped && <p className="text-xs text-gray-400 mt-4">Tap to flip</p>}
          </button>

          {flipped && (
            <div className="flex gap-4" role="group" aria-label="Did you know it?">
              <button
                type="button"
                onClick={() => markCard('missed')}
                aria-pressed={marks[index] === 'missed'}
                className={`flex-1 py-3 rounded-lg border font-medium transition-colors ${
                  marks[index] === 'missed' ? 'border-red-500 bg-red-500/10' : 'hover:border-red-400'
                }`}
              >
                ✗ Missed it
              </button>
              <button
                type="button"
                onClick={() => markCard('got')}
                aria-pressed={marks[index] === 'got'}
                className={`flex-1 py-3 rounded-lg border font-medium transition-colors ${
                  marks[index] === 'got' ? 'border-green-500 bg-green-500/10' : 'hover:border-green-400'
                }`}
              >
                ✓ Got it
              </button>
            </div>
          )}

          <div className="flex justify-between items-center gap-4">
            <button
              onClick={goPrev}
              disabled={index === 0}
              className="btn btn-secondary btn-lg flex-1"
            >
              ← Prev
            </button>
            <button
              onClick={goNext}
              className="btn btn-primary btn-lg flex-1"
            >
              {isLast ? 'Finish' : 'Next →'}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
