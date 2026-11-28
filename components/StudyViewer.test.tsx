// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import StudyViewer, { type StudyResult } from '@/components/StudyViewer';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const MC_CARDS = [
  { id: 'c1', question: 'Layer 3?', answer: 'Network', options: ['Physical', 'Network', 'Transport'] },
  { id: 'c2', question: 'Reliable transport?', answer: 'TCP', options: ['UDP', 'TCP', 'ARP'] },
];
const FLASH_CARDS = [
  { id: 'f1', question: 'Fluid inside the chloroplast', answer: 'Stroma' },
  { id: 'f2', question: 'Enzyme that fixes CO2', answer: 'RuBisCO' },
  { id: 'f3', question: 'Pigment that absorbs light', answer: 'Chlorophyll' },
];
const SIX = [
  ...FLASH_CARDS,
  { id: 'f4', question: 'Stage that makes glucose', answer: 'Calvin cycle' },
  { id: 'f5', question: 'Gas given off', answer: 'Oxygen' },
  { id: 'f6', question: 'Organelle where it happens', answer: 'Chloroplast' },
];

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
// The card in the middle of the desk: the button that turns it over.
const flip = () => fireEvent.click(screen.getByRole('button', { name: /^Flip (the card|back)$/ }));
const piles = () => screen.getByRole('group', { name: 'Did you know it?' });
const sortTo = (name: 'Got it' | 'Missed it') => fireEvent.click(within(piles()).getByRole('button', { name }));
const pressKey = (button: string, key: 'ArrowLeft' | 'ArrowRight') => fireEvent.keyDown(screen.getByRole('button', { name: button }), { key });
// Match: clue and term slips, found by their words (a paired slip's name goes on
// to say what it is paired with).
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clue = (text: string) => within(screen.getByRole('list', { name: 'Clues' })).getByRole('button', { name: new RegExp(`^${escape(text)}`) });
const term = (text: string) => within(screen.getByRole('list', { name: 'Terms' })).getByRole('button', { name: new RegExp(`^${escape(text)}(\\.|$)`) });
const pair = (clueText: string, termText: string) => {
  fireEvent.click(clue(clueText));
  fireEvent.click(term(termText));
};

