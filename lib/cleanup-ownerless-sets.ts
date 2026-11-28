import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Role } from '@/lib/role-types';

// SERVER-ONLY (service-role client).
// #131: Idempotent cleanup utility and strict access-control helpers for
// legacy/orphaned study sets that have no valid owner.

export type OrphanReason = 'missing_owner' | 'non_existent_owner';

export interface OrphanedFlashcardBackup {
  id: string;
  set_id: string;
  question?: string | null;
  answer?: string | null;
  options?: unknown;
  explanation?: string | null;
  position?: number | null;
}

export interface OrphanedAttemptBackup {
  id: string;
  user_id: string | null;
  set_id: string;
  assignment_id?: string | null;
  study_type?: string | null;
  mode?: string | null;
  score?: number | null;
  total?: number | null;
  completed_at?: string | null;
}

export interface OrphanedAssignmentBackup {
  id: string;
  class_id: string;
  set_id: string;
  due_at?: string | null;
  created_at?: string | null;
}

export interface OrphanedSetBackupRecord {
  id: string;
  user_id: string | null;
  title: string;
  source_filename: string | null;
  study_type: string;
  created_at: string | null;
  reason: OrphanReason;
  flashcards: OrphanedFlashcardBackup[];
  attempts: OrphanedAttemptBackup[];
  assignments: OrphanedAssignmentBackup[];
}

export interface CleanupBackupSnapshot {
  generatedAt: string;
  dryRun: boolean;
  totalSetsScanned: number;
  orphanedSets: OrphanedSetBackupRecord[];
  summary: {
    orphanedSetCount: number;
    missingOwnerCount: number;
    nonExistentOwnerCount: number;
    cascadedFlashcardCount: number;
    cascadedAttemptCount: number;
    cascadedAssignmentCount: number;
  };
}

export interface CleanupResult {
  dryRun: boolean;
  totalSetsScanned: number;
  orphanedSetIds: string[];
  deletedSetIds: string[];
  cascadedFlashcardCount: number;
  cascadedAttemptCount: number;
  cascadedAssignmentCount: number;
  backup: CleanupBackupSnapshot;
}

export interface CleanupOptions {
  dryRun?: boolean;
  /**
   * Optional explicit set of known valid user IDs. When omitted, valid user IDs
   * are discovered from `public.profiles` (and `auth.admin.listUsers` if present).
   */
  validUserIds?: Iterable<string>;
  logger?: (message: string, details?: Record<string, unknown>) => void;
  onBackup?: (snapshot: CleanupBackupSnapshot) => Promise<void> | void;
}

interface RawSetRow {
  id: string;
  user_id: string | null;
  title?: string | null;
  source_filename?: string | null;
  study_type?: string | null;
  created_at?: string | null;
}

async function resolveValidUserIds(
  client: SupabaseClient,
  explicit?: Iterable<string>
): Promise<Set<string> | null> {
  if (explicit) {
    return new Set(Array.from(explicit, (id) => id.trim()).filter(Boolean));
  }

  const known = new Set<string>();
  let hasSource = false;

  const { data: profiles, error: profErr } = await client.from('profiles').select('id');
  if (!profErr && Array.isArray(profiles)) {
    if (profiles.length > 0) hasSource = true;
    for (const row of profiles as { id?: unknown }[]) {
      if (typeof row.id === 'string' && row.id.trim()) {
        known.add(row.id.trim());
      }
    }
  }

  const adminAuth = (client.auth as unknown as {
    admin?: { listUsers?: () => Promise<{ data?: { users?: { id?: string }[] }; error?: unknown }> };
  })?.admin;

  if (typeof adminAuth?.listUsers === 'function') {
    const { data, error } = await adminAuth.listUsers();
    if (!error && Array.isArray(data?.users)) {
      hasSource = true;
      for (const u of data.users) {
        if (typeof u.id === 'string' && u.id.trim()) {
          known.add(u.id.trim());
        }
      }
    }
  }

  return hasSource ? known : null;
}

/**
 * Identifies all legacy/orphaned study sets where `user_id` is null/empty or
 * points to a non-existent user, along with their associated flashcards,
 * progress attempts, and class assignments.
 */
