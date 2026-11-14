import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface DeleteUserResult {
  ok: boolean;
  error?: string;
}

// SERVER-ONLY (service-role client). Deletes a user's account and everything tied
// to it (#88) with one call: deleting their auth.users row. Every table that holds
// a user's data references auth.users ON DELETE CASCADE, so the database removes it
// all in that one statement and nothing can be left half deleted:
//   - their profile, saved sets (and the sets' cards), History, attempts, class
//     memberships and join failures;
//   - the classes they teach, with those classes' members and assignments.
// A teacher's sets take every attempt on them along (attempts.set_id cascades), so
// students lose their scores on that teacher's assignments. generation_logs,
// audit_log and app_settings keep their rows with the user's id set to null
// (ON DELETE SET NULL). A new table with user data needs the same kind of foreign
// key, or deleting an account leaves its rows behind.
//
// Throws when the account can't be deleted, so the caller never reports success
// for an account that still exists.
export async function deleteUserData(
  userId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<DeleteUserResult> {
  // The last admin can't delete their account: someone must be able to manage
  // roles. (Two admins deleting their accounts at the same moment could both pass
  // this check; that's rare enough to leave.)
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;

  if (profile?.role === 'admin') {
    const { count, error } = await client
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');
    // If the admins can't be counted, don't risk deleting the last one.
    if (error) throw error;
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "The last admin account can't be deleted. Make someone else an admin first.",
      };
    }
  }

  // supabase-js reports a failure in `error` instead of throwing.
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) throw error;
  return { ok: true };
}
