'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { checkTypedAnswer, type TypedVerdict } from '@/lib/answer-check';
import { CARD_LIMITS, isTrueFalseOptions, normalizeChoice } from '@/lib/card-rules';
import {
  FLASHCARD_MODE_LABELS,
  FLASHCARD_MODES,
  isStudyType,
  matchRounds,
  type FlashcardMode,
  type StudyMode,
  type StudyType,
} from '@/lib/study-types';

export interface StudyItem {
  id?: string;
  question: string;
  answer: string;
  options?: string[] | null;
  // Shown after answering, e.g. the corrected fact for a false statement (#68).
  explanation?: string | null;
}

export type FlashcardMark = 'got' | 'missed';

// What the student did with one card, in study order (#57).
export interface StudyAnswer {
  cardId?: string;
  // Multiple choice: the option picked, or null if skipped. Matching (#67):
  // the term picked for this card's clue.
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

// How the student answers a card: flip and mark it, pick an option, type, or
// match it with a term in a round of cards (#67).
type Interaction = 'flip' | 'choice' | 'typed' | 'match';

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

// Flip / Type / Match for flashcard sets (#66, #67). Changing it starts the
// set over.
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

// A matched term counts if it reads the same as this card's answer (two cards
// may share one), the same rule the server uses.
const sameTerm = (a: string | undefined, b: string) => a !== undefined && normalizeChoice(a) === normalizeChoice(b);

function isCorrect(interaction: Interaction, card: StudyItem, a: CardAnswer | undefined): boolean {
  if (!a) return false;
  if (interaction === 'choice') return a.chosen === card.answer;
  if (interaction === 'match') return sameTerm(a.chosen, card.answer);
  if (interaction === 'typed') return a.verdict === 'correct' || a.verdict === 'close';
  return a.result === 'got';
}

function reportAnswer(interaction: Interaction, card: StudyItem, a: CardAnswer | undefined): StudyAnswer {
  if (interaction === 'choice' || interaction === 'match') return { cardId: card.id, chosen: a?.chosen ?? null };
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
  // Bumped on every restart, so typed cards start empty and matching rounds
  // are shuffled again.
  const [run, setRun] = useState(0);
  const nextButton = useRef<HTMLButtonElement>(null);
  const focusNext = useRef(false);

  // After a typed answer is checked, Enter goes on to the next card.
  useEffect(() => {
    if (focusNext.current) {
      focusNext.current = false;
      nextButton.current?.focus();
    }
  });

  // A set saved with an old study type (one legacy set says "identification")
  // has always been shown as flashcards.
  const isFlashcards = studyType === 'flashcard' || !isStudyType(studyType);
  const interaction: Interaction = !isFlashcards
    ? 'choice'
    : mode === 'type'
      ? 'typed'
      : mode === 'match'
        ? 'match'
        : 'flip';
  const studyMode: StudyMode | null = isFlashcards && mode !== 'flip' ? mode : null;
  // Matching goes round by round (#67), everything else card by card: index
  // is the current round or card.
  const rounds = useMemo(() => matchRounds(cards.length), [cards.length]);
  const pageCount = interaction === 'match' ? rounds.length : cards.length;
  const isLast = index === pageCount - 1;
  const card = cards[index];
  const answer = answers[index];
  const roundCards =
    interaction === 'match' && rounds[index]
      ? cards.slice(...rounds[index]).map((c, k) => ({ card: c, index: rounds[index][0] + k }))
      : [];
  const pageAnswered =
    interaction === 'match' ? roundCards.every((c) => answers[c.index] !== undefined) : answer !== undefined;

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
    if (index < pageCount - 1) goTo(index + 1);
    else finish();
  };

  const goPrev = () => {
    if (index > 0) goTo(index - 1);
  };

  const restart = () => {
    setAnswers({});
    goTo(0);
    setView('card');
    setRun((r) => r + 1);
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
        // Everything but flipped flashcards needs an answer (or a checked
        // round) first; flashcards can be skipped.
        disabled={interaction !== 'flip' && !pageAnswered}
        className="btn btn-primary btn-lg flex-1"
      >
        {isLast ? 'Finish' : interaction === 'match' ? 'Next round →' : 'Next →'}
      </button>
    </div>
  );

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center min-h-screen space-y-6">
      {header}

      <div className="text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {interaction === 'match' ? `Round ${index + 1} of ${rounds.length}` : `Card ${index + 1} of ${cards.length}`}
        </p>
      </div>

      {saveSlot}

      {interaction === 'choice' && (
        <ChoiceCard card={card} picked={answer?.chosen} onPick={(opt) => answerCard({ chosen: opt })} />
      )}

      {interaction === 'match' && (
        <MatchingRound
          key={`${run}-${index}`}
          cards={roundCards}
          answers={answers}
          onCheck={(picked) => {
            focusNext.current = true;
            setAnswers((prev) => ({ ...prev, ...picked }));
          }}
        />
      )}