export async function identifyOrphanedStudySets(
  options: Pick<CleanupOptions, 'validUserIds'> = {},
  client: SupabaseClient = supabaseAdmin
): Promise<{ totalSetsScanned: number; orphanedSets: OrphanedSetBackupRecord[] }> {
  const { data: setsData, error: setsErr } = await client
    .from('flashcard_sets')
    .select('id, user_id, title, source_filename, study_type, created_at');
  if (setsErr) throw setsErr;

  const allSets = ((setsData ?? []) as RawSetRow[]).slice().sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  );
  const validUsers = await resolveValidUserIds(client, options.validUserIds);

  const orphanedRaw: { row: RawSetRow; reason: OrphanReason }[] = [];
  for (const row of allSets) {
    const ownerId = typeof row.user_id === 'string' ? row.user_id.trim() : '';
    if (!ownerId) {
      orphanedRaw.push({ row, reason: 'missing_owner' });
    } else if (validUsers !== null && !validUsers.has(ownerId)) {
      orphanedRaw.push({ row, reason: 'non_existent_owner' });
    }
  }

  if (orphanedRaw.length === 0) {
    return { totalSetsScanned: allSets.length, orphanedSets: [] };
  }

  const targetIds = orphanedRaw.map(({ row }) => row.id);

  const [cardsRes, attemptsRes, assignmentsRes] = await Promise.all([
    client.from('flashcards').select('*').in('set_id', targetIds),
    client.from('attempts').select('*').in('set_id', targetIds),
    client.from('assignments').select('*').in('set_id', targetIds),
  ]);
  if (cardsRes.error) throw cardsRes.error;
  if (attemptsRes.error) throw attemptsRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;

  const cardsBySet = new Map<string, OrphanedFlashcardBackup[]>();
  for (const card of (cardsRes.data ?? []) as OrphanedFlashcardBackup[]) {
    const list = cardsBySet.get(card.set_id) ?? [];
    list.push(card);
    cardsBySet.set(card.set_id, list);
  }

  const attemptsBySet = new Map<string, OrphanedAttemptBackup[]>();
  for (const attempt of (attemptsRes.data ?? []) as OrphanedAttemptBackup[]) {
    const list = attemptsBySet.get(attempt.set_id) ?? [];
    list.push(attempt);
    attemptsBySet.set(attempt.set_id, list);
  }

  const assignmentsBySet = new Map<string, OrphanedAssignmentBackup[]>();
  for (const assignment of (assignmentsRes.data ?? []) as OrphanedAssignmentBackup[]) {
    const list = assignmentsBySet.get(assignment.set_id) ?? [];
    list.push(assignment);
    assignmentsBySet.set(assignment.set_id, list);
  }

  const orphanedSets: OrphanedSetBackupRecord[] = orphanedRaw.map(({ row, reason }) => ({
    id: row.id,
    user_id: row.user_id ?? null,
    title: row.title ?? '(Untitled)',
    source_filename: row.source_filename ?? null,
    study_type: row.study_type ?? 'flashcard',
    created_at: row.created_at ?? null,
    reason,
    flashcards: cardsBySet.get(row.id) ?? [],
    attempts: attemptsBySet.get(row.id) ?? [],
    assignments: assignmentsBySet.get(row.id) ?? [],
  }));

  return { totalSetsScanned: allSets.length, orphanedSets };
}

/**
 * Idempotently identifies and deletes legacy/orphaned study sets (and cascades
 * cleanup of their flashcards, attempts, and assignments). Supports `--dry-run`
 * and a backup/logging safeguard before any destructive operation runs.
 */