describe('multiple choice', () => {
  it('reports each pick once when the student finishes', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} onComplete={onComplete} />);
    click('Network');
    click('Next question →');
    click('UDP');
    click('See your score →');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      answers: [
        { cardId: 'c1', chosen: 'Network' },
        { cardId: 'c2', chosen: 'UDP' },
      ],
      correct: 1,
      total: 2,
    });
    expect(screen.getByText('Multiple choice · done')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('50% correct')).toBeTruthy();
  });

  it('shows the completion slot on the finish note, and reports again after Start over', () => {
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
    click('Next question →');
    click('TCP');
    click('See your score →');
    expect(screen.getByText('Saved!')).toBeTruthy();
    expect(screen.getByText('Every answer was right.')).toBeTruthy();

    click('Start over');
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
    click('Physical');
    click('Next question →');
    click('TCP');
    click('See your score →');
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

describe('quizzes on the desk', () => {
  const slips = () => within(screen.getByRole('group', { name: 'Answers' })).getAllByRole('button');

  it('keeps a forward-only quiz moving forward through its score', () => {
    const onComplete = vi.fn();
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} allowBack={false} onComplete={onComplete} />);
    click('Network');
    click('Next question →');
    expect(screen.getByText('Forward-only ·')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '← Previous' })).toBeNull();
    click('UDP');
    click('See your score →');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ correct: 1, total: 2 }));
    click('Start over');
    expect(screen.queryByRole('button', { name: '← Previous' })).toBeNull();
  });

  it('keeps both picks and their score when going back after seeing a correction', () => {
    const onComplete = vi.fn();
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} onComplete={onComplete} />);
    expect((screen.getByRole('button', { name: '← Previous' }) as HTMLButtonElement).disabled).toBe(true);
    click('Network');
    click('Next question →');
    click('UDP');
    expect(screen.getByRole('status').textContent).toContain('The answer is TCP.');

    click('← Previous');
    expect(screen.getByText('Reviewing question 1 of 2')).toBeTruthy();
    expect(screen.getByText('. Right 1, Wrong 0.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('✓ Correct');
    expect(slips().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);

    click('Resume quiz →');
    expect(screen.getByRole('status').textContent).toContain('The answer is TCP.');
    expect((screen.getByRole('button', { name: 'TCP' }) as HTMLButtonElement).disabled).toBe(true);
    click('See your score →');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({
      answers: [{ cardId: 'c1', chosen: 'Network' }, { cardId: 'c2', chosen: 'UDP' }],
      correct: 1,
      total: 2,
    });
  });

  it('reviews answers from the current practice round without reporting again', () => {
    const onComplete = vi.fn();
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} onComplete={onComplete} />);
    click('Physical');
    click('Next question →');
    click('UDP');
    click('See your score →');
    click('Try the wrong ones again');
    click('Network');
    click('Next question →');
    click('← Previous');
    expect(screen.getByRole('status').textContent).toBe('✓ Correct');
    click('Resume quiz →');
    click('TCP');
    click('See your score →');
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('resumes the last question on a double-click without submitting the quiz', () => {
    const onComplete = vi.fn();
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} onComplete={onComplete} />);
    click('Network');
    click('Next question →');
    click('UDP');
    click('← Previous');

    const resume = screen.getByRole('button', { name: 'Resume quiz →' });
    fireEvent.click(resume, { detail: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'See your score →' }), { detail: 2 });
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    click('See your score →');
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('lays the answers out as lettered slips, and shows the verdict once one is picked', () => {
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    expect(screen.getByRole('heading', { name: 'Networking' })).toBeTruthy();
    expect(screen.getByText('Multiple choice · 2 questions')).toBeTruthy();
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
    expect(slips().map((b) => b.textContent)).toEqual(['APhysical', 'BNetwork', 'CTransport']);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Next/ })).toBeNull();

    click('Physical');
    expect(screen.getByRole('status').textContent).toBe('✗ Not quite. The answer is Network.');
    expect(slips().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    // The right slip lifts, the wrong pick is struck through, the rest fade.
    expect(slips().map((b) => b.className.match(/is-(right|wrong|faded)/)?.[0])).toEqual(['is-wrong', 'is-right', 'is-faded']);
  });

  it('puts each answered question on the Right or Wrong pile', () => {
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    expect(screen.getByText('. Right 0, Wrong 0.')).toBeTruthy();
    click('Physical');
    click('Next question →');
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
    expect(screen.getByText('. Right 0, Wrong 1.')).toBeTruthy();
    click('TCP');
    expect(screen.getByRole('status').textContent).toBe('✓ Correct');
    click('See your score →');
    expect(screen.getByText('All done')).toBeTruthy();
    expect(screen.getByText('. Right 1, Wrong 1.')).toBeTruthy();
    expect(screen.getByText('The Wrong pile has one question to go over.')).toBeTruthy();
  });

  it('goes over the Wrong pile again for practice, without reporting it again', () => {
    const onComplete = vi.fn();
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} onComplete={onComplete} />);
    click('Physical');
    click('Next question →');
    click('TCP');
    click('See your score →');
    expect(onComplete).toHaveBeenCalledOnce();

    click('Try the wrong ones again');
    expect(screen.getByText('Question 1 of 1')).toBeTruthy();
    expect(screen.getByText('Layer 3?')).toBeTruthy();
    click('Network');
    click('See your score →');
    expect(screen.getByText('Practice round done')).toBeTruthy();
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByText('on the Right pile')).toBeTruthy();
    expect(screen.getByText('Every question is on the Right pile now.')).toBeTruthy();
    expect(screen.getByText('Your saved score is from the first time through.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try the wrong ones again' })).toBeNull();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('moves focus to Next once answered, then to the next question, then to the score', () => {
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    click('Network');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next question →' }));
    click('Next question →');
    expect(document.activeElement?.textContent).toBe('Reliable transport?');
    click('TCP');
    click('See your score →');
    expect(document.activeElement).toBe(screen.getByRole('region', { name: '2 / 2' }));
  });

  it('only lets screen readers reach the card in the middle', () => {
    const { container } = render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    const cards = [...container.querySelectorAll('.desk-card')];
    expect(cards).toHaveLength(2);
    expect(cards.filter((c) => c.getAttribute('aria-hidden') !== 'true')).toHaveLength(1);
  });

  it('shows the pencil only when the cards can be edited', () => {
    const onEdit = vi.fn();
    const first = render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} onEdit={onEdit} />);
    click('Edit cards');
    expect(onEdit).toHaveBeenCalledOnce();
    first.unmount();
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    expect(screen.queryByRole('button', { name: 'Edit cards' })).toBeNull();
  });
});

describe('flashcards on the desk', () => {
  it('shows the clue, and the term once the card is turned over', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(screen.getByRole('heading', { name: 'Photosynthesis' })).toBeTruthy();
    expect(screen.getByText('Card 1 of 3')).toBeTruthy();
    expect(screen.getByText('Fluid inside the chloroplast')).toBeTruthy();
    expect(screen.queryByText('Stroma')).toBeNull();
    flip();
    expect(screen.getByText('Stroma')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Flip back' })).toBeTruthy();
  });

  it('only lets screen readers reach the card in the middle', () => {
    const { container } = render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    const cards = [...container.querySelectorAll('.desk-card')];
    expect(cards).toHaveLength(3);
    expect(cards.filter((c) => c.getAttribute('aria-hidden') !== 'true')).toHaveLength(1);
  });

  it('sorts each card onto a pile, by clicking it or with ← and →, and reports the marks at the end', () => {
    const results: StudyResult[] = [];
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} onComplete={(r) => results.push(r)} />);
    flip();
    sortTo('Got it');
    expect(screen.getByText('Card 2 of 3')).toBeTruthy();
    expect(screen.getByText('Enzyme that fixes CO2')).toBeTruthy();
    // A card can be sorted without turning it over, and from the keyboard.
    pressKey('Flip the card', 'ArrowLeft');
    expect(screen.getByText('Card 3 of 3')).toBeTruthy();
    expect(results).toEqual([]);
    pressKey('Got it', 'ArrowRight');

    expect(results).toEqual([
      {
        answers: [
          { cardId: 'f1', result: 'got' },
          { cardId: 'f2', result: 'missed' },
          { cardId: 'f3', result: 'got' },
        ],
        correct: 2,
        total: 3,
      },
    ]);
    expect(screen.getByText('Session done')).toBeTruthy();
    expect(screen.getByText('2 / 3')).toBeTruthy();
    expect(screen.getByText('in Got it')).toBeTruthy();
    expect(screen.getByText('Click the Missed it pile to go through that card again.')).toBeTruthy();
  });

  it('deals the Missed it pile again for practice, without reporting it again', () => {
    const onComplete = vi.fn();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} onComplete={onComplete} />);
    sortTo('Got it');
    sortTo('Missed it');
    sortTo('Missed it');
    expect(onComplete).toHaveBeenCalledOnce();
    expect((within(piles()).getByRole('button', { name: 'Got it pile, 1 card' }) as HTMLButtonElement).disabled).toBe(true);

    click('Study the 2 missed cards again');
    expect(screen.getByText('Card 1 of 2')).toBeTruthy();
    expect(screen.getByText('Enzyme that fixes CO2')).toBeTruthy();
    sortTo('Got it');
    sortTo('Got it');
    expect(screen.getByText('Practice round done')).toBeTruthy();
    expect(screen.getByText('3 / 3')).toBeTruthy();
    expect(screen.getByText('Every card ended up in Got it.')).toBeTruthy();
    expect(screen.getByText('Your saved score is from the first time through.')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('starts the whole deck over with Review Again, and reports that run too', () => {
    const onComplete = vi.fn();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} onComplete={onComplete} />);
    for (let i = 0; i < 3; i++) sortTo('Got it');
    click('Review Again');
    expect(screen.getByText('Card 1 of 3')).toBeTruthy();
    expect(screen.getByText('Fluid inside the chloroplast')).toBeTruthy();
    for (let i = 0; i < 3; i++) sortTo('Missed it');
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete.mock.calls[1][0]).toMatchObject({ correct: 0, total: 3 });
  });

  it('shows the pencil only when the cards can be edited', () => {
    const onEdit = vi.fn();
    const first = render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} onEdit={onEdit} />);
    click('Edit cards');
    expect(onEdit).toHaveBeenCalledOnce();
    first.unmount();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(screen.queryByRole('button', { name: 'Edit cards' })).toBeNull();
  });

  it('says so when the set has no cards', () => {
    render(<StudyViewer title="Empty" studyType="flashcard" cards={[]} />);
    expect(screen.getByText('No items in this set.')).toBeTruthy();
  });
});

