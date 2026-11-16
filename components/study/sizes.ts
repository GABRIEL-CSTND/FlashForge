import type { DeskKind } from '@/components/desk/useDeskLayout';

// Text sizes that keep a clue, a question or a term on its card: the longer the
// text, the smaller the type (and the card scrolls if it still doesn't fit).
// Shared by the flashcard desk (phase 2) and the quiz desk (phase 4).

const CLUE_SIZES: Record<DeskKind, number[]> = { laptop: [29, 25, 21, 18, 16], phone: [22, 20, 18, 16, 15] };
const TERM_SIZES: Record<DeskKind, number[]> = { laptop: [60, 46, 36, 28, 22], phone: [42, 34, 28, 22, 18] };

function fitted(text: string, steps: number[], sizes: number[]): number {
  const i = steps.findIndex((s) => text.length <= s);
  return sizes[i === -1 ? sizes.length - 1 : i];
}

// A clue, or a quiz question. Smaller when the card also holds a verdict, a
// correction, a quote or the line to type on.
export const clueSize = (text: string, kind: DeskKind, crowded = false) =>
  Math.min(fitted(text, [50, 90, 140, 220], CLUE_SIZES[kind]), crowded ? (kind === 'phone' ? 18 : 22) : Infinity);

// A term on the back of a flashcard. Smaller when the card also shows a verdict
// or a quote.
export const termSize = (text: string, kind: DeskKind, crowded: boolean) =>
  Math.min(fitted(text, [10, 18, 28, 44], TERM_SIZES[kind]), crowded ? (kind === 'phone' ? 30 : 44) : Infinity);
