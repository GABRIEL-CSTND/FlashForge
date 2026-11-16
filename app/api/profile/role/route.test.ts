import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// In-memory stand-in for the profiles table, applying the same eq/is filters
// the real query uses, so "choose twice" and "parallel requests" behave like
// Postgres (checked against the real database in a rolled-back transaction).
interface Row {
  id: string;
  role: string;
  role_chosen_at: string | null;
}

const db = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  tokens: {} as Record<string, string>,
  failUpdates: false,
}));

vi.mock('@/lib/supabase-admin', () => {
  function from(table: string) {
    if (table !== 'profiles') throw new Error(`unexpected table ${table}`);
    const filters: ((r: Row) => boolean)[] = [];
    let op: { kind: 'select' } | { kind: 'update'; values: Partial<Row> } | { kind: 'insert'; row: Row } = {
      kind: 'select',
    };
    const run = () => {
      if (op.kind === 'insert') {
        if (db.rows.has(op.row.id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        db.rows.set(op.row.id, { ...op.row });
        return { data: null, error: null };
      }
      const matched = [...db.rows.values()].filter((r) => filters.every((f) => f(r)));
      if (op.kind === 'update') {
        if (db.failUpdates) return { data: null, error: { code: 'XX000', message: 'connection reset' } };
        for (const r of matched) Object.assign(r, op.values);
        return { data: matched.map((r) => ({ id: r.id })), error: null };
      }
      return { data: matched, error: null };
    };
    const builder = {
      select: () => builder,
      update: (values: Partial<Row>) => ((op = { kind: 'update', values }), builder),
      insert: (row: Row) => ((op = { kind: 'insert', row }), builder),
      eq: (col: keyof Row, val: unknown) => (filters.push((r) => r[col] === val), builder),
      is: (col: keyof Row, val: unknown) => (filters.push((r) => r[col] === val), builder),
      maybeSingle: async () => {
        const { data, error } = run();
        return { data: (data as Row[] | null)?.[0] ?? null, error };
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }
  return {
    supabaseAdmin: {
      auth: {
        getUser: async (token: string) =>
          db.tokens[token]
            ? { data: { user: { id: db.tokens[token], email: `${db.tokens[token]}@example.com` } }, error: null }
            : { data: { user: null }, error: new Error('invalid JWT') },
      },
      from,
    },
  };
});

import { POST } from '@/app/api/profile/role/route';

function request(body: unknown, token?: string) {
  return new NextRequest('http://localhost/api/profile/role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function call(body: unknown, token?: string) {
  const res = await POST(request(body, token));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  db.failUpdates = false;
  db.rows = new Map([
    ['new-student', { id: 'new-student', role: 'student', role_chosen_at: null }],
    ['admin', { id: 'admin', role: 'admin', role_chosen_at: '2026-10-20T00:00:00Z' }],
    ['assigned-teacher', { id: 'assigned-teacher', role: 'teacher', role_chosen_at: null }],
  ]);
  db.tokens = {
    's-token': 'new-student',
    'a-token': 'admin',
    't-token': 'assigned-teacher',
    'nop-token': 'no-profile',
  };
});

describe('POST /api/profile/role', () => {
  it('rejects requests without a session (401)', async () => {
    expect((await call({ role: 'teacher' })).status).toBe(401);
    expect((await call({ role: 'teacher' }, 'forged-token')).status).toBe(401);
  });

  it.each([['admin'], ['superuser'], [''], [null]])('rejects role %j (400)', async (role) => {
    const res = await call({ role }, 's-token');
    expect(res.status).toBe(400);
    expect(db.rows.get('new-student')).toMatchObject({ role: 'student', role_chosen_at: null });
  });

  it('rejects a missing or malformed body (400)', async () => {
    expect((await call('not json', 's-token')).status).toBe(400);
    expect((await call({}, 's-token')).status).toBe(400);
  });

  it('lets a new student choose teacher once', async () => {
    const res = await call({ role: 'teacher' }, 's-token');
    expect(res).toEqual({ status: 200, body: { role: 'teacher' } });
    expect(db.rows.get('new-student')?.role).toBe('teacher');
    expect(db.rows.get('new-student')?.role_chosen_at).not.toBeNull();
  });

  it('lets a new student confirm student, so they are not asked again', async () => {
    const res = await call({ role: 'student' }, 's-token');
    expect(res).toEqual({ status: 200, body: { role: 'student' } });
    expect(db.rows.get('new-student')?.role_chosen_at).not.toBeNull();
  });

  it('rejects a second choice (409) and keeps the first one', async () => {
    await call({ role: 'teacher' }, 's-token');
    const second = await call({ role: 'student' }, 's-token');
    expect(second.status).toBe(409);
    expect(db.rows.get('new-student')?.role).toBe('teacher');
  });

  it('does not let a confirmed student switch to teacher later (409)', async () => {
    await call({ role: 'student' }, 's-token');
    const later = await call({ role: 'teacher' }, 's-token');
    expect(later.status).toBe(409);
    expect(db.rows.get('new-student')?.role).toBe('student');
  });

  it('lets only one of two parallel requests win', async () => {
    const results = await Promise.all([call({ role: 'teacher' }, 's-token'), call({ role: 'student' }, 's-token')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('never lets an admin change their own role here (409)', async () => {
    expect((await call({ role: 'teacher' }, 'a-token')).status).toBe(409);
    expect(db.rows.get('admin')?.role).toBe('admin');
  });

  it('does not overwrite a role an admin assigned before the user chose (409)', async () => {
    expect((await call({ role: 'student' }, 't-token')).status).toBe(409);
    expect(db.rows.get('assigned-teacher')?.role).toBe('teacher');
  });

  it('creates the profile if the sign-up trigger never did', async () => {
    const res = await call({ role: 'teacher' }, 'nop-token');
    expect(res.status).toBe(200);
    expect(db.rows.get('no-profile')).toMatchObject({ role: 'teacher' });
    expect((await call({ role: 'student' }, 'nop-token')).status).toBe(409);
  });

  it('returns a generic 500 on a database error without leaking details', async () => {
    db.failUpdates = true;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call({ role: 'teacher' }, 's-token');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('connection reset');
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});
