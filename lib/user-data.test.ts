import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeUuid, type FakeDb } from '@/test-utils/fake-supabase';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }));

import { deleteUserData } from '@/lib/user-data';

const USER_A = fakeUuid();
const USER_B = fakeUuid();

let fake: ReturnType<typeof createFakeSupabase>;
let db: FakeDb;

beforeEach(() => {
  fake = createFakeSupabase({
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
  });
  db = fake.db;
});

describe('deleteUserData (#88)', () => {
  it('deletes all personal data for the user while leaving other users untouched', async () => {
    // Seed user A data
    db.rows.profiles = [
      { id: USER_A, role: 'student', displayName: 'User A' },
      { id: USER_B, role: 'student', displayName: 'User B' },
    ];
    db.rows.flashcard_sets = [
      { id: 'set-1', user_id: USER_A, title: 'Set A' },
      { id: 'set-2', user_id: USER_B, title: 'Set B' },
    ];
    db.rows.guide_history = [
      { id: 'h-1', user_id: USER_A, title: 'Guide A' },
      { id: 'h-2', user_id: USER_B, title: 'Guide B' },
    ];
    db.rows.attempts = [
      { id: 'att-1', user_id: USER_A, score: 9 },
      { id: 'att-2', user_id: USER_B, score: 8 },
    ];
    db.rows.classes = [
      { id: 'c-1', teacher_id: USER_A, name: 'Class A' },
      { id: 'c-2', teacher_id: USER_B, name: 'Class B' },
    ];
    db.rows.class_members = [
      { id: 'm-1', student_id: USER_A, class_id: 'c-2' },
      { id: 'm-2', student_id: USER_B, class_id: 'c-1' },
    ];
    db.rows.class_join_failures = [
      { id: 'f-1', user_id: USER_A },
      { id: 'f-2', user_id: USER_B },
    ];
    db.rows.generation_logs = [
      { id: 1, user_id: USER_A, duration_ms: 100 },
      { id: 2, user_id: USER_B, duration_ms: 200 },
    ];

    const result = await deleteUserData(USER_A, fake.client as any);
    expect(result).toEqual({ ok: true });

    // User A data is gone
    expect(db.rows.profiles.find((p) => p.id === USER_A)).toBeUndefined();
    expect(db.rows.flashcard_sets.find((s) => s.user_id === USER_A)).toBeUndefined();
    expect(db.rows.guide_history.find((h) => h.user_id === USER_A)).toBeUndefined();
    expect(db.rows.attempts.find((a) => a.user_id === USER_A)).toBeUndefined();
    expect(db.rows.classes.find((c) => c.teacher_id === USER_A)).toBeUndefined();
    expect(db.rows.class_members.find((m) => m.student_id === USER_A)).toBeUndefined();
    expect(db.rows.class_join_failures.find((f) => f.user_id === USER_A)).toBeUndefined();

    // Generation logs anonymized
    expect(db.rows.generation_logs.find((l) => l.id === 1)?.user_id).toBeNull();

    // User B data is completely untouched
    expect(db.rows.profiles.find((p) => p.id === USER_B)).toBeDefined();
    expect(db.rows.flashcard_sets.find((s) => s.user_id === USER_B)).toBeDefined();
    expect(db.rows.guide_history.find((h) => h.user_id === USER_B)).toBeDefined();
    expect(db.rows.attempts.find((a) => a.user_id === USER_B)).toBeDefined();
    expect(db.rows.classes.find((c) => c.teacher_id === USER_B)).toBeDefined();
    expect(db.rows.class_members.find((m) => m.student_id === USER_B)).toBeDefined();
    expect(db.rows.class_join_failures.find((f) => f.user_id === USER_B)).toBeDefined();
    expect(db.rows.generation_logs.find((l) => l.id === 2)?.user_id).toBe(USER_B);
  });

  it('refuses to delete the last admin account', async () => {
    db.rows.profiles = [{ id: USER_A, role: 'admin' }];

    const result = await deleteUserData(USER_A, fake.client as any);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("The last admin account can't be deleted");
    expect(db.rows.profiles).toHaveLength(1);
  });

  it('allows deleting an admin account if another admin exists', async () => {
    db.rows.profiles = [
      { id: USER_A, role: 'admin' },
      { id: USER_B, role: 'admin' },
    ];

    const result = await deleteUserData(USER_A, fake.client as any);
    expect(result).toEqual({ ok: true });
    expect(db.rows.profiles.find((p) => p.id === USER_A)).toBeUndefined();
    expect(db.rows.profiles.find((p) => p.id === USER_B)).toBeDefined();
  });
});
