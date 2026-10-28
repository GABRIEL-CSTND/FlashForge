import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, fakeUuid, type FakeDb } from '@/test-utils/fake-supabase';

const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('@/test-utils/fake-supabase').createFakeSupabase> }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (t: string) => fake.current!.client.from(t),
    auth: { getUser: (token: string) => fake.current!.client.auth.getUser(token) },
  },
}));

import { POST } from '@/app/api/save-set/route';

const SAM = { id: fakeUuid(), email: 'sam@example.com' };
let db: FakeDb;

beforeEach(() => {
  fake.current = createFakeSupabase({
    tables: {
      flashcard_sets: { unique: [['id']], defaults: { id: () => fakeUuid() } },
      flashcards: { unique: [['id']], defaults: { id: () => fakeUuid() } },
    },
    users: { sam: SAM },
  });
  db = fake.current.db;
});

async function save(body: Record<string, unknown>, token: string | null = 'sam') {
  const res = await POST(
    new NextRequest('http://localhost/api/save-set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, body: await res.json() };
}

const TF_ITEMS = [
  {
    question: 'Chloroplasts make most of the cell’s ATP.',
    answer: 'False',
    options: ['True', 'False'],
    explanation: 'Mitochondria make most of the ATP.',
  },
  { question: 'Plants make glucose in photosynthesis.', answer: 'true', options: ['True', 'False'] },
];

describe('POST /api/save-set', () => {
  it('requires sign-in', async () => {
    expect((await save({ title: 'Cells', studyType: 'flashcard', items: [{ question: 'Q', answer: 'A' }] }, null)).status).toBe(401);
    expect(db.rows.flashcard_sets ?? []).toEqual([]);
  });

  it('saves a true-or-false set with its explanations (#68)', async () => {
    const res = await save({ title: 'Cells', studyType: 'true_false', sourceFilename: 'cells.pdf', items: TF_ITEMS });
    expect(res.status).toBe(200);
    expect(db.rows.flashcard_sets).toEqual([
      expect.objectContaining({ id: res.body.id, title: 'Cells', study_type: 'true_false', user_id: SAM.id }),
    ]);
    expect(db.rows.flashcards.map(({ question, answer, options, explanation, position }) => ({ question, answer, options, explanation, position }))).toEqual([
      { question: TF_ITEMS[0].question, answer: 'False', options: ['True', 'False'], explanation: 'Mitochondria make most of the ATP.', position: 0 },
      { question: TF_ITEMS[1].question, answer: 'True', options: ['True', 'False'], explanation: null, position: 1 },
    ]);
  });

  it('saves flashcards and multiple choice as before', async () => {
    expect((await save({ title: 'A', studyType: 'flashcard', items: [{ question: 'Fluid in the chloroplast', answer: 'Stroma' }] })).status).toBe(200);
    expect(
      (await save({ title: 'B', studyType: 'multiple_choice', items: [{ question: 'Layer 3?', answer: 'Network', options: ['Physical', 'Network', 'Transport', 'Session'] }] })).status
    ).toBe(200);
    expect(db.rows.flashcards.map((c) => [c.answer, c.options])).toEqual([
      ['Stroma', null],
      ['Network', ['Physical', 'Network', 'Transport', 'Session']],
    ]);
  });

  it.each([
    ['an unknown study type', { studyType: 'essay', items: [{ question: 'Q', answer: 'A' }] }, 'Missing required fields'],
    ['a true-or-false answer that is neither', { studyType: 'true_false', items: [{ question: 'Q', answer: 'Maybe' }] }, 'Card 1: pick True or False.'],
    [
      'a multiple-choice card with 3 choices',
      { studyType: 'multiple_choice', items: [{ question: 'Q', answer: 'A', options: ['A', 'B', 'C'] }] },
      'Card 1: a multiple-choice card needs exactly 4 choices.',
    ],
    [
      'an explanation on a flashcard',
      { studyType: 'flashcard', items: [{ question: 'Q', answer: 'A', explanation: 'Why' }] },
      'Card 1: only true-or-false cards have an explanation.',
    ],
  ])('refuses %s and saves nothing (400)', async (_label, body, error) => {
    expect(await save({ title: 'Cells', ...body })).toEqual({ status: 400, body: { error } });
    expect(db.rows.flashcard_sets ?? []).toEqual([]);
    expect(db.rows.flashcards ?? []).toEqual([]);
  });

  it('removes the set again if its cards fail to save', async () => {
    db.failNext('flashcards', 'insert');
    expect((await save({ title: 'Cells', studyType: 'true_false', items: TF_ITEMS })).status).toBe(500);
    expect(db.rows.flashcard_sets).toEqual([]);
  });
});

describe('POST /api/save-set: where each card came from', () => {
  const quotes = () => db.rows.flashcards.map((c) => [c.source_excerpt, c.source_location]);

  it('saves the quote and where it is, and nothing for a card without one', async () => {
    const res = await save({
      title: 'Cells',
      studyType: 'flashcard',
      items: [
        { question: 'Q1', answer: 'A1', source: '  Ribosomes assemble proteins.  ', sourceLocation: 'Page 3' },
        { question: 'Q2', answer: 'A2' },
      ],
    });
    expect(res.status).toBe(200);
    expect(quotes()).toEqual([
      ['Ribosomes assemble proteins.', 'Page 3'],
      [null, null],
    ]);
  });

  it('pairs each quote with its own card by position', async () => {
    await save({
      title: 'Cells',
      studyType: 'flashcard',
      items: [
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: 'A2', source: 'The middle card’s sentence.', sourceLocation: 'Line 7' },
        { question: 'Q3', answer: 'A3' },
      ],
    });
    expect(db.rows.flashcards.map((c) => [c.answer, c.source_excerpt, c.source_location])).toEqual([
      ['A1', null, null],
      ['A2', 'The middle card’s sentence.', 'Line 7'],
      ['A3', null, null],
    ]);
  });

  it('keeps them to short plain text, or nothing', async () => {
    await save({
      title: 'Cells',
      studyType: 'flashcard',
      items: [
        { question: 'Q1', answer: 'A1', source: 'x'.repeat(5000), sourceLocation: 'y'.repeat(500) },
        { question: 'Q2', answer: 'A2', source: 42, sourceLocation: { page: 3 } },
        { question: 'Q3', answer: 'A3', source: '   ', sourceLocation: '' },
      ],
    });
    expect(db.rows.flashcards[0].source_excerpt).toHaveLength(600);
    expect(db.rows.flashcards[0].source_location).toHaveLength(40);
    expect(quotes().slice(1)).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it('saves them on a true-or-false set too', async () => {
    await save({
      title: 'Cells',
      studyType: 'true_false',
      items: [{ ...TF_ITEMS[0], source: 'Mitochondria make most of the ATP.', sourceLocation: 'Page 2' }],
    });
    expect(quotes()).toEqual([['Mitochondria make most of the ATP.', 'Page 2']]);
  });
});
