import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, fakeUuid } from '@/test-utils/fake-supabase';

// Routes import the real service-role client; swap in the in-memory fake.
const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('@/test-utils/fake-supabase').createFakeSupabase> }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (t: string) => fake.current!.client.from(t),
    rpc: (n: string, a: Record<string, unknown>) => fake.current!.client.rpc(n, a),
    auth: { getUser: (token: string) => fake.current!.client.auth.getUser(token) },
  },
}));

import * as usersRoute from '@/app/api/admin/users/route';
import * as userRoute from '@/app/api/admin/users/[id]/route';

const USERS = {
  adm: { id: fakeUuid(), email: 'admin@example.com', role: 'admin' },
  t1: { id: fakeUuid(), email: 'teacher@example.com', role: 'teacher' },
  stu: { id: fakeUuid(), email: 'student@example.com', role: 'student' },
};
type Token = keyof typeof USERS;

// What the database functions were called with; their real rules are checked
// in supabase/tests/admin-users-check.sql.
let calls: { name: string; args: Record<string, unknown> }[];
let changeRoleError: null | { code: string; message: string };

beforeEach(() => {
  calls = [];
  changeRoleError = null;
  fake.current = createFakeSupabase({
    tables: { profiles: { unique: [['id']] } },
    users: Object.fromEntries(Object.entries(USERS).map(([t, u]) => [t, { id: u.id, email: u.email }])),
    rpc: {
      admin_list_users: (args) => {
        calls.push({ name: 'admin_list_users', args });
        return [{ user_id: USERS.stu.id, email: 'student@example.com', display_name: 'Sam', role: 'student', signed_up_at: '2026-10-01T00:00:00Z', set_count: 3 }];
      },
      admin_change_role: (args) => {
        calls.push({ name: 'admin_change_role', args });
        if (changeRoleError) throw changeRoleError;
        return 'student';
      },
    },
  });
  fake.current.db.rows.profiles = Object.values(USERS).map((u) => ({ id: u.id, role: u.role }));
});

const headers = (token?: Token) => ({ 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) });
const list = async (token?: Token, query = '') => {
  const res = await usersRoute.GET(new NextRequest(`http://localhost/api/admin/users${query}`, { headers: headers(token) }));
  return { status: res.status, body: await res.json() };
};
const patch = async (token: Token | undefined, id: string, body: unknown) => {
  const req = new NextRequest(`http://localhost/api/admin/users/${id}`, { method: 'PATCH', headers: headers(token), body: JSON.stringify(body) });
  const res = await userRoute.PATCH(req, { params: Promise.resolve({ id }) });
  return { status: res.status, body: await res.json() };
};

describe('admin users API', () => {
  it.each([
    ['not signed in', undefined, 401],
    ['a teacher', 't1' as Token, 403],
    ['a student', 'stu' as Token, 403],
  ])('refuses %s, without calling the database', async (_label, token, status) => {
    expect((await list(token)).status).toBe(status);
    expect((await patch(token, USERS.stu.id, { role: 'teacher' })).status).toBe(status);
    expect(calls).toEqual([]);
  });

  it('lists users for an admin, passing the search along', async () => {
    const res = await list('adm', '?q=%20sam%20');
    expect(res).toEqual({
      status: 200,
      body: { users: [{ id: USERS.stu.id, email: 'student@example.com', displayName: 'Sam', role: 'student', signedUpAt: '2026-10-01T00:00:00Z', setCount: 3 }] },
    });
    expect(calls).toEqual([{ name: 'admin_list_users', args: { p_search: 'sam', p_limit: 200 } }]);
    await list('adm');
    expect(calls[1].args.p_search).toBeNull();
  });

  it('changes a role as the calling admin', async () => {
    expect(await patch('adm', USERS.stu.id, { role: 'teacher' })).toEqual({ status: 200, body: { from: 'student', role: 'teacher' } });
    expect(calls).toEqual([{ name: 'admin_change_role', args: { p_actor_id: USERS.adm.id, p_user_id: USERS.stu.id, p_role: 'teacher' } }]);
  });

  it.each([
    ['an unknown role', { role: 'owner' }],
    ['no role', {}],
  ])('rejects %s (400)', async (_label, body) => {
    expect((await patch('adm', USERS.stu.id, body)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('turns database refusals into clear answers', async () => {
    expect((await patch('adm', 'not-a-uuid', { role: 'teacher' })).status).toBe(404);
    changeRoleError = { code: 'P0002', message: 'user not found' };
    expect(await patch('adm', fakeUuid(), { role: 'teacher' })).toEqual({ status: 404, body: { error: 'User not found.' } });
    changeRoleError = { code: 'P0001', message: 'last_admin' };
    expect(await patch('adm', USERS.adm.id, { role: 'teacher' })).toEqual({
      status: 409,
      body: { error: "The last admin can't be removed. Make someone else an admin first." },
    });
    changeRoleError = { code: 'XX000', message: 'boom' };
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await patch('adm', USERS.stu.id, { role: 'teacher' })).status).toBe(500);
    errorLog.mockRestore();
  });
});
