// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import MatchBoard, { linkPair, pairColor, PAIR_COLORS, unlink } from '@/components/study/MatchBoard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('pairing helpers (#119)', () => {
  it('pairs a clue with a term, moving either out of an earlier pair', () => {
    expect(linkPair({}, 0, 2)).toEqual({ 0: 2 });
    // The clue gets a new term.
    expect(linkPair({ 0: 2, 1: 3 }, 0, 4)).toEqual({ 0: 4, 1: 3 });
    // The term moves to another clue.
    expect(linkPair({ 0: 2, 1: 3 }, 1, 2)).toEqual({ 1: 2 });
    // Does not change what it was given.
    const before = { 0: 1 };
    linkPair(before, 2, 1);
    expect(before).toEqual({ 0: 1 });
  });

  it('takes a clue or a term out of its pair', () => {
    expect(unlink({ 0: 2, 1: 3 }, 'clue', 0)).toEqual({ 1: 3 });
    expect(unlink({ 0: 2, 1: 3 }, 'term', 3)).toEqual({ 0: 2 });
    expect(unlink({ 0: 2 }, 'term', 4)).toEqual({ 0: 2 });
  });

  it('gives each of five clues its own colour', () => {
    expect(new Set([0, 1, 2, 3, 4].map(pairColor)).size).toBe(5);
    expect(PAIR_COLORS).toEqual(['blue', 'purple', 'teal', 'orange', 'pink']);
  });
});

describe('MatchBoard (#119)', () => {
  const termButton = (name: string) => within(screen.getByRole('list', { name: 'Terms' })).getByRole('button', { name: new RegExp(`^${name}(\\.|$)`) });
  const clueButton = (name: string) => within(screen.getByRole('list', { name: 'Clues' })).getByRole('button', { name: new RegExp(`^${name}`) });

  it('counts two cards with the same answer as right either way round', () => {
    const onDone = vi.fn();
    const cards = [
      { card: { question: 'Powerhouse of the cell', answer: 'Mitochondria' }, index: 4 },
      { card: { question: 'Makes ATP', answer: 'mitochondria ' }, index: 7 },
    ];
    render(<MatchBoard cards={cards} isLastRound onDone={onDone} kind="laptop" quoteLabel="From the document" />);
    // Pair each clue with the other card's term.
    fireEvent.click(clueButton('Powerhouse of the cell'));
    fireEvent.click(termButton('mitochondria'));
    fireEvent.click(clueButton('Makes ATP'));
    fireEvent.click(termButton('Mitochondria'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answers' }));
    expect(screen.getByText(/You got 2 of 2 right/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'See results →' }));
    expect(onDone).toHaveBeenCalledWith({ 4: 'mitochondria ', 7: 'Mitochondria' });
  });

  it('moves focus to the button that goes on once the round is checked', () => {
    const cards = [{ card: { question: 'Gas given off', answer: 'Oxygen' }, index: 0 }];
    render(<MatchBoard cards={cards} isLastRound={false} onDone={() => {}} kind="phone" quoteLabel="From the document" />);
    fireEvent.click(termButton('Oxygen'));
    fireEvent.click(clueButton('Gas given off'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answers' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next round →' }));
  });
});