      {interaction === 'typed' && (
        <TypedCard
          key={`${run}-${index}`}
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

// Multiple choice, or true or false (#68): pick one, and the right answer (and
// any explanation) shows straight away.
function ChoiceCard({
  card,
  picked,
  onPick,
}: {
  card: StudyItem;
  picked: string | undefined;
  onPick: (option: string) => void;
}) {
  const trueFalse = isTrueFalseOptions(card.options);
  const answered = picked !== undefined;
  return (
    <div className="w-full min-h-[220px] border rounded-xl p-8 flex flex-col justify-center space-y-4">
      {trueFalse && <p className="text-center text-xs uppercase tracking-wide text-gray-400">True or false?</p>}
      <p className="text-lg font-medium text-center">{card.question}</p>
      <div className={trueFalse ? 'grid grid-cols-2 gap-3' : 'space-y-2'}>
        {(card.options ?? []).map((opt) => (
          <button
            key={opt}
            onClick={() => onPick(opt)}
            disabled={answered}
            className={`w-full px-4 rounded-lg border transition-colors ${
              trueFalse ? 'py-3 text-center font-medium' : 'py-2 text-left'
            } ${
              answered && opt === card.answer
                ? 'border-green-500 bg-green-500/10'
                : answered && picked === opt
                  ? 'border-red-500 bg-red-500/10'
                  : 'border-border'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {answered && trueFalse && (
        <p role="status" className={`text-center text-sm ${picked === card.answer ? 'text-green-600' : 'text-red-500'}`}>
          {picked === card.answer ? '✓ Correct' : `✗ Not quite. It's ${card.answer.toLowerCase()}.`}
        </p>
      )}
      {answered && card.explanation && <p className="text-center text-sm text-gray-500">{card.explanation}</p>}
    </div>
  );
}

// Fisher-Yates. A round of 2 or more never keeps the clues' order, so the
// answer is never just "the same position".
function shuffledTerms(terms: string[]): string[] {
  const out = [...terms];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((t, i) => t === terms[i])) out.push(out.shift()!);
  return out;
}

const LETTERS = 'ABCDEFGHIJ';

// One matching round (#67): the round's clues, each picking a term from the
// round's shuffled terms. A term can only be used once, so picking one that
// another clue has moves it. The round is checked all at once.
function MatchingRound({
  cards,
  answers,
  onCheck,
}: {
  cards: { card: StudyItem; index: number }[];
  answers: Record<number, CardAnswer>;
  onCheck: (picked: Record<number, CardAnswer>) => void;
}) {
  const idBase = useId();
  const [terms] = useState(() => shuffledTerms(cards.map((c) => c.card.answer)));
  // The term (its position in `terms`) picked for each clue, by card index.
  const [picks, setPicks] = useState<Record<number, number>>({});
  const checked = cards.every((c) => answers[c.index] !== undefined);
  const allPicked = cards.every((c) => picks[c.index] !== undefined);
  const used = new Set(Object.values(picks));

  const pick = (cardIndex: number, term: number | null) =>
    setPicks((prev) => {
      const next: Record<number, number> = {};
      for (const [k, v] of Object.entries(prev)) if (v !== term) next[Number(k)] = v;
      if (term === null) delete next[cardIndex];
      else next[cardIndex] = term;
      return next;
    });

  const check = () => onCheck(Object.fromEntries(cards.map((c) => [c.index, { chosen: terms[picks[c.index]] }])));

  return (
    <div className="w-full space-y-4 rounded-xl border p-5">
      <p className="text-center text-sm text-gray-500">
        {checked ? 'Here’s how you did.' : 'Match each clue with its term. Each term is used once.'}
      </p>
      <ul aria-label="Terms" className="flex flex-wrap justify-center gap-2">
        {terms.map((t, pos) => (
          <li
            key={pos}
            className={`rounded-full border px-3 py-1 text-sm transition-opacity ${
              !checked && used.has(pos) ? 'opacity-40' : ''
            }`}
          >
            <span className="font-semibold">{LETTERS[pos]}.</span> {t}
          </li>
        ))}
      </ul>
      <ol aria-label="Clues" className="space-y-3">
        {cards.map(({ card, index }, row) => {
          const a = answers[index];
          const right = a !== undefined && sameTerm(a.chosen, card.answer);
          const id = `${idBase}-${row}`;
          return (
            <li
              key={index}
              className={`space-y-2 rounded-lg border p-3 ${
                a === undefined ? '' : right ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'
              }`}
            >
              {a === undefined ? (
                <>
                  <label htmlFor={id} className="block text-sm font-medium">
                    {card.question}
                  </label>
                  <select
                    id={id}
                    value={picks[index] ?? ''}
                    onChange={(e) => pick(index, e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Choose a term…</option>
                    {terms.map((t, pos) => (
                      <option key={pos} value={pos}>
                        {LETTERS[pos]}. {t}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">{card.question}</p>
                  <p className="text-sm">
                    {right ? '✓ ' : '✗ '}
                    {a.chosen}
                    {!right && (
                      <>
                        {' '}· Answer: <span className="font-semibold">{card.answer}</span>
                      </>
                    )}
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ol>
      {!checked && (
        <button type="button" onClick={check} disabled={!allPicked} className="btn btn-primary w-full">
          Check answers
        </button>
      )}
    </div>
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
