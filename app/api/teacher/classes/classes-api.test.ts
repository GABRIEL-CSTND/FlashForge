import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { randomInt } from 'node:crypto';
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
// Lets a test force specific join codes (to exercise collision retries).
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});

import * as listRoute from '@/app/api/teacher/classes/route';
import * as classRoute from '@/app/api/teacher/classes/[id]/route';
import * as codeRoute from '@/app/api/teacher/classes/[id]/join-code/route';
import * as studentRoute from '@/app/api/teacher/classes/[id]/students/[studentId]/route';
import { JOIN_CODE_ALPHABET } from '@/lib/classes-shared';

const USERS = {
  t1: { id: fakeUuid(), email: 'teacher.one@example.com', role: 'teacher', name: 'Teacher One' },
  t2: { id: fakeUuid(), email: 'teacher.two@example.com', role: 'teacher', name: 'Teacher Two' },
  adm: { id: fakeUuid(), email: 'admin@example.com', role: 'admin', name: 'Admin' },
  stu: { id: fakeUuid(), email: 'student@example.com', role: 'student', name: 'Sam Student' },
  stu2: { id: fakeUuid(), email: 'student2@example.com', role: 'student', name: null },
};
type Token = keyof typeof USERS;

let db: FakeDb;

function setup() {
  fake.current = createFakeSupabase({
    tables: {
      profiles: { unique: [['id']] },
      classes: {
        unique: [['id'], ['join_code']],
        defaults: { id: fakeUuid, created_at: () => new Date().toISOString() },
        cascade: [{ table: 'class_members', column: 'class_id' }],
      },
      class_members: { unique: [['class_id', 'student_id']], defaults: { joined_at: () => new Date().toISOString() } },
    },
    users: Object.fromEntries(Object.entries(USERS).map(([token, u]) => [token, { id: u.id, email: u.email }])),
    rpc: {
      // Mirrors public.class_roster(): only rows for the class's own teacher.
      class_roster: ({ p_class_id, p_teacher_id }, d) => {
        const owned = d.rows.classes?.some((c) => c.id === p_class_id && c.teacher_id === p_teacher_id);
        if (!owned) return [];
        return (d.rows.class_members ?? [])
          .filter((m) => m.class_id === p_class_id)
          .map((m) => {
            const u = Object.values(USERS).find((x) => x.id === m.student_id)!;
            return { student_id: u.id, display_name: u.name, email: u.email, joined_at: m.joined_at };
          });
      },
    },
  });
  db = fake.current.db;
  db.rows.profiles = Object.values(USERS).map((u) => ({ id: u.id, role: u.role, display_name: u.name }));
}

