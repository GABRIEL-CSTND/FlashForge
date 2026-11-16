// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import DeckSpread, { LAND_GAP_MS } from './DeckSpread';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ITEMS = [
  { question: 'Fluid inside the chloroplast', answer: 'Stroma' },
  { question: 'Enzyme that fixes CO2', answer: 'RuBisCO' },
  { question: 'Pigment that absorbs light', answer: 'Chlorophyll' },
];

const spread = (onStart = vi.fn()) =>
  render(
    <DeckSpread
      title="Photosynthesis"
      meta="Flashcards · 3 cards"
      items={ITEMS}
      onStart={onStart}
      onExit={vi.fn()}
      saveSlot={<button>Save this study guide</button>}
      savedToHistory
    />
  );

describe('a new deck on the desk', () => {
  it('counts the cards as they land, then says they are ready', () => {
    vi.useFakeTimers();
    spread();
    expect(screen.getByText('Laying out card 1 of 3')).toBeTruthy();
    // One state change per card, so each step gets its own act().
    for (let i = 0; i < ITEMS.length; i++) act(() => vi.advanceTimersByTime(LAND_GAP_MS));
    expect(screen.getByText('All 3 cards are ready')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '1Fluid inside the chloroplast',
      '2Enzyme that fixes CO2',
      '3Pigment that absorbs light',
    ]);
    expect(screen.getByText('Saved to History')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save this study guide' })).toBeTruthy();
  });

  it('gathers the cards before the study screen takes over', () => {
    vi.useFakeTimers();
    const onStart = vi.fn();
    const { container } = spread(onStart);
    fireEvent.click(screen.getByRole('button', { name: 'Start studying' }));
    expect(onStart).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.spread-card.is-gathering')).toHaveLength(3);
    expect((screen.getByRole('button', { name: 'Start studying' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => vi.advanceTimersByTime(600));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('starts at once when the student asks for less motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const onStart = vi.fn();
    spread(onStart);
    fireEvent.click(screen.getByRole('button', { name: 'Start studying' }));
    expect(onStart).toHaveBeenCalledOnce();
  });
});
