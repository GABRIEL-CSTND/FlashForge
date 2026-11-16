import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }));

import { MAX_ANSWERS, parseAnswers, scoreAnswers } from '@/lib/attempts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('parseAnswers', () => {
  it('accepts multiple-choice picks, with null for skipped cards', () => {
    expect(parseAnswers([{ cardId: id(1), chosen: 'Network' }, { cardId: id(2) }], 'multiple_choice')).toEqual({
      ok: true,
      answers: [
        { cardId: id(1), chosen: 'Network' },
        { cardId: id(2), chosen: null },
      ],
    });
  });

  it('accepts flashcard marks, with null for unmarked cards', () => {
    expect(parseAnswers([{ cardId: id(1), result: 'got' }, { cardId: id(2), result: null }], 'flashcard')).toEqual({
      ok: true,
      answers: [
        { cardId: id(1), result: 'got' },
        { cardId: id(2), result: null },
      ],
    });
  });

  it.each([
    ['not a list', 'nope', 'multiple_choice'],
    ['an empty list', [], 'multiple_choice'],
    ['a bad card id', [{ cardId: 'x' }], 'multiple_choice'],
    ['a repeated card', [{ cardId: id(1) }, { cardId: id(1) }], 'multiple_choice'],
    ['a non-string choice', [{ cardId: id(1), chosen: 3 }], 'multiple_choice'],
    ['an unknown mark', [{ cardId: id(1), result: 'maybe' }], 'flashcard'],
    ['too many answers', Array.from({ length: MAX_ANSWERS + 1 }, (_, i) => ({ cardId: id(i + 1) })), 'multiple_choice'],
  ] as const)('rejects %s', (_label, raw, type) => {
    expect(parseAnswers(raw, type).ok).toBe(false);
  });
});

describe('scoreAnswers', () => {
  const cards = [
    { id: id(1), answer: 'Network' },
    { id: id(2), answer: 'Tennis Court Oath' },
    { id: id(3), answer: 'Stroma' },
  ];

  it('scores multiple choice from the real answers, ignoring case and trailing periods', () => {
    const result = scoreAnswers(
      [
        { cardId: id(1), chosen: 'network' },
        { cardId: id(2), chosen: 'Tennis court oath.' },
        { cardId: id(3), chosen: 'Thylakoid' },
      ],
      cards,
      'multiple_choice'
    );
    expect(result.score).toBe(2);
    expect(result.total).toBe(3);
    expect(result.stored.map((a) => a.correct)).toEqual([true, true, false]);
  });

  it('counts a skipped card as wrong', () => {
    expect(scoreAnswers([{ cardId: id(1), chosen: null }], cards, 'multiple_choice')).toMatchObject({ score: 0, total: 1 });
  });

  it('scores flashcards by "got it" marks', () => {
    const result = scoreAnswers(
      [
        { cardId: id(1), result: 'got' },
        { cardId: id(2), result: 'missed' },
        { cardId: id(3), result: null },
      ],
      cards,
      'flashcard'
    );
    expect(result).toMatchObject({ score: 1, total: 3 });
  });

  it('drops answers for cards that no longer exist', () => {
    const result = scoreAnswers(
      [
        { cardId: id(1), chosen: 'Network' },
        { cardId: id(99), chosen: 'Gone' },
      ],
      cards,
      'multiple_choice'
    );
    expect(result).toMatchObject({ score: 1, total: 1 });
    expect(result.stored.map((a) => a.cardId)).toEqual([id(1)]);
  });
});

