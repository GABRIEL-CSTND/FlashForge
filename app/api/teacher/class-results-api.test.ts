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

import * as resultsRoute from '@/app/api/teacher/classes/[id]/results/route';
import * as studentRoute from '@/app/api/teacher/classes/[id]/students/[studentId]/route';

const USERS = {
  t1: { id: fakeUuid(), email: 'teacher.one@example.com', role: 'teacher', name: 'Teacher One' },
  t2: { id: fakeUuid(), email: 'teacher.two@example.com', role: 'teacher', name: 'Teacher Two' },
  adm: { id: fakeUuid(), email: 'admin@example.com', role: 'admin', name: 'Admin' },
  cara: { id: fakeUuid(), email: 'cara@example.com', role: 'student', name: 'Cara Diaz' },
  ana: { id: fakeUuid(), email: 'ana@example.com', role: 'student', name: 'Ana Reyes' },
  ben: { id: fakeUuid(), email: 'ben@example.com', role: 'student', name: null },
  // Left class X after finishing an assignment.
  eve: { id: fakeUuid(), email: 'eve@example.com', role: 'student', name: 'Eve Left' },
  // Only in teacher two's class.
  dan: { id: fakeUuid(), email: 'dan@example.com', role: 'student', name: 'Dan Other' },
};
type Token = keyof typeof USERS;

const CLASSES = { x: fakeUuid(), z: fakeUuid(), y: fakeUuid() };
const SETS = { quiz: fakeUuid(), cards: fakeUuid(), other: fakeUuid() };
const ASSIGNMENTS = { xQuiz: fakeUuid(), xCards: fakeUuid(), zQuiz: fakeUuid(), yOther: fakeUuid() };
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-22T12:00:00.000Z');
const at = (days: number) => new Date(NOW + days * DAY).toISOString();
const DUE = at(-2);

let db: FakeDb;
let attemptRows: Record<string, unknown>[];
const attempt = (who: Token, assignmentId: string | null, setId: string, score: number, total: number, completedAt: string) => {
  const row = { id: fakeUuid(), user_id: USERS[who].id, set_id: setId, assignment_id: assignmentId, study_type: 'multiple_choice', score, total, answers: [], completed_at: completedAt };
  attemptRows.push(row);
  return row.id as string;
};

beforeEach(() => {
  fake.current = createFakeSupabase({
    tables: {
      profiles: { unique: [['id']] },
      classes: { unique: [['id']] },
      class_members: { unique: [['class_id', 'student_id']] },
      flashcard_sets: { unique: [['id']] },
      assignments: { unique: [['id'], ['class_id', 'set_id']] },
      attempts: { unique: [['id']] },
    },
    users: Object.fromEntries(Object.entries(USERS).map(([token, u]) => [token, { id: u.id, email: u.email }])),
    rpc: {
      // Mirrors public.class_roster(): only for the class's own teacher, by name.
      class_roster: ({ p_class_id, p_teacher_id }, d) => {
        const owned = d.rows.classes?.some((c) => c.id === p_class_id && c.teacher_id === p_teacher_id);
        if (!owned) return [];
        return (d.rows.class_members ?? [])
          .filter((m) => m.class_id === p_class_id)
          .map((m) => {
            const u = Object.values(USERS).find((x) => x.id === m.student_id)!;
            return { student_id: u.id, display_name: u.name, email: u.email, joined_at: m.joined_at };
          })
          .sort((a, b) => (a.display_name ?? a.email).toLowerCase().localeCompare((b.display_name ?? b.email).toLowerCase()));
      },
    },
  });
  db = fake.current.db;
  db.rows.profiles = Object.values(USERS).map((u) => ({ id: u.id, role: u.role, display_name: u.name }));
  db.rows.classes = [
    { id: CLASSES.x, teacher_id: USERS.t1.id, name: 'Biology X', join_code: 'XXXXX2', created_at: at(-30) },
    { id: CLASSES.z, teacher_id: USERS.t1.id, name: 'Biology Z', join_code: 'ZZZZZ2', created_at: at(-30) },
    { id: CLASSES.y, teacher_id: USERS.t2.id, name: 'Chemistry Y', join_code: 'YYYYY2', created_at: at(-30) },
  ];
  const member = (classId: string, who: Token) => ({ class_id: classId, student_id: USERS[who].id, joined_at: at(-20) });
  db.rows.class_members = [member(CLASSES.x, 'ana'), member(CLASSES.x, 'ben'), member(CLASSES.x, 'cara'), member(CLASSES.z, 'ana'), member(CLASSES.y, 'ana'), member(CLASSES.y, 'dan')];
  db.rows.flashcard_sets = [
    { id: SETS.quiz, user_id: USERS.t1.id, title: 'Cell parts quiz', study_type: 'multiple_choice' },
    { id: SETS.cards, user_id: USERS.t1.id, title: 'Photosynthesis', study_type: 'flashcard' },
    { id: SETS.other, user_id: USERS.t2.id, title: 'Atoms', study_type: 'multiple_choice' },
  ];
  db.rows.assignments = [
    { id: ASSIGNMENTS.xCards, class_id: CLASSES.x, set_id: SETS.cards, due_at: null, created_at: at(-10) },
    { id: ASSIGNMENTS.xQuiz, class_id: CLASSES.x, set_id: SETS.quiz, due_at: DUE, created_at: at(-10) },
    // The same quiz, assigned to the teacher's other class.
    { id: ASSIGNMENTS.zQuiz, class_id: CLASSES.z, set_id: SETS.quiz, due_at: null, created_at: at(-10) },
    { id: ASSIGNMENTS.yOther, class_id: CLASSES.y, set_id: SETS.other, due_at: null, created_at: at(-10) },
  ];
  attemptRows = db.rows.attempts;
  attempt('ana', ASSIGNMENTS.xQuiz, SETS.quiz, 6, 10, at(-3)); // on time
  attempt('ana', ASSIGNMENTS.xQuiz, SETS.quiz, 9, 10, at(-1)); // practising after the due date
  attempt('ben', ASSIGNMENTS.xQuiz, SETS.quiz, 5, 10, at(-1)); // first finish after the due date
  attempt('ana', ASSIGNMENTS.xCards, SETS.cards, 3, 5, at(-1));
  // None of these belong in class X's results:
  attempt('ana', null, SETS.quiz, 10, 10, at(-4)); // private study
  attempt('ana', ASSIGNMENTS.zQuiz, SETS.quiz, 10, 10, at(-4)); // same set, other class
  attempt('ana', ASSIGNMENTS.yOther, SETS.other, 1, 10, at(-4)); // another teacher's class
  attempt('eve', ASSIGNMENTS.xQuiz, SETS.quiz, 10, 10, at(-3)); // left the class since
});