export async function cleanupOrphanedStudySets(
  options: CleanupOptions = {},
  client: SupabaseClient = supabaseAdmin
): Promise<CleanupResult> {
  const dryRun = options.dryRun === true;
  const log = options.logger ?? (() => {});

  const { totalSetsScanned, orphanedSets } = await identifyOrphanedStudySets(
    { validUserIds: options.validUserIds },
    client
  );

  const missingOwnerCount = orphanedSets.filter((s) => s.reason === 'missing_owner').length;
  const nonExistentOwnerCount = orphanedSets.filter((s) => s.reason === 'non_existent_owner').length;
  const cascadedFlashcardCount = orphanedSets.reduce((sum, s) => sum + s.flashcards.length, 0);
  const cascadedAttemptCount = orphanedSets.reduce((sum, s) => sum + s.attempts.length, 0);
  const cascadedAssignmentCount = orphanedSets.reduce((sum, s) => sum + s.assignments.length, 0);

  const backup: CleanupBackupSnapshot = {
    generatedAt: new Date().toISOString(),
    dryRun,
    totalSetsScanned,
    orphanedSets,
    summary: {
      orphanedSetCount: orphanedSets.length,
      missingOwnerCount,
      nonExistentOwnerCount,
      cascadedFlashcardCount,
      cascadedAttemptCount,
      cascadedAssignmentCount,
    },
  };

  if (options.onBackup) {
    await options.onBackup(backup);
  }

  const orphanedSetIds = orphanedSets.map((s) => s.id);

  log(
    dryRun
      ? `[DRY-RUN] Identified ${orphanedSets.length} orphaned study set(s) (${cascadedFlashcardCount} flashcards, ${cascadedAttemptCount} attempts). No records were deleted.`
      : `Identified ${orphanedSets.length} orphaned study set(s) for permanent removal.`,
    {
      dryRun,
      totalSetsScanned,
      orphanedSetIds,
      missingOwnerCount,
      nonExistentOwnerCount,
      cascadedFlashcardCount,
      cascadedAttemptCount,
      cascadedAssignmentCount,
    }
  );

  if (dryRun || orphanedSetIds.length === 0) {
    return {
      dryRun,
      totalSetsScanned,
      orphanedSetIds,
      deletedSetIds: [],
      cascadedFlashcardCount,
      cascadedAttemptCount,
      cascadedAssignmentCount,
      backup,
    };
  }

  // Explicitly delete child progress/attempt records, assignments, and flashcards
  // first so cleanup works consistently even on clients/environments where FK
  // cascade rules are not active in-memory, then delete the orphaned sets.
  const { error: attemptsDelErr } = await client.from('attempts').delete().in('set_id', orphanedSetIds);
  if (attemptsDelErr) throw attemptsDelErr;

  const { error: assignDelErr } = await client.from('assignments').delete().in('set_id', orphanedSetIds);
  if (assignDelErr) throw assignDelErr;

  const { error: cardsDelErr } = await client.from('flashcards').delete().in('set_id', orphanedSetIds);
  if (cardsDelErr) throw cardsDelErr;

  const { error: setsDelErr } = await client.from('flashcard_sets').delete().in('id', orphanedSetIds);
  if (setsDelErr) throw setsDelErr;

  log(`Deleted ${orphanedSetIds.length} orphaned study set(s) and their associated records.`, {
    deletedSetIds: orphanedSetIds,
    cascadedFlashcardCount,
    cascadedAttemptCount,
    cascadedAssignmentCount,
  });

  return {
    dryRun: false,
    totalSetsScanned,
    orphanedSetIds,
    deletedSetIds: orphanedSetIds,
    cascadedFlashcardCount,
    cascadedAttemptCount,
    cascadedAssignmentCount,
    backup,
  };
}

export interface CleanupCliArgs {
  dryRun: boolean;
  backupFile: string | null;
}

export function parseCleanupCliArgs(argv: string[]): CleanupCliArgs {
  let dryRun = false;
  let backupFile: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run' || arg === '-n') {
      dryRun = true;
    } else if (arg === '--backup-file' || arg === '--backup') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        backupFile = next;
        i += 1;
      }
    } else if (arg.startsWith('--backup-file=')) {
      backupFile = arg.slice('--backup-file='.length) || null;
    } else if (arg.startsWith('--backup=')) {
      backupFile = arg.slice('--backup='.length) || null;
    }
  }

  return { dryRun, backupFile };
}

export type SetAccessLevel = 'owner' | 'class_member' | 'admin';