describe('typed answers (#66)', () => {
  const cards = [
    { id: id(1), answer: 'Network' },
    { id: id(2), answer: 'Tennis Court Oath' },
    { id: id(3), answer: 'Stroma' },
  ];

  it('accepts typed answers, with null for "I don\'t know" or a blank answer', () => {
    expect(
      parseAnswers([{ cardId: id(1), typed: ' Stroma ' }, { cardId: id(2), typed: null }, { cardId: id(3), typed: '  ' }], 'flashcard', 'type')
    ).toEqual({
      ok: true,
      answers: [
        { cardId: id(1), typed: 'Stroma' },
        { cardId: id(2), typed: null },
        { cardId: id(3), typed: null },
      ],
    });
  });

  it('keeps only what was typed, not marks or picks', () => {
    expect(parseAnswers([{ cardId: id(1), typed: 'Stroma', result: 'got', chosen: 'Stroma' }], 'flashcard', 'type')).toEqual({
      ok: true,
      answers: [{ cardId: id(1), typed: 'Stroma' }],
    });
  });

  it.each([
    ['a number', 5],
    ['text over 200 characters', 'x'.repeat(201)],
  ])('rejects a typed answer that is %s', (_label, typed) => {
    expect(parseAnswers([{ cardId: id(1), typed }], 'flashcard', 'type').ok).toBe(false);
  });

  it('scores typed answers with the same check as the study screen, typos included', () => {
    const result = scoreAnswers(
      [
        { cardId: id(1), typed: 'network' },
        { cardId: id(2), typed: 'Tenis Court Oath' },
        { cardId: id(3), typed: 'Thylakoid' },
      ],
      cards,
      'flashcard',
      'type'
    );
    expect(result).toMatchObject({ score: 2, total: 3 });
    expect(result.stored).toEqual([
      { cardId: id(1), typed: 'network', correct: true },
      { cardId: id(2), typed: 'Tenis Court Oath', correct: true },
      { cardId: id(3), typed: 'Thylakoid', correct: false },
    ]);
  });

  it('counts "I don\'t know" as wrong', () => {
    expect(scoreAnswers([{ cardId: id(3), typed: null }], cards, 'flashcard', 'type')).toMatchObject({ score: 0, total: 1 });
  });
});

describe('matched answers (#67)', () => {
  const cards = [
    { id: id(1), answer: 'Stroma' },
    { id: id(2), answer: 'RuBisCO' },
  ];

  it('accepts the term picked for each clue', () => {
    expect(parseAnswers([{ cardId: id(1), chosen: 'RuBisCO', typed: 'x' }, { cardId: id(2) }], 'flashcard', 'match')).toEqual({
      ok: true,
      answers: [
        { cardId: id(1), chosen: 'RuBisCO' },
        { cardId: id(2), chosen: null },
      ],
    });
    expect(parseAnswers([{ cardId: id(1), chosen: 7 }], 'flashcard', 'match').ok).toBe(false);
  });

  it('scores a pick when it reads the same as the card\'s own answer', () => {
    const result = scoreAnswers(
      [
        { cardId: id(1), chosen: 'RuBisCO' },
        { cardId: id(2), chosen: 'rubisco' },
      ],
      cards,
      'flashcard',
      'match'
    );
    expect(result).toMatchObject({ score: 1, total: 2 });
    expect(result.stored.map((a) => a.correct)).toEqual([false, true]);
  });
});

describe('true or false (#68)', () => {
  const cards = [
    { id: id(1), answer: 'True' },
    { id: id(2), answer: 'False' },
  ];

  it('scores the True/False pick against the real answer', () => {
    const parsed = parseAnswers([{ cardId: id(1), chosen: 'True' }, { cardId: id(2), chosen: 'True', result: 'got' }], 'true_false');
    expect(parsed).toEqual({ ok: true, answers: [{ cardId: id(1), chosen: 'True' }, { cardId: id(2), chosen: 'True' }] });
    const result = scoreAnswers(parsed.ok ? parsed.answers : [], cards, 'true_false');
    expect(result).toMatchObject({ score: 1, total: 2 });
  });
});

describe('mixed quiz (#69)', () => {
  const cards = [
    { id: id(1), answer: 'Network', options: ['Physical', 'Network', 'Transport', 'Session'] },
    { id: id(2), answer: 'False', options: ['True', 'False'] },
    { id: id(3), answer: 'Mitochondria', options: null },
  ];

  it('scores picks and typed answers by each card\'s kind, keeping only what that kind uses', () => {
    const parsed = parseAnswers(
      [
        { cardId: id(1), chosen: 'Network', typed: 'Network' },
        { cardId: id(2), chosen: 'True' },
        { cardId: id(3), typed: ' mitochondira ', chosen: 'Mitochondria' },
      ],
      'mixed'
    );
    const result = scoreAnswers(parsed.ok ? parsed.answers : [], cards, 'mixed');
    expect(result.score).toBe(2);
    expect(result.stored).toEqual([
      { cardId: id(1), chosen: 'Network', correct: true },
      { cardId: id(2), chosen: 'True', correct: false },
      { cardId: id(3), typed: 'mitochondira', correct: true },
    ]);
  });

  it('rejects a typed answer that is too long', () => {
    expect(parseAnswers([{ cardId: id(3), typed: 'x'.repeat(201) }], 'mixed').ok).toBe(false);
  });
});
