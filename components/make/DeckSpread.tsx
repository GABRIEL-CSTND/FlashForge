'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { StudyItem } from '@/components/study/logic';
import { ExitButton } from '@/components/study/parts';

// The API sends every card at once (it streams only its progress steps), so the
// cards land one after another, this far apart, once the deck has arrived.
// Landing each card the moment it's written needs streaming from the AI.
export const LAND_GAP_MS = 350;
const GATHER_MS = 600;
const TILTS = [-6, 4, -3, 7, 3, -5, 2, -4, 5, -2];
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

// A new deck lies spread out on the desk (desk redesign, phase 3): its name,
// Start studying, and the cards in a loose spread. Start studying gathers them
// into a stack before the study screen takes over.
export default function DeckSpread({
  title,
  meta,
  items,
  onStart,
  onExit,
  saveSlot,
  savedToHistory,
}: {
  title: string;
  // e.g. "10 flashcards · medium".
  meta: string;
  items: StudyItem[];
  onStart: () => void;
  onExit: () => void;
  saveSlot: ReactNode;
  savedToHistory: boolean;
}) {
  const [landed, setLanded] = useState(0);
  const [gather, setGather] = useState<{ x: number; y: number }[] | null>(null);
  const cardEls = useRef<(HTMLLIElement | null)[]>([]);
  const spreadRef = useRef<HTMLOListElement>(null);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Counts the cards as they land, for the status line.
  useEffect(() => {
    if (landed >= items.length) return;
    const id = setTimeout(() => setLanded((n) => n + 1), landed === 0 ? 0 : LAND_GAP_MS);
    return () => clearTimeout(id);
  }, [landed, items.length]);
  useEffect(
    () => () => {
      if (startTimer.current) clearTimeout(startTimer.current);
    },
    []
  );

  // Every card slides to the top left of the spread, where the deck will be.
  const start = () => {
    const spread = spreadRef.current;
    if (!spread || reducedMotion()) {
      onStart();
      return;
    }
    const box = spread.getBoundingClientRect();
    const target = { x: box.left + Math.min(140, box.width / 4), y: box.top + 90 };
    setGather(
      cardEls.current.map((el) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: target.x - (r.left + r.width / 2), y: target.y - (r.top + r.height / 2) } : { x: 0, y: 0 };
      })
    );
    startTimer.current = setTimeout(onStart, GATHER_MS);
  };

  const ready = landed >= items.length;

  return (
    <main className="on-desk w-full pb-8">
      <div className="flex items-center justify-between gap-4">
        <ExitButton onExit={onExit} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-on-desk/80 hover:text-on-desk" />
        <p aria-live="polite" className="inline-flex items-center gap-2 text-sm font-medium text-on-desk/85">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full bg-brass ${ready ? '' : 'animate-pulse'}`} />
          {ready ? `All ${items.length} cards are ready` : `Laying out card ${landed + 1} of ${items.length}`}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="paper paper-shadow -rotate-1 rounded px-4 py-2.5 text-ink">
          <h1 className="text-[19px] leading-tight">{title}</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">{meta}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <button type="button" onClick={start} disabled={gather !== null} className="btn btn-primary btn-lg rounded-full px-6">
            Start studying
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </button>
          {savedToHistory && (
            <span className="inline-flex items-center gap-1.5 text-[13.5px] text-on-desk/85">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12 5 5 9-10" />
              </svg>
              Saved to History
            </span>
          )}
        </div>
        {saveSlot && <div className="paper paper-shadow rounded px-4 py-3 text-sm text-ink">{saveSlot}</div>}
      </div>

      <ol ref={spreadRef} aria-label="Your new cards" className="mt-8 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-5">
        {items.map((item, i) => (
          <li
            key={i}
            ref={(el) => {
              cardEls.current[i] = el;
            }}
            className={`spread-card paper flex aspect-[8/5] flex-col gap-1.5 overflow-hidden rounded-md px-3.5 py-3 text-ink ${gather ? 'is-gathering' : ''}`}
            style={
              {
                '--i': i,
                '--tilt': `${TILTS[i % TILTS.length]}deg`,
                '--gx': `${gather?.[i]?.x ?? 0}px`,
                '--gy': `${gather?.[i]?.y ?? 0}px`,
              } as CSSProperties
            }
          >
            <span className="text-[11px] tabular-nums text-muted">{i + 1}</span>
            <p className="line-clamp-4 font-serif text-[14.5px] leading-snug">{item.question}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
