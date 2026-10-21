import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import * as joinRoute from '@/app/api/student/classes/route';
import * as leaveRoute from '@/app/api/student/classes/[id]/route';

const USERS = {
  stu: { id: fakeUuid(), email: 'sam@example.com', role: 'student', name: 'Sam Student' },
  stu2: { id: fakeUuid(), email: 'pat@example.com', role: 'student', name: 'Pat Pupil' },
  t1: { id: fakeUuid(), email: 'reyes@example.com', role: 'teacher', name: 'Ms. Reyes' },
  t2: { id: fakeUuid(), email: 'cruz@example.com', role: 'teacher', name: null },
  adm: { id: fakeUuid(), email: 'admin@example.com', role: 'admin', name: 'Admin' },
};
type Token = keyof typeof USERS;

const NOW = new Date('2026-10-21T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

let db: FakeDb;
const CLASSES = { bio: fakeUuid(), chem: fakeUuid(), art: fakeUuid() };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  let failureId = 0;
  fake.current = createFakeSupabase({
    tables: {
      profiles: { unique: [['id']] },
      classes: { unique: [['id'], ['join_code']], cascade: [{ table: 'class_members', column: 'class_id' }] },
      class_members: { unique: [['class_id', 'student_id']], defaults: { joined_at: () => new Date().toISOString() } },
      class_join_failures: {
        defaults: { id: () => ++failureId, attempted_at: () => new Date().toISOString() },
      },
    },
    users: Object.fromEntries(Object.entries(USERS).map(([token, u]) => [token, { id: u.id, email: u.email }])),
  });
  db = fake.current.db;
  db.rows.profiles = Object.values(USERS).map((u) => ({ id: u.id, role: u.role, display_name: u.name }));
  db.rows.classes = [
    { id: CLASSES.bio, teacher_id: USERS.t1.id, name: 'Biology 101', join_code: 'K7M2QX' },
    { id: CLASSES.chem, teacher_id: USERS.t2.id, name: 'Chemistry', join_code: 'ABC234' },
    { id: CLASSES.art, teacher_id: USERS.t1.id, name: 'Art', join_code: 'ZZZ999' },
  ];
});

afterEach(() => {
  vi.useRealTimers();
});

