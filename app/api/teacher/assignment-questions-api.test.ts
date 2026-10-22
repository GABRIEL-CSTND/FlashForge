import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, fakeUuid, type FakeDb } from '@/test-utils/fake-supabase';

// Routes import the real service-role client; swap in the in-memory fake.
const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('@/test-utils/fake-supabase').createFakeSupabase> }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (t: string) => fake.current!.client.from(t),
    rpc: (n: string, a: Record<string, unknown>) => fake.current!.client.rpc(n, a),
    auth: { getUser: (token: string) => fake.current!.client.auth.getUser(token) },
  },
}));

import * as assignmentRoute from '@/app/api/teacher/classes/[id]/assignments/[assignmentId]/route';
import { questionStats } from '@/lib/class-results';

const USERS = {
  t1: { id: fakeUuid(), email: 'teacher.one@example.com', role: 'teacher', name: 'Teacher One' },
  t2: { id: fakeUuid(), email: 'teacher.two@example.com', role: 'teacher', name: 'Teacher Two' },
  ana: { id: fakeUuid(), email: 'ana@example.com', role: 'student', name: 'Ana Reyes' },
  ben: { id: fakeUuid(), email: 'ben@example.com', role: 'student', name: 'Ben Cruz' },
  cara: { id: fakeUuid(), email: 'cara@example.com', role: 'student', name: 'Cara Diaz' },
  // Left the class after answering.
  eve: { id: fakeUuid(), email: 'eve@example.com', role: 'student', name: 'Eve Left' },
};
type Token = keyof typeof USERS;

const CLASSES = { x: fakeUuid(), y: fakeUuid() };
const SET = fakeUuid();
const CARDS = { c1: fakeUuid(), c2: fakeUuid(), c3: fakeUuid(), added: fakeUuid(), gone: fakeUuid() };
const ASSIGNMENTS = { x: fakeUuid(), y: fakeUuid() };
let db: FakeDb;

const answer = (cardId: string, chosen: string | null, correct: boolean) => ({ cardId, chosen, correct });

beforeEach(() => {
  fake.current = createFakeSupabase({
    tables: {
      profiles: { unique: [['id']] },
      classes: { unique: [['id']] },
      class_members: { unique: [['class_id', 'student_id']] },
      flashcard_sets: { unique: [['id']] },
      flashcards: { unique: [['id']] },
      assignments: { unique: [['id']] },
      attempts: { unique: [['id']] },
    },
    users: Object.fromEntries(Object.entries(USERS).map(([token, u]) => [token, { id: u.id, email: u.email }])),
    rpc: {
      // Mirrors public.class_roster(): only for the class's own teacher.
      class_roster: ({ p_class_id, p_teacher_id }, d) => {
        const owned = d.rows.classes?.some((c) => c.id === p_class_id && c.teacher_id === p_teacher_id);
        if (!owned) return [];
        return (d.rows.class_members ?? [])
          .filter((m) => m.class_id === p_class_id)
          .map((m) => {
            const u = Object.values(USERS).find((x) => x.id === m.student_id)!;
            return { student_id: u.id, display_name: u.name, email: u.email, joined_at: '2026-10-01T00:00:00Z' };
          });
      },
    },
  });
  db = fake.current.db;
  db.rows.profiles = Object.values(USERS).map((u) => ({ id: u.id, role: u.role, display_name: u.name }));
  db.rows.classes = [
    { id: CLASSES.x, teacher_id: USERS.t1.id, name: 'Networking X', join_code: 'XXXXX2', created_at: '2026-10-01T00:00:00Z' },
    { id: CLASSES.y, teacher_id: USERS.t1.id, name: 'Networking Y', join_code: 'YYYYY2', created_at: '2026-10-01T00:00:00Z' },
  ];
  db.rows.class_members = ['ana', 'ben', 'cara'].map((who) => ({ class_id: CLASSES.x, student_id: USERS[who as Token].id }));
  db.rows.flashcard_sets = [{ id: SET, user_id: USERS.t1.id, title: 'Layers quiz', study_type: 'multiple_choice' }];
  db.rows.flashcards = [
    { id: CARDS.c1, set_id: SET, question: 'Reliable transport?', answer: 'TCP', position: 0 },
    { id: CARDS.c2, set_id: SET, question: 'Layer 3?', answer: 'Network', position: 1 },
    { id: CARDS.c3, set_id: SET, question: 'Resolves IP to MAC?', answer: 'ARP', position: 2 },
    // Added after everyone answered.
    { id: CARDS.added, set_id: SET, question: 'Layer 7?', answer: 'Application', position: 3 },
  ];
  db.rows.assignments = [
    { id: ASSIGNMENTS.x, class_id: CLASSES.x, set_id: SET, due_at: null, created_at: '2026-10-02T00:00:00Z' },
    { id: ASSIGNMENTS.y, class_id: CLASSES.y, set_id: SET, due_at: null, created_at: '2026-10-02T00:00:00Z' },
  ];
  const attempt = (who: Token, assignmentId: string | null, completedAt: string, answers: unknown[]) =>
    db.rows.attempts.push({ id: fakeUuid(), user_id: USERS[who].id, set_id: SET, assignment_id: assignmentId, completed_at: completedAt, answers });
  // Ana's first try doesn't count; her latest does.
  attempt('ana', ASSIGNMENTS.x, '2026-10-10T10:00:00Z', [answer(CARDS.c1, 'UDP', false), answer(CARDS.c2, 'Network', true)]);
  attempt('ana', ASSIGNMENTS.x, '2026-10-12T10:00:00Z', [
    answer(CARDS.c1, 'TCP', true),
    answer(CARDS.c2, 'Session', false),
    answer(CARDS.c3, null, false), // skipped
  ]);
  attempt('ben', ASSIGNMENTS.x, '2026-10-11T10:00:00Z', [
    answer(CARDS.c1, 'UDP', false),
    answer(CARDS.c2, 'Session', false),
    answer(CARDS.c3, 'ARP', true),
    answer(CARDS.gone, 'Whatever', false), // card deleted since
  ]);
  // None of these count:
  attempt('ana', null, '2026-10-13T10:00:00Z', [answer(CARDS.c2, 'Transport', false)]); // private study
  attempt('ben', ASSIGNMENTS.y, '2026-10-13T10:00:00Z', [answer(CARDS.c3, 'DNS', false)]); // the other class
  attempt('eve', ASSIGNMENTS.x, '2026-10-12T10:00:00Z', [answer(CARDS.c1, 'ARP', false)]); // left the class
});

