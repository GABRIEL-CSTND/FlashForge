import { describe, expect, it } from 'vitest';
import { CARD_LIMITS, normalizeChoice, validateCards } from '@/lib/card-rules';

const ID = '6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const mc = (over: Record<string, unknown> = {}) => ({
  question: 'Which layer routes packets?',
  options: ['Physical', 'Network', 'Transport', 'Session'],
  answer: 'Network',
  ...over,
});

const errorOf = (raw: unknown, type: 'flashcard' | 'multiple_choice') => {
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
        { id: ID, question: 'Q', answer: 'A', options: null },
        { id: null, question: 'New', answer: 'Card', options: null },
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
