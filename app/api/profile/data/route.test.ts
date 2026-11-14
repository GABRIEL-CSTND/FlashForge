import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, fakeUuid } from '@/test-utils/fake-supabase';

const USER_A = { id: fakeUuid(), email: 'sam@example.com' };
const USER_B = { id: fakeUuid(), email: 'admin@example.com' };

const fake = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof import('@/test-utils/fake-supabase').createFakeSupabase>,
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (t: string) => fake.current!.client.from(t),
    auth: {
      getUser: (token: string) => fake.current!.client.auth.getUser(token),
    },
  },
}));

import { DELETE } from '@/app/api/profile/data/route';

beforeEach(() => {
  fake.current = createFakeSupabase({
    tables: {
      profiles: { unique: [['id']] },
      flashcard_sets: { unique: [['id']] },
      guide_history: { unique: [['id']] },
      attempts: { unique: [['id']] },
      classes: { unique: [['id']] },
      class_members: { unique: [['id']] },
      class_join_failures: { unique: [['id']] },
      generation_logs: { unique: [['id']] },
    },
    users: {
      sam: USER_A,
      admin: USER_B,
    },
  });
});

function del(headers: Record<string, string> = {}, body?: unknown) {
  return DELETE(
    new NextRequest('http://localhost/api/profile/data', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  );
}

describe('DELETE /api/profile/data (#88)', () => {
  it('requires authentication', async () => {
    const res = await del({}, { confirm: true });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'You must be signed in.' });
  });

  it('requires explicit confirmation', async () => {
    const res = await del({ authorization: 'Bearer sam' }, {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Confirmation is required to delete your account data.' });
  });

  it('refuses when the user is the only admin', async () => {
    fake.current!.db.rows.profiles = [{ id: USER_B.id, role: 'admin' }];
    const res = await del({ authorization: 'Bearer admin' }, { confirm: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("The last admin account can't be deleted");
  });

  it('deletes data and returns success when confirmed', async () => {
    fake.current!.db.rows.profiles = [{ id: USER_A.id, role: 'student' }];
    fake.current!.db.rows.flashcard_sets = [{ id: 'set-1', user_id: USER_A.id, title: 'My Set' }];

    const res = await del({ authorization: 'Bearer sam' }, { confirm: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });

    expect(fake.current!.db.rows.profiles).toHaveLength(0);
    expect(fake.current!.db.rows.flashcard_sets).toHaveLength(0);
  });
});
