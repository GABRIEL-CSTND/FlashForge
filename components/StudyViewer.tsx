'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { checkTypedAnswer, type TypedVerdict } from '@/lib/answer-check';
import { CARD_LIMITS } from '@/lib/card-rules';
import {
  FLASHCARD_MODE_LABELS,
  FLASHCARD_MODES,
  type FlashcardMode,
  type StudyMode,
  type StudyType,
} from '@/lib/study-types';

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
  // Flipped flashcards: the student's own mark, or null if not marked.
  result?: FlashcardMark | null;
  // Typed answers (#66): what the student typed, or null if not answered.
  typed?: string | null;
}

export interface StudyResult {
  // How a flashcard set was studied (#66); left out for the normal way.
  mode?: StudyMode;
  answers: StudyAnswer[];
  correct: number;
  total: number;
}

interface StudyViewerProps {
  title: string;
  studyType: StudyType;
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

// How the student answers a card: flip and mark it, pick an option, or type.
type Interaction = 'flip' | 'choice' | 'typed';

// What the student did with one card, while studying.
interface CardAnswer {
  chosen?: string;
  result?: FlashcardMark;
  // Null for "I don't know".
  typed?: string | null;
  verdict?: TypedVerdict;
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

// Flip / Type for flashcard sets (#66). Changing it starts the set over.
function ModeSwitcher({ mode, onChange }: { mode: FlashcardMode; onChange: (mode: FlashcardMode) => void }) {
  return (
    <div role="group" aria-label="How do you want to study?" className="inline-flex shrink-0 rounded-lg border p-0.5 text-sm">
      {FLASHCARD_MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={`rounded-md px-3 py-1 font-medium transition-colors ${
            mode === m ? 'bg-accent text-white' : 'text-gray-500 hover:text-foreground'
          }`}
        >
          {FLASHCARD_MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

function isCorrect(interaction: Interaction, card: StudyItem, a: CardAnswer | undefined): boolean {
  if (!a) return false;
  if (interaction === 'choice') return a.chosen === card.answer;
  if (interaction === 'typed') return a.verdict === 'correct' || a.verdict === 'close';
  return a.result === 'got';
}

function reportAnswer(interaction: Interaction, card: StudyItem, a: CardAnswer | undefined): StudyAnswer {
  if (interaction === 'choice') return { cardId: card.id, chosen: a?.chosen ?? null };
  if (interaction === 'typed') return { cardId: card.id, typed: a?.typed ?? null };
  return { cardId: card.id, result: a?.result ?? null };
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
  const [mode, setMode] = useState<FlashcardMode>('flip');
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answers, setAnswers] = useState<Record<number, CardAnswer>>({});
  const [view, setView] = useState<'card' | 'summary'>('card');
  const nextButton = useRef<HTMLButtonElement>(null);
  const focusNext = useRef(false);

  // After a typed answer is checked, Enter goes on to the next card.
  useEffect(() => {
    if (focusNext.current) {
      focusNext.current = false;
      nextButton.current?.focus();
    }
  });

  const isFlashcards = studyType === 'flashcard';
  const interaction: Interaction = !isFlashcards ? 'choice' : mode === 'type' ? 'typed' : 'flip';
  const studyMode: StudyMode | null = isFlashcards && mode !== 'flip' ? mode : null;
  const isLast = index === cards.length - 1;
  const card = cards[index];
  const answer = answers[index];

  const goTo = (i: number) => {
    setFlipped(false);
    setIndex(i);
  };

  // Reports the run once (from the click that finishes it) and shows the
  // finish screen.
  const finish = (final: Record<number, CardAnswer> = answers) => {
    onComplete?.({
      ...(studyMode ? { mode: studyMode } : {}),
      answers: cards.map((c, i) => reportAnswer(interaction, c, final[i])),
      correct: cards.filter((c, i) => isCorrect(interaction, c, final[i])).length,
      total: cards.length,
    });
    setView('summary');
  };

  const goNext = () => {
    if (index < cards.length - 1) goTo(index + 1);
    else finish();
  };

  const goPrev = () => {
    if (index > 0) goTo(index - 1);
  };

  const restart = () => {
    setAnswers({});
    goTo(0);
    setView('card');
  };

  const changeMode = (next: FlashcardMode) => {
    setMode(next);
    restart();
  };

  const answerCard = (a: CardAnswer) => setAnswers((prev) => ({ ...prev, [index]: a }));

  // Marking a flashcard moves on to the next one (or finishes on the last).
  const markCard = (mark: FlashcardMark) => {
    const next = { ...answers, [index]: { result: mark } };
    setAnswers(next);
    if (isLast) finish(next);
    else goTo(index + 1);
  };

  const header = (
    <div className="flex items-center justify-between gap-3">
      <ExitButton onExit={onExit} />
      {isFlashcards && <ModeSwitcher mode={mode} onChange={changeMode} />}
    </div>
  );

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

  if (view === 'summary' && interaction === 'flip') {
    const marks = Object.values(answers).map((a) => a.result);
    const got = marks.filter((m) => m === 'got').length;
    const missed = marks.filter((m) => m === 'missed').length;
    const unmarked = cards.length - got - missed;

    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-6">
          {header}
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

  if (view === 'summary') {
    const answered = cards.filter((_, i) => answers[i] !== undefined).length;
    const correct = cards.filter((c, i) => isCorrect(interaction, c, answers[i])).length;
    const withTypo = Object.values(answers).filter((a) => a.verdict === 'close').length;
    const pct = Math.round((correct / cards.length) * 100);

    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-6">
          {header}
          <h1 className="text-xl font-semibold">{title}</h1>
          <div className="border rounded-xl p-8 space-y-2">
            <p className="text-4xl font-bold">
              {correct} / {cards.length}
            </p>
            <p className="text-gray-500">{pct}% correct</p>
            {withTypo > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                {withTypo} with a small typo
              </p>
            )}
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

  const navigation = (
    <div className="flex justify-between items-center gap-4">
      <button
        onClick={goPrev}
        disabled={index === 0}
        className="btn btn-secondary btn-lg flex-1"
      >
        ← Prev
      </button>
      <button
        ref={nextButton}
        onClick={goNext}
        // Multiple choice and typed answers need an answer first; flashcards
        // can be skipped.
        disabled={interaction !== 'flip' && answer === undefined}
        className="btn btn-primary btn-lg flex-1"
      >
        {isLast ? 'Finish' : 'Next →'}
      </button>
    </div>
  );

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center min-h-screen space-y-6">
      {header}

      <div className="text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Card {index + 1} of {cards.length}
        </p>
      </div>

      {saveSlot}

      {interaction === 'choice' && (
        <div className="w-full min-h-[220px] border rounded-xl p-8 flex flex-col justify-center space-y-4">
          <p className="text-lg font-medium text-center">{card.question}</p>
          <div className="space-y-2">
            {(card.options ?? []).map((opt) => {
              const picked = answer?.chosen;
              const showState = picked !== undefined;
              const isCorrectOption = opt === card.answer;
              return (
                <button
                  key={opt}
                  onClick={() => answerCard({ chosen: opt })}
                  disabled={showState}
                  className={`w-full text-left px-4 py-2 rounded-lg border transition-colors ${
                    showState && isCorrectOption
                      ? 'border-green-500 bg-green-500/10'
                      : showState && picked === opt
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
      )}

      {interaction === 'typed' && (
        <TypedCard
          key={index}
          card={card}
          answer={answer}
          onAnswer={(a) => {
            focusNext.current = true;
            answerCard(a);
          }}
        />
      )}

      {interaction === 'flip' && (
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
                aria-pressed={answer?.result === 'missed'}
                className={`flex-1 py-3 rounded-lg border font-medium transition-colors ${
                  answer?.result === 'missed' ? 'border-red-500 bg-red-500/10' : 'hover:border-red-400'
                }`}
              >
                ✗ Missed it
              </button>
              <button
                type="button"
                onClick={() => markCard('got')}
                aria-pressed={answer?.result === 'got'}
                className={`flex-1 py-3 rounded-lg border font-medium transition-colors ${
                  answer?.result === 'got' ? 'border-green-500 bg-green-500/10' : 'hover:border-green-400'
                }`}
              >
                ✓ Got it
              </button>
            </div>
          )}
        </>
      )}

      {navigation}
    </main>
  );
}

// Type the answer (#66): the clue, a box for the term, and the verdict once
// checked. The same check runs on the server when the score is saved.
function TypedCard({
  card,
  answer,
  onAnswer,
}: {
  card: StudyItem;
  answer: CardAnswer | undefined;
  onAnswer: (a: CardAnswer) => void;
}) {
  const [draft, setDraft] = useState('');
  const answered = answer !== undefined;

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onAnswer({ typed: draft.trim(), verdict: checkTypedAnswer(draft, card.answer) });
  };

  return (
    <div className="w-full border rounded-xl p-6 space-y-4">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-gray-400 mb-3">Question</p>
        <p className="text-lg font-medium">{card.question}</p>
      </div>
      <form onSubmit={check} className="space-y-3">
        <input
          aria-label="Your answer"
          value={answered ? (answer.typed ?? '') : draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={answered}
          maxLength={CARD_LIMITS.answer}
          placeholder={answered ? '' : 'Type the answer'}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className={`w-full rounded-lg border bg-transparent px-3 py-2 text-center text-base ${
            !answered
              ? ''
              : answer.verdict === 'wrong'
                ? 'border-red-500 bg-red-500/10'
                : 'border-green-500 bg-green-500/10'
          }`}
        />
        {!answered && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onAnswer({ typed: null, verdict: 'wrong' })}
              className="btn btn-secondary flex-1"
            >
              I don&apos;t know
            </button>
            <button type="submit" disabled={!draft.trim()} className="btn btn-primary flex-1">
              Check
            </button>
          </div>
        )}
      </form>
      {answered && (
        <p
          role="status"
          className={`text-center text-sm ${answer.verdict === 'wrong' ? 'text-red-500' : 'text-green-600'}`}
        >
          {answer.verdict === 'correct' && '✓ Correct'}
          {answer.verdict === 'close' && (
            <>
              ✓ Almost. It&apos;s spelled <span className="font-semibold">{card.answer}</span>.
            </>
          )}
          {answer.verdict === 'wrong' && (
            <>
              {answer.typed === null ? '' : '✗ Not quite. '}The answer is{' '}
              <span className="font-semibold">{card.answer}</span>.
            </>
          )}
        </p>
      )}
    </div>
  );
}