describe('type the answer (#66)', () => {
  const type = (text: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: text } });
  const modes = () =>
    within(screen.getByRole('group', { name: 'How do you want to study?' }))
      .getAllByRole('button')
      .map((b) => [b.textContent, b.getAttribute('aria-pressed')]);

  it('keeps both Flip and Type forward-only and preserves the Missed it keyboard shortcut', () => {
    const flipDesk = render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} allowBack={false} />);
    pressKey('Flip the card', 'ArrowLeft');
    expect(screen.getByText('Card 2 of 3')).toBeTruthy();
    expect(screen.getByText('. Got it 0, Missed it 1.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '← Previous' })).toBeNull();
    const typeMode = screen.getByRole('button', { name: 'Type' }) as HTMLButtonElement;
    expect(typeMode.disabled).toBe(true);
    fireEvent.click(typeMode);
    expect(screen.getByText('Card 2 of 3')).toBeTruthy();
    flipDesk.unmount();

    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} allowBack={false} />);
    click('Type');
    type('Stroma');
    click('Check');
    click('Next card →');
    expect(screen.getByText('Card 2 of 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '← Previous' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Flip' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reviews flipped cards without marking them again or losing the active side', () => {
    const onComplete = vi.fn();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} onComplete={onComplete} />);
    sortTo('Missed it');
    sortTo('Got it');
    flip();
    click('← Previous');
    expect(screen.getByText('Reviewing card 2 of 3')).toBeTruthy();
    click('← Previous');
    expect(screen.getByText('Reviewing card 1 of 3')).toBeTruthy();
    pressKey('Flip the card', 'ArrowRight');
    expect(screen.getByText('. Got it 1, Missed it 1.')).toBeTruthy();
    flip();
    expect(screen.getByText('Marked Missed it')).toBeTruthy();
    click('Next card →');
    click('Resume studying →');
    expect(screen.getByRole('button', { name: 'Flip back' })).toBeTruthy();
    sortTo('Got it');
    expect(onComplete.mock.calls[0][0].answers).toEqual([
      { cardId: 'f1', result: 'missed' }, { cardId: 'f2', result: 'got' }, { cardId: 'f3', result: 'got' },
    ]);
  });

  it('locks checked typed answers while reviewing and keeps the active draft', () => {
    const onComplete = vi.fn();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} onComplete={onComplete} />);
    click('Type');
    type('xylem');
    click('Check');
    click('Next card →');
    type('RuBisCO');
    click('← Previous');
    expect(screen.getByRole('status').textContent).toContain('The answer is Stroma.');
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).toBeNull();
    click('Resume studying →');
    expect((screen.getByRole('textbox', { name: 'Your answer' }) as HTMLInputElement).value).toBe('RuBisCO');
    click('Check');
    click('← Previous');
    click('Resume studying →');
    expect(screen.getByRole('status').textContent).toBe('✓ Correct');
    click('Next card →');
    type('Chlorophyll');
    click('Check');
    click('Finish');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({
      mode: 'type',
      answers: [{ cardId: 'f1', typed: 'xylem' }, { cardId: 'f2', typed: 'RuBisCO' }, { cardId: 'f3', typed: 'Chlorophyll' }],
      correct: 2,
      total: 3,
    });
  });

  it('lets flashcard sets be flipped, typed or matched, starting with Flip', () => {
    const first = render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(modes()).toEqual([
      ['Flip', 'true'],
      ['Type', 'false'],
      ['Match', 'false'],
    ]);
    first.unmount();
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    expect(screen.queryByRole('group', { name: 'How do you want to study?' })).toBeNull();
  });

  it('writes the answer on the card, checks it, then reports what was typed', () => {
    const results: StudyResult[] = [];
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} onComplete={(r) => results.push(r)} />);
    click('Type');
    expect(screen.getByText('Fluid inside the chloroplast')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Check' }) as HTMLButtonElement).disabled).toBe(true);

    type('stroma');
    click('Check');
    expect(screen.getByRole('status').textContent).toBe('✓ Correct');
    click('Next card →');

    type('rubisko');
    click('Check');
    expect(screen.getByRole('status').textContent).toBe("✓ Almost. It's spelled RuBisCO.");
    click('Next card →');

    click("I don't know");
    expect(screen.getByRole('status').textContent).toBe('The answer is Chlorophyll.');
    click('Finish');

    expect(results).toEqual([
      {
        mode: 'type',
        answers: [
          { cardId: 'f1', typed: 'stroma' },
          { cardId: 'f2', typed: 'rubisko' },
          { cardId: 'f3', typed: null },
        ],
        correct: 2,
        total: 3,
      },
    ]);
    expect(screen.getByText('2 / 3')).toBeTruthy();
    expect(screen.getByText('67% correct')).toBeTruthy();
    expect(screen.getByText('1 with a small typo')).toBeTruthy();
  });

  it('puts a wrong answer on the Missed it pile', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    click('Type');
    type('xylem');
    fireEvent.submit(screen.getByRole('textbox', { name: 'Your answer' }));
    expect(screen.getByRole('status').textContent).toBe('✗ Not quite. The answer is Stroma.');
    click('Next card →');
    expect(screen.getByText('Card 2 of 3')).toBeTruthy();
    expect(within(piles()).getByRole('button', { name: 'Missed it pile, 1 card' })).toBeTruthy();
  });

  it('starts over when switching how to study', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    sortTo('Got it');
    expect(screen.getByText('Card 2 of 3')).toBeTruthy();
    click('Type');
    expect(screen.getByText('Card 1 of 3')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toBeTruthy();
    expect(within(piles()).getByRole('button', { name: 'Got it pile, 0 cards' })).toBeTruthy();
    click('Flip');
    expect(within(piles()).getByRole('button', { name: 'Got it' })).toBeTruthy();
  });
});

