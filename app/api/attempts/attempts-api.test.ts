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

import * as attemptsRoute from '@/app/api/attempts/route';
import * as studentClasses from '@/app/api/student/classes/route';

const USERS = {
  owner: { id: fakeUuid(), email: 'teacher@example.com', role: 'teacher' },
  stu: { id: fakeUuid(), email: 'sam@example.com', role: 'student' },
  stu2: { id: fakeUuid(), email: 'pat@example.com', role: 'student' },
  out: { id: fakeUuid(), email: 'out@example.com', role: 'student' },
};
type Token = keyof typeof USERS;

const SETS = { mc: fakeUuid(), privateFlash: fakeUuid(), legacy: fakeUuid() };
const CARDS = { c1: fakeUuid(), c2: fakeUuid(), p1: fakeUuid(), p2: fakeUuid(), l1: fakeUuid() };
const CLASSES = { x: fakeUuid(), y: fakeUuid() };
const ASSIGNMENTS = { xMc: fakeUuid(), yMc: fakeUuid(), xFlash: fakeUuid() };
let db: FakeDb;

beforeEach(() => {
  fake.current = createFakeSupabase({
    tables: {
      profiles: { unique: [['id']] },
      flashcard_sets: { unique: [['id']] },
      flashcards: { unique: [['id']] },
      classes: { unique: [['id']] },
      class_members: { unique: [['class_id', 'student_id']] },
      assignments: { unique: [['id'], ['class_id', 'set_id']] },
      attempts: { unique: [['id']], defaults: { completed_at: () => new Date().toISOString() } },
    },
    users: Object.fromEntries(Object.entries(USERS).map(([t, u]) => [t, { id: u.id, email: u.email }])),
  });
  db = fake.current.db;
  db.rows.profiles = Object.values(USERS).map((u) => ({ id: u.id, role: u.role, display_name: null }));
  db.rows.flashcard_sets = [
    { id: SETS.mc, user_id: USERS.owner.id, title: 'Networking', study_type: 'multiple_choice' },
    { id: SETS.privateFlash, user_id: USERS.owner.id, title: 'Owner notes', study_type: 'flashcard' },
    { id: SETS.legacy, user_id: null, title: 'Old set', study_type: 'flashcard' },
  ];
  db.rows.flashcards = [
    { id: CARDS.c1, set_id: SETS.mc, answer: 'Network', options: ['Physical', 'Network', 'Transport', 'Session'] },
    { id: CARDS.c2, set_id: SETS.mc, answer: 'TCP', options: ['UDP', 'TCP', 'HTTP', 'ARP'] },
    { id: CARDS.p1, set_id: SETS.privateFlash, answer: 'Stroma' },
    { id: CARDS.p2, set_id: SETS.privateFlash, answer: 'RuBisCO' },
    { id: CARDS.l1, set_id: SETS.legacy, answer: '1789' },
  ];
  db.rows.classes = [
    { id: CLASSES.x, teacher_id: USERS.owner.id, name: 'X' },
    { id: CLASSES.y, teacher_id: USERS.owner.id, name: 'Y' },
  ];
  db.rows.class_members = [
    { class_id: CLASSES.x, student_id: USERS.stu.id, joined_at: '2026-10-20T00:00:00Z' },
    { class_id: CLASSES.x, student_id: USERS.stu2.id, joined_at: '2026-10-20T00:00:00Z' },
    // Y has a member, just not stu.
    { class_id: CLASSES.y, student_id: USERS.stu2.id, joined_at: '2026-10-20T00:00:00Z' },
  ];
  db.rows.assignments = [
    { id: ASSIGNMENTS.xMc, class_id: CLASSES.x, set_id: SETS.mc, due_at: null, created_at: '2026-10-20T00:00:00Z' },
    { id: ASSIGNMENTS.yMc, class_id: CLASSES.y, set_id: SETS.mc, due_at: null, created_at: '2026-10-20T00:00:00Z' },
  ];
});

