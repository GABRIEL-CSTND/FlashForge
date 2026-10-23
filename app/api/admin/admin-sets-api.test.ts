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

import * as setsRoute from '@/app/api/admin/sets/route';
import * as setRoute from '@/app/api/admin/sets/[id]/route';

const USERS = {
  adm: { id: fakeUuid(), email: 'admin@example.com', role: 'admin' },
  t1: { id: fakeUuid(), email: 'teacher@example.com', role: 'teacher' },
  stu: { id: fakeUuid(), email: 'student@example.com', role: 'student' },
};
type Token = keyof typeof USERS;
const SET = fakeUuid();

// What the database functions were called with; their real rules are checked
// in supabase/tests/admin-sets-check.sql.
let calls: { name: string; args: Record<string, unknown> }[];
let deleteError: null | { code: string; message: string };

beforeEach(() => {
  calls = [];
  deleteError = null;
  fake.current = createFakeSupabase({
    tables: { profiles: { unique: [['id']] } },
    users: Object.fromEntries(Object.entries(USERS).map(([t, u]) => [t, { id: u.id, email: u.email }])),
    rpc: {
      admin_list_sets: (args) => {
        calls.push({ name: 'admin_list_sets', args });
        return [
          { set_id: SET, title: 'Cell parts', study_type: 'flashcard', created_at: '2026-10-01T00:00:00Z', owner_id: USERS.t1.id, owner_email: 'teacher@example.com', owner_name: 'Ms. Reyes', card_count: 10, assignment_count: 2 },
        ];
      },
      admin_delete_set: (args) => {
        calls.push({ name: 'admin_delete_set', args });
        if (deleteError) throw deleteError;
        return 2;
      },
    },
  });
  fake.current.db.rows.profiles = Object.values(USERS).map((u) => ({ id: u.id, role: u.role }));
});

const headers = (token?: Token): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});
const list = async (token?: Token, query = '') => {
  const res = await setsRoute.GET(new NextRequest(`http://localhost/api/admin/sets${query}`, { headers: headers(token) }));
  return { status: res.status, body: await res.json() };
};
const remove = async (token: Token | undefined, id: string) => {
  const req = new NextRequest(`http://localhost/api/admin/sets/${id}`, { method: 'DELETE', headers: headers(token) });
  const res = await setRoute.DELETE(req, { params: Promise.resolve({ id }) });
  return { status: res.status, body: await res.json() };
};

describe('admin sets API', () => {
  it.each([
    ['not signed in', undefined, 401],
    ['a teacher', 't1' as Token, 403],
    ['a student', 'stu' as Token, 403],
  ])('refuses %s, without calling the database', async (_label, token, status) => {
    expect((await list(token)).status).toBe(status);
    expect((await remove(token, SET)).status).toBe(status);
    expect(calls).toEqual([]);
  });

  it('lists every set for an admin, passing the search along', async () => {
    expect(await list('adm', '?q=cell')).toEqual({
      status: 200,
      body: {
        sets: [
          { id: SET, title: 'Cell parts', studyType: 'flashcard', createdAt: '2026-10-01T00:00:00Z', ownerId: USERS.t1.id, ownerEmail: 'teacher@example.com', ownerName: 'Ms. Reyes', cardCount: 10, assignmentCount: 2 },
        ],
      },
    });
    expect(calls).toEqual([{ name: 'admin_list_sets', args: { p_search: 'cell', p_limit: 200 } }]);
  });

  it("deletes any set as the calling admin and says how many classes had it", async () => {
    expect(await remove('adm', SET)).toEqual({ status: 200, body: { deleted: true, assignments: 2 } });
    expect(calls).toEqual([{ name: 'admin_delete_set', args: { p_actor_id: USERS.adm.id, p_set_id: SET } }]);
  });

  it('answers 404 for a missing or malformed set, and 500 for other errors', async () => {
    expect((await remove('adm', 'nope')).status).toBe(404);
    deleteError = { code: 'P0002', message: 'set not found' };
    expect(await remove('adm', fakeUuid())).toEqual({ status: 404, body: { error: 'Study set not found.' } });
    deleteError = { code: 'XX000', message: 'boom' };
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await remove('adm', SET)).status).toBe(500);
    errorLog.mockRestore();
  });
});
