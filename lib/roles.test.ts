import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// The real admin client needs env vars and network; every test passes its own fake.
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }));

import { AuthError, getAuthedUser, requireRole } from '@/lib/roles';

const USER = { id: 'user-1', email: 'student@example.com' };

function fakeClient(opts: { user?: typeof USER | null; role?: string | null }) {
  return {
    auth: {
      getUser: vi.fn(async () =>
        opts.user ? { data: { user: opts.user }, error: null } : { data: { user: null }, error: new Error('bad jwt') }
      ),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: opts.role === null ? null : { role: opts.role },
            error: null,
          }),
        }),
      }),
    })),
  } as unknown as SupabaseClient;
}

const req = (token?: string) =>
  new Request('http://localhost/api/x', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

async function expectAuthError(p: Promise<unknown>, status: 401 | 403) {
  const err = await p.catch((e) => e);
  expect(err).toBeInstanceOf(AuthError);
  expect((err as AuthError).status).toBe(status);
}

describe('requireRole', () => {
  it('rejects a request with no Authorization header (401)', async () => {
    await expectAuthError(requireRole(req(), ['student'], fakeClient({ user: USER, role: 'student' })), 401);
  });

  it('rejects an invalid or expired token (401)', async () => {
    await expectAuthError(requireRole(req('bad'), ['student'], fakeClient({ user: null })), 401);
  });

  it('rejects a student calling a teacher route (403)', async () => {
    await expectAuthError(requireRole(req('t'), ['teacher', 'admin'], fakeClient({ user: USER, role: 'student' })), 403);
  });

  it('rejects a teacher calling an admin route (403)', async () => {
    await expectAuthError(requireRole(req('t'), ['admin'], fakeClient({ user: USER, role: 'teacher' })), 403);
  });

  it('allows a matching role and returns the user', async () => {
    const user = await requireRole(req('t'), ['teacher', 'admin'], fakeClient({ user: USER, role: 'teacher' }));
    expect(user).toEqual({ id: 'user-1', email: 'student@example.com', role: 'teacher' });
  });

  it('allows an admin on an admin route', async () => {
    const user = await requireRole(req('t'), ['admin'], fakeClient({ user: USER, role: 'admin' }));
    expect(user.role).toBe('admin');
  });
});

describe('getAuthedUser', () => {
  it('treats a user with no profile row as a student', async () => {
    const user = await getAuthedUser(req('t'), fakeClient({ user: USER, role: null }));
    expect(user?.role).toBe('student');
  });

  it('treats an unknown role value as a student', async () => {
    const user = await getAuthedUser(req('t'), fakeClient({ user: USER, role: 'superuser' }));
    expect(user?.role).toBe('student');
  });

  it('returns null without a session', async () => {
    expect(await getAuthedUser(req(), fakeClient({ user: USER, role: 'admin' }))).toBeNull();
  });
});