describe('matching (#67)', () => {
  it('shows previous-card navigation only in the individual card modes', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    click('Match');
    expect(screen.queryByRole('button', { name: '← Previous' })).toBeNull();
  });

  it('plays round by round, checks each round on Submit Answers, and reports the term paired with each clue', () => {
    const results: StudyResult[] = [];
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SIX} onComplete={(r) => results.push(r)} />);
    click('Match');
    expect(screen.getByText('Round 1 of 2')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Clues' })).getAllByRole('button')).toHaveLength(3);

    pair('Fluid inside the chloroplast', 'Stroma');
    // Two clues paired the wrong way round: nothing says so yet (#119).
    pair('Enzyme that fixes CO2', 'Chlorophyll');
    pair('Pigment that absorbs light', 'RuBisCO');
    expect(screen.queryByText(/Not that one/)).toBeNull();
    click('Submit Answers');
    expect(screen.getByText(/You got 1 of 3 right/)).toBeTruthy();
    click('Next round →');

    expect(screen.getByText('Round 2 of 2')).toBeTruthy();
    pair('Stage that makes glucose', 'Calvin cycle');
    pair('Gas given off', 'Oxygen');
    pair('Organelle where it happens', 'Chloroplast');
    click('Submit Answers');
    click('See results →');

    expect(results).toEqual([
      {
        mode: 'match',
        answers: [
          { cardId: 'f1', chosen: 'Stroma' },
          { cardId: 'f2', chosen: 'Chlorophyll' },
          { cardId: 'f3', chosen: 'RuBisCO' },
          { cardId: 'f4', chosen: 'Calvin cycle' },
          { cardId: 'f5', chosen: 'Oxygen' },
          { cardId: 'f6', chosen: 'Chloroplast' },
        ],
        correct: 4,
        total: 6,
      },
    ]);
    expect(screen.getByText('4 / 6')).toBeTruthy();
    expect(screen.getByText('67% correct')).toBeTruthy();
    expect(within(piles()).getByRole('button', { name: 'Study the 2 missed cards again' })).toBeTruthy();
  });

  it('takes a term first, then its clue', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SIX} />);
    click('Match');
    fireEvent.click(term('RuBisCO'));
    expect(term('RuBisCO').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(clue('Enzyme that fixes CO2'));
    expect(term('RuBisCO').getAttribute('aria-pressed')).toBe('false');
    expect(clue('Enzyme that fixes CO2').textContent).toContain('RuBisCO');
    expect(clue('Enzyme that fixes CO2').getAttribute('aria-label')).toBe('Enzyme that fixes CO2. Paired with RuBisCO.');
  });

  it('never lists the terms in the same order as the clues', () => {
    // A shuffle that would keep the order is turned by one place.
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SIX} />);
    click('Match');
    expect(
      within(screen.getByRole('list', { name: 'Terms' }))
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['RuBisCO', 'Chlorophyll', 'Stroma']);
  });
});

