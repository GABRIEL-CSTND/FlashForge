'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export interface SlipOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

// The slips lie at slightly different angles, like paper pulled from a stack.
const TILTS = ['-2deg', '1.5deg', '-1deg', '2deg', '-1.5deg'];

// A word on a paper card that fans out paper slips to choose from (desk
// redesign, phase 3): "Make me [10] [medium] [flashcards]". The word says what
// is chosen now; its name for screen readers says what it is ("How many: 10").
// Picking a slip, Escape or a click elsewhere closes the slips, and the arrow
// keys move between them.
export default function SlipMenu<T extends string | number>({
  name,
  word,
  options,
  value,
  onChange,
  disabled = false,
}: {
  // The question the slips answer, e.g. "How many".
  name: string;
  // What the word says now, e.g. "10".
  word: string;
  options: SlipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wordRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !wordRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      wordRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    // Opening puts focus on the slip that's chosen now.
    menuRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The slips are centered on their word; near the edge of a phone screen they
  // move back inside it.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    menu.style.marginLeft = '';
    const box = menu.getBoundingClientRect();
    const margin = 8;
    const shift = box.left < margin ? margin - box.left : box.right > window.innerWidth - margin ? window.innerWidth - margin - box.right : 0;
    if (shift) menu.style.marginLeft = `${Math.round(shift)}px`;
  }, [open]);

  const pick = (next: T) => {
    onChange(next);
    setOpen(false);
    wordRef.current?.focus();
  };

  // The slips fan out upwards, so ↑ moves away from the word and ↓ back.
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const slips = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const at = slips.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowUp' ? Math.min(slips.length - 1, at + 1) : Math.max(0, at - 1);
    slips[next]?.focus();
  };

  return (
    <span className="relative inline-block">
      <button
        ref={wordRef}
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-label={`${name}: ${word}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="slip-word"
      >
        {word}
      </button>
      {open && (
        <span
          ref={menuRef}
          id={menuId}
          role="group"
          aria-label={name}
          onKeyDown={onMenuKey}
          className="absolute bottom-[calc(100%+10px)] left-1/2 z-40 flex w-60 -translate-x-1/2 flex-col-reverse gap-1.5 font-sans text-[15px] font-normal leading-snug tracking-normal"
        >
          {options.map((option, i) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => pick(option.value)}
              aria-pressed={option.value === value}
              className="paper slip flex min-h-11 w-full items-center justify-between gap-2.5 rounded px-3.5 py-2 text-left text-ink"
              style={{ rotate: TILTS[i % TILTS.length] }}
            >
              <span className="flex flex-col">
                <span className="font-semibold">{option.label}</span>
                {option.hint && <span className="text-[12.5px] text-muted">{option.hint}</span>}
              </span>
              {option.value === value && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-brass-ink">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              )}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