export type SetAccessDecision =
  | {
      ok: true;
      status: 200;
      access: SetAccessLevel;
      set: { id: string; userId: string; title: string; studyType: string };
    }
  | {
      ok: false;
      status: 401 | 403 | 404;
      error: string;
    };

/**
 * Enforces strict study-set visibility boundaries (#131):
 * - Only the set's designated owner, students enrolled in a class to which the
 *   owner assigned the set, or verified admins may access a study set.
 * - Orphaned/ownerless sets (where `user_id` is null or points to a non-existent
 *   owner) are never accessible and return 404 Not Found.
 * - Unauthenticated callers receive 401/403 and unauthorized users receive 403
 *   Forbidden (or 404 when the set does not exist).
 */
export async function authorizeStudySetAccess(
  params: {
    setId: string;
    userId: string | null;
    role?: Role | null;
    hideUnauthorizedAs404?: boolean;
  },
  client: SupabaseClient = supabaseAdmin
): Promise<SetAccessDecision> {
  const { setId, userId, hideUnauthorizedAs404 = false } = params;

  if (!userId) {
    return hideUnauthorizedAs404
      ? { ok: false, status: 404, error: 'Study set not found.' }
      : { ok: false, status: 403, error: 'Forbidden: sign in to view this study set.' };
  }

  const { data: set, error: setErr } = await client
    .from('flashcard_sets')
    .select('id, user_id, title, study_type')
    .eq('id', setId)
    .maybeSingle();
  if (setErr) throw setErr;

  const ownerId = typeof set?.user_id === 'string' ? set.user_id.trim() : '';
  if (!set || !ownerId) {
    return { ok: false, status: 404, error: 'Study set not found.' };
  }

  // Verify the owner exists when profiles are present in the database.
  const { data: ownerProfile, error: ownerErr } = await client
    .from('profiles')
    .select('id')
    .eq('id', ownerId)
    .maybeSingle();
  if (!ownerErr && !ownerProfile) {
    const { data: anyProfiles } = await client.from('profiles').select('id').limit(1);
    if ((anyProfiles ?? []).length > 0) {
      return { ok: false, status: 404, error: 'Study set not found.' };
    }
  }

  const summary = {
    id: set.id as string,
    userId: ownerId,
    title: (set.title as string) ?? '',
    studyType: (set.study_type as string) ?? 'flashcard',
  };

  if (ownerId === userId) {
    return { ok: true, status: 200, access: 'owner', set: summary };
  }

  let callerRole: Role | null = params.role ?? null;
  if (!callerRole) {
    const { data: profile, error: profErr } = await client
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (profErr) throw profErr;
    callerRole = (profile?.role as Role | undefined) ?? 'student';
  }

  if (callerRole === 'admin') {
    return { ok: true, status: 200, access: 'admin', set: summary };
  }

  const [{ data: assignments, error: aErr }, { data: memberships, error: mErr }] = await Promise.all([
    client.from('assignments').select('class_id').eq('set_id', setId),
    client.from('class_members').select('class_id').eq('student_id', userId),
  ]);
  if (aErr) throw aErr;
  if (mErr) throw mErr;

  const enrolledClassIds = new Set((memberships ?? []).map((m) => m.class_id as string));
  const assignedClassIds = (assignments ?? [])
    .map((a) => a.class_id as string)
    .filter((classId) => enrolledClassIds.has(classId));

  if (assignedClassIds.length > 0) {
    // Ensure the class belongs to the set's designated owner if classes are tracked.
    const { data: ownerClasses, error: cErr } = await client
      .from('classes')
      .select('id, teacher_id')
      .in('id', assignedClassIds);
    if (cErr) throw cErr;

    const validClass =
      !ownerClasses ||
      ownerClasses.length === 0 ||
      ownerClasses.some((c) => c.teacher_id === ownerId);

    if (validClass) {
      return { ok: true, status: 200, access: 'class_member', set: summary };
    }
  }

  return hideUnauthorizedAs404
    ? { ok: false, status: 404, error: 'Study set not found.' }
    : { ok: false, status: 403, error: 'Forbidden: you do not have access to this study set.' };
}