describe('matching: pair first, check on submit (#119)', () => {
  const FIVE = SIX.slice(0, 5);
  const pairOf = (el: HTMLElement) => el.getAttribute('data-pair');
  const submitButton = () => screen.getByRole('button', { name: 'Submit Answers' }) as HTMLButtonElement;

  it('gives each pair its own colour, shared by the clue and the term', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FIVE} />);
    click('Match');
    expect(within(screen.getByRole('list', { name: 'Clues' })).getAllByRole('button')).toHaveLength(5);
    expect(pairOf(clue('Fluid inside the chloroplast'))).toBeNull();

    pair('Fluid inside the chloroplast', 'Stroma');
    pair('Enzyme that fixes CO2', 'Chlorophyll');
    pair('Pigment that absorbs light', 'RuBisCO');
    pair('Stage that makes glucose', 'Oxygen');
    pair('Gas given off', 'Calvin cycle');

    const colours = [
      ['Fluid inside the chloroplast', 'Stroma'],
      ['Enzyme that fixes CO2', 'Chlorophyll'],
      ['Pigment that absorbs light', 'RuBisCO'],
      ['Stage that makes glucose', 'Oxygen'],
      ['Gas given off', 'Calvin cycle'],
    ].map(([c, t]) => {
      expect(pairOf(clue(c))).toBe(pairOf(term(t)));
      expect(clue(c).className).toContain('slip-paired');
      expect(term(t).className).toContain(`pair-${pairOf(clue(c))}`);
      return pairOf(clue(c));
    });
    // Five pairs, five different colours from the palette.
    expect(new Set(colours).size).toBe(5);
    expect(colours.every((c) => ['blue', 'purple', 'teal', 'orange', 'pink'].includes(c ?? ''))).toBe(true);
    // Nothing is marked right or wrong before submitting.
    expect(document.querySelector('[data-verdict]')).toBeNull();
    expect(document.querySelector('.slip-wrong, .slip-right')).toBeNull();
  });

  it('lets a pair be taken apart or moved before submitting', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FIVE} />);
    click('Match');

    // Moving a term to another clue takes it away from the first.
    pair('Fluid inside the chloroplast', 'RuBisCO');
    expect(pairOf(term('RuBisCO'))).toBe(pairOf(clue('Fluid inside the chloroplast')));
    pair('Enzyme that fixes CO2', 'RuBisCO');
    expect(pairOf(clue('Fluid inside the chloroplast'))).toBeNull();
    expect(clue('Fluid inside the chloroplast').textContent).not.toContain('RuBisCO');
    expect(pairOf(term('RuBisCO'))).toBe(pairOf(clue('Enzyme that fixes CO2')));

    // Giving a paired clue another term frees its old one.
    pair('Fluid inside the chloroplast', 'Oxygen');
    fireEvent.click(clue('Fluid inside the chloroplast'));
    expect(pairOf(term('Oxygen'))).toBeNull();
    fireEvent.click(term('Stroma'));
    expect(clue('Fluid inside the chloroplast').textContent).toContain('Stroma');
    expect(pairOf(term('Stroma'))).toBe(pairOf(clue('Fluid inside the chloroplast')));
    expect(pairOf(term('Oxygen'))).toBeNull();

    // Picking a paired term, then putting it down, leaves both slips unpaired.
    fireEvent.click(term('Stroma'));
    expect(term('Stroma').getAttribute('aria-pressed')).toBe('true');
    expect(pairOf(clue('Fluid inside the chloroplast'))).toBeNull();
    fireEvent.click(term('Stroma'));
    expect(term('Stroma').getAttribute('aria-pressed')).toBe('false');
    expect(pairOf(term('Stroma'))).toBeNull();
    expect(screen.getByText('1 of 5 paired. Pick a paired card to change it.')).toBeTruthy();
  });

  it('keeps Submit Answers off until every clue has a term, then checks them all at once', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FIVE} onComplete={onComplete} />);
    click('Match');
    expect(submitButton().disabled).toBe(true);

    pair('Fluid inside the chloroplast', 'Stroma');
    pair('Enzyme that fixes CO2', 'RuBisCO');
    pair('Pigment that absorbs light', 'Chlorophyll');
    pair('Stage that makes glucose', 'Oxygen');
    expect(submitButton().disabled).toBe(true);
    click('Submit Answers');
    expect(screen.queryByText(/You got/)).toBeNull();
    pair('Gas given off', 'Calvin cycle');
    expect(submitButton().disabled).toBe(false);
    // Every slip is still on the desk and can still be changed.
    expect(within(screen.getByRole('list', { name: 'Terms' })).getAllByRole('button').every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();

    click('Submit Answers');
    expect(screen.getByText(/You got 3 of 5 right/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Submit Answers' })).toBeNull();

    // Right pairs in green with a check.
    for (const [c, t] of [
      ['Fluid inside the chloroplast', 'Stroma'],
      ['Enzyme that fixes CO2', 'RuBisCO'],
      ['Pigment that absorbs light', 'Chlorophyll'],
    ]) {
      expect(clue(c).getAttribute('data-verdict')).toBe('right');
      expect(clue(c).className).toContain('slip-right');
      expect(clue(c).getAttribute('aria-label')).toBe(`${c}. Right: you matched ${t}.`);
    }
    // Wrong pairs in red pencil, with the right term written in.
    const stage = clue('Stage that makes glucose');
    expect(stage.getAttribute('data-verdict')).toBe('wrong');
    expect(stage.className).toContain('slip-wrong');
    expect(stage.textContent).toContain('Answer: Calvin cycle');
    expect(stage.getAttribute('aria-label')).toBe('Stage that makes glucose. Wrong: you matched Oxygen. The answer is Calvin cycle.');
    expect(clue('Gas given off').textContent).toContain('Answer: Oxygen');
    expect(term('Oxygen').getAttribute('data-verdict')).toBe('wrong');
    expect(term('Stroma').getAttribute('data-verdict')).toBe('right');
    // Checked slips can't be changed any more.
    expect((clue('Gas given off') as HTMLButtonElement).disabled).toBe(true);
    expect((term('Stroma') as HTMLButtonElement).disabled).toBe(true);

    click('See results →');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      mode: 'match',
      answers: [
        { cardId: 'f1', chosen: 'Stroma' },
        { cardId: 'f2', chosen: 'RuBisCO' },
        { cardId: 'f3', chosen: 'Chlorophyll' },
        { cardId: 'f4', chosen: 'Oxygen' },
        { cardId: 'f5', chosen: 'Calvin cycle' },
      ],
      correct: 3,
      total: 5,
    });
    expect(screen.getByText('3 / 5')).toBeTruthy();
  });
});

