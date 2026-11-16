'use client';

import { useEffect, useRef, useState } from 'react';
import type { DeskKind } from '@/components/desk/useDeskLayout';
import { sameTerm, shuffled, type StudyItem } from './logic';

type Selection = { side: 'clue' | 'term'; at: number } | null;

const SLIP = 'paper slip w-full rounded-md text-left text-ink transition-transform duration-200';

// One Match round on the desk (#67): the round's clues as paper slips, and
// their terms, shuffled, beside them (on a phone, above them). Pick a clue and
// then its term (or the other way round). A right pair stays together with a
// brass edge; a wrong pick flashes red pencil and counts that clue as missed.
// The term picked first for each clue is what's reported, so the server scores
// a round the way it always has.
export default function MatchBoard({
  cards,
  isLastRound,
  onDone,
  kind,
  quoteLabel,
}: {
  cards: { card: StudyItem; index: number }[];
  isLastRound: boolean;
  onDone: (firstPicks: Record<number, string>) => void;
  kind: DeskKind;
  quoteLabel: string;
}) {
  // Term slips in shuffled order, each by its position in `cards`.
  const [termOrder] = useState(() => shuffled(cards.map((_, k) => k)));
  const [selection, setSelection] = useState<Selection>(null);
  // For each clue (position in `cards`), the term slip it was matched with.
  const [paired, setPaired] = useState<Record<number, number>>({});
  // The first term picked for each clue.
  const [firstPicks, setFirstPicks] = useState<Record<number, string>>({});
  const [flash, setFlash] = useState<{ clue: number; term: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const used = new Set(Object.values(paired));
  const done = cards.every((_, k) => paired[k] !== undefined);

  const attempt = (clue: number, term: number) => {
    const picked = cards[term].card.answer;
    if (firstPicks[clue] === undefined) setFirstPicks((prev) => ({ ...prev, [clue]: picked }));
    if (sameTerm(picked, cards[clue].card.answer)) {
      setPaired((prev) => ({ ...prev, [clue]: term }));
      setSelection(null);
      return;
    }
    setFlash({ clue, term });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setFlash(null);
      setSelection(null);
    }, 750);
  };

  const pickClue = (clue: number) => {
    if (flash || paired[clue] !== undefined) return;
    if (selection?.side === 'term') attempt(clue, selection.at);
    else setSelection(selection?.side === 'clue' && selection.at === clue ? null : { side: 'clue', at: clue });
  };

  const pickTerm = (term: number) => {
    if (flash || used.has(term)) return;
    if (selection?.side === 'clue') attempt(selection.at, term);
    else setSelection(selection?.side === 'term' && selection.at === term ? null : { side: 'term', at: term });
  };

  const message = done
    ? isLastRound
      ? 'All matched. See how you did.'
      : 'All matched. On to the next round.'
    : flash
      ? 'Not that one. Try another term.'
      : selection?.side === 'clue'
        ? 'Now pick the term that goes with it.'
        : selection?.side === 'term'
          ? 'Now pick the clue it goes with.'
          : `${cards.length} cards on the desk. Pick a clue, then the term that goes with it.`;

  const ring = (state: 'picked' | 'paired' | 'wrong' | null) =>
    state === 'wrong' ? 'slip-wrong' : state === 'picked' ? 'slip-picked' : state === 'paired' ? 'slip-paired' : '';

  const clues = (
    <ul aria-label="Clues" className="flex flex-col gap-3">
      {cards.map(({ card, index }, k) => {
        const match = paired[k];
        const state = flash?.clue === k ? 'wrong' : match !== undefined ? 'paired' : selection?.side === 'clue' && selection.at === k ? 'picked' : null;
        return (
          <li key={index}>
            <button
              type="button"
              onClick={() => pickClue(k)}
              disabled={match !== undefined}
              aria-pressed={state === 'picked'}
              className={`${SLIP} ${ring(state)} flex min-h-16 flex-col justify-center gap-1 px-4 py-2 font-serif text-[15.5px] leading-snug`}
            >
              <span>{card.question}</span>
              {match !== undefined && (
                <span className="flex items-center gap-1.5 font-sans text-[13px] font-semibold text-brass-ink">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                  {cards[match].card.answer}
                </span>
              )}
              {/* Once matched, where the card came from (spans: a button holds no blocks). */}
              {match !== undefined && card.source && (
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
        const isUsed = used.has(k);
        const state = flash?.term === k ? 'wrong' : selection?.side === 'term' && selection.at === k ? 'picked' : null;
        return (
          <li key={k} className={kind === 'phone' ? '' : row % 2 ? 'rotate-[0.8deg]' : '-rotate-[0.8deg]'}>
            <button
              type="button"
              onClick={() => pickTerm(k)}
              disabled={isUsed}
              aria-pressed={state === 'picked'}
              className={`${SLIP} ${isUsed ? 'slip-used' : ring(state)} flex min-h-12 items-center px-3.5 font-serif text-[17px] font-medium`}
            >
              {cards[k].card.answer}
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
      {done && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => onDone(Object.fromEntries(cards.map(({ index }, k) => [index, firstPicks[k]])))}
            className="btn btn-primary btn-lg min-w-52 rounded-full"
          >
            {isLastRound ? 'See results' : 'Next round'} →
          </button>
        </div>
      )}
    </div>
  );
}
