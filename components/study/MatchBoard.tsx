'use client';

import { useEffect, useRef, useState } from 'react';
import type { DeskKind } from '@/components/desk/useDeskLayout';
import { sameTerm, shuffled, type StudyItem } from './logic';

type Side = 'clue' | 'term';
type Selection = { side: Side; at: number } | null;

const SLIP = 'paper slip w-full rounded-md text-left text-ink transition-transform duration-200';

// The tints a pair is drawn in (#119). One per clue, so a round of up to five
// never repeats one. Soft blue, purple, teal, orange and pink: each reads on the
// cream paper, sits quietly on the green desk, and stays clear of the brass edge
// of a picked-up slip (app/globals.css).
export const PAIR_COLORS = ['blue', 'purple', 'teal', 'orange', 'pink'] as const;
export type PairColor = (typeof PAIR_COLORS)[number];
export const pairColor = (clue: number): PairColor => PAIR_COLORS[clue % PAIR_COLORS.length];

// Pairs a clue with a term, taking both out of any pair they were in, so each
// clue has at most one term and each term at most one clue. Exported for tests.
export function linkPair(paired: Record<number, number>, clue: number, term: number): Record<number, number> {
  const next: Record<number, number> = {};
  for (const [c, t] of Object.entries(paired)) {
    if (Number(c) !== clue && t !== term) next[Number(c)] = t;
  }
  next[clue] = term;
  return next;
}

// Takes a card (a clue, or a term) out of its pair, if it is in one.
export function unlink(paired: Record<number, number>, side: Side, at: number): Record<number, number> {
  const next: Record<number, number> = {};
  for (const [c, t] of Object.entries(paired)) {
    if (side === 'clue' ? Number(c) !== at : t !== at) next[Number(c)] = t;
  }
  return next;
}

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12 5 5 9-10" />
  </svg>
);
const Cross = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

