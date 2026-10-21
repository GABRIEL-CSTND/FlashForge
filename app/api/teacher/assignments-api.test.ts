import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import * as setAssignments from '@/app/api/teacher/sets/[id]/assignments/route';
import * as classAssignment from '@/app/api/teacher/classes/[id]/assignments/[assignmentId]/route';
import * as classRoute from '@/app/api/teacher/classes/[id]/route';
import * as studentClasses from '@/app/api/student/classes/route';
import { listStudentAssignments } from '@/lib/assignments';
import { supabaseAdmin } from '@/lib/supabase-admin';

const USERS = {
  t1: { id: fakeUuid(), email: 't1@example.com', role: 'teacher' },
  t2: { id: fakeUuid(), email: 't2@example.com', role: 'teacher' },
  stu: { id: fakeUuid(), email: 'sam@example.com', role: 'student' },
  out: { id: fakeUuid(), email: 'out@example.com', role: 'student' },
};
type Token = keyof typeof USERS;

const NOW = new Date('2026-10-21T12:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const SETS = { bio: fakeUuid(), net: fakeUuid(), theirs: fakeUuid() };
const CLASSES = { a: fakeUuid(), b: fakeUuid(), theirs: fakeUuid() };
let db: FakeDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  fake.current = createFakeSupabase({
    tables: {
      profiles: { unique: [['id']] },
      flashcard_sets: { unique: [['id']], cascade: [{ table: 'assignments', column: 'set_id' }] },
      classes: { unique: [['id'], ['join_code']], cascade: [{ table: 'assignments', column: 'class_id' }, { table: 'class_members', column: 'class_id' }] },
      class_members: { unique: [['class_id', 'student_id']] },
      assignments: {
        unique: [['id'], ['class_id', 'set_id']],
        defaults: { id: fakeUuid, created_at: () => new Date().toISOString(), due_at: () => null },
      },
    },
    users: Object.fromEntries(Object.entries(USERS).map(([t, u]) => [t, { id: u.id, email: u.email }])),
    rpc: { class_roster: () => [] },
  });
  db = fake.current.db;
  db.rows.profiles = Object.values(USERS).map((u) => ({ id: u.id, role: u.role, display_name: null }));
  db.rows.flashcard_sets = [
    { id: SETS.bio, user_id: USERS.t1.id, title: 'Photosynthesis', study_type: 'flashcard' },
    { id: SETS.net, user_id: USERS.t1.id, title: 'Networking', study_type: 'multiple_choice' },
    { id: SETS.theirs, user_id: USERS.t2.id, title: 'Not yours', study_type: 'flashcard' },
  ];
  db.rows.classes = [
    { id: CLASSES.a, teacher_id: USERS.t1.id, name: 'Bio 101', join_code: 'AAA222', created_at: '2026-10-20T00:00:00Z' },
    { id: CLASSES.b, teacher_id: USERS.t1.id, name: 'Bio 102', join_code: 'BBB333', created_at: '2026-10-21T00:00:00Z' },
    { id: CLASSES.theirs, teacher_id: USERS.t2.id, name: 'Chem', join_code: 'CCC444', created_at: '2026-10-21T00:00:00Z' },
  ];
  db.rows.class_members = [{ class_id: CLASSES.a, student_id: USERS.stu.id, joined_at: '2026-10-20T00:00:00Z' }];
});

afterEach(() => {
  vi.useRealTimers();
});

