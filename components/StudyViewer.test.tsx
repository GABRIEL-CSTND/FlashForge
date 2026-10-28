// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('lets flashcard sets be flipped, typed or matched, starting with Flip', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(modes()).toEqual(['Flip (on)', 'Type', 'Match']);
    cleanup();
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    expect(screen.queryByRole('group', { name: 'How do you want to study?' })).toBeNull();
  });

  it('checks each typed answer, then reports what was typed', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} onComplete={onComplete} />);
    click('Type');
    expect(modes()).toEqual(['Flip', 'Type (on)', 'Match']);
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

describe('matching (#67)', () => {
  const SIX_CARDS = [
    ...FLASH_CARDS,
    { id: 'f4', question: 'Stage that makes glucose', answer: 'Calvin cycle' },
    { id: 'f5', question: 'Gas given off', answer: 'Oxygen' },
    { id: 'f6', question: 'Organelle where it happens', answer: 'Chloroplast' },
  ];
  const termSelect = (clue: string) => screen.getByRole('combobox', { name: clue }) as HTMLSelectElement;
  // Terms are shuffled, so pick by name.
  const matchTerm = (clue: string, term: string) => {
    const option = within(termSelect(clue))
      .getAllByRole('option')
      .find((o) => o.textContent?.endsWith(`. ${term}`)) as HTMLOptionElement;
    fireEvent.change(termSelect(clue), { target: { value: option.value } });
  };
  const rows = () =>
    within(screen.getByRole('list', { name: 'Clues' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
  const disabled = (name: string) => (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;

  it('plays round by round and reports the term picked for each clue', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SIX_CARDS} onComplete={onComplete} />);
    click('Match');
    expect(screen.getByText('Round 1 of 2')).toBeTruthy();
    expect(
      within(screen.getByRole('list', { name: 'Terms' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent?.slice(3))
        .sort()
    ).toEqual(['Chlorophyll', 'RuBisCO', 'Stroma']);
    expect([disabled('Check answers'), disabled('Next round →')]).toEqual([true, true]);

    matchTerm('Fluid inside the chloroplast', 'Stroma');
    matchTerm('Enzyme that fixes CO2', 'Chlorophyll');
    expect(disabled('Check answers')).toBe(true);
    matchTerm('Pigment that absorbs light', 'RuBisCO');
    click('Check answers');
    expect(rows()).toEqual([
      'Fluid inside the chloroplast✓ Stroma',
      'Enzyme that fixes CO2✗ Chlorophyll · Answer: RuBisCO',
      'Pigment that absorbs light✗ RuBisCO · Answer: Chlorophyll',
    ]);
    expect(screen.queryByRole('combobox')).toBeNull();

    click('Next round →');
    expect(screen.getByText('Round 2 of 2')).toBeTruthy();
    matchTerm('Stage that makes glucose', 'Calvin cycle');
    matchTerm('Gas given off', 'Oxygen');
    matchTerm('Organelle where it happens', 'Chloroplast');
    click('Check answers');
    click('Finish');

    expect(onComplete).toHaveBeenCalledWith({
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
    });
    expect(screen.getByText('4 / 6')).toBeTruthy();
    expect(screen.getByText('67% correct')).toBeTruthy();
  });

  it('moves a term to the clue that picks it last', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    click('Match');
    matchTerm('Fluid inside the chloroplast', 'Stroma');
    matchTerm('Enzyme that fixes CO2', 'Stroma');
    expect(termSelect('Fluid inside the chloroplast').value).toBe('');
    expect(termSelect('Enzyme that fixes CO2').selectedOptions[0].textContent).toMatch(/Stroma$/);
  });

  it('never lists the terms in the same order as the clues', () => {
    // With this, the shuffle swaps nothing, so the order is rotated instead.
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    click('Match');
    expect(within(screen.getByRole('list', { name: 'Terms' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'A. RuBisCO',
      'B. Chlorophyll',
      'C. Stroma',
    ]);
    vi.restoreAllMocks();
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
    expect(screen.getByText('True or false?')).toBeTruthy();
    expect(screen.queryByText('Mitochondria make most of the ATP.')).toBeNull();

    click('True');
    expect(screen.getByRole('status').textContent).toBe("✗ Not quite. It's false.");
    expect(screen.getByText('Mitochondria make most of the ATP.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'False' }) as HTMLButtonElement).disabled).toBe(true);
    click('Next →');

    click('True');
    expect(screen.getByRole('status').textContent).toBe('✓ Correct');
    click('Finish');
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
    expect(screen.getByRole('button', { name: /Tap to flip/ })).toBeTruthy();
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

  it('goes part by part, with a typed Part III, and scores each part', () => {
    const onComplete = vi.fn<(r: StudyResult) => void>();
    render(<StudyViewer title="Exam" studyType="mixed" cards={MIXED} onComplete={onComplete} />);
    expect(screen.queryByRole('group', { name: 'How do you want to study?' })).toBeNull();
    expect(screen.getByText('Part I · Multiple choice')).toBeTruthy();
    click('Physical');
    click('Next →');
    expect(screen.getByText('Part II · True or false')).toBeTruthy();
    click('True');
    click('Next →');
    expect(screen.getByText('Part III · Identification')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: 'mitochondria' } });
    click('Check');
    click('Finish');

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

  const readAloud = () => click('🔊 Read aloud');
  const TF = [
    { id: 't1', question: 'Chloroplasts make most of the ATP', answer: 'False', options: ['True', 'False'], explanation: 'Mitochondria do.' },
  ];

  it('shows no read-aloud controls where the browser cannot speak', () => {
    vi.unstubAllGlobals();
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={FLASH_CARDS} />);
    expect(screen.queryByRole('button', { name: '🔊 Read aloud' })).toBeNull();
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
    mark('✓ Got it');
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

  it('stops reading when the set is finished', () => {
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={MC_CARDS} />);
    click('Auto');
    click('Network');
    click('Next →');
    expect(spoken.at(-1)).toBe('Reliable transport? Choices: UDP. TCP. ARP.');
    click('TCP');
    const spokenBefore = spoken.length;
    const cancelsBefore = cancels;
    click('Finish');
    expect(cancels).toBeGreaterThan(cancelsBefore);
    expect(spoken).toHaveLength(spokenBefore);
  });
});

describe('where a card came from', () => {
  const FROM = /From your document/;
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
    expect(screen.getByText('From your document · Page 4')).toBeTruthy();
    expect(screen.getByText(/The stroma is the fluid inside the chloroplast\./)).toBeTruthy();
  });

  it('shows nothing for a card that has no quote', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SOURCED_FLASH} />);
    flip();
    fireEvent.click(screen.getByRole('button', { name: /Got it/ }));
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
    expect(screen.getByText('From your document')).toBeTruthy();
    expect(screen.getByText(/Chlorophyll is the pigment that absorbs light\./)).toBeTruthy();
  });

  it('shows the quote after a choice is picked, not before', () => {
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={SOURCED_MC} />);
    expect(screen.queryByText(FROM)).toBeNull();
    click('Physical');
    expect(screen.getByText('From your document · Page 2')).toBeTruthy();
    expect(screen.getByText(/Layer 3 is the network layer\./)).toBeTruthy();
  });

  it('shows the quote after a typed answer is checked, not before', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SOURCED_FLASH} />);
    click('Type');
    expect(screen.queryByText(FROM)).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: 'Stroma' } });
    click('Check');
    expect(screen.getByText('From your document · Page 4')).toBeTruthy();
  });

  it('shows the quote for each clue once a matching round is checked', () => {
    const SIX = [
      ...SOURCED_FLASH,
      { id: 'f4', question: 'Stage that makes glucose', answer: 'Calvin cycle' },
      { id: 'f5', question: 'Gas given off', answer: 'Oxygen' },
      { id: 'f6', question: 'Organelle where it happens', answer: 'Chloroplast' },
    ];
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SIX} />);
    click('Match');
    // Terms are shuffled, so pick each by name.
    const matchTerm = (clue: string, term: string) => {
      const select = screen.getByRole('combobox', { name: clue }) as HTMLSelectElement;
      const option = within(select)
        .getAllByRole('option')
        .find((o) => o.textContent?.endsWith(`. ${term}`)) as HTMLOptionElement;
      fireEvent.change(select, { target: { value: option.value } });
    };
    matchTerm('Fluid inside the chloroplast', 'Stroma');
    matchTerm('Enzyme that fixes CO2', 'RuBisCO');
    matchTerm('Pigment that absorbs light', 'Chlorophyll');
    expect(screen.queryByText(FROM)).toBeNull();

    click('Check answers');
    expect(screen.getByText('From your document · Page 4')).toBeTruthy();
    expect(screen.getByText(/The stroma is the fluid inside the chloroplast\./)).toBeTruthy();
    expect(screen.getByText(/Chlorophyll is the pigment that absorbs light\./)).toBeTruthy();
    // The clue with no quote adds nothing: two of the three have one.
    expect(screen.getAllByText(FROM)).toHaveLength(2);
  });
});
