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

import * as usageRoute from '@/app/api/admin/usage/route';
import { quotaDay } from '@/lib/admin';

const USERS = {
  adm: { id: fakeUuid(), email: 'admin@example.com', role: 'admin' },
  t1: { id: fakeUuid(), email: 'teacher@example.com', role: 'teacher' },
};
type Token = keyof typeof USERS;
let calls: { name: string; args: Record<string, unknown> }[];

beforeEach(() => {
  calls = [];
  fake.current = createFakeSupabase({
    tables: { profiles: { unique: [['id']] } },
    users: Object.fromEntries(Object.entries(USERS).map(([t, u]) => [t, { id: u.id, email: u.email }])),
    rpc: {
      admin_generation_daily: (args) => {
        calls.push({ name: 'admin_generation_daily', args });
        return [{ day: '2026-10-22', generations: '3', failures: '1', signed_out: '1', avg_ms: 6400, answered: { 'gemini-3.5-flash': 2 }, requests: { 'gemini-3.5-flash': 4 } }];
      },
      admin_top_generators: (args) => {
        calls.push({ name: 'admin_top_generators', args });
        return [{ user_id: USERS.t1.id, email: 'teacher@example.com', display_name: null, role: 'teacher', generations: '2', failures: '0' }];
      },
    },
  });
  fake.current.db.rows.profiles = Object.values(USERS).map((u) => ({ id: u.id, role: u.role }));
});

const get = async (token?: Token) => {
  const res = await usageRoute.GET(new NextRequest('http://localhost/api/admin/usage', { headers: token ? { authorization: `Bearer ${token}` } : {} }));
  return { status: res.status, body: await res.json() };
};

describe('admin usage API', () => {
  it('is admins only', async () => {
    expect((await get()).status).toBe(401);
    expect((await get('t1')).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('returns 14 quota days, top users, and the models in fallback order with the main quota', async () => {
    const res = await get('adm');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      today: quotaDay(new Date()),
      periodDays: 14,
      models: ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemma-4-26b-a4b-it'],
      mainModelDailyQuota: 20,
      days: [{ day: '2026-10-22', generations: 3, failures: 1, signedOut: 1, avgMs: 6400, answered: { 'gemini-3.5-flash': 2 }, requests: { 'gemini-3.5-flash': 4 } }],
      topUsers: [{ id: USERS.t1.id, email: 'teacher@example.com', displayName: null, role: 'teacher', generations: 2, failures: 0 }],
    });
    expect(calls).toEqual([
      { name: 'admin_generation_daily', args: { p_days: 14 } },
      { name: 'admin_top_generators', args: { p_days: 14, p_limit: 10 } },
    ]);
  });
});

describe('quotaDay', () => {
  it('is the date in Pacific time, when the Gemini quota resets', () => {
    // October: Pacific daylight time (UTC-7).
    expect(quotaDay(new Date('2026-10-23T06:59:00Z'))).toBe('2026-10-22');
    expect(quotaDay(new Date('2026-10-23T07:00:00Z'))).toBe('2026-10-23');
    // December: Pacific standard time (UTC-8).
    expect(quotaDay(new Date('2026-12-05T07:30:00Z'))).toBe('2026-12-04');
  });
});