// One Match round on the desk (#67, reworked for #119): the round's clues as
// paper slips, and their terms, shuffled, beside them (on a phone, above them).
// Pick a clue and then a term (or the other way round) to pair them: nothing is
// checked yet. Each pair takes its own tint, shared by both slips. Picking a
// slip that is already paired takes it out of its pair, so it can be paired
// again; pairing it with a slip from another pair moves it there. Once every
// clue has a term, Submit Answers checks the whole round at once: a right pair
// turns green, a wrong one red pencil with the right term written under it.
// The term each clue was paired with is what's reported, so the server scores
// the round the way it always has.
export default function MatchBoard({
  cards,
  isLastRound,
  onDone,
  kind,
  quoteLabel,
}: {
  cards: { card: StudyItem; index: number }[];
  isLastRound: boolean;
  onDone: (picks: Record<number, string>) => void;
  kind: DeskKind;
  quoteLabel: string;
}) {
  // Term slips in shuffled order, each by its position in `cards`.
  const [termOrder] = useState(() => shuffled(cards.map((_, k) => k)));
  const [selection, setSelection] = useState<Selection>(null);
  // For each clue (position in `cards`), the term slip it is paired with.
  const [paired, setPaired] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  // After submitting, keyboard focus goes to the button that moves on.
  useEffect(() => {
    if (submitted) nextRef.current?.focus();
  }, [submitted]);

  // The clue each term is paired with.
  const clueOf: Record<number, number> = {};
  for (const [c, t] of Object.entries(paired)) clueOf[t] = Number(c);

  const pairedCount = Object.keys(paired).length;
  const allPaired = cards.length > 0 && pairedCount === cards.length;
  const isRight = (clue: number) => paired[clue] !== undefined && sameTerm(cards[paired[clue]].card.answer, cards[clue].card.answer);
  const rightCount = cards.filter((_, k) => isRight(k)).length;

  const pick = (side: Side, at: number) => {
    if (submitted) return;
    // A slip of the other side is waiting: pair the two.
    if (selection && selection.side !== side) {
      const clue = side === 'clue' ? at : selection.at;
      const term = side === 'term' ? at : selection.at;
      setPaired((prev) => linkPair(prev, clue, term));
      setSelection(null);
      return;
    }
    // The same slip again: put it down.
    if (selection && selection.at === at) {
      setSelection(null);
      return;
    }
    // Pick this slip up. If it was paired, that pair comes apart.
    setPaired((prev) => unlink(prev, side, at));
    setSelection({ side, at });
  };

  const submit = () => {
    if (!allPaired || submitted) return;
    setSelection(null);
    setSubmitted(true);
  };

  const finish = () => onDone(Object.fromEntries(cards.map(({ index }, k) => [index, cards[paired[k]].card.answer])));

  const message = submitted
    ? `You got ${rightCount} of ${cards.length} right. ${isLastRound ? 'See how you did overall.' : 'On to the next round when you are ready.'}`
    : selection?.side === 'clue'
      ? 'Now pick the term that goes with it.'
      : selection?.side === 'term'
        ? 'Now pick the clue it goes with.'
        : allPaired
          ? 'Every clue has a term. Change any pair, or submit your answers.'
          : pairedCount > 0
            ? `${pairedCount} of ${cards.length} paired. Pick a paired card to change it.`
            : `${cards.length} cards on the desk. Pick a clue, then the term that goes with it.`;

  // The classes for a slip: picked up, in a pair (with its tint), or checked.
  const slipState = (side: Side, at: number): string => {
    const clue = side === 'clue' ? at : clueOf[at];
    if (submitted) return clue === undefined ? '' : isRight(clue) ? 'slip-right' : 'slip-wrong';
    if (selection?.side === side && selection.at === at) return 'slip-picked';
    if (clue === undefined || paired[clue] === undefined) return '';
    return `slip-paired pair-${pairColor(clue)}`;
  };

  // A small numbered tag in the pair's tint, so a pair can be told apart
  // without relying on colour alone.
  const tag = (clue: number) => (
    <span aria-hidden="true" className={`pair-tag pair-${pairColor(clue)}`}>
      {clue + 1}
    </span>
  );

  const clues = (
    <ul aria-label="Clues" className="flex flex-col gap-3">
      {cards.map(({ card, index }, k) => {
        const match = paired[k];
        const state = slipState('clue', k);
        const right = submitted && isRight(k);
        const label = submitted
          ? `${card.question}. ${right ? 'Right' : 'Wrong'}: you matched ${cards[match].card.answer}${right ? '' : `. The answer is ${card.answer}`}.`
          : match !== undefined
            ? `${card.question}. Paired with ${cards[match].card.answer}.`
            : undefined;
        return (
          <li key={index}>
            <button
              type="button"
              onClick={() => pick('clue', k)}
              disabled={submitted}
              aria-pressed={selection?.side === 'clue' && selection.at === k}
              aria-label={label}
              data-pair={!submitted && match !== undefined ? pairColor(k) : undefined}
              data-verdict={submitted ? (right ? 'right' : 'wrong') : undefined}
              className={`${SLIP} ${state} flex min-h-16 flex-col justify-center gap-1 px-4 py-2 font-serif text-[15.5px] leading-snug`}
            >
              <span>{card.question}</span>
              {!submitted && match !== undefined && (
                <span className="flex items-center gap-1.5 font-sans text-[13px] font-semibold text-ink/80">
                  {tag(k)}
                  {cards[match].card.answer}
                </span>
              )}
              {submitted && (
                <span className={`flex flex-wrap items-center gap-x-1.5 font-sans text-[13px] font-semibold ${right ? 'text-[#2f6b3a]' : 'text-pencil'}`}>
                  {right ? <Check /> : <Cross />}
                  <span className={right ? '' : 'line-through decoration-2'}>{cards[match].card.answer}</span>
                  {!right && <span className="text-ink/80">· Answer: {card.answer}</span>}
                </span>
              )}
              {/* Once checked, where the card came from (spans: a button holds no blocks). */}
              {submitted && card.source && (
                <span className="mt-0.5 block border-l-2 border-accent/40 pl-2.5 font-sans text-[12px] leading-snug text-ink/75">
                  <span className="block uppercase tracking-wide text-muted">
                    {quoteLabel}
                    {card.sourceLocation ? ` · ${card.sourceLocation}` : ''}
                  </span>
                  <span className="line-clamp-2 italic">&ldquo;{card.source}&rdquo;</span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const terms = (
    <ul aria-label="Terms" className={kind === 'phone' ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-3'}>
      {termOrder.map((k, row) => {
        const clue = clueOf[k];
        const state = slipState('term', k);
        return (
          <li key={k} className={kind === 'phone' ? '' : row % 2 ? 'rotate-[0.8deg]' : '-rotate-[0.8deg]'}>
            <button
              type="button"
              onClick={() => pick('term', k)}
              disabled={submitted}
              aria-pressed={selection?.side === 'term' && selection.at === k}
              aria-label={!submitted && clue !== undefined ? `${cards[k].card.answer}. Paired with clue ${clue + 1}.` : undefined}
              data-pair={!submitted && clue !== undefined ? pairColor(clue) : undefined}
              data-verdict={submitted && clue !== undefined ? (isRight(clue) ? 'right' : 'wrong') : undefined}
              className={`${SLIP} ${state} flex min-h-12 items-center justify-between gap-2 px-3.5 font-serif text-[17px] font-medium`}
            >
              <span>{cards[k].card.answer}</span>
              {!submitted && clue !== undefined && tag(clue)}
              {submitted && clue !== undefined && (
                <span className={isRight(clue) ? 'text-[#2f6b3a]' : 'text-pencil'}>{isRight(clue) ? <Check /> : <Cross />}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="w-full space-y-4">
      <p aria-live="polite" className="text-[14.5px] text-on-desk/85">
        {message}
      </p>
      {kind === 'phone' ? (
        <div className="space-y-5">
          {terms}
          {clues}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] items-start gap-5">
          {clues}
          {terms}
        </div>
      )}
      <div className="flex justify-center pt-1">
        {submitted ? (
          <button ref={nextRef} type="button" onClick={finish} className="btn btn-primary btn-lg min-w-52 rounded-full">
            {isLastRound ? 'See results' : 'Next round'} →
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={!allPaired} className="btn btn-primary btn-lg min-w-52 rounded-full disabled:cursor-not-allowed disabled:opacity-50">
            Submit Answers
          </button>
        )}
      </div>
    </div>
  );
}
