import type { CSSProperties } from 'react';
import type { DeskKind } from '@/components/desk/useDeskLayout';
import { isTrueFalseOptions } from '@/lib/card-rules';

const LETTERS = ['A', 'B', 'C', 'D'];
// The slips lie at slightly different angles, like paper laid down by hand.
const TILTS = ['-1deg', '0.8deg', '0.6deg', '-0.9deg'];

const MARK_PROPS = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

// The answers to a quiz question, as paper slips under the card (desk
// redesign, phase 4): four lettered slips for multiple choice, True and False
// for a statement (#68). They come in one after another. Once one is picked
// they all stay put: the right one lifts with a brass edge and a check, a
// wrong pick is struck through in red pencil, and the rest fade back. Each
// slip's name is just its answer; the verdict on the card says which was right.
export default function AnswerSlips({
  options,
  answer,
  picked,
  onPick,
  kind,
}: {
  options: string[];
  // The right answer.
  answer: string;
  // The slip picked, once one is.
  picked: string | undefined;
  onPick: (option: string) => void;
  kind: DeskKind;
}) {
  const trueFalse = isTrueFalseOptions(options);
  const answered = picked !== undefined;
  // Multiple choice is two by two on a laptop and one under another on a phone;
  // True and False always sit side by side.
  const columns = trueFalse || kind === 'laptop' ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <div role="group" aria-label="Answers" className={`grid w-full gap-2.5 ${columns}`}>
      {options.map((option, k) => {
        const right = answered && option === answer;
        const wrong = answered && option === picked && !right;
        const state = right ? 'is-right' : wrong ? 'is-wrong' : answered ? 'is-faded' : '';
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPick(option)}
            disabled={answered}
            className={`paper answer-slip flex items-center gap-3 rounded-md px-3.5 py-2.5 text-left text-ink ${trueFalse ? 'min-h-16' : 'min-h-14'} ${state}`}
            style={{ '--k': k, '--tilt': TILTS[k % TILTS.length] } as CSSProperties}
          >
            <span aria-hidden="true" className="brass inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold">
              {trueFalse ? option.trim().charAt(0).toUpperCase() : LETTERS[k]}
            </span>
            <span className="answer-slip-text min-w-0 flex-1 font-serif text-lg leading-snug [overflow-wrap:anywhere]">{option}</span>
            {right && (
              <svg {...MARK_PROPS} className="shrink-0 text-brass-ink">
                <path d="m5 12 5 5 9-10" />
              </svg>
            )}
            {wrong && (
              <svg {...MARK_PROPS} className="shrink-0 text-pencil">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
