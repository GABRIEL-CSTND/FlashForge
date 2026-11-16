// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
// Match: clue and term slips, found by their words.
const clue = (text: string) => within(screen.getByRole('list', { name: 'Clues' })).getByRole('button', { name: new RegExp(`^${text}`) });
const term = (text: string) => within(screen.getByRole('list', { name: 'Terms' })).getByRole('button', { name: text });
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
  it('plays round by round, and reports the first term picked for each clue', () => {
    vi.useFakeTimers();
    const results: StudyResult[] = [];
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SIX} onComplete={(r) => results.push(r)} />);
    click('Match');
    expect(screen.getByText('Round 1 of 2')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Clues' })).getAllByRole('button')).toHaveLength(3);

    pair('Fluid inside the chloroplast', 'Stroma');
    expect((clue('Fluid inside the chloroplast') as HTMLButtonElement).disabled).toBe(true);
    expect((term('Stroma') as HTMLButtonElement).disabled).toBe(true);
    // A wrong pick flashes, and that clue counts as missed even once it's matched.
    pair('Enzyme that fixes CO2', 'Chlorophyll');
    expect(screen.getByText('Not that one. Try another term.')).toBeTruthy();
    act(() => vi.advanceTimersByTime(800));
    pair('Enzyme that fixes CO2', 'RuBisCO');
    pair('Pigment that absorbs light', 'Chlorophyll');
    click('Next round →');

    expect(screen.getByText('Round 2 of 2')).toBeTruthy();
    pair('Stage that makes glucose', 'Calvin cycle');
    pair('Gas given off', 'Oxygen');
    pair('Organelle where it happens', 'Chloroplast');
    click('See results →');

    expect(results).toEqual([
      {
        mode: 'match',
        answers: [
          { cardId: 'f1', chosen: 'Stroma' },
          { cardId: 'f2', chosen: 'Chlorophyll' },
          { cardId: 'f3', chosen: 'Chlorophyll' },
          { cardId: 'f4', chosen: 'Calvin cycle' },
          { cardId: 'f5', chosen: 'Oxygen' },
          { cardId: 'f6', chosen: 'Chloroplast' },
        ],
        correct: 5,
        total: 6,
      },
    ]);
    expect(screen.getByText('5 / 6')).toBeTruthy();
    expect(screen.getByText('83% correct')).toBeTruthy();
    expect(within(piles()).getByRole('button', { name: 'Study the 1 missed card again' })).toBeTruthy();
  });

  it('takes a term first, then its clue', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SIX} />);
    click('Match');
    fireEvent.click(term('RuBisCO'));
    expect(term('RuBisCO').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(clue('Enzyme that fixes CO2'));
    expect((term('RuBisCO') as HTMLButtonElement).disabled).toBe(true);
    expect(clue('Enzyme that fixes CO2').textContent).toContain('RuBisCO');
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
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // "🔊 Read aloud" on the quiz screen, "Read aloud" among the desk's tools.
  const readAloud = () => click(/Read aloud/);
  const TF = [
    { id: 't1', question: 'Chloroplasts make most of the ATP', answer: 'False', options: ['True', 'False'], explanation: 'Mitochondria do.' },
  ];

  it('shows no read-aloud controls where the browser cannot speak', () => {
    vi.unstubAllGlobals();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(screen.queryByRole('button', { name: /Read aloud/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Auto' })).toBeNull();
  });

  it('reads the side of the flashcard that is showing', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    readAloud();
    expect(spoken).toEqual(['Fluid inside the chloroplast']);
    flip();
    readAloud();
    expect(spoken.at(-1)).toBe('Stroma');
  });

  it('reads the question with its choices, then the answer once answered', () => {
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    readAloud();
    expect(spoken).toEqual(['Layer 3? Choices: Physical. Network. Transport.']);
    click('Transport');
    readAloud();
    expect(spoken.at(-1)).toBe('Layer 3? Choices: Physical. Network. Transport. The answer is Network.');
  });

  it('reads a true-or-false statement, then the correction', () => {
    render(<StudyViewer title="Cells" studyType="true_false" cards={TF} />);
    readAloud();
    expect(spoken).toEqual(['True or false? Chloroplasts make most of the ATP.']);
    click('True');
    readAloud();
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

  it('reads each card by itself with Auto on, and remembers the choice', () => {
    const first = render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(spoken).toEqual([]);
    click('Auto');
    expect(screen.getByRole('button', { name: 'Auto' }).getAttribute('aria-pressed')).toBe('true');
    expect(spoken).toEqual(['Fluid inside the chloroplast']);
    flip();
    expect(spoken.at(-1)).toBe('Stroma');
    sortTo('Got it');
    expect(spoken.at(-1)).toBe('Enzyme that fixes CO2');
    expect(localStorage.getItem('flashforge_read_aloud')).toBe('1');

    const cancelsBefore = cancels;
    first.unmount();
    expect(cancels).toBeGreaterThan(cancelsBefore);

    spoken = [];
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(spoken).toEqual(['Fluid inside the chloroplast']);
    click('Auto');
    expect(localStorage.getItem('flashforge_read_aloud')).toBe('0');
  });

  it("reads the card that opens each part of a mixed quiz", () => {
    render(<StudyViewer title="Exam" studyType="mixed" cards={[{ id: 'm1', question: 'Layer 3?', answer: 'Network', options: ['Physical', 'Network', 'Transport', 'Session'] }]} />);
    readAloud();
    expect(spoken).toEqual(['Part 1. Multiple choice. 1 question.']);
  });

  it('stops reading when the set is finished', () => {
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    click('Auto');
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
    click('Auto');
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

  it('shows the quote under each clue once it is matched', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={[...SOURCED_FLASH, ...SIX.slice(3)]} />);
    click('Match');
    expect(screen.queryByText(FROM)).toBeNull();
    pair('Fluid inside the chloroplast', 'Stroma');
    expect(screen.getByText('From the document · Page 4')).toBeTruthy();
    expect(screen.getByText(/The stroma is the fluid inside the chloroplast\./)).toBeTruthy();
    pair('Enzyme that fixes CO2', 'RuBisCO');
    pair('Pigment that absorbs light', 'Chlorophyll');
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
