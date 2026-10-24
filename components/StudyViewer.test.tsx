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

describe('type the answer (#66)', () => {
  const typeIn = (text: string) =>
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: text } });
  const modes = () =>
    within(screen.getByRole('group', { name: 'How do you want to study?' }))
      .getAllByRole('button')
      .map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? ' (on)' : ''}`);

  it('lets flashcard sets be flipped or typed, starting with Flip', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(modes()).toEqual(['Flip (on)', 'Type']);
    cleanup();
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    expect(screen.queryByRole('group', { name: 'How do you want to study?' })).toBeNull();
  });

  it('checks each typed answer, then reports what was typed', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} onComplete={onComplete} />);
    click('Type');
    expect(modes()).toEqual(['Flip', 'Type (on)']);
    expect(screen.getByText('Fluid inside the chloroplast')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next →' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Check' }) as HTMLButtonElement).disabled).toBe(true);

    typeIn('stroma');
    click('Check');
    expect(screen.getByRole('status').textContent).toBe('✓ Correct');
    click('Next →');

    typeIn('Rubisko');
    click('Check');
    expect(screen.getByRole('status').textContent).toBe('✓ Almost. It\'s spelled RuBisCO.');
    click('Next →');

    click("I don't know");
    expect(screen.getByRole('status').textContent).toBe('The answer is Chlorophyll.');
    click('Finish');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      mode: 'type',
      answers: [
        { cardId: 'f1', typed: 'stroma' },
        { cardId: 'f2', typed: 'Rubisko' },
        { cardId: 'f3', typed: null },
      ],
      correct: 2,
      total: 3,
    });
    expect(screen.getByText('2 / 3')).toBeTruthy();
    expect(screen.getByText('67% correct')).toBeTruthy();
    expect(screen.getByText('1 with a small typo')).toBeTruthy();
  });

  it('shows the right answer after a wrong one, and keeps it when going back', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    click('Type');
    typeIn('Thylakoid');
    fireEvent.submit(screen.getByRole('textbox', { name: 'Your answer' }));
    expect(screen.getByRole('status').textContent).toBe('✗ Not quite. The answer is Stroma.');
    click('Next →');
    click('← Prev');
    const box = screen.getByRole('textbox', { name: 'Your answer' }) as HTMLInputElement;
    expect([box.value, box.disabled]).toEqual(['Thylakoid', true]);
    expect(screen.getByRole('status').textContent).toBe('✗ Not quite. The answer is Stroma.');
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
  });

  it('starts over when switching how to study', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    flip();
    mark('✓ Got it');
    expect(screen.getByText('Card 2 of 3')).toBeTruthy();
    click('Type');
    expect(screen.getByText('Card 1 of 3')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toBeTruthy();
    click('Flip');
    flip();
    expect(screen.getByRole('button', { name: '✓ Got it' }).getAttribute('aria-pressed')).toBe('false');
  });
});