const get = async (token: Token | undefined, classId: string, assignmentId: string) => {
  const req = new NextRequest(`http://localhost/api/teacher/classes/${classId}/assignments/${assignmentId}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const res = await assignmentRoute.GET(req, { params: Promise.resolve({ id: classId, assignmentId }) });
  return { status: res.status, body: await res.json() };
};

describe('GET /api/teacher/classes/[id]/assignments/[assignmentId] (most-missed questions)', () => {
  it("ranks the set's current cards by how many students got them wrong, using each student's latest attempt", async () => {
    const res = await get('t1', CLASSES.x, ASSIGNMENTS.x);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      class: { id: CLASSES.x, name: 'Networking X' },
      assignment: { id: ASSIGNMENTS.x, setTitle: 'Layers quiz' },
      studentCount: 3,
      studentsDone: 2,
    });
    expect(res.body.questions).toEqual([
      { cardId: CARDS.c2, question: 'Layer 3?', answer: 'Network', answered: 2, wrong: 2, percentWrong: 100, topWrongChoice: { choice: 'Session', count: 2 } },
      { cardId: CARDS.c1, question: 'Reliable transport?', answer: 'TCP', answered: 2, wrong: 1, percentWrong: 50, topWrongChoice: { choice: 'UDP', count: 1 } },
      // A skip counts as wrong but isn't a wrong choice.
      { cardId: CARDS.c3, question: 'Resolves IP to MAC?', answer: 'ARP', answered: 2, wrong: 1, percentWrong: 50, topWrongChoice: null },
      // Added since: listed last with no answers. The deleted card isn't listed.
      { cardId: CARDS.added, question: 'Layer 7?', answer: 'Application', answered: 0, wrong: 0, percentWrong: null, topWrongChoice: null },
    ]);
  });

  it('works before anyone has finished', async () => {
    db.rows.attempts = [];
    const res = await get('t1', CLASSES.x, ASSIGNMENTS.x);
    expect(res.body.studentsDone).toBe(0);
    expect(res.body.questions.map((q: { percentWrong: number | null }) => q.percentWrong)).toEqual([null, null, null, null]);
  });

  it.each([
    ['not signed in', undefined, CLASSES.x, ASSIGNMENTS.x, 401],
    ['a student', 'ana' as Token, CLASSES.x, ASSIGNMENTS.x, 403],
    ["another teacher's class", 't2' as Token, CLASSES.x, ASSIGNMENTS.x, 404],
    ["an assignment from the teacher's other class", 't1' as Token, CLASSES.x, ASSIGNMENTS.y, 404],
    ['a malformed id', 't1' as Token, CLASSES.x, 'nope', 404],
  ])('refuses %s', async (_label, token, classId, assignmentId, status) => {
    const res = await get(token, classId, assignmentId);
    expect(res.status).toBe(status);
    expect(res.body.questions).toBeUndefined();
  });
});

describe('questionStats', () => {
  it('breaks ties by the number wrong, then by card order', () => {
    const cards = ['a', 'b', 'c'].map((id) => ({ id, question: id, answer: id }));
    const stats = questionStats(cards, [
      [answer('a', 'x', false), answer('b', 'x', false), answer('c', 'y', false)],
      [answer('a', 'x', false), answer('b', 'b', true)],
    ]);
    expect(stats.map((s) => [s.cardId, s.percentWrong, s.wrong])).toEqual([
      ['a', 100, 2],
      ['c', 100, 1],
      ['b', 50, 1],
    ]);
  });
});
