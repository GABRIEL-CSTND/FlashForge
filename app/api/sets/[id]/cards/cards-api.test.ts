import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, fakeUuid, type FakeDb } from '@/test-utils/fake-supabase';

const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('@/test-utils/fake-supabase').createFakeSupabase> }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (t: string) => fake.current!.client.from(t),
    rpc: (n: string, a: Record<string, unknown>) => fake.current!.client.rpc(n, a),
    auth: { getUser: (token: string) => fake.current!.client.auth.getUser(token) },
  },
}));

import { PUT } from '@/app/api/sets/[id]/cards/route';
import { getOwnedSet } from '@/lib/sets';
import { supabaseAdmin } from '@/lib/supabase-admin';

const USERS = {
  owner: { id: fakeUuid(), email: 'owner@example.com', role: 'teacher' },
  other: { id: fakeUuid(), email: 'other@example.com', role: 'student' },
  adm: { id: fakeUuid(), email: 'admin@example.com', role: 'admin' },
};
type Token = keyof typeof USERS;
type Card = { id: string; set_id: string; question: string; answer: string; options: string[] | null; position: number };

const SETS = { flash: fakeUuid(), mc: fakeUuid(), legacy: fakeUuid(), others: fakeUuid() };
const CARDS = { a: fakeUuid(), b: fakeUuid(), c: fakeUuid(), m: fakeUuid(), o: fakeUuid(), l: fakeUuid() };
let db: FakeDb;

beforeEach(() => {
  fake.current = createFakeSupabase({
    tables: { profiles: { unique: [['id']] }, flashcard_sets: { unique: [['id']] }, flashcards: { unique: [['id']] } },
    users: Object.fromEntries(Object.entries(USERS).map(([t, u]) => [t, { id: u.id, email: u.email }])),
    rpc: {
      // Mirrors public.replace_set_cards() (checked against the live database
      // in supabase/tests/sets-editing-check.sql).
      replace_set_cards: ({ p_set_id, p_owner_id, p_cards }, d) => {
        const set = d.rows.flashcard_sets.find((s) => s.id === p_set_id && s.user_id === p_owner_id);
        if (!set) throw { code: 'P0002', message: 'set not found for this owner' };
        const cards = p_cards as { id?: string; question: string; answer: string; options: string[] | null }[];
        const own = (d.rows.flashcards as Card[]).filter((f) => f.set_id === p_set_id);
        if (cards.some((c) => c.id && !own.some((f) => f.id === c.id))) throw { code: '22023', message: 'card not in set' };
        const ids = cards.filter((c) => c.id).map((c) => c.id);
        if (new Set(ids).size !== ids.length) throw { code: '22023', message: 'card twice' };
        d.rows.flashcards = (d.rows.flashcards as Card[]).filter((f) => f.set_id !== p_set_id || ids.includes(f.id));
        cards.forEach((c, i) => {
          const values = { question: c.question, answer: c.answer, options: Array.isArray(c.options) ? c.options : null, position: i };
          if (c.id) Object.assign(d.rows.flashcards.find((f) => f.id === c.id)!, values);
          else d.rows.flashcards.push({ id: fakeUuid(), set_id: p_set_id, ...values });
        });
        return (d.rows.flashcards as Card[])
          .filter((f) => f.set_id === p_set_id)
          .sort((x, y) => x.position - y.position)
          .map(({ id, question, answer, options, position }) => ({ id, question, answer, options, position }));
      },
    },
  });
  db = fake.current.db;
  db.rows.profiles = Object.values(USERS).map((u) => ({ id: u.id, role: u.role }));
  db.rows.flashcard_sets = [
    { id: SETS.flash, user_id: USERS.owner.id, title: 'Bio', study_type: 'flashcard' },
    { id: SETS.mc, user_id: USERS.owner.id, title: 'Net', study_type: 'multiple_choice' },
    { id: SETS.legacy, user_id: null, title: 'Old', study_type: 'flashcard' },
    { id: SETS.others, user_id: USERS.other.id, title: 'Theirs', study_type: 'flashcard' },
  ];
  db.rows.flashcards = [
    { id: CARDS.a, set_id: SETS.flash, question: 'Qa', answer: 'Aa', options: null, position: 0 },
    { id: CARDS.b, set_id: SETS.flash, question: 'Qb', answer: 'Ab', options: null, position: 1 },
    { id: CARDS.c, set_id: SETS.flash, question: 'Qc', answer: 'Ac', options: null, position: 2 },
    { id: CARDS.m, set_id: SETS.mc, question: 'Which layer?', answer: 'Network', options: ['Physical', 'Network', 'Transport', 'Session'], position: 0 },
    { id: CARDS.o, set_id: SETS.others, question: 'Qo', answer: 'Ao', options: null, position: 0 },
    { id: CARDS.l, set_id: SETS.legacy, question: 'Ql', answer: 'Al', options: null, position: 0 },
  ];
});

async function put(setId: string, cards: unknown, token?: Token) {
  const req = new NextRequest(`http://localhost/api/sets/${setId}/cards`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ cards }),
  });
  const res = await PUT(req, { params: Promise.resolve({ id: setId }) });
  return { status: res.status, body: await res.json() };
}
const cardsOf = (setId: string) =>
  (db.rows.flashcards as Card[]).filter((f) => f.set_id === setId).sort((x, y) => x.position - y.position);

