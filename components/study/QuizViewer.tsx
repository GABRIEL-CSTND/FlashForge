'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { checkTypedAnswer } from '@/lib/answer-check';
import { speak, stopSpeaking, useAutoRead, useCanSpeak } from '@/lib/speech';
import { CARD_LIMITS, cardKind, isTrueFalseOptions, type CardKind } from '@/lib/card-rules';
import { MIXED_PARTS, type StudyType } from '@/lib/study-types';
import { byPart, cardSpeech, isCorrect, reportAnswer, type CardAnswer, type Interaction, type StudyItem, type StudyResult } from './logic';
import SourceNote from './SourceNote';
import { ExitButton, TypedVerdictLine } from './parts';

// Multiple choice, true or false (#68) and the mixed quiz (#69), card by card
// on the sheet. Phase 4 of the desk redesign moves these onto the desk too;
// until then this is the study screen they always had.
export interface QuizViewerProps {
  title: string;
  studyType: StudyType;
  cards: StudyItem[];
  onFinish?: () => void;
  onExit?: () => void;
  onEdit?: () => void;
  onComplete?: (result: StudyResult) => void;
  completionSlot?: React.ReactNode;
  saveSlot?: React.ReactNode;
  quoteLabel?: string;
}

const EXIT_CLASSES = 'text-sm text-muted hover:text-ink inline-flex items-center gap-1';

