// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CardEditor, { type EditableCard, type SaveResult } from '@/components/CardEditor';

const FLASH: EditableCard[] = [
  { id: '00000000-0000-4000-8000-00000000000a', question: 'Pigment that absorbs light', answer: 'Chlorophyll', options: null },
  { id: '00000000-0000-4000-8000-00000000000b', question: 'Fluid around the thylakoids', answer: 'Stroma', options: null },
  { id: '00000000-0000-4000-8000-00000000000c', question: 'Enzyme for carbon fixation', answer: 'RuBisCO', options: null },
];
const MC: EditableCard[] = [
  { id: '00000000-0000-4000-8000-00000000000d', question: 'Which layer routes packets?', answer: 'Network', options: ['Physical', 'Network', 'Transport', 'Session'] },
];

const onSave = vi.fn<(cards: unknown) => Promise<SaveResult>>();
const onCancel = vi.fn();
const confirmMock = vi.fn(() => true);

beforeEach(() => {
  onSave.mockReset().mockResolvedValue({ ok: true });
  onCancel.mockReset();
  confirmMock.mockReset().mockReturnValue(true);
  vi.stubGlobal('confirm', confirmMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const card = (n: number) => screen.getByRole('listitem', { name: `Card ${n}` });
const questionOf = (n: number) => within(card(n)).getByLabelText('Question') as HTMLTextAreaElement;
const saveButton = () => screen.getByRole('button', { name: 'Save changes' });
const savedCards = () => onSave.mock.calls[0][0] as { id?: string; question: string; answer: string; options?: string[] }[];

describe('CardEditor: flashcards', () => {
  it('shows every card with its question and answer', () => {
    render(<CardEditor studyType="flashcard" cards={FLASH} onSave={onSave} onCancel={onCancel} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(questionOf(2).value).toBe('Fluid around the thylakoids');
    expect((within(card(2)).getByLabelText('Answer') as HTMLInputElement).value).toBe('Stroma');
    expect(saveButton().hasAttribute('disabled')).toBe(true);
  });

  it('saves edited, reordered, deleted and added cards in order, keeping ids', async () => {
    render(<CardEditor studyType="flashcard" cards={FLASH} onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(questionOf(1), { target: { value: 'Green pigment that absorbs light' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move Card 3 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Card 3' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add card' }));
    fireEvent.change(questionOf(3), { target: { value: 'Pores for gas exchange' } });
    fireEvent.change(within(card(3)).getByLabelText('Answer'), { target: { value: 'Stomata' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(savedCards()).toEqual([
      { id: '00000000-0000-4000-8000-00000000000a', question: 'Green pigment that absorbs light', answer: 'Chlorophyll' },
      { id: '00000000-0000-4000-8000-00000000000c', question: 'Enzyme for carbon fixation', answer: 'RuBisCO' },
      { question: 'Pores for gas exchange', answer: 'Stomata' },
    ]);
  });

  it('points at the card with a problem and does not save', async () => {
    render(<CardEditor studyType="flashcard" cards={FLASH} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add card' }));
    fireEvent.click(saveButton());
    expect(within(card(4)).getByRole('alert').textContent).toBe('Card 4: write a question.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps at least one card', () => {
    render(<CardEditor studyType="flashcard" cards={FLASH.slice(0, 1)} onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: 'Delete Card 1' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows the server\'s error on the right card', async () => {
    onSave.mockResolvedValue({ ok: false, error: 'Card 2: the answer is too long (up to 200 characters).', cardIndex: 1 });
    render(<CardEditor studyType="flashcard" cards={FLASH} onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(questionOf(1), { target: { value: 'changed' } });
    fireEvent.click(saveButton());
    expect((await within(card(2)).findByRole('alert')).textContent).toMatch(/answer is too long/);
  });

  it('shows errors that aren\'t about one card below the list', async () => {
    onSave.mockResolvedValue({ ok: false, error: 'This set changed since you opened it. Reload the page and try again.', cardIndex: null });
    render(<CardEditor studyType="flashcard" cards={FLASH} onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(questionOf(1), { target: { value: 'changed' } });
    fireEvent.click(saveButton());
    expect((await screen.findByRole('alert')).textContent).toMatch(/Reload the page/);
  });
});

describe('CardEditor: multiple choice', () => {
  it('shows the 4 choices with the correct one selected', () => {
    render(<CardEditor studyType="multiple_choice" cards={MC} onSave={onSave} onCancel={onCancel} />);
    expect((screen.getByLabelText('Card 1: choice 2 is correct') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Card 1: choice 4') as HTMLInputElement).value).toBe('Session');
  });

  it('saves the newly selected correct choice', async () => {
    render(<CardEditor studyType="multiple_choice" cards={MC} onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText('Card 1: choice 4'), { target: { value: 'Data link' } });
    fireEvent.click(screen.getByLabelText('Card 1: choice 4 is correct'));
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(savedCards()).toEqual([
      { id: '00000000-0000-4000-8000-00000000000d', question: 'Which layer routes packets?', options: ['Physical', 'Network', 'Transport', 'Data link'], answer: 'Data link' },
    ]);
  });

  it('needs a correct choice on a new card', () => {
    render(<CardEditor studyType="multiple_choice" cards={MC} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add card' }));
    fireEvent.change(questionOf(2), { target: { value: 'Which protocol is connectionless?' } });
    ['UDP', 'TCP', 'HTTP', 'FTP'].forEach((v, j) => fireEvent.change(screen.getByLabelText(`Card 2: choice ${j + 1}`), { target: { value: v } }));
    fireEvent.click(saveButton());
    expect(within(card(2)).getByRole('alert').textContent).toBe('Card 2: pick the correct choice.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects two identical choices', () => {
    render(<CardEditor studyType="multiple_choice" cards={MC} onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText('Card 1: choice 3'), { target: { value: 'network.' } });
    fireEvent.click(saveButton());
    expect(within(card(1)).getByRole('alert').textContent).toBe('Card 1: two choices are the same.');
  });

  it('asks for a correct choice when an old card\'s answer matches none of its choices', () => {
    const broken: EditableCard[] = [{ ...MC[0], answer: 'Application' }];
    render(<CardEditor studyType="multiple_choice" cards={broken} onSave={onSave} onCancel={onCancel} />);
    expect([1, 2, 3, 4].some((j) => (screen.getByLabelText(`Card 1: choice ${j} is correct`) as HTMLInputElement).checked)).toBe(false);
  });
});

describe('CardEditor: cancel', () => {
  it('leaves right away when nothing changed', () => {
    render(<CardEditor studyType="flashcard" cards={FLASH} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirmMock).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('asks before throwing away changes', () => {
    render(<CardEditor studyType="flashcard" cards={FLASH} onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(questionOf(1), { target: { value: 'changed' } });
    confirmMock.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirmMock).toHaveBeenCalledWith('Discard your changes to these cards?');
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('CardEditor: true or false (#68)', () => {
  const TF: EditableCard[] = [
    {
      id: '00000000-0000-4000-8000-00000000000e',
      question: 'Chloroplasts make most of the ATP.',
      answer: 'False',
      options: ['True', 'False'],
      explanation: 'Mitochondria do.',
    },
  ];
  const statementOf = (n: number) => within(card(n)).getByLabelText('Statement') as HTMLTextAreaElement;
  const explanationOf = (n: number) => within(card(n)).getByLabelText('Explanation (optional)') as HTMLTextAreaElement;
  const truth = (n: number, value: 'true' | 'false') =>
    within(card(n)).getByRole('radio', { name: `Card ${n} is ${value}` }) as HTMLInputElement;

  it('shows the statement, the answer and the explanation', () => {
    render(<CardEditor studyType="true_false" cards={TF} onSave={onSave} onCancel={onCancel} />);
    expect(statementOf(1).value).toBe('Chloroplasts make most of the ATP.');
    expect([truth(1, 'true').checked, truth(1, 'false').checked]).toEqual([false, true]);
    expect(explanationOf(1).value).toBe('Mitochondria do.');
  });

  it('saves a flipped answer, a cleared explanation and a new statement', async () => {
    render(<CardEditor studyType="true_false" cards={TF} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(truth(1, 'true'));
    fireEvent.change(explanationOf(1), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add card' }));
    fireEvent.change(statementOf(2), { target: { value: 'Plants give off oxygen.' } });
    fireEvent.click(truth(2, 'true'));
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(savedCards()).toEqual([
      { id: TF[0].id, question: 'Chloroplasts make most of the ATP.', answer: 'True', options: ['True', 'False'], explanation: '' },
      { question: 'Plants give off oxygen.', answer: 'True', options: ['True', 'False'], explanation: '' },
    ]);
  });

  it('needs True or False on a new statement', () => {
    render(<CardEditor studyType="true_false" cards={TF} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add card' }));
    fireEvent.change(statementOf(2), { target: { value: 'Plants give off oxygen.' } });
    fireEvent.click(saveButton());
    expect(within(card(2)).getByRole('alert').textContent).toBe('Card 2: pick True or False.');
    expect(onSave).not.toHaveBeenCalled();
  });
});
