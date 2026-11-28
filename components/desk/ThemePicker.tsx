'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  COLOR_THEMES,
  useColorTheme,
  type ColorThemeId,
  type ColorThemePalette,
} from '@/lib/theme';

// Circular Google Chrome-style 3-tone swatch (desk background, cream card surface,
// and accent shade) with a check icon when selected.
function SwatchCircle({
  palette,
  selected,
  size = 28,
}: {
  palette: ColorThemePalette;
  selected?: boolean;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/25 shadow-xs"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="block">
        {/* Left half: leather/linen desk background shade */}
        <path d="M16 0 A16 16 0 0 0 16 32 Z" fill={palette.bgSurface} />
        {/* Top-right quadrant: wooden card box shade */}
        <path d="M16 0 A16 16 0 0 1 32 16 L16 16 Z" fill={palette.boxSurface} />
        {/* Bottom-right quadrant: sticky note / cream card accent shade */}
        <path d="M32 16 A16 16 0 0 1 16 32 L16 16 Z" fill={palette.stickySurface} />
      </svg>
      {selected && (
        <span
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35 text-white"
          data-testid={`swatch-check-${palette.id}`}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12 5 5 9-10" />
          </svg>
        </span>
      )}
    </span>
  );
}

// Google Chrome-style color-only theme picker (#90): presents circular color
// swatches pairing harmonious background, card, and accent shades, updates CSS
// custom properties immediately, announces changes to screen readers, and
// persists the chosen palette in localStorage.
export default function ThemePicker({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [themeId, setThemeId, current] = useColorTheme();
  const [open, setOpen] = useState(defaultOpen);
  const [announcement, setAnnouncement] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSelect = (nextId: ColorThemeId, label: string) => {
    setThemeId(nextId);
    setAnnouncement(`Theme color set to ${label}`);
  };

  const onSwatchKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (
      e.key !== 'ArrowRight' &&
      e.key !== 'ArrowLeft' &&
      e.key !== 'ArrowDown' &&
      e.key !== 'ArrowUp'
    ) {
      return;
    }
    e.preventDefault();
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (index + delta + COLOR_THEMES.length) % COLOR_THEMES.length;
    const nextTheme = COLOR_THEMES[nextIndex];
    handleSelect(nextTheme.id, nextTheme.label);
    const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-theme-swatch]');
    buttons?.[nextIndex]?.focus();
  };

  return (
    <div className="relative inline-flex items-center">
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </span>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Customize theme color (${current.label})`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? panelId : undefined}
        title={`Theme color: ${current.label}`}
        className={`${
          open ? 'brass' : 'brass-ring'
        } inline-flex size-9 cursor-pointer items-center justify-center rounded-md transition-colors`}
      >
        <SwatchCircle palette={current} size={20} />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label="Theme color swatches"
          className="paper paper-shadow absolute right-0 top-[calc(100%+10px)] z-50 w-72 rounded-lg border border-ink/15 p-3.5 text-ink"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ink/15 pb-2">
            <p className="font-serif text-sm font-semibold text-ink">Theme color</p>
            <span className="truncate font-sans text-xs text-muted">{current.label}</span>
          </div>

          <div
            role="group"
            aria-label="Choose a color theme"
            className="mt-3 grid grid-cols-3 place-items-center gap-2.5"
          >
            {COLOR_THEMES.map((palette, idx) => {
              const active = palette.id === themeId;
              return (
                <button
                  key={palette.id}
                  type="button"
                  data-theme-swatch={palette.id}
                  aria-label={`${palette.label} theme`}
                  aria-pressed={active}
                  title={palette.label}
                  onClick={() => handleSelect(palette.id, palette.label)}
                  onKeyDown={(e) => onSwatchKeyDown(e, idx)}
                  className={`inline-flex size-10 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-105 ${
                    active ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper' : ''
                  }`}
                >
                  <SwatchCircle palette={palette} selected={active} size={32} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