export default function QuizViewer({
  title,
  studyType,
  cards: givenCards,
  onFinish,
  onExit,
  onEdit,
  onComplete,
  completionSlot,
  saveSlot,
  quoteLabel = 'From the document',
}: QuizViewerProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, CardAnswer>>({});
  const [view, setView] = useState<'card' | 'summary'>('card');
  // Bumped on every restart, so typed cards start empty.
  const [run, setRun] = useState(0);
  const nextButton = useRef<HTMLButtonElement>(null);
  const focusNext = useRef(false);
  const cards = useMemo(() => (studyType === 'mixed' ? byPart(givenCards) : givenCards), [givenCards, studyType]);

  // After a typed answer is checked, Enter goes on to the next card.
  useEffect(() => {
    if (focusNext.current) {
      focusNext.current = false;
      nextButton.current?.focus();
    }
  });

  // In a mixed quiz (#69) identification cards are typed and the other parts
  // are picks.
  const interactionFor = (c: StudyItem | undefined): Interaction =>
    studyType === 'mixed' && c && cardKind(c.options) === 'identification' ? 'typed' : 'choice';
  const card = cards[index];
  const interaction = interactionFor(card);
  const isLast = index === cards.length - 1;
  const answer = answers[index];

  // Read aloud (#77). With Auto on, each card is read as it appears. Moving on
  // stops what's being read.
  const speechAvailable = useCanSpeak();
  const [autoRead, setAutoRead] = useAutoRead();
  const speech = view === 'card' ? cardSpeech(interaction, card, [], false, answer) : '';
  useEffect(() => {
    if (autoRead && speech) speak(speech);
    else stopSpeaking();
    // Only when another card is shown, not again after each answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, view, index, run]);
  useEffect(() => stopSpeaking, []);

  // Reports the run once (from the click that finishes it) and shows the
  // finish screen.
  const finish = () => {
    onComplete?.({
      answers: cards.map((c, i) => reportAnswer(interactionFor(c), c, answers[i])),
      correct: cards.filter((c, i) => isCorrect(interactionFor(c), c, answers[i])).length,
      total: cards.length,
    });
    setView('summary');
  };

  const goNext = () => {
    if (index < cards.length - 1) setIndex(index + 1);
    else finish();
  };

  const restart = () => {
    setAnswers({});
    setIndex(0);
    setView('card');
    setRun((r) => r + 1);
  };

  const answerCard = (a: CardAnswer) => setAnswers((prev) => ({ ...prev, [index]: a }));

  const header = (
    <div className="flex items-center justify-between gap-3">
      <ExitButton onExit={onExit} className={EXIT_CLASSES} />
      {onEdit && (
        <button type="button" onClick={onEdit} className="text-sm text-muted hover:text-ink hover:underline">
          Edit cards
        </button>
      )}
    </div>
  );

  if (cards.length === 0) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center space-y-6">
        <div className="flex justify-start">
          <ExitButton onExit={onExit} className={EXIT_CLASSES} />
        </div>
        <div className="border rounded-lg p-6 text-center text-muted">No items in this set.</div>
      </main>
    );
  }

  if (view === 'summary') {
    const answered = cards.filter((_, i) => answers[i] !== undefined).length;
    const isRight = (c: StudyItem, i: number) => isCorrect(interactionFor(c), c, answers[i]);
    const correct = cards.filter(isRight).length;
    // Mixed quiz (#69): the score of each part as well.
    const partScores =
      studyType === 'mixed'
        ? MIXED_PARTS.map((p) => {
            const inPart = cards.map((c, i) => ({ c, i })).filter(({ c }) => cardKind(c.options) === p.kind);
            return { ...p, total: inPart.length, right: inPart.filter(({ c, i }) => isRight(c, i)).length };
          }).filter((p) => p.total > 0)
        : [];
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
            <p className="text-muted">{pct}% correct</p>
            {partScores.length > 0 && (
              <ul aria-label="Score by part" className="mt-3 space-y-1 text-left text-sm">
                {partScores.map((p) => (
                  <li key={p.kind} className="flex justify-between gap-3">
                    <span className="text-muted">
                      Part {p.numeral} · {p.label}
                    </span>
                    <span className="font-medium tabular-nums">
                      {p.right} / {p.total}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {withTypo > 0 && <p className="text-xs text-muted mt-2">{withTypo} with a small typo</p>}
            {answered < cards.length && (
              <p className="text-xs text-muted mt-2">
                {cards.length - answered} card{cards.length - answered === 1 ? '' : 's'} skipped without answering
              </p>
            )}
          </div>
          {completionSlot}
          {saveSlot}
          <button onClick={restart} className="btn btn-secondary btn-lg w-full">
            Try Again
          </button>
          {onFinish && (
            <button onClick={onFinish} className="btn btn-primary btn-lg w-full">
              Done
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center min-h-screen space-y-6">
      {header}

      <div className="text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="mt-1 flex items-center justify-center gap-3 text-sm text-muted">
          <span>{`Card ${index + 1} of ${cards.length}`}</span>
          {speechAvailable && (
            <>
              <button
                type="button"
                onClick={() => speak(speech)}
                className="rounded-md px-1.5 py-0.5 font-medium text-link hover:bg-accent/10"
              >
                🔊 Read aloud
              </button>
              <button
                type="button"
                onClick={() => setAutoRead(!autoRead)}
                aria-pressed={autoRead}
                title="Read each card aloud as it appears"
                className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                  autoRead ? 'border-accent bg-accent/10 text-link' : 'text-muted'
                }`}
              >
                Auto
              </button>
            </>
          )}
        </div>
        {studyType === 'mixed' && card && <PartLabel kind={cardKind(card.options)} />}
      </div>

      {saveSlot}

      {interaction === 'choice' && (
        <ChoiceCard card={card} picked={answer?.chosen} onPick={(opt) => answerCard({ chosen: opt })} quoteLabel={quoteLabel} />
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
          quoteLabel={quoteLabel}
        />
      )}

      <div className="flex justify-between items-center gap-4">
        <button onClick={() => index > 0 && setIndex(index - 1)} disabled={index === 0} className="btn btn-secondary btn-lg flex-1">
          ← Prev
        </button>
        <button ref={nextButton} onClick={goNext} disabled={answer === undefined} className="btn btn-primary btn-lg flex-1">
          {isLast ? 'Finish' : 'Next →'}
        </button>
      </div>
    </main>
  );
}

// "Part II · True or false" above a mixed-quiz card (#69).
function PartLabel({ kind }: { kind: CardKind }) {
  const part = MIXED_PARTS.find((p) => p.kind === kind);
  if (!part) return null;
  return (
    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-link">
      Part {part.numeral} · {part.label}
    </p>
  );
}

// Multiple choice, or true or false (#68): pick one, and the right answer (and
// any explanation) shows straight away.
function ChoiceCard({
  card,
  picked,
  onPick,
  quoteLabel,
}: {
  card: StudyItem;
  picked: string | undefined;
  onPick: (option: string) => void;
  quoteLabel: string;
}) {
  const trueFalse = isTrueFalseOptions(card.options);
  const answered = picked !== undefined;
  return (
    <div className="w-full min-h-[220px] border rounded-xl p-8 flex flex-col justify-center space-y-4">
      {trueFalse && <p className="text-center text-xs uppercase tracking-wide text-muted">True or false?</p>}
      <p className="text-lg font-medium text-center">{card.question}</p>
      <div className={trueFalse ? 'grid grid-cols-2 gap-3' : 'space-y-2'}>
        {(card.options ?? []).map((opt) => (
          <button
            key={opt}
            onClick={() => onPick(opt)}
            disabled={answered}
            className={`w-full px-4 rounded-lg border transition-colors ${trueFalse ? 'py-3 text-center font-medium' : 'py-2 text-left'} ${
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
        <p role="status" className={`text-center text-sm ${picked === card.answer ? 'text-green-700' : 'text-pencil'}`}>
          {picked === card.answer ? '✓ Correct' : `✗ Not quite. It's ${card.answer.toLowerCase()}.`}
        </p>
      )}
      {answered && card.explanation && <p className="text-center text-sm text-muted">{card.explanation}</p>}
      {answered && <SourceNote card={card} label={quoteLabel} />}
    </div>
  );
}

// Type the answer (Part III of a mixed quiz): the clue, a box for the term, and
// the verdict once checked. The same check runs on the server when the score
// is saved.
function TypedCard({
  card,
  answer,
  onAnswer,
  quoteLabel,
}: {
  card: StudyItem;
  answer: CardAnswer | undefined;
  onAnswer: (a: CardAnswer) => void;
  quoteLabel: string;
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
        <p className="text-xs uppercase tracking-wide text-muted mb-3">Question</p>
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
            !answered ? '' : answer.verdict === 'wrong' ? 'border-red-500 bg-red-500/10' : 'border-green-500 bg-green-500/10'
          }`}
        />
        {!answered && (
          <div className="flex gap-3">
            <button type="button" onClick={() => onAnswer({ typed: null, verdict: 'wrong' })} className="btn btn-secondary flex-1">
              I don&apos;t know
            </button>
            <button type="submit" disabled={!draft.trim()} className="btn btn-primary flex-1">
              Check
            </button>
          </div>
        )}
      </form>
      {answered && <TypedVerdictLine card={card} answer={answer} className="text-center text-sm" />}
      {answered && <SourceNote card={card} label={quoteLabel} />}
    </div>
  );
}