describe('true or false (#68)', () => {
  const TF_CARDS = [
    { id: 't1', question: 'Chloroplasts make most of the cell’s ATP.', answer: 'False', options: ['True', 'False'], explanation: 'Mitochondria make most of the ATP.' },
    { id: 't2', question: 'Plants give off oxygen.', answer: 'True', options: ['True', 'False'], explanation: null },
  ];

  it('shows each statement with True and False, then the verdict and correction', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(<StudyViewer title="Cells" studyType="true_false" cards={TF_CARDS} onComplete={onComplete} />);
    expect(screen.queryByRole('group', { name: 'How do you want to study?' })).toBeNull();
    expect(screen.getByText('True or false')).toBeTruthy();
    expect(
      within(screen.getByRole('group', { name: 'Answers' }))
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['TTrue', 'FFalse']);
    expect(screen.queryByText('Mitochondria make most of the ATP.')).toBeNull();

    click('True');
    expect(screen.getByRole('status').textContent).toBe("✗ Not quite. It's false.");
    expect(screen.getByText('Mitochondria make most of the ATP.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'False' }) as HTMLButtonElement).disabled).toBe(true);
    click('Next statement →');

    click('True');
    expect(screen.getByRole('status').textContent).toBe('✓ Correct');
    click('See your score →');
    expect(onComplete).toHaveBeenCalledWith({
      answers: [
        { cardId: 't1', chosen: 'True' },
        { cardId: 't2', chosen: 'True' },
      ],
      correct: 1,
      total: 2,
    });
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('shows a set with an old study type as flashcards', () => {
    render(<StudyViewer title="Old" studyType={'identification' as 'flashcard'} cards={FLASH_CARDS} />);
    expect(screen.getByRole('button', { name: /^Flip the card$/ })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'How do you want to study?' })).toBeTruthy();
  });
});

describe('mixed quiz (#69)', () => {
  // Saved out of order on purpose: the quiz still goes Part I, II, III.
  const MIXED = [
    { id: 'm3', question: 'Organelle that makes ATP', answer: 'Mitochondria', options: null },
    { id: 'm2', question: 'Plants give off oxygen.', answer: 'True', options: ['True', 'False'], explanation: null },
    { id: 'm1', question: 'Layer 3?', answer: 'Network', options: ['Physical', 'Network', 'Transport', 'Session'] },
  ];

  it('reviews previous questions across parts and resumes a typed draft', () => {
    render(<StudyViewer title="Exam" studyType="mixed" cards={MIXED} />);
    click('Begin Part I →');
    click('Network');
    click('On to Part II →');
    click('Begin Part II →');
    click('False');
    click('On to Part III →');
    click('Begin Part III →');
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: 'mitoch' } });

    click('← Previous');
    expect(screen.getByText('Reviewing question 2 of 3')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe("✗ Not quite. It's true.");
    click('← Previous');
    expect(screen.getByText('Reviewing question 1 of 3')).toBeTruthy();
    click('Next question →');
    click('Resume quiz →');
    expect(screen.getByText('Question 3 of 3')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Your answer' }) as HTMLInputElement).value).toBe('mitoch');
  });

  it('opens each part with its own card, types Part III, and scores each part', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(<StudyViewer title="Exam" studyType="mixed" cards={MIXED} onComplete={onComplete} />);
    expect(screen.queryByRole('group', { name: 'How do you want to study?' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Part I' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Answers' })).toBeNull();
    click('Begin Part I →');
    expect(screen.getByText('Part I · Multiple choice')).toBeTruthy();
    click('Physical');
    click('On to Part II →');
    expect(screen.getByRole('heading', { name: 'Part II' })).toBeTruthy();
    click('Begin Part II →');
    expect(screen.getByText('Part II · True or false')).toBeTruthy();
    click('True');
    click('On to Part III →');
    click('Begin Part III →');
    expect(screen.getByText('Part III · Identification')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: 'mitochondria' } });
    click('Check');
    click('See your score →');

    expect(onComplete).toHaveBeenCalledWith({
      answers: [
        { cardId: 'm1', chosen: 'Physical' },
        { cardId: 'm2', chosen: 'True' },
        { cardId: 'm3', typed: 'mitochondria' },
      ],
      correct: 2,
      total: 3,
    });
    expect(screen.getByText('2 / 3')).toBeTruthy();
    expect(
      within(screen.getByRole('list', { name: 'Score by part' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['Part I · Multiple choice0 / 1', 'Part II · True or false1 / 1', 'Part III · Identification1 / 1']);
  });
});