describe('PUT /api/sets/[id]/cards: who can save', () => {
  it('requires a session (401)', async () => {
    expect((await put(SETS.flash, [{ question: 'Q', answer: 'A' }])).status).toBe(401);
  });

  it.each([
    ['someone else\'s set', SETS.others, 'owner'],
    ['a set the caller doesn\'t own, even as admin', SETS.flash, 'adm'],
    ['a legacy set with no owner', SETS.legacy, 'owner'],
    ['a set that doesn\'t exist', fakeUuid(), 'owner'],
    ['a malformed id', 'not-a-uuid', 'owner'],
  ] as const)('hides %s (404) and changes nothing', async (_label, setId, token) => {
    const before = JSON.stringify(db.rows.flashcards);
    const res = await put(setId, [{ question: 'Hijacked', answer: 'x' }], token);
    expect(res).toEqual({ status: 404, body: { error: 'Study set not found.' } });
    expect(JSON.stringify(db.rows.flashcards)).toBe(before);
  });

  it('getOwnedSet only returns the owner\'s own set', async () => {
    expect(await getOwnedSet(USERS.owner.id, SETS.flash, supabaseAdmin)).toEqual({ id: SETS.flash, studyType: 'flashcard' });
    expect(await getOwnedSet(USERS.other.id, SETS.flash, supabaseAdmin)).toBeNull();
    expect(await getOwnedSet(USERS.owner.id, SETS.legacy, supabaseAdmin)).toBeNull();
  });
});

describe('PUT /api/sets/[id]/cards: saving', () => {
  it('edits, reorders, deletes and adds cards in one save, keeping ids of kept cards', async () => {
    const res = await put(
      SETS.flash,
      [
        { id: CARDS.c, question: 'Qc', answer: 'Ac' },
        { id: CARDS.a, question: '  Qa edited ', answer: 'Aa edited' },
        { question: 'Brand new', answer: 'Card' },
      ],
      'owner'
    );
    expect(res.status).toBe(200);
    expect(res.body.cards.map((c: Card) => [c.question, c.position])).toEqual([
      ['Qc', 0],
      ['Qa edited', 1],
      ['Brand new', 2],
    ]);
    expect(res.body.cards[0].id).toBe(CARDS.c);
    expect(res.body.cards[1].id).toBe(CARDS.a);
    expect(cardsOf(SETS.flash).map((c) => c.id)).not.toContain(CARDS.b);
    expect(cardsOf(SETS.flash)).toHaveLength(3);
  });

  it('saves a multiple-choice card with the answer stored as the chosen option', async () => {
    const res = await put(
      SETS.mc,
      [{ id: CARDS.m, question: 'Which layer routes packets?', options: ['Physical', 'Network', 'Transport', 'Session'], answer: ' network ' }],
      'owner'
    );
    expect(res.status).toBe(200);
    expect(cardsOf(SETS.mc)[0]).toMatchObject({ answer: 'Network', options: ['Physical', 'Network', 'Transport', 'Session'] });
  });

  it.each([
    ['a multiple-choice card with no correct choice', SETS.mc, [{ question: 'Q', options: ['A', 'B', 'C', 'D'], answer: '' }], 'Card 1: pick the correct choice.', 0],
    ['a multiple-choice card with only 3 choices', SETS.mc, [{ question: 'Q', options: ['A', 'B', 'C'], answer: 'A' }], 'Card 1: a multiple-choice card needs exactly 4 choices.', 0],
    ['choices on a flashcard', SETS.flash, [{ question: 'Q', answer: 'A', options: ['A', 'B', 'C', 'D'] }], "Card 1: flashcards don't have choices.", 0],
    ['an empty question on card 2', SETS.flash, [{ question: 'Q', answer: 'A' }, { question: ' ', answer: 'A' }], 'Card 2: write a question.', 1],
    ['an empty set', SETS.flash, [], 'A set needs at least one card. Delete the set instead if you no longer need it.', null],
  ])('rejects %s (400) and changes nothing', async (_label, setId, cards, error, cardIndex) => {
    const before = JSON.stringify(db.rows.flashcards);
    expect(await put(setId, cards, 'owner')).toEqual({ status: 400, body: { error, cardIndex } });
    expect(JSON.stringify(db.rows.flashcards)).toBe(before);
  });

  it('refuses a card that belongs to another set (409, out of date) and changes nothing', async () => {
    const before = JSON.stringify(db.rows.flashcards);
    const res = await put(SETS.flash, [{ id: CARDS.a, question: 'Qa', answer: 'Aa' }, { id: CARDS.o, question: 'stolen', answer: 'x' }], 'owner');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Reload the page/);
    expect(JSON.stringify(db.rows.flashcards)).toBe(before);
  });

  it('turns database errors into a generic 500', async () => {
    db.failNext('flashcard_sets', 'select');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await put(SETS.flash, [{ question: 'Q', answer: 'A' }], 'owner')).toEqual({
      status: 500,
      body: { error: 'Something went wrong. Please try again.' },
    });
    errorLog.mockRestore();
  });
});
