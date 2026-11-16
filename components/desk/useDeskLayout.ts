'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';

// Where things lie on the study desk (desk redesign, phase 2).
//
// The page lays the desk out with ordinary CSS: empty "slots" mark the deck,
// the card in the middle and the two piles. This hook measures those slots,
// and the cards (absolutely placed) move between them with a CSS transform, so
// the layout can change size without the cards losing their place.
//
// Two layouts: the laptop desk (deck on the left, card in the middle, piles on
// the right) once the desk is LAPTOP_MIN pixels wide, and the phone desk below
// that (the deck peeks out above the card, the piles are trays underneath).

export type DeskKind = 'laptop' | 'phone';
export type SlotName = 'deck' | 'card' | 'got' | 'missed';

export interface Rect {
  x: number; // center, from the desk's left edge
  y: number; // center, from the desk's top edge
  w: number;
  h: number;
}

export type Slots = Partial<Record<SlotName, Rect>>;

// Where a card lies: its center, a tilt in degrees and a scale (1 = full size).
export interface Spot {
  x: number;
  y: number;
  r: number;
  s: number;
}

// The laptop desk needs room for the deck, the card and the piles side by side.
// 960 is a 1,024-pixel window less the desk's margins.
export const LAPTOP_MIN = 960;

// Cards in a stack show at most this many layers (a 30-card deck would
// otherwise be a tower).
export const MAX_LAYERS = 8;

export function deskKind(width: number): DeskKind {
  return width >= LAPTOP_MIN ? 'laptop' : 'phone';
}

// The size of the card in the middle: wide enough to read, never wider than
// the printed design (560 × 350).
export function cardSize(width: number, kind: DeskKind): { w: number; h: number } {
  if (kind === 'laptop') {
    const w = Math.round(Math.min(560, Math.max(420, width * 0.44)));
    return { w, h: Math.round(w * 0.625) };
  }
  const w = Math.round(Math.max(240, Math.min(560, width)));
  return { w, h: Math.round(Math.min(400, Math.max(220, w * 0.74))) };
}

// Small tilts, so a stack looks hand-made rather than machine-cut.
const TILT = [-1.5, 1, -0.5, 2, -2, 0.5, 1.5, -1];

// A card in the deck, `depth` cards down from the top.
export function deckSpot(kind: DeskKind, slots: Slots, card: { w: number; h: number }, depth: number): Spot | null {
  const d = Math.min(depth, MAX_LAYERS - 1);
  if (kind === 'laptop') {
    const slot = slots.deck;
    if (!slot) return null;
    return { x: slot.x - d * 1.3, y: slot.y + d * 1.7, r: TILT[d] * 0.8, s: slot.w / card.w };
  }
  // Phone: the deck lies behind the top of the card, showing a strip above it.
  const middle = slots.card;
  if (!middle) return null;
  const s = 0.5;
  return { x: middle.x + (d % 2 ? 1.5 : -1.5), y: middle.y - middle.h / 2 + (card.h * s) / 2 - 30 - d * 1.2, r: TILT[d] * 0.5, s };
}

// A card on a pile, `depth` cards up from the bottom.
export function pileSpot(kind: DeskKind, slots: Slots, card: { w: number; h: number }, pile: 'got' | 'missed', depth: number): Spot | null {
  const slot = slots[pile];
  if (!slot) return null;
  const jitter = (((depth * 37) % 7) - 3) * 1.6;
  const tilt = (((depth * 53) % 9) - 4) * 1.3;
  if (kind === 'laptop') {
    return { x: slot.x + jitter, y: slot.y - Math.min(depth, MAX_LAYERS - 1) * 2.4, r: tilt, s: (slot.w - 28) / card.w };
  }
  // Phone trays: the cards lie on the right of the tray, past its label.
  const s = Math.min(0.3, (slot.h - 26) / card.h, (slot.w * 0.5) / card.w);
  return { x: slot.x + slot.w * 0.18 + jitter * 0.5, y: slot.y + 6 - Math.min(depth, MAX_LAYERS - 1) * 1.4, r: tilt * 0.6, s };
}

