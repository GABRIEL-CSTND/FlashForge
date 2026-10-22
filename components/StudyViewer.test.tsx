// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import StudyViewer, { type StudyResult } from '@/components/StudyViewer';

afterEach(cleanup);

const MC_CARDS = [
  { id: 'c1', question: 'Layer 3?', answer: 'Network', options: ['Physical', 'Network', 'Transport'] },
  { id: 'c2', question: 'Reliable transport?', answer: 'TCP', options: ['UDP', 'TCP', 'ARP'] },
];
const FLASH_CARDS = [
  { id: 'f1', question: 'Fluid inside the chloroplast', answer: 'Stroma' },
  { id: 'f2', question: 'Enzyme that fixes CO2', answer: 'RuBisCO' },
  { id: 'f3', question: 'Pigment that absorbs light', answer: 'Chlorophyll' },
];

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const flip = () => fireEvent.click(screen.getByRole('button', { name: /Tap to flip/ }));
const mark = (name: '✓ Got it' | '✗ Missed it') =>
  fireEvent.click(within(screen.getByRole('group', { name: 'Did you know it?' })).getByRole('button', { name }));

describe('multiple choice', () => {
  it('reports each pick once when the student finishes', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} onComplete={onComplete} />);
    click('Network');
    click('Next →');
    click('UDP');
    click('Finish');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      answers: [
        { cardId: 'c1', chosen: 'Network' },
        { cardId: 'c2', chosen: 'UDP' },
      ],
      correct: 1,
      total: 2,
    });
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('shows the completion slot on the summary, and reports again after Try Again', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(
      <StudyViewer
        title="Networking"
        studyType="multiple_choice"
        cards={MC_CARDS}
        onComplete={onComplete}
        completionSlot={<p>Saved!</p>}
      />
    );
    expect(screen.queryByText('Saved!')).toBeNull();
    click('Network');
    click('Next →');
    click('TCP');
    click('Finish');
    expect(screen.getByText('Saved!')).toBeTruthy();

    click('Try Again');
    click('Physical');
    click('Next →');
    click('TCP');
    click('Finish');
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete.mock.calls[1][0]).toMatchObject({
      answers: [
        { cardId: 'c1', chosen: 'Physical' },
        { cardId: 'c2', chosen: 'TCP' },
      ],
      correct: 1,
    });
  });
});

describe('flashcards', () => {
  it('only offers "Got it / Missed it" once the card is flipped', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(screen.queryByRole('group', { name: 'Did you know it?' })).toBeNull();
    flip();
    expect(screen.getByText('Stroma')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Did you know it?' })).toBeTruthy();
  });

  it('moves on after each mark and reports the marks when the last one is marked', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} onComplete={onComplete} />);
    flip();
    mark('✓ Got it');
    expect(screen.getByText('Card 2 of 3')).toBeTruthy();
    // The next card starts face down.
    expect(screen.getByText('Enzyme that fixes CO2')).toBeTruthy();
    flip();
    mark('✗ Missed it');
    flip();
    mark('✓ Got it');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      answers: [
        { cardId: 'f1', result: 'got' },
        { cardId: 'f2', result: 'missed' },
        { cardId: 'f3', result: 'got' },
      ],
      correct: 2,
      total: 3,
    });
    expect(screen.getByText('2 / 3')).toBeTruthy();
    expect(screen.getByText('1 missed')).toBeTruthy();
  });

  it('counts cards skipped with Next as not marked', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} onComplete={onComplete} />);
    flip();
    mark('✗ Missed it');
    click('Next →');
    click('Finish');

    expect(onComplete.mock.calls[0][0].answers).toEqual([
      { cardId: 'f1', result: 'missed' },
      { cardId: 'f2', result: null },
      { cardId: 'f3', result: null },
    ]);
    expect(screen.getByText('0 / 3')).toBeTruthy();
    expect(screen.getByText('1 missed · 2 not marked')).toBeTruthy();
  });

  it('keeps the old "reviewed all" message when nothing was marked', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    click('Next →');
    click('Next →');
    click('Finish');
    expect(screen.getByText(/reviewed all 3 cards/)).toBeTruthy();
  });

  it('shows an earlier mark when going back, and starts fresh after Review Again', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} onComplete={onComplete} />);
    flip();
    mark('✓ Got it');
    click('← Prev');
    flip();
    expect(screen.getByRole('button', { name: '✓ Got it' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '✗ Missed it' }).getAttribute('aria-pressed')).toBe('false');

    // Changing the mark replaces it.
    mark('✗ Missed it');
    click('Next →');
    click('Finish');
    expect(onComplete.mock.calls[0][0].answers.map((a) => a.result)).toEqual(['missed', null, null]);

    click('Review Again');
    expect(screen.getByText('Card 1 of 3')).toBeTruthy();
    flip();
    expect(screen.getByRole('button', { name: '✗ Missed it' }).getAttribute('aria-pressed')).toBe('false');
  });
});