function req(method: string, token?: Token, body?: unknown) {
  return new NextRequest('http://localhost/api/student/classes', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const json = async (res: Response) => ({ status: res.status, body: await res.json(), headers: res.headers });
const join = async (token: Token, code: unknown) => json(await joinRoute.POST(req('POST', token, { code })));
const list = async (token: Token) => json(await joinRoute.GET(req('GET', token)));
const leave = async (token: Token, id: string) =>
  json(await leaveRoute.DELETE(req('DELETE', token), { params: Promise.resolve({ id }) }));

const memberships = (token: Token) => db.rows.class_members.filter((m) => m.student_id === USERS[token].id);
const failures = (token: Token) => db.rows.class_join_failures.filter((f) => f.user_id === USERS[token].id);
const addFailures = (token: Token, count: number, atMinutesAgo: number) => {
  for (let i = 0; i < count; i++) {
    db.rows.class_join_failures.push({ id: 1000 + db.rows.class_join_failures.length, user_id: USERS[token].id, attempted_at: minutesAgo(atMinutesAgo) });
  }
};

describe('who can use the student class API', () => {
  it('requires a session (401)', async () => {
    expect((await joinRoute.GET(req('GET'))).status).toBe(401);
    expect((await joinRoute.POST(req('POST', undefined, { code: 'K7M2QX' }))).status).toBe(401);
    expect((await leaveRoute.DELETE(req('DELETE'), { params: Promise.resolve({ id: CLASSES.bio }) })).status).toBe(401);
  });

  it.each([['t1' as Token], ['adm' as Token]])('is for students only (403 for %s)', async (token) => {
    expect((await list(token)).status).toBe(403);
    expect((await join(token, 'K7M2QX')).status).toBe(403);
    expect((await leave(token, CLASSES.bio)).status).toBe(403);
    expect(db.rows.class_members).toEqual([]);
  });
});

describe('joining with a code', () => {
  it('adds the student, accepting lowercase, spaces and the hyphen', async () => {
    const res = await join('stu', ' k7m-2qx ');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ class: { id: CLASSES.bio, name: 'Biology 101', teacherName: 'Ms. Reyes' }, alreadyMember: false });
    expect(memberships('stu').map((m) => m.class_id)).toEqual([CLASSES.bio]);
  });

  it('does nothing when joining the same class again', async () => {
    await join('stu', 'K7M2QX');
    const again = await join('stu', 'K7M-2QX');
    expect(again.status).toBe(200);
    expect(again.body.alreadyMember).toBe(true);
    expect(memberships('stu')).toHaveLength(1);
  });

  it.each([[''], ['abc'], ['K7M2Q'], ['O0I1LL'], [123], [null]])(
    'rejects %j as not a code (400) without counting it as a wrong guess',
    async (code) => {
      const res = await join('stu', code);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/doesn't look like a class code/);
      expect(failures('stu')).toEqual([]);
    }
  );

  it('rejects a malformed body (400)', async () => {
    expect((await joinRoute.POST(req('POST', 'stu', 'not json'))).status).toBe(400);
  });

  it('says clearly when no class uses the code (404) and records the wrong guess', async () => {
    const res = await join('stu', 'QQQ222');
    expect(res).toMatchObject({ status: 404, body: { error: 'No class uses that code. Check it with your teacher.' } });
    expect(failures('stu')).toHaveLength(1);
    expect(memberships('stu')).toEqual([]);
  });

  it('blocks a student after 10 wrong codes in 15 minutes, even for a valid code (429)', async () => {
    for (let i = 0; i < 10; i++) expect((await join('stu', 'QQQ222')).status).toBe(404);
    const blocked = await join('stu', 'K7M2QX');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('Too many wrong codes. Try again in 15 minutes.');
    expect(blocked.headers.get('Retry-After')).toBe('900');
    expect(memberships('stu')).toEqual([]);
    // Another student is not affected.
    expect((await join('stu2', 'K7M2QX')).status).toBe(201);
  });

  it('counts down from the oldest wrong guess in the window', async () => {
    addFailures('stu', 10, 5);
    const res = await join('stu', 'K7M2QX');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too many wrong codes. Try again in 10 minutes.');
  });

  it('forgets wrong guesses older than 15 minutes, and cleans them up', async () => {
    addFailures('stu', 10, 20);
    expect((await join('stu', 'QQQ222')).status).toBe(404);
    expect(failures('stu')).toHaveLength(1);
    expect((await join('stu', 'K7M2QX')).status).toBe(201);
  });

  it('refuses to join a class the student owns (409)', async () => {
    db.rows.classes.push({ id: fakeUuid(), teacher_id: USERS.stu.id, name: 'Old class', join_code: 'WWN234' });
    const res = await join('stu', 'WWN234');
    expect(res).toMatchObject({ status: 409, body: { error: 'You teach this class.' } });
  });
});

describe('listing and leaving classes', () => {
  beforeEach(() => {
    db.rows.class_members.push(
      { class_id: CLASSES.bio, student_id: USERS.stu.id, joined_at: minutesAgo(60) },
      { class_id: CLASSES.chem, student_id: USERS.stu.id, joined_at: minutesAgo(5) },
      { class_id: CLASSES.art, student_id: USERS.stu2.id, joined_at: minutesAgo(30) }
    );
  });

  it('lists only the student\'s classes, most recent first, with teacher names', async () => {
    const res = await list('stu');
    expect(res.status).toBe(200);
    expect(res.body.classes).toEqual([
      { id: CLASSES.chem, name: 'Chemistry', teacherName: null, joinedAt: minutesAgo(5), assignments: [] },
      { id: CLASSES.bio, name: 'Biology 101', teacherName: 'Ms. Reyes', joinedAt: minutesAgo(60), assignments: [] },
    ]);
  });

  it('drops a class once its teacher deletes it', async () => {
    db.rows.classes = db.rows.classes.filter((c) => c.id !== CLASSES.chem);
    db.rows.class_members = db.rows.class_members.filter((m) => m.class_id !== CLASSES.chem);
    expect((await list('stu')).body.classes.map((c: { name: string }) => c.name)).toEqual(['Biology 101']);
  });

  it('lets a student leave their own class only', async () => {
    expect(await leave('stu', CLASSES.bio)).toMatchObject({ status: 200, body: { left: true } });
    expect(memberships('stu').map((m) => m.class_id)).toEqual([CLASSES.chem]);
    // Leaving again, leaving a class they're not in, and a malformed id are all 404s.
    expect((await leave('stu', CLASSES.bio)).status).toBe(404);
    expect((await leave('stu', CLASSES.art)).status).toBe(404);
    expect(memberships('stu2')).toHaveLength(1);
    expect((await leave('stu', 'nope')).status).toBe(404);
  });

  it('turns database errors into a generic 500 without details', async () => {
    db.failNext('class_members', 'select');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await list('stu');
    expect(res).toMatchObject({ status: 500, body: { error: 'Something went wrong. Please try again.' } });
    errorLog.mockRestore();
  });
});