export function middleSpot(slots: Slots, lifted: boolean): Spot | null {
  const slot = slots.card;
  if (!slot) return null;
  return { x: slot.x, y: slot.y, r: 0, s: lifted ? 1.04 : 1 };
}

// The transform that puts a card of this size on the spot.
export function spotTransform(spot: Spot, card: { w: number; h: number }): string {
  return `translate(${Math.round(spot.x - card.w / 2)}px, ${Math.round(spot.y - card.h / 2)}px) rotate(${spot.r}deg) scale(${spot.s})`;
}

const sameRect = (a: Rect | undefined, b: Rect | undefined) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

const sameSlots = (a: Slots | null, b: Slots) =>
  !!a && (['deck', 'card', 'got', 'missed'] as const).every((k) => sameRect(a[k], b[k]));

export interface DeskLayout {
  stageRef: RefObject<HTMLDivElement | null>;
  slot: (name: SlotName) => (el: HTMLElement | null) => void;
  kind: DeskKind;
  card: { w: number; h: number };
  slots: Slots | null;
  // False until the cards have been placed once, so they don't fly in from the
  // corner on the first paint.
  settled: boolean;
}

const SLOT_NAMES: SlotName[] = ['deck', 'card', 'got', 'missed'];

// Runs the callback on the next frame; returns a cancel function.
function nextFrame(callback: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(callback, 16);
  return () => clearTimeout(id);
}

const onWindowResize = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};
const readWindowWidth = () => window.innerWidth;
const noWindowWidth = () => null;

// `layoutKey` changes whenever the slots may have moved without the desk
// changing size (another mode, the finish note).
export function useDeskLayout(layoutKey: string): DeskLayout {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const slotEls = useRef<Partial<Record<SlotName, HTMLElement | null>>>({});
  // Until the desk is measured, a guess from the window (less the desk's
  // margins), so a phone doesn't flash the laptop desk. Hydration uses the
  // server's answer (none), so the first HTML always matches.
  const windowWidth = useSyncExternalStore(onWindowResize, readWindowWidth, noWindowWidth);
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? (windowWidth === null ? null : windowWidth - (windowWidth >= 640 ? 48 : 16));
  const [slots, setSlots] = useState<Slots | null>(null);
  const [settled, setSettled] = useState(false);

  // One stable ref callback per slot, so React doesn't detach and reattach them
  // on every render.
  const [slot] = useState(() => {
    const callbacks = Object.fromEntries(
      SLOT_NAMES.map((name) => [
        name,
        (el: HTMLElement | null) => {
          slotEls.current[name] = el;
        },
      ])
    ) as Record<SlotName, (el: HTMLElement | null) => void>;
    return (name: SlotName) => callbacks[name];
  });

  // Reads where the slots are now. Only called from effects and observers.
  const [measure] = useState(() => () => {
    const stage = stageRef.current;
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    const next: Slots = {};
    for (const name of SLOT_NAMES) {
      const el = slotEls.current[name];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      next[name] = { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, w: r.width, h: r.height };
    }
    setMeasured(stage.clientWidth || 1024);
    setSlots((prev) => (sameSlots(prev, next) ? prev : next));
  });

  // The desk's size: the first measurement, and again whenever it changes.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (typeof ResizeObserver === 'undefined') return nextFrame(measure);
    const observer = new ResizeObserver(() => measure());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [measure]);

  // Slots can move without the desk changing size, e.g. switching to Match.
  useEffect(() => nextFrame(measure), [layoutKey, measure]);

  // Turn the motion on one frame after the cards first lie in place.
  useEffect(() => {
    if (!slots || settled) return;
    return nextFrame(() => setSettled(true));
  }, [slots, settled]);

  const kind = deskKind(width ?? 1024);
  return { stageRef, slot, kind, card: cardSize(width ?? 1024, kind), slots, settled };
}
