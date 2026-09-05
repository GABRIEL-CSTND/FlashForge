'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface StudyItem {
  id?: string;
  question: string;
  answer: string;
  options?: string[] | null;
}

interface StudyViewerProps {
  title: string;
  studyType: 'flashcard' | 'multiple_choice';
  cards: StudyItem[];
  onFinish?: () => void;
  saveSlot?: React.ReactNode;
}

function ExitButton() {
  return (
    <Link
      href="/"
      className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"
    >
      ← Exit
    </Link>
  );
}

export default function StudyViewer({ title, studyType, cards, onFinish, saveSlot }: StudyViewerProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [view, setView] = useState<'card' | 'summary'>('card');

  const isMultipleChoice = studyType === 'multiple_choice';
  const isLast = index === cards.length - 1;
  const card = cards[index];

  const resetCardState = () => {
    setFlipped(false);
    setSelectedOption(null);
  };

  const goNext = () => {
    if (index < cards.length - 1) {
      resetCardState();
      setIndex((i) => i + 1);
    } else if (isMultipleChoice) {
      setView('summary');
    } else if (onFinish) {
      onFinish();
    }
  };

  const goPrev = () => {
    if (index > 0) {
      resetCardState();
      setIndex((i) => i - 1);
    }
  };

  const restart = () => {
    setResults({});
    setIndex(0);
    resetCardState();
    setView('card');
  };

  const selectMcOption = (opt: string) => {
    if (selectedOption !== null) return;
    setSelectedOption(opt);
    setResults((r) => ({ ...r, [index]: opt === card.answer }));
  };

  if (cards.length === 0) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center space-y-6">
        <div className="flex justify-start">
          <ExitButton />
        </div>
        <div className="border rounded-lg p-6 text-center text-gray-500">
          No items in this set.
        </div>
      </main>
    );
  }

  if (view === 'summary') {
    const answered = Object.keys(results).length;
    const correct = Object.values(results).filter(Boolean).length;
    const pct = cards.length > 0 ? Math.round((correct / cards.length) * 100) : 0;

    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="flex justify-start">
            <ExitButton />
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
          {saveSlot}
          <button
            onClick={restart}
            className="w-full py-3 rounded-lg border font-medium"
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center min-h-screen space-y-6">
      <div className="flex justify-start">
        <ExitButton />
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
                        : 'border-gray-300'
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
              className="flex-1 py-3 rounded-lg border font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <button
              onClick={goNext}
              disabled={selectedOption === null}
              className="flex-1 py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isLast ? 'Finish' : 'Next →'}
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            onClick={() => setFlipped((f) => !f)}
            className="w-full min-h-[220px] border rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-blue-400 transition-colors"
          >
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-3">
              {flipped ? 'Answer' : 'Question'}
            </p>
            <p className="text-lg font-medium">{flipped ? card.answer : card.question}</p>
            {!flipped && <p className="text-xs text-gray-400 mt-4">Tap to flip</p>}
          </button>

          <div className="flex justify-between items-center gap-4">
            <button
              onClick={goPrev}
              disabled={index === 0}
              className="flex-1 py-3 rounded-lg border font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <button
              onClick={goNext}
              className="flex-1 py-3 rounded-lg bg-blue-600 text-white font-medium"
            >
              {isLast ? 'Finish' : 'Next →'}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