function req(method: string, token?: Token, body?: unknown) {
  return new NextRequest('http://localhost/api/x', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const json = async (res: Response) => ({ status: res.status, body: await res.json() });
const ctx = <P extends Record<string, string>>(p: P) => ({ params: Promise.resolve(p) });
const assign = async (token: Token, setId: string, body: unknown) => json(await setAssignments.POST(req('POST', token, body), ctx({ id: setId })));
const view = async (token: Token, setId: string) => json(await setAssignments.GET(req('GET', token), ctx({ id: setId })));
const rows = () => db.rows.assignments;

describe('assigning a set from its page', () => {
  it('shows the teacher\'s classes and which already have the set', async () => {
    db.rows.assignments.push({ id: fakeUuid(), class_id: CLASSES.a, set_id: SETS.bio, due_at: inDays(3), created_at: NOW.toISOString() });
    const res = await view('t1', SETS.bio);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Photosynthesis');
    expect(res.body.classes.map((c: { className: string; dueAt: string | null; assignmentId: string | null }) => [c.className, c.dueAt, c.assignmentId !== null])).toEqual([
      ['Bio 102', null, false],
      ['Bio 101', inDays(3), true],
    ]);
  });

  it('assigns to several classes at once with one due date', async () => {
    const res = await assign('t1', SETS.bio, { classIds: [CLASSES.a, CLASSES.b], dueAt: inDays(7) });
    expect(res).toEqual({ status: 201, body: { ok: true, assigned: [CLASSES.a, CLASSES.b], alreadyAssigned: [] } });
    expect(rows().map((r) => [r.class_id, r.due_at])).toEqual([
      [CLASSES.a, inDays(7)],
      [CLASSES.b, inDays(7)],
    ]);
  });

  it('leaves a class that already has the set as it is', async () => {
    await assign('t1', SETS.bio, { classIds: [CLASSES.a], dueAt: inDays(2) });
    const res = await assign('t1', SETS.bio, { classIds: [CLASSES.a, CLASSES.b], dueAt: null });
    expect(res.body).toEqual({ ok: true, assigned: [CLASSES.b], alreadyAssigned: [CLASSES.a] });
    expect(rows().find((r) => r.class_id === CLASSES.a)?.due_at).toBe(inDays(2));
  });

  it.each([
    ['no classes', { classIds: [] }, 'Pick at least one class.'],
    ['a malformed class id', { classIds: ['nope'] }, 'Pick at least one class.'],
    ['a due date in the past', { classIds: [CLASSES.a], dueAt: inDays(-1) }, 'That due date has already passed.'],
    ['a due date 3 years out', { classIds: [CLASSES.a], dueAt: inDays(3 * 366) }, 'Pick a due date within the next 2 years.'],
    ['an invalid due date', { classIds: [CLASSES.a], dueAt: 'tomorrow' }, 'Pick a valid due date.'],
  ])('rejects %s (400)', async (_label, body, error) => {
    expect(await assign('t1', SETS.bio, body)).toEqual({ status: 400, body: { error } });
    expect(rows()).toEqual([]);
  });

  it('only assigns the teacher\'s own sets (404)', async () => {
    expect((await assign('t1', SETS.theirs, { classIds: [CLASSES.a] })).body).toEqual({ error: 'Study set not found.' });
    expect((await view('t1', SETS.theirs)).status).toBe(404);
    expect(rows()).toEqual([]);
  });

  it('only assigns to the teacher\'s own classes, all or nothing (404)', async () => {
    const res = await assign('t1', SETS.bio, { classIds: [CLASSES.a, CLASSES.theirs] });
    expect(res).toEqual({ status: 404, body: { error: 'Class not found.' } });
    expect(rows()).toEqual([]);
  });

  it('is for teachers only', async () => {
    expect((await assign('stu', SETS.bio, { classIds: [CLASSES.a] })).status).toBe(403);
    expect((await setAssignments.GET(req('GET'), ctx({ id: SETS.bio }))).status).toBe(401);
  });
});

describe('managing assignments on the class page', () => {
  let bioAssignment: string;
  beforeEach(async () => {
    await assign('t1', SETS.bio, { classIds: [CLASSES.a], dueAt: inDays(5) });
    await assign('t1', SETS.net, { classIds: [CLASSES.a], dueAt: inDays(1) });
    bioAssignment = rows().find((r) => r.set_id === SETS.bio)!.id as string;
  });

  it('lists the class\'s assignments, soonest due first', async () => {
    const res = await json(await classRoute.GET(req('GET', 't1'), ctx({ id: CLASSES.a })));
    expect(res.body.class.assignments.map((a: { setTitle: string; dueAt: string }) => [a.setTitle, a.dueAt])).toEqual([
      ['Networking', inDays(1)],
      ['Photosynthesis', inDays(5)],
    ]);
  });

  it('changes or clears the due date', async () => {
    const path = ctx({ id: CLASSES.a, assignmentId: bioAssignment });
    expect(await json(await classAssignment.PATCH(req('PATCH', 't1', { dueAt: inDays(9) }), path))).toEqual({ status: 200, body: { dueAt: inDays(9) } });
    expect(await json(await classAssignment.PATCH(req('PATCH', 't1', { dueAt: null }), path))).toEqual({ status: 200, body: { dueAt: null } });
    expect(rows().find((r) => r.id === bioAssignment)?.due_at).toBeNull();
    expect((await classAssignment.PATCH(req('PATCH', 't1', { dueAt: inDays(-2) }), path)).status).toBe(400);
  });

  it('unassigns, so it disappears from the student\'s list', async () => {
    const before = await json(await studentClasses.GET(req('GET', 'stu')));
    expect(before.body.classes[0].assignments.map((a: { setTitle: string }) => a.setTitle)).toEqual(['Networking', 'Photosynthesis']);

    const res = await json(await classAssignment.DELETE(req('DELETE', 't1'), ctx({ id: CLASSES.a, assignmentId: bioAssignment })));
    expect(res).toEqual({ status: 200, body: { unassigned: true } });

    const after = await json(await studentClasses.GET(req('GET', 'stu')));
    expect(after.body.classes[0].assignments.map((a: { setTitle: string }) => a.setTitle)).toEqual(['Networking']);
  });

  it('won\'t touch another teacher\'s class or an assignment from another class (404)', async () => {
    const theirs = ctx({ id: CLASSES.theirs, assignmentId: bioAssignment });
    expect((await classAssignment.DELETE(req('DELETE', 't2'), ctx({ id: CLASSES.a, assignmentId: bioAssignment }))).status).toBe(404);
    expect((await classAssignment.DELETE(req('DELETE', 't1'), ctx({ id: CLASSES.b, assignmentId: bioAssignment }))).status).toBe(404);
    expect((await classAssignment.PATCH(req('PATCH', 't2', { dueAt: null }), theirs)).status).toBe(404);
    expect((await classAssignment.DELETE(req('DELETE', 't1'), ctx({ id: CLASSES.a, assignmentId: 'nope' }))).status).toBe(404);
    expect(rows()).toHaveLength(2);
  });
});

describe('what students see', () => {
  it('lists each class\'s assignments with titles and due dates, and nothing for classes they\'re not in', async () => {
    await assign('t1', SETS.bio, { classIds: [CLASSES.a, CLASSES.b], dueAt: inDays(2) });
    const res = await json(await studentClasses.GET(req('GET', 'stu')));
    expect(res.body.classes).toHaveLength(1);
    expect(res.body.classes[0].assignments).toEqual([
      { id: expect.any(String), setId: SETS.bio, setTitle: 'Photosynthesis', studyType: 'flashcard', dueAt: inDays(2), createdAt: NOW.toISOString() },
    ]);
    const outsider = await json(await studentClasses.GET(req('GET', 'out')));
    expect(outsider.body.classes).toEqual([]);
  });

  it("listStudentAssignments only returns the given student's classes' assignments", async () => {
    await assign('t1', SETS.bio, { classIds: [CLASSES.a] });
    expect((await listStudentAssignments(USERS.stu.id, supabaseAdmin)).map((x) => x.setTitle)).toEqual(['Photosynthesis']);
    expect(await listStudentAssignments(USERS.out.id, supabaseAdmin)).toEqual([]);
  });

  it('drops assignments when the teacher deletes the set', async () => {
    await assign('t1', SETS.bio, { classIds: [CLASSES.a] });
    db.rows.flashcard_sets = db.rows.flashcard_sets.filter((s) => s.id !== SETS.bio);
    db.rows.assignments = db.rows.assignments.filter((a) => a.set_id !== SETS.bio);
    expect((await json(await studentClasses.GET(req('GET', 'stu')))).body.classes[0].assignments).toEqual([]);
  });
});