function req(method: string, path: string, token?: Token, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

async function createClass(token: Token, name: string) {
  return json(await listRoute.POST(req('POST', '/api/teacher/classes', token, { name })));
}
const classRow = (id: string) => db.rows.classes?.find((c) => c.id === id);
const addMember = (classId: string, token: Token) =>
  db.rows.class_members.push({ class_id: classId, student_id: USERS[token].id, joined_at: '2026-10-20T10:00:00Z' });

beforeEach(() => {
  setup();
  vi.mocked(randomInt).mockRestore?.();
});

describe('who can use the class API', () => {
  it('requires a session (401) on every route', async () => {
    const id = fakeUuid();
    const statuses = [
      (await listRoute.GET(req('GET', '/x'))).status,
      (await listRoute.POST(req('POST', '/x', undefined, { name: 'A' }))).status,
      (await classRoute.GET(req('GET', '/x'), ctx({ id }))).status,
      (await classRoute.PATCH(req('PATCH', '/x', undefined, { name: 'A' }), ctx({ id }))).status,
      (await classRoute.DELETE(req('DELETE', '/x'), ctx({ id }))).status,
      (await codeRoute.POST(req('POST', '/x'), ctx({ id }))).status,
      (await studentRoute.DELETE(req('DELETE', '/x'), ctx({ id, studentId: id }))).status,
    ];
    expect(statuses).toEqual([401, 401, 401, 401, 401, 401, 401]);
  });

  it('refuses students (403) on every route', async () => {
    const id = fakeUuid();
    const statuses = [
      (await listRoute.GET(req('GET', '/x', 'stu'))).status,
      (await listRoute.POST(req('POST', '/x', 'stu', { name: 'A' }))).status,
      (await classRoute.GET(req('GET', '/x', 'stu'), ctx({ id }))).status,
      (await classRoute.PATCH(req('PATCH', '/x', 'stu', { name: 'A' }), ctx({ id }))).status,
      (await classRoute.DELETE(req('DELETE', '/x', 'stu'), ctx({ id }))).status,
      (await codeRoute.POST(req('POST', '/x', 'stu'), ctx({ id }))).status,
      (await studentRoute.DELETE(req('DELETE', '/x', 'stu'), ctx({ id, studentId: id }))).status,
    ];
    expect(statuses).toEqual([403, 403, 403, 403, 403, 403, 403]);
    expect(db.rows.classes ?? []).toEqual([]);
  });

  it('lets admins use teacher features on their own classes', async () => {
    const created = await createClass('adm', 'Admin class');
    expect(created.status).toBe(201);
    const listed = await json(await listRoute.GET(req('GET', '/x', 'adm')));
    expect(listed.body.classes.map((c: { name: string }) => c.name)).toEqual(['Admin class']);
  });
});

describe('creating and listing classes', () => {
  it('creates a class with a valid join code and a cleaned-up name', async () => {
    const res = await createClass('t1', '  Biology   101 ');
    expect(res.status).toBe(201);
    expect(res.body.class).toMatchObject({ name: 'Biology 101', studentCount: 0 });
    expect(res.body.class.joinCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(classRow(res.body.class.id)?.teacher_id).toBe(USERS.t1.id);
  });

  it.each([[''], ['    '], ['x'.repeat(81)], [42], [null]])('rejects class name %j (400)', async (name) => {
    expect((await createClass('t1', name as string)).status).toBe(400);
  });

  it('rejects a missing or malformed body (400)', async () => {
    expect((await listRoute.POST(req('POST', '/x', 't1', 'not json'))).status).toBe(400);
    expect((await listRoute.POST(req('POST', '/x', 't1', ['Biology']))).status).toBe(400);
  });

  it('lists only the teacher\'s own classes, newest first, with student counts', async () => {
    const older = (await createClass('t1', 'Older')).body.class;
    classRow(older.id)!.created_at = '2026-01-01T00:00:00Z';
    const newer = (await createClass('t1', 'Newer')).body.class;
    await createClass('t2', 'Not mine');
    addMember(newer.id, 'stu');
    addMember(newer.id, 'stu2');

    const res = await json(await listRoute.GET(req('GET', '/x', 't1')));
    expect(res.body.classes.map((c: { name: string; studentCount: number }) => [c.name, c.studentCount])).toEqual([
      ['Newer', 2],
      ['Older', 0],
    ]);
  });

  it('caps a teacher at 50 classes (409)', async () => {
    for (let i = 0; i < 50; i++) await createClass('t1', `Class ${i}`);
    const res = await createClass('t1', 'One too many');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/up to 50 classes/);
    expect((await createClass('t2', 'Other teacher is fine')).status).toBe(201);
  });

  it('retries with a fresh code when a generated code is already taken', async () => {
    const indexOf = (ch: string) => JOIN_CODE_ALPHABET.indexOf(ch);
    const sequence = [...'AAAAAA', ...'AAAAAA', ...'BBBBBB'].map(indexOf);
    vi.mocked(randomInt).mockImplementation((() => sequence.shift()!) as typeof randomInt);
    expect((await createClass('t1', 'First')).body.class.joinCode).toBe('AAAAAA');
    const second = await createClass('t1', 'Second');
    expect(second.status).toBe(201);
    expect(second.body.class.joinCode).toBe('BBBBBB');
  });

  it('gives up with a generic 500 if every attempt collides', async () => {
    vi.mocked(randomInt).mockImplementation((() => JOIN_CODE_ALPHABET.indexOf('A')) as typeof randomInt);
    await createClass('t1', 'Has AAAAAA');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await createClass('t1', 'Collides forever');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Something went wrong. Please try again.');
    errorLog.mockRestore();
  });
});

describe('a single class', () => {
  let mine: { id: string; joinCode: string };
  let theirs: { id: string; joinCode: string };

  beforeEach(async () => {
    mine = (await createClass('t1', 'Mine')).body.class;
    theirs = (await createClass('t2', 'Theirs')).body.class;
    addMember(mine.id, 'stu');
    addMember(mine.id, 'stu2');
    addMember(theirs.id, 'stu');
  });

  it('shows the teacher their class with its roster', async () => {
    const res = await json(await classRoute.GET(req('GET', '/x', 't1'), ctx({ id: mine.id })));
    expect(res.status).toBe(200);
    expect(res.body.class).toMatchObject({ name: 'Mine', joinCode: mine.joinCode, studentCount: 2 });
    expect(res.body.class.students.map((s: { email: string }) => s.email).sort()).toEqual([
      'student2@example.com',
      'student@example.com',
    ]);
  });

  it('hides another teacher\'s class, a missing class, and a malformed id (404)', async () => {
    expect((await classRoute.GET(req('GET', '/x', 't1'), ctx({ id: theirs.id }))).status).toBe(404);
    expect((await classRoute.GET(req('GET', '/x', 't1'), ctx({ id: fakeUuid() }))).status).toBe(404);
    expect((await classRoute.GET(req('GET', '/x', 't1'), ctx({ id: 'not-a-uuid' }))).status).toBe(404);
  });

  it('renames the teacher\'s own class only', async () => {
    const ok = await json(await classRoute.PATCH(req('PATCH', '/x', 't1', { name: ' Mine, renamed ' }), ctx({ id: mine.id })));
    expect(ok).toEqual({ status: 200, body: { name: 'Mine, renamed' } });
    const other = await classRoute.PATCH(req('PATCH', '/x', 't1', { name: 'Hijacked' }), ctx({ id: theirs.id }));
    expect(other.status).toBe(404);
    expect(classRow(theirs.id)?.name).toBe('Theirs');
    expect((await classRoute.PATCH(req('PATCH', '/x', 't1', { name: '' }), ctx({ id: mine.id }))).status).toBe(400);
  });

  it('replaces the join code so the old one stops working', async () => {
    const res = await json(await codeRoute.POST(req('POST', '/x', 't1'), ctx({ id: mine.id })));
    expect(res.status).toBe(200);
    expect(res.body.joinCode).not.toBe(mine.joinCode);
    expect(db.rows.classes.some((c) => c.join_code === mine.joinCode)).toBe(false);
    expect(classRow(mine.id)?.join_code).toBe(res.body.joinCode);
    expect(db.rows.class_members.filter((m) => m.class_id === mine.id)).toHaveLength(2);
  });

  it('will not replace another teacher\'s join code (404)', async () => {
    expect((await codeRoute.POST(req('POST', '/x', 't1'), ctx({ id: theirs.id }))).status).toBe(404);
    expect(classRow(theirs.id)?.join_code).toBe(theirs.joinCode);
  });

  it('removes a student from the teacher\'s class', async () => {
    const path = ctx({ id: mine.id, studentId: USERS.stu.id });
    expect((await studentRoute.DELETE(req('DELETE', '/x', 't1'), path)).status).toBe(200);
    expect(db.rows.class_members.some((m) => m.class_id === mine.id && m.student_id === USERS.stu.id)).toBe(false);
    // Still in the other teacher's class, and a second removal is a 404.
    expect(db.rows.class_members.some((m) => m.class_id === theirs.id && m.student_id === USERS.stu.id)).toBe(true);
    const again = await json(await studentRoute.DELETE(req('DELETE', '/x', 't1'), path));
    expect(again).toEqual({ status: 404, body: { error: 'Student not found.' } });
  });

  it('will not remove students from another teacher\'s class (404)', async () => {
    const res = await json(await studentRoute.DELETE(req('DELETE', '/x', 't1'), ctx({ id: theirs.id, studentId: USERS.stu.id })));
    expect(res).toEqual({ status: 404, body: { error: 'Class not found.' } });
    expect(db.rows.class_members.some((m) => m.class_id === theirs.id)).toBe(true);
    const badId = await studentRoute.DELETE(req('DELETE', '/x', 't1'), ctx({ id: mine.id, studentId: 'nope' }));
    expect(badId.status).toBe(404);
  });

  it('deletes the teacher\'s class and its memberships', async () => {
    expect((await classRoute.DELETE(req('DELETE', '/x', 't1'), ctx({ id: mine.id }))).status).toBe(200);
    expect(classRow(mine.id)).toBeUndefined();
    expect(db.rows.class_members.some((m) => m.class_id === mine.id)).toBe(false);
    expect(db.rows.class_members.some((m) => m.class_id === theirs.id)).toBe(true);
  });

  it('will not delete another teacher\'s class (404)', async () => {
    expect((await classRoute.DELETE(req('DELETE', '/x', 't1'), ctx({ id: theirs.id }))).status).toBe(404);
    expect(classRow(theirs.id)).toBeDefined();
  });

  it('turns database errors into a generic 500 without details', async () => {
    db.failNext('classes', 'select');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await json(await classRoute.GET(req('GET', '/x', 't1'), ctx({ id: mine.id })));
    expect(res).toEqual({ status: 500, body: { error: 'Something went wrong. Please try again.' } });
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});
