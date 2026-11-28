import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, fakeUuid, type FakeDb } from '@/test-utils/fake-supabase';

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {},
}));

import {
  authorizeStudySetAccess,
  cleanupOrphanedStudySets,
  identifyOrphanedStudySets,
  parseCleanupCliArgs,
  type CleanupBackupSnapshot,
} from '@/lib/cleanup-ownerless-sets';
import { findStudySet } from '@/lib/attempts';

const USERS = {
  teacher: { id: fakeUuid(), email: 'teacher@example.com', role: 'teacher' as const },
  enrolledStudent: { id: fakeUuid(), email: 'student@example.com', role: 'student' as const },
  outsiderStudent: { id: fakeUuid(), email: 'outsider@example.com', role: 'student' as const },
  otherTeacher: { id: fakeUuid(), email: 'other-teacher@example.com', role: 'teacher' as const },
  admin: { id: fakeUuid(), email: 'admin@example.com', role: 'admin' as const },
  deletedGhostId: fakeUuid(),
};

const SETS = {
  teacherPrivate: fakeUuid(),
  teacherAssigned: fakeUuid(),
  nullOwnerLegacy: fakeUuid(),
  emptyOwnerLegacy: fakeUuid(),
  ghostOwnerOrphan: fakeUuid(),
};

const CLASSES = {
  bio101: fakeUuid(),
};

let client: SupabaseClient;
let db: FakeDb;

beforeEach(() => {
  const fake = createFakeSupabase({
    tables: {
      profiles: { unique: [['id']] },
      flashcard_sets: {
        unique: [['id']],
        cascade: [
          { table: 'flashcards', column: 'set_id' },
          { table: 'attempts', column: 'set_id' },
          { table: 'assignments', column: 'set_id' },
        ],
      },
      flashcards: { unique: [['id']] },
      classes: { unique: [['id']] },
      class_members: { unique: [['class_id', 'student_id']] },
      assignments: { unique: [['id'], ['class_id', 'set_id']] },
      attempts: { unique: [['id']] },
    },
  });
  client = fake.client as unknown as SupabaseClient;
  db = fake.db;

  db.rows.profiles = [
    { id: USERS.teacher.id, role: USERS.teacher.role, display_name: 'Ms. Teacher' },
    { id: USERS.enrolledStudent.id, role: USERS.enrolledStudent.role, display_name: 'Sam Student' },
    { id: USERS.outsiderStudent.id, role: USERS.outsiderStudent.role, display_name: 'Out Student' },
    { id: USERS.otherTeacher.id, role: USERS.otherTeacher.role, display_name: 'Mr. Other' },
    { id: USERS.admin.id, role: USERS.admin.role, display_name: 'Site Admin' },
  ];

  db.rows.flashcard_sets = [
    {
      id: SETS.teacherPrivate,
      user_id: USERS.teacher.id,
      title: 'Private Cell Notes',
      source_filename: 'cells.pdf',
      study_type: 'flashcard',
      created_at: '2026-10-10T00:00:00Z',
    },
    {
      id: SETS.teacherAssigned,
      user_id: USERS.teacher.id,
      title: 'Assigned Photosynthesis Quiz',
      source_filename: 'photo.pdf',
      study_type: 'multiple_choice',
      created_at: '2026-10-12T00:00:00Z',
    },
    {
      id: SETS.nullOwnerLegacy,
      user_id: null,
      title: 'Legacy August Set (null owner)',
      source_filename: null,
      study_type: 'flashcard',
      created_at: '2026-08-30T00:00:00Z',
    },
    {
      id: SETS.emptyOwnerLegacy,
      user_id: '   ',
      title: 'Legacy Blank Owner Set',
      source_filename: null,
      study_type: 'flashcard',
      created_at: '2026-09-01T00:00:00Z',
    },
    {
      id: SETS.ghostOwnerOrphan,
      user_id: USERS.deletedGhostId,
      title: 'Orphaned Set for Non-Existent User',
      source_filename: 'ghost.txt',
      study_type: 'flashcard',
      created_at: '2026-09-04T00:00:00Z',
    },
  ];

  db.rows.flashcards = [
    { id: fakeUuid(), set_id: SETS.teacherPrivate, question: 'Q-priv', answer: 'A-priv', position: 0 },
    { id: fakeUuid(), set_id: SETS.teacherAssigned, question: 'Q-asg', answer: 'A-asg', position: 0 },
    { id: fakeUuid(), set_id: SETS.nullOwnerLegacy, question: 'Q-leg-1', answer: 'A-leg-1', position: 0 },
    { id: fakeUuid(), set_id: SETS.nullOwnerLegacy, question: 'Q-leg-2', answer: 'A-leg-2', position: 1 },
    { id: fakeUuid(), set_id: SETS.emptyOwnerLegacy, question: 'Q-emp-1', answer: 'A-emp-1', position: 0 },
    { id: fakeUuid(), set_id: SETS.ghostOwnerOrphan, question: 'Q-gho-1', answer: 'A-gho-1', position: 0 },
  ];

  db.rows.classes = [
    { id: CLASSES.bio101, teacher_id: USERS.teacher.id, name: 'Biology 101' },
  ];

  db.rows.class_members = [
    { class_id: CLASSES.bio101, student_id: USERS.enrolledStudent.id, joined_at: '2026-10-15T00:00:00Z' },
  ];

  db.rows.assignments = [
    { id: fakeUuid(), class_id: CLASSES.bio101, set_id: SETS.teacherAssigned, due_at: null, created_at: '2026-10-15T00:00:00Z' },
    { id: fakeUuid(), class_id: CLASSES.bio101, set_id: SETS.ghostOwnerOrphan, due_at: null, created_at: '2026-09-05T00:00:00Z' },
  ];

  db.rows.attempts = [
    {
      id: fakeUuid(),
      user_id: USERS.enrolledStudent.id,
      set_id: SETS.teacherAssigned,
      study_type: 'multiple_choice',
      score: 1,
      total: 1,
      completed_at: '2026-10-16T00:00:00Z',
    },
    {
      id: fakeUuid(),
      user_id: USERS.enrolledStudent.id,
      set_id: SETS.nullOwnerLegacy,
      study_type: 'flashcard',
      score: 2,
      total: 2,
      completed_at: '2026-09-10T00:00:00Z',
    },
    {
      id: fakeUuid(),
      user_id: USERS.outsiderStudent.id,
      set_id: SETS.ghostOwnerOrphan,
      study_type: 'flashcard',
      score: 0,
      total: 1,
      completed_at: '2026-09-11T00:00:00Z',
    },
  ];
});

