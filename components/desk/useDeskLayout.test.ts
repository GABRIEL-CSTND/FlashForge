import { describe, expect, it } from 'vitest';
import { cardSize, deckSpot, deskKind, LAPTOP_MIN, MAX_LAYERS, middleSpot, pileSpot, spotTransform, type Slots } from './useDeskLayout';

// The desk at the widths the build plan checks: a small phone, a large phone,
// a 1,024-pixel laptop and a 1,440-pixel one (each less the desk's margins).
const WIDTHS = { smallPhone: 320 - 16, phone: 430 - 16, laptop: 1024 - 48, wideLaptop: 1440 - 48 };

describe('desk layout', () => {
  it('uses the laptop desk from a 1,024-pixel window, the phone desk below', () => {
    expect(deskKind(WIDTHS.smallPhone)).toBe('phone');
    expect(deskKind(WIDTHS.phone)).toBe('phone');
    expect(deskKind(LAPTOP_MIN - 1)).toBe('phone');
    expect(deskKind(WIDTHS.laptop)).toBe('laptop');
    expect(deskKind(WIDTHS.wideLaptop)).toBe('laptop');
  });

  it('keeps the card readable and never wider than the desk or the printed design', () => {
    for (const width of Object.values(WIDTHS)) {
      const kind = deskKind(width);
      const card = cardSize(width, kind);
      expect(card.w).toBeLessThanOrEqual(Math.min(560, width));
      expect(card.h).toBeGreaterThanOrEqual(220);
      // On a laptop the deck and the piles fit beside the card.
      if (kind === 'laptop') expect(width - card.w).toBeGreaterThanOrEqual(2 * 200);
    }
    expect(cardSize(WIDTHS.wideLaptop, 'laptop')).toEqual({ w: 560, h: 350 });
  });

  const slots: Slots = {
    deck: { x: 150, y: 120, w: 235, h: 147 },
    card: { x: 600, y: 200, w: 560, h: 350 },
    got: { x: 1100, y: 140, w: 263, h: 175 },
    missed: { x: 1100, y: 380, w: 263, h: 175 },
  };
  const card = { w: 560, h: 350 };

  it('stacks a deck at most eight cards deep', () => {
    const top = deckSpot('laptop', slots, card, 0)!;
    expect(top.s).toBeCloseTo(235 / 560);
    expect(deckSpot('laptop', slots, card, 29)).toEqual(deckSpot('laptop', slots, card, MAX_LAYERS - 1));
  });

  it('shrinks a card onto its pile and puts it in the middle full size', () => {
    const onPile = pileSpot('laptop', slots, card, 'got', 0)!;
    expect(onPile.s * card.w).toBeCloseTo(263 - 28);
    expect(pileSpot('laptop', slots, card, 'missed', 0)!.y).toBeGreaterThan(onPile.y);
    expect(middleSpot(slots, false)).toEqual({ x: 600, y: 200, r: 0, s: 1 });
    expect(middleSpot(slots, true)!.s).toBeGreaterThan(1);
  });

  it('has no spot for a slot that is not on the desk', () => {
    expect(middleSpot({}, false)).toBeNull();
    expect(pileSpot('phone', {}, card, 'got', 0)).toBeNull();
    expect(deckSpot('phone', {}, card, 0)).toBeNull();
  });

  it('turns a spot into a transform around the card center', () => {
    expect(spotTransform({ x: 600, y: 200, r: 1.5, s: 0.5 }, card)).toBe('translate(320px, 25px) rotate(1.5deg) scale(0.5)');
  });
});