describe('read aloud (#77)', () => {
  let spoken: string[];
  let cancels: number;

  beforeEach(() => {
    spoken = [];
    cancels = 0;
    vi.stubGlobal('speechSynthesis', {
      speak: (u: { text: string }) => spoken.push(u.text),
      cancel: () => {
        cancels += 1;
      },
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        rate = 1;
        constructor(text: string) {
          this.text = text;
        }
      }
    );
    localStorage.clear();
    // Each test starts with Read aloud off. (Cleared storage alone isn't enough:
    // the in-memory fallback for blocked storage would carry the last test's choice.)
    localStorage.setItem('flashforge_read_aloud', '0');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // One Read aloud switch (#117): on reads the card at once and each one after.
  const readAloud = () => click(/Read aloud/);
  const readAloudButton = () => screen.getByRole('button', { name: /Read aloud/ });
  const TF = [
    { id: 't1', question: 'Chloroplasts make most of the ATP', answer: 'False', options: ['True', 'False'], explanation: 'Mitochondria do.' },
  ];

  it('shows no read-aloud control where the browser cannot speak', () => {
    vi.unstubAllGlobals();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(screen.queryByRole('button', { name: /Read aloud/ })).toBeNull();
  });

  it('has one Read aloud switch and no separate Auto button', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(screen.getAllByRole('button', { name: /Read aloud/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Auto' })).toBeNull();
    expect(readAloudButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('reads the side of the flashcard that is showing', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    readAloud();
    expect(spoken).toEqual(['Fluid inside the chloroplast']);
    flip();
    expect(spoken.at(-1)).toBe('Stroma');
  });

  it('reads the question with its choices, then the answer once answered', () => {
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    readAloud();
    expect(spoken).toEqual(['Layer 3? Choices: Physical. Network. Transport.']);
    click('Transport');
    expect(spoken.at(-1)).toBe('Layer 3? Choices: Physical. Network. Transport. The answer is Network.');
  });

  it('reads a true-or-false statement, then the correction', () => {
    render(<StudyViewer title="Cells" studyType="true_false" cards={TF} />);
    readAloud();
    expect(spoken).toEqual(['True or false? Chloroplasts make most of the ATP.']);
    click('True');
    expect(spoken.at(-1)).toBe('True or false? Chloroplasts make most of the ATP. The answer is False. Mitochondria do.');
  });

  it("reads a matching round's clues", () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    click('Match');
    readAloud();
    expect(spoken.at(-1)).toBe(
      'Match each clue with its term. Clue 1. Fluid inside the chloroplast. Clue 2. Enzyme that fixes CO2. Clue 3. Pigment that absorbs light.'
    );
  });

  it('reads each card while it is on, stops when turned off, and remembers the choice', () => {
    const first = render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(spoken).toEqual([]);
    readAloud();
    expect(readAloudButton().getAttribute('aria-pressed')).toBe('true');
    expect(spoken).toEqual(['Fluid inside the chloroplast']);
    flip();
    expect(spoken.at(-1)).toBe('Stroma');
    sortTo('Got it');
    expect(spoken.at(-1)).toBe('Enzyme that fixes CO2');
    expect(localStorage.getItem('flashforge_read_aloud')).toBe('1');

    // Turning it off stops the reading, and the next card isn't read.
    const cancelsBefore = cancels;
    readAloud();
    expect(readAloudButton().getAttribute('aria-pressed')).toBe('false');
    expect(cancels).toBeGreaterThan(cancelsBefore);
    const spokenBefore = spoken.length;
    flip();
    sortTo('Got it');
    expect(spoken).toHaveLength(spokenBefore);
    expect(localStorage.getItem('flashforge_read_aloud')).toBe('0');

    readAloud();
    const cancelsOnUnmount = cancels;
    first.unmount();
    expect(cancels).toBeGreaterThan(cancelsOnUnmount);

    spoken = [];
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(spoken).toEqual(['Fluid inside the chloroplast']);
    expect(readAloudButton().getAttribute('aria-pressed')).toBe('true');
  });

  it("reads the card that opens each part of a mixed quiz", () => {
    render(<StudyViewer title="Exam" studyType="mixed" cards={[{ id: 'm1', question: 'Layer 3?', answer: 'Network', options: ['Physical', 'Network', 'Transport', 'Session'] }]} />);
    readAloud();
    expect(spoken).toEqual(['Part 1. Multiple choice. 1 question.']);
  });

  it('stops reading when the set is finished', () => {
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    readAloud();
    click('Network');
    click('Next question →');
    expect(spoken.at(-1)).toBe('Reliable transport? Choices: UDP. TCP. ARP.');
    click('TCP');
    const spokenBefore = spoken.length;
    const cancelsBefore = cancels;
    click('See your score →');
    expect(cancels).toBeGreaterThan(cancelsBefore);
    expect(spoken).toHaveLength(spokenBefore);
  });

  it('stops reading when the flashcard deck is finished', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    readAloud();
    sortTo('Got it');
    sortTo('Got it');
    const spokenBefore = spoken.length;
    const cancelsBefore = cancels;
    sortTo('Got it');
    expect(cancels).toBeGreaterThan(cancelsBefore);
    expect(spoken).toHaveLength(spokenBefore);
  });
});

describe('where a card came from', () => {
  const FROM = /From the document/;
  const SOURCED_FLASH = [
    { id: 'f1', question: 'Fluid inside the chloroplast', answer: 'Stroma', source: 'The stroma is the fluid inside the chloroplast.', sourceLocation: 'Page 4' },
    { id: 'f2', question: 'Enzyme that fixes CO2', answer: 'RuBisCO' },
    { id: 'f3', question: 'Pigment that absorbs light', answer: 'Chlorophyll', source: 'Chlorophyll is the pigment that absorbs light.' },
  ];
  const SOURCED_MC = [
    { id: 'c1', question: 'Layer 3?', answer: 'Network', options: ['Physical', 'Network', 'Transport'], source: 'Layer 3 is the network layer.', sourceLocation: 'Page 2' },
    { id: 'c2', question: 'Reliable transport?', answer: 'TCP', options: ['UDP', 'TCP', 'ARP'] },
  ];

  it('shows the quote and its page after a flashcard is flipped, not before', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SOURCED_FLASH} />);
    expect(screen.queryByText(FROM)).toBeNull();
    expect(screen.queryByText(/The stroma is the fluid/)).toBeNull();

    flip();
    expect(screen.getByText('From the document · Page 4')).toBeTruthy();
    expect(screen.getByText(/The stroma is the fluid inside the chloroplast\./)).toBeTruthy();
  });

  it('says where the quote is from when the page knows, e.g. a Wikipedia article', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SOURCED_FLASH} quoteLabel="From Wikipedia" />);
    flip();
    expect(screen.getByText('From Wikipedia · Page 4')).toBeTruthy();
  });

  it('shows nothing for a card that has no quote', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SOURCED_FLASH} />);
    flip();
    sortTo('Got it');
    expect(screen.getByText('Enzyme that fixes CO2')).toBeTruthy();
    flip();
    expect(screen.queryByText(FROM)).toBeNull();
  });

  it('leaves out the place when the quote has none', () => {
    render(
      <StudyViewer
        title="Photosynthesis"
        studyType="flashcard"
        cards={[SOURCED_FLASH[2], SOURCED_FLASH[1], SOURCED_FLASH[0]]}
      />
    );
    flip();
    expect(screen.getByText('From the document')).toBeTruthy();
    expect(screen.getByText(/Chlorophyll is the pigment that absorbs light\./)).toBeTruthy();
  });

  it('shows the quote after a choice is picked, not before', () => {
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={SOURCED_MC} />);
    expect(screen.queryByText(FROM)).toBeNull();
    click('Physical');
    expect(screen.getByText('From the document · Page 2')).toBeTruthy();
    expect(screen.getByText(/Layer 3 is the network layer\./)).toBeTruthy();
  });

  it('shows the quote after a typed answer is checked, not before', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SOURCED_FLASH} />);
    click('Type');
    expect(screen.queryByText(FROM)).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: 'Stroma' } });
    click('Check');
    expect(screen.getByText('From the document · Page 4')).toBeTruthy();
  });

  it('shows the quote under each clue once the round is checked', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={[...SOURCED_FLASH, ...SIX.slice(3)]} />);
    click('Match');
    expect(screen.queryByText(FROM)).toBeNull();
    pair('Fluid inside the chloroplast', 'Stroma');
    pair('Enzyme that fixes CO2', 'RuBisCO');
    pair('Pigment that absorbs light', 'Chlorophyll');
    // Pairing alone gives nothing away (#119).
    expect(screen.queryByText(FROM)).toBeNull();
    click('Submit Answers');
    expect(screen.getByText('From the document · Page 4')).toBeTruthy();
    expect(screen.getByText(/The stroma is the fluid inside the chloroplast\./)).toBeTruthy();
    expect(screen.getByText(/Chlorophyll is the pigment that absorbs light\./)).toBeTruthy();
    // The clue with no quote adds nothing: two of the three have one.
    expect(screen.getAllByText(FROM)).toHaveLength(2);
  });
});

