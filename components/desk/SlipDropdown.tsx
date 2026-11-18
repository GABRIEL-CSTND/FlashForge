'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { SlipOption } from './SlipMenu';

// The slips lie at slightly different angles, like paper pulled from a stack.
const TILTS = ['-2deg', '1.5deg', '-1deg', '2deg', '-1.5deg'];

export interface SlipDropdownProps<T extends string | number> {
  name: string;
  label: string;
  options: SlipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  minWidth?: string;
  menuWidth?: string;
}

export default function SlipDropdown<T extends string | number>({
  name,
  label,
  options,
  value,
  onChange,
  disabled = false,
  minWidth = 'min-w-[110px]',
  menuWidth = 'w-64',
}: SlipDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
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

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    menu.style.marginLeft = '';
    const box = menu.getBoundingClientRect();
    const margin = 8;
    const shift =
      box.left < margin
        ? margin - box.left
        : box.right > window.innerWidth - margin
          ? window.innerWidth - margin - box.right
          : 0;
    if (shift) menu.style.marginLeft = `${Math.round(shift)}px`;
  }, [open]);

  const pick = (next: T) => {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const slips = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const at = slips.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowUp' ? Math.min(slips.length - 1, at + 1) : Math.max(0, at - 1);
    slips[next]?.focus();
  };

  return (
    <div className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-label={`${name}: ${label}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`h-[38px] ${minWidth} rounded-lg border border-[#d6c7b5] bg-[#faf6ed] pl-3.5 pr-2.5 text-sm font-medium text-[#201813] shadow-sm hover:border-[#bda993] focus:outline-none focus:ring-1 focus:ring-[#ad8539] flex items-center justify-between gap-2.5 cursor-pointer transition select-none disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className="truncate">{label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`shrink-0 text-[#736a5e] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <span
          ref={menuRef}
          id={menuId}
          role="group"
          aria-label={name}
          onKeyDown={onMenuKey}
          className={`absolute bottom-[calc(100%+8px)] left-0 z-50 flex ${menuWidth} flex-col-reverse gap-1.5 font-sans text-[14.5px] font-normal leading-snug tracking-normal`}
        >
          {options.map((option, i) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => pick(option.value)}
              aria-pressed={option.value === value}
              className="paper slip flex min-h-11 w-full items-center justify-between gap-2.5 rounded px-3.5 py-2 text-left text-ink transition hover:scale-[1.02] cursor-pointer"
              style={{ rotate: TILTS[i % TILTS.length] }}
            >
              <span className="flex flex-col">
                <span className="font-semibold">{option.label}</span>
                {option.hint && <span className="text-[12px] text-muted">{option.hint}</span>}
              </span>
              {option.value === value && (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0 text-brass-ink"
                >
                  <path d="m5 12 5 5 9-10" />
                </svg>
              )}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
