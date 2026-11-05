import Link from 'next/link';
import type { CardAnswer, StudyItem } from './logic';

// Small pieces both study screens use.

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