describe('cards that arrive while studying', () => {
  it('a flashcard session takes new cards on, even after the first ones are all done', () => {
    const { rerender } = render(<StudyViewer title="Plants" studyType="flashcard" cards={FLASH_CARDS.slice(0, 2)} />);
    expect(screen.getByText('Card 1 of 2')).toBeTruthy();
    flip();
    sortTo('Got it');
    // The AI wrote a third card while the student was on the first.
    rerender(<StudyViewer title="Plants" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(screen.getByText('Card 2 of 3')).toBeTruthy();
    flip();
    sortTo('Missed it');
    // Up to the card that arrived: the session carries on rather than ending.
    expect(screen.getByText('Card 3 of 3')).toBeTruthy();
    expect(screen.getByText('Pigment that absorbs light')).toBeTruthy();
  });

  it('keeps going when cards arrive just after the last one was done', () => {
    const { rerender } = render(<StudyViewer title="Plants" studyType="flashcard" cards={FLASH_CARDS.slice(0, 1)} />);
    flip();
    sortTo('Got it');
    expect(screen.getByText('All done')).toBeTruthy();
    rerender(<StudyViewer title="Plants" studyType="flashcard" cards={FLASH_CARDS.slice(0, 2)} />);
    expect(screen.getByText('Card 2 of 2')).toBeTruthy();
  });

  it('a quiz takes new questions on too', () => {
    const { rerender } = render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS.slice(0, 1)} />);
    expect(screen.getByText('Question 1 of 1')).toBeTruthy();
    rerender(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    click('Network');
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
    click('Next question →');
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
  });
});