describe('parseCleanupCliArgs (#131)', () => {
  it('parses --dry-run and --backup-file flags accurately', () => {
    expect(parseCleanupCliArgs([])).toEqual({ dryRun: false, backupFile: null });
    expect(parseCleanupCliArgs(['--dry-run'])).toEqual({ dryRun: true, backupFile: null });
    expect(parseCleanupCliArgs(['-n', '--backup-file', './tmp/backup.json'])).toEqual({
      dryRun: true,
      backupFile: './tmp/backup.json',
    });
    expect(parseCleanupCliArgs(['--backup=out.json'])).toEqual({
      dryRun: false,
      backupFile: 'out.json',
    });
  });
});

describe('identifyOrphanedStudySets & cleanupOrphanedStudySets (#131)', () => {
  it('identifies sets with null, empty, or non-existent user_id along with their child records', async () => {
    const { totalSetsScanned, orphanedSets } = await identifyOrphanedStudySets({}, client);
    expect(totalSetsScanned).toBe(5);
    expect(orphanedSets).toHaveLength(3);

    const reasons = Object.fromEntries(orphanedSets.map((s) => [s.id, s.reason]));
    expect(reasons).toEqual({
      [SETS.nullOwnerLegacy]: 'missing_owner',
      [SETS.emptyOwnerLegacy]: 'missing_owner',
      [SETS.ghostOwnerOrphan]: 'non_existent_owner',
    });
  });

  it('supports --dry-run with backup and logging safeguards without deleting any database rows', async () => {
    const logs: { msg: string; meta?: Record<string, unknown> }[] = [];
    let capturedBackup: CleanupBackupSnapshot | null = null;

    const result = await cleanupOrphanedStudySets(
      {
        dryRun: true,
        logger: (msg, meta) => logs.push({ msg, meta }),
        onBackup: (snapshot) => {
          capturedBackup = snapshot;
        },
      },
      client
    );

    expect(result.dryRun).toBe(true);
    expect(result.orphanedSetIds).toHaveLength(3);
    expect(result.deletedSetIds).toEqual([]);
    expect(result.cascadedFlashcardCount).toBe(4);
    expect(result.cascadedAttemptCount).toBe(2);
    expect(result.cascadedAssignmentCount).toBe(1);

    expect(capturedBackup).not.toBeNull();
    expect(capturedBackup!.summary).toEqual({
      orphanedSetCount: 3,
      missingOwnerCount: 2,
      nonExistentOwnerCount: 1,
      cascadedFlashcardCount: 4,
      cascadedAttemptCount: 2,
      cascadedAssignmentCount: 1,
    });
    expect(logs[0]?.msg).toContain('[DRY-RUN]');

    // Verify zero mutations occurred in the database during dry-run
    expect(db.rows.flashcard_sets).toHaveLength(5);
    expect(db.rows.flashcards).toHaveLength(6);
    expect(db.rows.attempts).toHaveLength(3);
    expect(db.rows.assignments).toHaveLength(2);
  });

  it('permanently deletes orphaned sets and cascades cleanup of flashcards, attempts, and assignments, and is idempotent on re-run', async () => {
    const onBackup = vi.fn();
    const firstRun = await cleanupOrphanedStudySets({ dryRun: false, onBackup }, client);

    expect(firstRun.dryRun).toBe(false);
    expect(firstRun.deletedSetIds.sort()).toEqual(
      [SETS.nullOwnerLegacy, SETS.emptyOwnerLegacy, SETS.ghostOwnerOrphan].sort()
    );
    expect(firstRun.cascadedFlashcardCount).toBe(4);
    expect(firstRun.cascadedAttemptCount).toBe(2);
    expect(firstRun.cascadedAssignmentCount).toBe(1);
    expect(onBackup).toHaveBeenCalledTimes(1);

    // Only valid owned sets and their associated records remain
    expect(db.rows.flashcard_sets.map((s) => s.id).sort()).toEqual(
      [SETS.teacherPrivate, SETS.teacherAssigned].sort()
    );
    expect(db.rows.flashcards.map((c) => c.set_id).sort()).toEqual(
      [SETS.teacherPrivate, SETS.teacherAssigned].sort()
    );
    expect(db.rows.attempts.map((a) => a.set_id)).toEqual([SETS.teacherAssigned]);
    expect(db.rows.assignments.map((a) => a.set_id)).toEqual([SETS.teacherAssigned]);

    // Second run is idempotent: 0 orphaned sets found, 0 deleted, valid sets untouched
    const secondRun = await cleanupOrphanedStudySets({ dryRun: false }, client);
    expect(secondRun.orphanedSetIds).toEqual([]);
    expect(secondRun.deletedSetIds).toEqual([]);
    expect(secondRun.cascadedFlashcardCount).toBe(0);
    expect(secondRun.cascadedAttemptCount).toBe(0);
    expect(db.rows.flashcard_sets).toHaveLength(2);
  });
});

