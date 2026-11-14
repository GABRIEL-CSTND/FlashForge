import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, fakeUuid, type FakeDb } from '@/test-utils/fake-supabase';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }));

import { deleteUserData } from '@/lib/user-data';

const USER_A = fakeUuid();
const USER_B = fakeUuid();

// Supabase Auth's admin delete reports a failure in `error`; it doesn't throw.
const makeDeleteUser = () =>
  vi.fn(async (id: string) => ({ data: { id } as unknown, error: null as { message: string } | null }));

let fake: ReturnType<typeof createFakeSupabase>;
let db: FakeDb;
let deleteUser: ReturnType<typeof makeDeleteUser>;
let client: SupabaseClient;

beforeEach(() => {
  fake = createFakeSupabase({
    tables: {
      profiles: { unique: [['id']] },
      flashcard_sets: { unique: [['id']] },
    },
  });
  db = fake.db;
  deleteUser = makeDeleteUser();
  client = { ...fake.client, auth: { ...fake.client.auth, admin: { deleteUser } } } as unknown as SupabaseClient;
});

describe('deleteUserData (#88)', () => {
  it('deletes the account through Supabase Auth, which removes all its data in one step', async () => {
    db.rows.profiles = [
      { id: USER_A, role: 'student' },
      { id: USER_B, role: 'student' },
    ];
    db.rows.flashcard_sets = [{ id: 'set-a', user_id: USER_A }];

    expect(await deleteUserData(USER_A, client)).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledOnce();
    expect(deleteUser).toHaveBeenCalledWith(USER_A);
    // Nothing is deleted table by table: the database's ON DELETE CASCADE removes
    // the rest with the account (this fake doesn't model it), so it can't stop halfway.
    expect(db.rows.flashcard_sets).toHaveLength(1);
    expect(db.rows.profiles).toHaveLength(2);
  });

  it('throws when Supabase Auth reports the account was not deleted', async () => {
    db.rows.profiles = [{ id: USER_A, role: 'student' }];
    deleteUser.mockResolvedValueOnce({ data: null, error: { message: 'Database error deleting user' } });

    await expect(deleteUserData(USER_A, client)).rejects.toMatchObject({ message: 'Database error deleting user' });
  });

  it('refuses to delete the last admin account', async () => {
    db.rows.profiles = [{ id: USER_A, role: 'admin' }];

    const result = await deleteUserData(USER_A, client);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("The last admin account can't be deleted");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('allows deleting an admin account if another admin exists', async () => {
    db.rows.profiles = [
      { id: USER_A, role: 'admin' },
      { id: USER_B, role: 'admin' },
    ];

    expect(await deleteUserData(USER_A, client)).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledWith(USER_A);
  });

  it("doesn't delete an admin when the admins can't be counted", async () => {
    db.rows.profiles = [
      { id: USER_A, role: 'admin' },
      { id: USER_B, role: 'admin' },
    ];
    // The role read works; the count of admins that follows fails.
    let profileQueries = 0;
    const flaky = {
      ...client,
      from: (table: string) => {
        if (table === 'profiles' && ++profileQueries === 2) db.failNext('profiles', 'select');
        return fake.client.from(table);
      },
    } as unknown as SupabaseClient;

    await expect(deleteUserData(USER_A, flaky)).rejects.toBeDefined();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("doesn't delete anything when the user's role can't be read", async () => {
    db.rows.profiles = [{ id: USER_A, role: 'student' }];
    db.failNext('profiles', 'select');

    await expect(deleteUserData(USER_A, client)).rejects.toBeDefined();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
