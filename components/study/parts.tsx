import Link from 'next/link';
import { isTrueFalseOptions } from '@/lib/card-rules';
import type { CardAnswer, StudyItem } from './logic';

// Small pieces both study desks use (flashcards, phase 2; quizzes, phase 4).

export function ExitButton({ onExit, className }: { onExit?: () => void; className: string }) {
  if (onExit) {
    return (
      <button type="button" onClick={onExit} className={className}>
        ← Exit
      </button>
    );
  }
  return (
    <Link href="/" className={className}>
      ← Exit
    </Link>
  );
}

// The line above the desk: Exit, and where you are. It's read out as it
// changes, with the piles' counts (`tally`) for screen readers.
export function DeskHeader({ onExit, progress, tally }: { onExit?: () => void; progress: string; tally: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <ExitButton onExit={onExit} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-on-desk/80 hover:text-on-desk" />
      <p aria-live="polite" className="text-sm font-medium text-on-desk/85">
        <span>{progress}</span>
        <span className="sr-only">{tally}</span>
      </p>
    </div>
  );
}

// "✓ Correct", "✓ Almost. It's spelled …" or "✗ Not quite. The answer is …"
// after a typed answer (#66) is checked.
export function TypedVerdictLine({ card, answer, className }: { card: StudyItem; answer: CardAnswer; className: string }) {
  return (
    <p role="status" className={`${className} ${answer.verdict === 'wrong' ? 'text-pencil' : 'text-green-800'}`}>
      {answer.verdict === 'correct' && '✓ Correct'}
      {answer.verdict === 'close' && (
        <>
          ✓ Almost. It&apos;s spelled <span className="font-semibold">{card.answer}</span>.
        </>
      )}
      {answer.verdict === 'wrong' && (
        <>
          {answer.typed === null ? '' : '✗ Not quite. '}The answer is <span className="font-semibold">{card.answer}</span>.
        </>
      )}
    </p>
  );
}

// "✓ Correct", or "✗ Not quite. The answer is …" (multiple choice) or
// "✗ Not quite. It's false." (#68), once a quiz answer is picked.
export function ChoiceVerdictLine({ card, picked, className }: { card: StudyItem; picked: string | undefined; className: string }) {
  const right = picked === card.answer;
  return (
    <p role="status" className={`${className} ${right ? 'text-green-800' : 'text-pencil'}`}>
      {right ? (
        '✓ Correct'
      ) : isTrueFalseOptions(card.options) ? (
        `✗ Not quite. It's ${card.answer.toLowerCase()}.`
      ) : (
        <>
          ✗ Not quite. The answer is <span className="font-semibold">{card.answer}</span>.
        </>
      )}
    </p>
  );
}