describe('authorizeStudySetAccess role-based visibility boundaries (#131)', () => {
  it('allows the designated owner to access both their private and assigned sets', async () => {
    const priv = await authorizeStudySetAccess(
      { setId: SETS.teacherPrivate, userId: USERS.teacher.id },
      client
    );
    expect(priv).toMatchObject({ ok: true, status: 200, access: 'owner' });

    const asg = await authorizeStudySetAccess(
      { setId: SETS.teacherAssigned, userId: USERS.teacher.id },
      client
    );
    expect(asg).toMatchObject({ ok: true, status: 200, access: 'owner' });
  });

  it('allows a student enrolled in an assigned class to access the assigned set, but blocks them from the owner’s private unassigned set', async () => {
    const assignedDecision = await authorizeStudySetAccess(
      { setId: SETS.teacherAssigned, userId: USERS.enrolledStudent.id },
      client
    );
    expect(assignedDecision).toMatchObject({ ok: true, status: 200, access: 'class_member' });

    const privateDecision = await authorizeStudySetAccess(
      { setId: SETS.teacherPrivate, userId: USERS.enrolledStudent.id },
      client
    );
    expect(privateDecision).toEqual({
      ok: false,
      status: 403,
      error: 'Forbidden: you do not have access to this study set.',
    });

    const hiddenDecision = await authorizeStudySetAccess(
      { setId: SETS.teacherPrivate, userId: USERS.enrolledStudent.id, hideUnauthorizedAs404: true },
      client
    );
    expect(hiddenDecision).toEqual({
      ok: false,
      status: 404,
      error: 'Study set not found.',
    });
  });

  it('allows a verified admin to access any valid owned study set', async () => {
    const priv = await authorizeStudySetAccess(
      { setId: SETS.teacherPrivate, userId: USERS.admin.id },
      client
    );
    expect(priv).toMatchObject({ ok: true, status: 200, access: 'admin' });

    const asg = await authorizeStudySetAccess(
      { setId: SETS.teacherAssigned, userId: USERS.admin.id },
      client
    );
    expect(asg).toMatchObject({ ok: true, status: 200, access: 'admin' });
  });

  it('denies access (403 / 404) to signed-out visitors, students outside the class, and other teachers', async () => {
    const anon = await authorizeStudySetAccess(
      { setId: SETS.teacherAssigned, userId: null },
      client
    );
    expect(anon.ok).toBe(false);
    expect(anon.status).toBe(403);

    const outsider = await authorizeStudySetAccess(
      { setId: SETS.teacherAssigned, userId: USERS.outsiderStudent.id },
      client
    );
    expect(outsider).toEqual({
      ok: false,
      status: 403,
      error: 'Forbidden: you do not have access to this study set.',
    });

    const otherTeacher = await authorizeStudySetAccess(
      { setId: SETS.teacherAssigned, userId: USERS.otherTeacher.id },
      client
    );
    expect(otherTeacher).toEqual({
      ok: false,
      status: 403,
      error: 'Forbidden: you do not have access to this study set.',
    });
  });

  it('returns 404 Not Found for orphaned/ownerless sets even if a user or admin requests them', async () => {
    for (const orphanId of [SETS.nullOwnerLegacy, SETS.emptyOwnerLegacy, SETS.ghostOwnerOrphan]) {
      for (const viewerId of [USERS.enrolledStudent.id, USERS.teacher.id, USERS.admin.id]) {
        const res = await authorizeStudySetAccess({ setId: orphanId, userId: viewerId }, client);
        expect(res).toEqual({
          ok: false,
          status: 404,
          error: 'Study set not found.',
        });
        expect(await findStudySet(viewerId, orphanId, client)).toBeNull();
      }
    }
  });

  it('findStudySet allows owner, enrolled class student, and admin on valid sets, and blocks unauthorized users', async () => {
    expect(await findStudySet(USERS.teacher.id, SETS.teacherPrivate, client)).toMatchObject({
      id: SETS.teacherPrivate,
    });
    expect(await findStudySet(USERS.enrolledStudent.id, SETS.teacherAssigned, client)).toMatchObject({
      id: SETS.teacherAssigned,
    });
    expect(await findStudySet(USERS.admin.id, SETS.teacherPrivate, client)).toMatchObject({
      id: SETS.teacherPrivate,
    });
    expect(await findStudySet(USERS.enrolledStudent.id, SETS.teacherPrivate, client)).toBeNull();
    expect(await findStudySet(USERS.outsiderStudent.id, SETS.teacherAssigned, client)).toBeNull();
  });
});
