#!/usr/bin/env node
// #131: Idempotent CLI script to identify and permanently delete legacy/orphaned
// study sets that have no owner (user_id is null or points to a non-existent user),
// along with cascading cleanup of their flashcards, assignments, and attempts.
//
// Usage:
//   node scripts/cleanup-ownerless-sets.mjs --dry-run
//   node scripts/cleanup-ownerless-sets.mjs --backup-file ./backups/orphaned-sets.json

import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function parseArgs(argv) {
  let dryRun = false;
  let backupFile = null;
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

async function main() {
  const { dryRun, backupFile } = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
    process.exit(1);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sets, error: setsErr } = await client
    .from('flashcard_sets')
    .select('id, user_id, title, source_filename, study_type, created_at');
  if (setsErr) throw setsErr;

  const { data: profiles, error: profErr } = await client.from('profiles').select('id');
  if (profErr) throw profErr;
  const validUserIds = new Set((profiles ?? []).map((p) => p.id));

  const orphaned = [];
  for (const row of sets ?? []) {
    const ownerId = typeof row.user_id === 'string' ? row.user_id.trim() : '';
    if (!ownerId) {
      orphaned.push({ ...row, reason: 'missing_owner' });
    } else if (validUserIds.size > 0 && !validUserIds.has(ownerId)) {
      orphaned.push({ ...row, reason: 'non_existent_owner' });
    }
  }

  const targetIds = orphaned.map((s) => s.id);
  let cards = [];
  let attempts = [];
  let assignments = [];

  if (targetIds.length > 0) {
    const [cRes, aRes, asgRes] = await Promise.all([
      client.from('flashcards').select('*').in('set_id', targetIds),
      client.from('attempts').select('*').in('set_id', targetIds),
      client.from('assignments').select('*').in('set_id', targetIds),
    ]);
    if (cRes.error) throw cRes.error;
    if (aRes.error) throw aRes.error;
    if (asgRes.error) throw asgRes.error;
    cards = cRes.data ?? [];
    attempts = aRes.data ?? [];
    assignments = asgRes.data ?? [];
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    dryRun,
    totalSetsScanned: (sets ?? []).length,
    summary: {
      orphanedSetCount: orphaned.length,
      cascadedFlashcardCount: cards.length,
      cascadedAttemptCount: attempts.length,
      cascadedAssignmentCount: assignments.length,
    },
    orphanedSets: orphaned.map((s) => ({
      ...s,
      flashcards: cards.filter((c) => c.set_id === s.id),
      attempts: attempts.filter((a) => a.set_id === s.id),
      assignments: assignments.filter((a) => a.set_id === s.id),
    })),
  };

  const resolvedBackupPath =
    backupFile ??
    path.join(
      process.cwd(),
      `orphaned-sets-backup-${snapshot.generatedAt.replace(/[:.]/g, '-')}.json`
    );

  await fs.mkdir(path.dirname(resolvedBackupPath), { recursive: true });
  await fs.writeFile(resolvedBackupPath, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(`[BACKUP] Wrote safeguard backup snapshot to ${resolvedBackupPath}`);
  console.log(JSON.stringify(snapshot.summary, null, 2));

  if (dryRun) {
    console.log('[DRY-RUN] Complete. No database rows were modified.');
    return;
  }

  if (targetIds.length === 0) {
    console.log('[CLEANUP] No orphaned study sets found. Database is already clean.');
    return;
  }

  const { error: delErr } = await client.from('flashcard_sets').delete().in('id', targetIds);
  if (delErr) throw delErr;

  console.log(
    `[CLEANUP] Permanently deleted ${targetIds.length} orphaned study set(s), ${cards.length} flashcard(s), ${attempts.length} attempt(s), and ${assignments.length} assignment(s).`
  );
}

main().catch((err) => {
  console.error('[CLEANUP ERROR]', err);
  process.exit(1);
});
