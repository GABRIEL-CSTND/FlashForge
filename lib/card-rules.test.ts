import { describe, expect, it } from 'vitest';
import { CARD_LIMITS, isTrueFalseOptions, normalizeChoice, toTrueFalse, validateCards, type StudyType } from '@/lib/card-rules';

const ID = '6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const mc = (over: Record<string, unknown> = {}) => ({
  question: 'Which layer routes packets?',
  options: ['Physical', 'Network', 'Transport', 'Session'],
  answer: 'Network',
  ...over,
});

const errorOf = (raw: unknown, type: StudyType) => {
  const r = validateCards(raw, type);
  return r.ok ? null : { error: r.error, cardIndex: r.cardIndex };
};

describe('normalizeChoice', () => {
  it('ignores case, extra spaces and trailing periods', () => {
    expect(normalizeChoice('  Tennis   Court Oath. ')).toBe('tennis court oath');
    expect(normalizeChoice('RuBisCO...')).toBe('rubisco');
  });
});

describe('validateCards: the list', () => {
  it('needs a list of 1 to 50 cards', () => {
    expect(errorOf('nope', 'flashcard')?.error).toBe('Send the cards as a list.');
    expect(errorOf([], 'flashcard')?.error).toMatch(/at least one card/);
    const tooMany = Array.from({ length: CARD_LIMITS.maxCards + 1 }, () => ({ question: 'Q', answer: 'A' }));
    expect(errorOf(tooMany, 'flashcard')?.error).toBe('A set can have up to 50 cards.');
    expect(validateCards(tooMany.slice(1), 'flashcard').ok).toBe(true);
  });

  it('accepts ids only once, and only real ids', () => {
    expect(errorOf([{ id: 'abc', question: 'Q', answer: 'A' }], 'flashcard')).toEqual({ error: 'Card 1 has an invalid id.', cardIndex: 0 });
    const dup = [{ id: ID, question: 'Q', answer: 'A' }, { id: ID, question: 'Q2', answer: 'A2' }];
    expect(errorOf(dup, 'flashcard')).toEqual({ error: 'Card 2 appears twice.', cardIndex: 1 });
  });
});

describe('validateCards: flashcards', () => {
  it('trims text and keeps ids (null for new cards)', () => {
    const r = validateCards([{ id: ID, question: '  Q  ', answer: ' A ' }, { question: 'New', answer: 'Card' }], 'flashcard');
    expect(r).toEqual({
      ok: true,
      cards: [
        { id: ID, question: 'Q', answer: 'A', options: null, explanation: null },
        { id: null, question: 'New', answer: 'Card', options: null, explanation: null },
      ],
    });
  });

  it.each([
    [{ question: '   ', answer: 'A' }, 'Card 2: write a question.'],
    [{ question: 'Q', answer: '' }, 'Card 2: write an answer.'],
    [{ question: 'x'.repeat(501), answer: 'A' }, 'Card 2: the question is too long (up to 500 characters).'],
    [{ question: 'Q', answer: 'x'.repeat(201) }, 'Card 2: the answer is too long (up to 200 characters).'],
    [{ question: 'Q', answer: 'A', options: ['a', 'b', 'c', 'd'] }, "Card 2: flashcards don't have choices."],
    ['not a card', 'Card 2 is not valid.'],
  ])('points at the card with the problem: %j', (bad, message) => {
    expect(errorOf([{ question: 'Fine', answer: 'Fine' }, bad], 'flashcard')).toEqual({ error: message, cardIndex: 1 });
  });
});

describe('validateCards: multiple choice', () => {
  it('stores the answer as the matching choice\'s exact text', () => {
    const r = validateCards([mc({ answer: '  network. ' })], 'multiple_choice');
    expect(r.ok && r.cards[0]).toEqual({
      id: null,
      question: 'Which layer routes packets?',
      answer: 'Network',
      options: ['Physical', 'Network', 'Transport', 'Session'],
      explanation: null,
    });
  });

  it.each([
    [mc({ options: ['A', 'B', 'C'] }), 'Card 1: a multiple-choice card needs exactly 4 choices.'],
    [mc({ options: undefined }), 'Card 1: a multiple-choice card needs exactly 4 choices.'],
    [mc({ options: ['Physical', '  ', 'Transport', 'Session'] }), 'Card 1: fill in all 4 choices.'],
    [mc({ options: ['Physical', 'x'.repeat(201), 'Transport', 'Session'] }), 'Card 1: a choice is too long (up to 200 characters).'],
    [mc({ options: ['Network', 'network.', 'Transport', 'Session'] }), 'Card 1: two choices are the same.'],
    [mc({ answer: '' }), 'Card 1: pick the correct choice.'],
    [mc({ answer: 'Application' }), 'Card 1: pick the correct choice.'],
  ])('rejects %j', (bad, message) => {
    expect(errorOf([bad], 'multiple_choice')).toEqual({ error: message, cardIndex: 0 });
  });
});

