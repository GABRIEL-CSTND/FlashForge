import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, fakeUuid } from '@/test-utils/fake-supabase';

const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('@/test-utils/fake-supabase').createFakeSupabase> }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (t: string) => fake.current!.client.from(t),
    rpc: (n: string, a: Record<string, unknown>) => fake.current!.client.rpc(n, a),
    auth: { getUser: (token: string) => fake.current!.client.auth.getUser(token) },
  },
}));

import * as limitsRoute from '@/app/api/admin/limits/route';
import * as usageRoute from '@/app/api/admin/usage/route';
import { limitMessage, parseGenerationLimits } from '@/lib/generation-limits';

const USERS = {
  adm: { id: fakeUuid(), email: 'admin@example.com', role: 'admin' },
  t1: { id: fakeUuid(), email: 'teacher@example.com', role: 'teacher' },
};
type Token = keyof typeof USERS;
const LIMITS = { anonymous: 2, student: 5, teacher: 15, admin: null };
let calls: Record<string, unknown>[];
let rpcError: null | { code: string; message: string };

beforeEach(() => {
  calls = [];
  rpcError = null;
  fake.current = createFakeSupabase({
    tables: { profiles: { unique: [['id']] }, app_settings: { unique: [['key']] } },
    users: Object.fromEntries(Object.entries(USERS).map(([t, u]) => [t, { id: u.id, email: u.email }])),
    rpc: {
      admin_set_generation_limits: (args) => {
        calls.push(args);
        if (rpcError) throw rpcError;
        return args.p_limits;
      },
      admin_generation_daily: () => [],
      admin_top_generators: () => [],
    },
  });
  fake.current.db.rows.profiles = Object.values(USERS).map((u) => ({ id: u.id, role: u.role }));
  fake.current.db.rows.app_settings = [{ key: 'generation_limits', value: LIMITS }];
});

const put = async (token: Token | undefined, body: unknown) => {
  const req = new NextRequest('http://localhost/api/admin/limits', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const res = await limitsRoute.PUT(req);
  return { status: res.status, body: await res.json() };
};
const INVALID = 'Each limit must be a whole number from 0 to 1000, or empty for no limit.';

describe('PUT /api/admin/limits', () => {
  it('is admins only', async () => {
    expect((await put(undefined, { limits: LIMITS })).status).toBe(401);
    expect((await put('t1', { limits: LIMITS })).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('saves the limits as the calling admin', async () => {
    const limits = { anonymous: 0, student: 3, teacher: 10, admin: null };
    expect(await put('adm', { limits })).toEqual({ status: 200, body: { limits } });
    expect(calls).toEqual([{ p_actor_id: USERS.adm.id, p_limits: limits }]);
  });

  it.each([
    ['a missing role', { anonymous: 2, student: 5, teacher: 15 }],
    ['an unknown role', { ...LIMITS, owner: 1 }],
    ['a negative limit', { ...LIMITS, student: -1 }],
    ['a fraction', { ...LIMITS, student: 2.5 }],
    ['text', { ...LIMITS, student: '5' }],
    ['over 1000', { ...LIMITS, teacher: 1001 }],
  ])('rejects %s without calling the database', async (_label, limits) => {
    expect(await put('adm', { limits })).toEqual({ status: 400, body: { error: INVALID } });
    expect(calls).toEqual([]);
  });

  it("also answers 400 when the database rejects the limits", async () => {
    rpcError = { code: '22023', message: 'invalid limits' };
    expect(await put('adm', { limits: LIMITS })).toEqual({ status: 400, body: { error: INVALID } });
  });
});

describe('GET /api/admin/usage includes the limits', () => {
  it('returns the saved limits', async () => {
    const res = await usageRoute.GET(new NextRequest('http://localhost/api/admin/usage', { headers: { authorization: 'Bearer adm' } }));
    expect((await res.json()).limits).toEqual(LIMITS);
  });
});

describe('limit rules', () => {
  it('accepts null (no limit) and whole numbers 0-1000 for exactly the four roles', () => {
    expect(parseGenerationLimits(LIMITS)).toEqual(LIMITS);
    expect(parseGenerationLimits({ anonymous: 0, student: 1000, teacher: null, admin: 7 })).toEqual({ anonymous: 0, student: 1000, teacher: null, admin: 7 });
    expect(parseGenerationLimits(null)).toBeNull();
    expect(parseGenerationLimits([1, 2, 3, 4])).toBeNull();
  });

  it('words the limit message for one or many guides', () => {
    expect(limitMessage(5)).toBe("You've reached today's limit of 5 study guides.");
    expect(limitMessage(1)).toBe("You've reached today's limit of 1 study guide.");
  });
});