function req(method: string, token?: Token, body?: unknown, query = '') {
  return new NextRequest(`http://localhost/api/attempts${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const json = async (res: Response) => ({ status: res.status, body: await res.json() });
const post = async (token: Token, body: Record<string, unknown>) => json(await attemptsRoute.POST(req('POST', token, body)));
const history = async (token: Token, setId: string) => json(await attemptsRoute.GET(req('GET', token, undefined, `?setId=${setId}`)));
const mcAnswers = [
  { cardId: CARDS.c1, chosen: 'network', correct: false },
  { cardId: CARDS.c2, chosen: 'UDP', correct: true },
];
const rowsFor = (token: Token) => db.rows.attempts.filter((a) => a.user_id === USERS[token].id);

describe('POST /api/attempts', () => {
  it('requires a session (401) and both ids (400)', async () => {
    expect((await attemptsRoute.POST(req('POST', undefined, { id: fakeUuid(), setId: SETS.mc, answers: mcAnswers }))).status).toBe(401);
    expect((await post('stu', { setId: SETS.mc, answers: mcAnswers })).status).toBe(400);
    expect((await post('stu', { id: fakeUuid(), setId: 'nope', answers: mcAnswers })).status).toBe(400);
  });

  it('scores on the server from the real cards, ignoring anything the browser claims', async () => {
    const res = await post('stu', { id: fakeUuid(), setId: SETS.mc, assignmentId: ASSIGNMENTS.xMc, answers: mcAnswers });
    expect(res.status).toBe(201);
    expect(res.body.attempt).toMatchObject({ setId: SETS.mc, assignmentId: ASSIGNMENTS.xMc, studyType: 'multiple_choice', score: 1, total: 2 });
    expect(rowsFor('stu')[0].answers).toEqual([
      { cardId: CARDS.c1, chosen: 'network', correct: true },
      { cardId: CARDS.c2, chosen: 'UDP', correct: false },
    ]);
  });

  it.each([
    ['no assignment id (private study)', undefined],
    ['an assignment in a class the student is not in', 'yMc'],
    ['an assignment for a different set', 'xFlash'],
    ['a malformed assignment id', 'not-a-uuid'],
  ] as const)('records %s as private', async (_label, key) => {
    if (key === 'xFlash') db.rows.assignments.push({ id: ASSIGNMENTS.xFlash, class_id: CLASSES.x, set_id: SETS.legacy, due_at: null, created_at: '2026-10-20T00:00:00Z' });
    const assignmentId = key === undefined ? undefined : key === 'not-a-uuid' ? key : ASSIGNMENTS[key];
    const res = await post('stu', { id: fakeUuid(), setId: SETS.mc, assignmentId, answers: mcAnswers });
    expect(res.status).toBe(201);
    expect(res.body.attempt.assignmentId).toBeNull();
  });

  it.each([
    ['an assigned set when not in the class', 'out' as Token, SETS.mc],
    ["the owner's private set", 'stu' as Token, SETS.privateFlash],
    ['a set that does not exist', 'stu' as Token, fakeUuid()],
  ])('will not record %s (404)', async (_label, token, setId) => {
    const res = await post(token, { id: fakeUuid(), setId, answers: [{ cardId: CARDS.p1, result: 'got' }] });
    expect(res).toEqual({ status: 404, body: { error: 'Study set not found.' } });
    expect(db.rows.attempts).toEqual([]);
  });

  it('records the owner studying their own set, and anyone studying a legacy set', async () => {
    const own = await post('owner', { id: fakeUuid(), setId: SETS.privateFlash, answers: [{ cardId: CARDS.p1, result: 'got' }, { cardId: CARDS.p2, result: 'missed' }] });
    expect(own.body.attempt).toMatchObject({ studyType: 'flashcard', score: 1, total: 2, assignmentId: null });
    const legacy = await post('out', { id: fakeUuid(), setId: SETS.legacy, answers: [{ cardId: CARDS.l1, result: null }] });
    expect(legacy.body.attempt).toMatchObject({ score: 0, total: 1 });
  });

  it('creates exactly one attempt when the same finish is sent twice', async () => {
    const id = fakeUuid();
    const first = await post('stu', { id, setId: SETS.mc, assignmentId: ASSIGNMENTS.xMc, answers: mcAnswers });
    const retry = await post('stu', { id, setId: SETS.mc, assignmentId: ASSIGNMENTS.xMc, answers: mcAnswers });
    expect([first.status, retry.status]).toEqual([201, 200]);
    expect(retry.body.attempt.id).toBe(id);
    expect(rowsFor('stu')).toHaveLength(1);
  });

  it("won't let someone reuse another user's attempt id (409)", async () => {
    const id = fakeUuid();
    await post('stu', { id, setId: SETS.legacy, answers: [{ cardId: CARDS.l1, result: 'got' }] });
    const res = await post('stu2', { id, setId: SETS.legacy, answers: [{ cardId: CARDS.l1, result: 'missed' }] });
    expect(res.status).toBe(409);
    expect(db.rows.attempts).toHaveLength(1);
    expect(db.rows.attempts[0].user_id).toBe(USERS.stu.id);
  });

  it('rejects answers that match no card in the set (409) and invalid answers (400)', async () => {
    expect((await post('stu', { id: fakeUuid(), setId: SETS.mc, answers: [{ cardId: fakeUuid(), chosen: 'x' }] })).status).toBe(409);
    expect((await post('stu', { id: fakeUuid(), setId: SETS.mc, answers: [{ cardId: CARDS.c1, chosen: 42 }] })).status).toBe(400);
    expect((await post('stu', { id: fakeUuid(), setId: SETS.mc, answers: [] })).status).toBe(400);
    expect(db.rows.attempts).toEqual([]);
  });

  it('turns database errors into a generic 500', async () => {
    db.failNext('flashcard_sets', 'select');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await post('stu', { id: fakeUuid(), setId: SETS.mc, answers: mcAnswers })).toEqual({
      status: 500,
      body: { error: 'Something went wrong. Please try again.' },
    });
    errorLog.mockRestore();
  });
});

describe('GET /api/attempts (my scores)', () => {
  it("returns only the caller's own attempts on that set, newest first", async () => {
    db.rows.attempts.push(
      { id: fakeUuid(), user_id: USERS.stu.id, set_id: SETS.mc, assignment_id: null, study_type: 'multiple_choice', score: 1, total: 2, completed_at: '2026-10-20T10:00:00Z' },
      { id: fakeUuid(), user_id: USERS.stu.id, set_id: SETS.mc, assignment_id: ASSIGNMENTS.xMc, study_type: 'multiple_choice', score: 2, total: 2, completed_at: '2026-10-21T10:00:00Z' },
      { id: fakeUuid(), user_id: USERS.stu2.id, set_id: SETS.mc, assignment_id: null, study_type: 'multiple_choice', score: 0, total: 2, completed_at: '2026-10-22T10:00:00Z' },
      { id: fakeUuid(), user_id: USERS.stu.id, set_id: SETS.legacy, assignment_id: null, study_type: 'flashcard', score: 1, total: 1, completed_at: '2026-10-22T11:00:00Z' }
    );
    const res = await history('stu', SETS.mc);
    expect(res.status).toBe(200);
    expect(res.body.attempts.map((a: { score: number; completedAt: string }) => [a.score, a.completedAt])).toEqual([
      [2, '2026-10-21T10:00:00Z'],
      [1, '2026-10-20T10:00:00Z'],
    ]);
  });

  it('requires a session (401) and a set id (400)', async () => {
    expect((await attemptsRoute.GET(req('GET', undefined, undefined, `?setId=${SETS.mc}`))).status).toBe(401);
    expect((await history('stu', 'nope')).status).toBe(400);
  });
});

describe('done / not done on My classes', () => {
  it("shows the student's best result per assignment, and null before they've done it", async () => {
    const list = async () => (await json(await studentClasses.GET(req('GET', 'stu')))).body.classes[0].assignments[0].myProgress;
    expect(await list()).toBeNull();
    await post('stu', { id: fakeUuid(), setId: SETS.mc, assignmentId: ASSIGNMENTS.xMc, answers: mcAnswers });
    await post('stu', { id: fakeUuid(), setId: SETS.mc, assignmentId: ASSIGNMENTS.xMc, answers: [{ cardId: CARDS.c1, chosen: 'Network' }, { cardId: CARDS.c2, chosen: 'TCP' }] });
    // A private attempt doesn't count toward the assignment.
    await post('stu', { id: fakeUuid(), setId: SETS.mc, answers: mcAnswers });
    expect(await list()).toMatchObject({ attempts: 2, bestScore: 2, bestTotal: 2 });
    // Another student's progress is their own.
    expect((await json(await studentClasses.GET(req('GET', 'stu2')))).body.classes[0].assignments[0].myProgress).toBeNull();
  });
});

describe('typed answers (#66)', () => {
  it('checks typed answers on the server and records how the set was studied', async () => {
    const res = await post('owner', {
      id: fakeUuid(),
      setId: SETS.privateFlash,
      mode: 'type',
      score: 2,
      answers: [
        { cardId: CARDS.p1, typed: 'stroma', correct: false },
        { cardId: CARDS.p2, typed: 'Chlorophyll', correct: true },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.attempt).toMatchObject({ studyType: 'flashcard', mode: 'type', score: 1, total: 2 });
    expect(rowsFor('owner')[0]).toMatchObject({
      mode: 'type',
      answers: [
        { cardId: CARDS.p1, typed: 'stroma', correct: true },
        { cardId: CARDS.p2, typed: 'Chlorophyll', correct: false },
      ],
    });
  });

  it('records flipped flashcards and multiple choice with no mode', async () => {
    await post('owner', { id: fakeUuid(), setId: SETS.privateFlash, answers: [{ cardId: CARDS.p1, result: 'got' }] });
    await post('owner', { id: fakeUuid(), setId: SETS.mc, mode: null, answers: mcAnswers });
    expect(rowsFor('owner').map((a) => a.mode)).toEqual([null, null]);
  });

  it.each([
    ['typing a multiple-choice set', SETS.mc, 'type'],
    ['an unknown way', SETS.privateFlash, 'guess'],
    ['"flip" spelled out (the normal way has no mode)', SETS.privateFlash, 'flip'],
  ])('refuses %s (400)', async (_label, setId, mode) => {
    const res = await post('owner', { id: fakeUuid(), setId, mode, answers: [{ cardId: CARDS.p1, typed: 'Stroma' }] });
    expect(res).toEqual({ status: 400, body: { error: "This set can't be studied that way." } });
    expect(db.rows.attempts).toEqual([]);
  });

  it('includes the mode in my recent scores', async () => {
    await post('owner', { id: fakeUuid(), setId: SETS.privateFlash, mode: 'type', answers: [{ cardId: CARDS.p1, typed: 'Stroma' }] });
    const res = await history('owner', SETS.privateFlash);
    expect(res.body.attempts.map((a: { mode: string | null; score: number }) => [a.mode, a.score])).toEqual([['type', 1]]);
  });
});