describe('validateCards: true or false (#68)', () => {
  const tf = (over: Record<string, unknown> = {}) => ({
    question: 'Chloroplasts make most of the cell’s ATP.',
    answer: 'False',
    options: ['True', 'False'],
    explanation: 'Mitochondria make most of the ATP.',
    ...over,
  });

  it('stores True or False with both options, and the explanation if any', () => {
    const r = validateCards([tf({ answer: ' false ' }), tf({ answer: true, options: undefined, explanation: '  ' })], 'true_false');
    expect(r.ok && r.cards).toEqual([
      { id: null, question: 'Chloroplasts make most of the cell’s ATP.', answer: 'False', options: ['True', 'False'], explanation: 'Mitochondria make most of the ATP.' },
      { id: null, question: 'Chloroplasts make most of the cell’s ATP.', answer: 'True', options: ['True', 'False'], explanation: null },
    ]);
  });

  it.each([
    [tf({ question: ' ' }), 'Card 1: write a statement.'],
    [tf({ question: 'x'.repeat(501) }), 'Card 1: the statement is too long (up to 500 characters).'],
    [tf({ answer: '' }), 'Card 1: pick True or False.'],
    [tf({ answer: 'Maybe' }), 'Card 1: pick True or False.'],
    [tf({ options: ['Yes', 'No'] }), "Card 1: a true-or-false card's only choices are True and False."],
    [tf({ options: ['True', 'False', 'Maybe'] }), "Card 1: a true-or-false card's only choices are True and False."],
    [tf({ explanation: 'x'.repeat(301) }), 'Card 1: the explanation is too long (up to 300 characters).'],
  ])('rejects %j', (bad, message) => {
    expect(errorOf([bad], 'true_false')).toEqual({ error: message, cardIndex: 0 });
  });

  it('allows an explanation only on true-or-false cards', () => {
    expect(errorOf([{ question: 'Q', answer: 'A', explanation: 'Because' }], 'flashcard')?.error).toBe(
      'Card 1: only true-or-false cards have an explanation.'
    );
    expect(errorOf([mc({ explanation: 'Because' })], 'multiple_choice')?.error).toBe('Card 1: only true-or-false cards have an explanation.');
    expect(validateCards([{ question: 'Q', answer: 'A', explanation: '' }], 'flashcard').ok).toBe(true);
  });

  it('recognizes True and False', () => {
    expect(isTrueFalseOptions(['True', 'False'])).toBe(true);
    expect(isTrueFalseOptions([' true', 'FALSE '])).toBe(true);
    expect(isTrueFalseOptions(['False', 'True'])).toBe(false);
    expect(isTrueFalseOptions(null)).toBe(false);
    expect([toTrueFalse('TRUE'), toTrueFalse(false), toTrueFalse('yes'), toTrueFalse(1)]).toEqual(['True', 'False', null, null]);
  });
});

describe('validateCards: mixed quiz (#69)', () => {
  const identification = { question: 'Fluid inside the chloroplast', answer: 'Stroma' };
  const trueFalse = { question: 'Plants give off oxygen.', answer: 'True', options: ['True', 'False'], explanation: '' };

  it('checks each card by its own kind', () => {
    const r = validateCards([mc(), trueFalse, identification], 'mixed');
    expect(r.ok && r.cards.map((c) => [c.answer, c.options])).toEqual([
      ['Network', ['Physical', 'Network', 'Transport', 'Session']],
      ['True', ['True', 'False']],
      ['Stroma', null],
    ]);
  });

  it.each([
    [[mc({ options: ['A', 'B', 'C'] })], 'Card 1: a multiple-choice card needs exactly 4 choices.'],
    [[mc(), { ...trueFalse, answer: 'Maybe' }], 'Card 2: pick True or False.'],
    [[mc(), trueFalse, { ...identification, answer: '' }], 'Card 3: write an answer.'],
    [[{ ...identification, explanation: 'Why' }], 'Card 1: only true-or-false cards have an explanation.'],
  ])('rejects %j', (cards, message) => {
    expect(errorOf(cards, 'mixed')?.error).toBe(message);
  });
});