function req(path: string, token?: Token) {
  return new NextRequest(`http://localhost${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}
const json = async (res: Response) => ({ status: res.status, body: await res.json() });
const results = async (token: Token | undefined, classId: string) =>
  json(await resultsRoute.GET(req(`/api/teacher/classes/${classId}/results`, token), { params: Promise.resolve({ id: classId }) }));
const studentResults = async (token: Token | undefined, classId: string, studentId: string) =>
  json(
    await studentRoute.GET(req(`/api/teacher/classes/${classId}/students/${studentId}`, token), {
      params: Promise.resolve({ id: classId, studentId }),
    })
  );

describe('GET /api/teacher/classes/[id]/results', () => {
  it('lists every current student × assignment, with not started as its own status', async () => {
    const res = await results('t1', CLASSES.x);
    expect(res.status).toBe(200);
    expect(res.body.class).toEqual({ id: CLASSES.x, name: 'Biology X' });
    // Due first, then no due date (same order as the class page).
    expect(res.body.assignments.map((a: { id: string }) => a.id)).toEqual([ASSIGNMENTS.xQuiz, ASSIGNMENTS.xCards]);
    // Alphabetical, and only students who are in the class now (not Eve).
    expect(res.body.students.map((s: { studentId: string }) => s.studentId)).toEqual([USERS.ana.id, USERS.ben.id, USERS.cara.id]);

    const [ana, ben, cara] = res.body.students;
    expect(ana).toMatchObject({ displayName: 'Ana Reyes', email: 'ana@example.com' });
    expect(ana.results[ASSIGNMENTS.xQuiz]).toEqual({
      status: 'done',
      attemptCount: 2,
      best: { score: 9, total: 10 },
      latest: { score: 9, total: 10, completedAt: at(-1) },
    });
    expect(ana.results[ASSIGNMENTS.xCards]).toMatchObject({ status: 'done', attemptCount: 1, best: { score: 3, total: 5 } });
    expect(ben.results[ASSIGNMENTS.xQuiz]).toMatchObject({ status: 'late', attemptCount: 1, best: { score: 5, total: 10 } });
    expect(cara.results[ASSIGNMENTS.xQuiz]).toEqual({ status: 'not-started', attemptCount: 0, best: null, latest: null });
    expect(cara.results[ASSIGNMENTS.xCards]).toEqual({ status: 'not-started', attemptCount: 0, best: null, latest: null });
  });

  it("averages each finisher's best score, leaving out students who haven't started", async () => {
    const res = await results('t1', CLASSES.x);
    const [quiz, cards] = res.body.assignments;
    // Ana 90% and Ben 50%; Cara hasn't started and Eve's 100% (she left) doesn't count.
    expect(quiz).toMatchObject({ setTitle: 'Cell parts quiz', dueAt: DUE, average: 70, doneCount: 2 });
    expect(cards).toMatchObject({ setTitle: 'Photosynthesis', dueAt: null, average: 60, doneCount: 1 });
  });

  it("keeps the same student's results in another class separate", async () => {
    const res = await results('t1', CLASSES.z);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0].results[ASSIGNMENTS.zQuiz]).toMatchObject({ attemptCount: 1, best: { score: 10, total: 10 } });
  });

  it('works for a class with no assignments or no students', async () => {
    db.rows.assignments = db.rows.assignments.filter((a) => a.class_id !== CLASSES.x);
    const empty = await results('t1', CLASSES.x);
    expect(empty.body.assignments).toEqual([]);
    expect(empty.body.students.map((s: { results: object }) => s.results)).toEqual([{}, {}, {}]);

    db.rows.class_members = [];
    const noStudents = await results('t1', CLASSES.z);
    expect(noStudents.body).toMatchObject({ students: [], assignments: [{ id: ASSIGNMENTS.zQuiz, average: null, doneCount: 0 }] });
  });

  it.each([
    ['not signed in', undefined, CLASSES.x, 401],
    ['a student', 'ana' as Token, CLASSES.x, 403],
    ["another teacher's class", 't2' as Token, CLASSES.x, 404],
    ["an admin, on a class that isn't theirs", 'adm' as Token, CLASSES.x, 404],
    ['a malformed class id', 't1' as Token, 'not-a-uuid', 404],
    ['a class that does not exist', 't1' as Token, fakeUuid(), 404],
  ])('refuses %s', async (_label, token, classId, status) => {
    const res = await results(token, classId);
    expect(res.status).toBe(status);
    expect(res.body.students).toBeUndefined();
  });

  it('turns database errors into a generic 500', async () => {
    db.failNext('attempts', 'select');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await results('t1', CLASSES.x)).toEqual({ status: 500, body: { error: 'Something went wrong. Please try again.' } });
    errorLog.mockRestore();
  });
});

describe('GET /api/teacher/classes/[id]/students/[studentId]', () => {
  it("lists one student's attempts on this class's assignments only, newest first", async () => {
    const res = await studentResults('t1', CLASSES.x, USERS.ana.id);
    expect(res.status).toBe(200);
    expect(res.body.student).toMatchObject({ studentId: USERS.ana.id, displayName: 'Ana Reyes', email: 'ana@example.com' });
    const [quiz, cards] = res.body.assignments;
    expect(quiz).toMatchObject({ id: ASSIGNMENTS.xQuiz, setTitle: 'Cell parts quiz', result: { status: 'done', attemptCount: 2 } });
    expect(quiz.attempts.map((t: { score: number; late: boolean; completedAt: string }) => [t.score, t.late, t.completedAt])).toEqual([
      [9, true, at(-1)],
      [6, false, at(-3)],
    ]);
    // Her private and other-class 10/10s aren't here.
    expect(cards.attempts.map((t: { score: number; total: number }) => `${t.score}/${t.total}`)).toEqual(['3/5']);
  });

  it('shows a student who has not started anything with empty attempt lists', async () => {
    const res = await studentResults('t1', CLASSES.x, USERS.cara.id);
    expect(res.body.assignments.map((a: { result: { status: string }; attempts: unknown[] }) => [a.result.status, a.attempts])).toEqual([
      ['not-started', []],
      ['not-started', []],
    ]);
  });

  it.each([
    ['a student who left the class', 't1' as Token, CLASSES.x, () => USERS.eve.id, 404, 'Student not found.'],
    ['a student in another class only', 't1' as Token, CLASSES.x, () => USERS.dan.id, 404, 'Student not found.'],
    ["another teacher's class", 't2' as Token, CLASSES.x, () => USERS.ana.id, 404, 'Class not found.'],
    ['a malformed student id', 't1' as Token, CLASSES.x, () => 'nope', 404, 'Student not found.'],
    ['a malformed class id', 't1' as Token, 'nope', () => USERS.ana.id, 404, 'Class not found.'],
    ['a student asking', 'ana' as Token, CLASSES.x, () => USERS.ana.id, 403, undefined],
  ])('refuses %s', async (_label, token, classId, studentId, status, error) => {
    const res = await studentResults(token, classId, studentId());
    expect(res.status).toBe(status);
    if (error) expect(res.body).toEqual({ error });
    expect(res.body.assignments).toBeUndefined();
  });
});
