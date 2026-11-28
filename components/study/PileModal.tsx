'use client';

import { useEffect, useId, useRef } from 'react';
import type { FlashcardMark, StudyItem } from './logic';

export interface PileModalEntry {
  index: number;
  card: StudyItem;
}

export interface PileModalProps {
  pile: FlashcardMark;
  entries: PileModalEntry[];
  totalCount: number;
  onClose: () => void;
}

export default function PileModal({ pile, entries, totalCount, onClose }: PileModalProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const isGot = pile === 'got';
  const pileName = isGot ? 'Got it' : 'Missed it';
  const countLabel = `${entries.length} card${entries.length === 1 ? '' : 's'}`;

  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      data-testid="pile-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={`pile-modal-${pile}`}
        className="paper paper-shadow flex max-h-[82vh] w-full max-w-xl flex-col rounded-xl border border-ink/15 text-ink shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 border-b border-ink/15 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] ${
                  isGot ? 'bg-brass/20 text-brass-ink' : 'bg-pencil/15 text-pencil'
                }`}
              >
                {pileName}
              </span>
              <span className="text-xs font-medium tabular-nums text-muted">{countLabel}</span>
            </div>
            <h2 id={titleId} className="mt-1 font-serif text-2xl font-normal leading-tight text-ink">
              {pileName} pile
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close pile cards"
            className="btn btn-secondary min-h-10 rounded-full px-4 text-sm font-semibold"
          >
            Close
          </button>
        </div>

        {/* Sorted Cards List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              No cards in the {pileName} pile yet.
            </p>
          ) : (
            <ul aria-label={`${pileName} pile cards`} className="space-y-3">
              {entries.map(({ index, card }, pos) => (
                <li
                  key={`${card.id ?? index}-${pos}`}
                  data-testid={`pile-modal-card-${index}`}
                  className="paper rounded-lg border border-ink/15 px-4 py-3.5 shadow-sm"
                >
                  <div className="flex items-baseline justify-between gap-2 border-b border-ink/10 pb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brass-ink">
                      Card {index + 1} of {totalCount}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        isGot ? 'text-brass-ink' : 'text-pencil'
                      }`}
                    >
                      {isGot ? '✓ Got it' : '✗ Missed it'}
                    </span>
                  </div>

                  <div className="mt-2.5 grid gap-2.5 sm:grid-cols-[1.2fr_1fr] sm:gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                        Clue / Question
                      </p>
                      <p className="mt-0.5 font-serif text-[15px] leading-snug text-ink [overflow-wrap:anywhere]">
                        {card.question}
                      </p>
                    </div>
                    <div className="border-t border-ink/10 pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                        Answer / Term
                      </p>
                      <p className="mt-0.5 font-serif text-[16px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
                        {card.answer}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
