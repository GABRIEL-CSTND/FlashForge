import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface DeleteUserResult {
  ok: boolean;
  error?: string;
}

// SERVER-ONLY (service-role client). Deletes all personal data tied to a user (#88):
// study sets, cards, history entries, attempt scores, created classes (and their
// assignments/memberships), class enrollments, and their profile.
export async function deleteUserData(
  userId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<DeleteUserResult> {
  // Check if the user is the last admin: the last admin account cannot be deleted.
  const { data: profile } = await client
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.role === 'admin') {
    const { count, error } = await client
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');

    if (!error && (count ?? 0) <= 1) {
      return {
        ok: false,
        error: "The last admin account can't be deleted. Make someone else an admin first.",
      };
    }
  }

  // 1. Delete user's saved sets (cards cascade in the database)
  const { error: setsErr } = await client
    .from('flashcard_sets')
    .delete()
    .eq('user_id', userId);
  if (setsErr) throw setsErr;

  // 2. Delete user's guide history
  const { error: histErr } = await client
    .from('guide_history')
    .delete()
    .eq('user_id', userId);
  if (histErr) throw histErr;

  // 3. Delete user's quiz and study attempts
  const { error: attErr } = await client
    .from('attempts')
    .delete()
    .eq('user_id', userId);
  if (attErr) throw attErr;

  // 4. Delete classes created by this teacher (assignments and memberships cascade)
  const { error: clsErr } = await client
    .from('classes')
    .delete()
    .eq('teacher_id', userId);
  if (clsErr) throw clsErr;

  // 5. Delete class memberships where this user was a student
  const { error: memErr } = await client
    .from('class_members')
    .delete()
    .eq('student_id', userId);
  if (memErr) throw memErr;

  // 6. Delete join failures
  await client
    .from('class_join_failures')
    .delete()
    .eq('user_id', userId);

  // 7. Anonymize generation logs (set user_id = null to preserve system metrics without personal ID)
  await client
    .from('generation_logs')
    .update({ user_id: null })
    .eq('user_id', userId);

  // 8. Delete user profile
  const { error: profErr } = await client
    .from('profiles')
    .delete()
    .eq('id', userId);
  if (profErr) throw profErr;

  // 9. If auth admin client is available, delete from auth.users
  try {
    const authAdmin = (client as unknown as { auth?: { admin?: { deleteUser?: (id: string) => Promise<unknown> } } })
      ?.auth?.admin;
    if (typeof authAdmin?.deleteUser === 'function') {
      await authAdmin.deleteUser(userId);
    }
  } catch (authErr) {
    console.error('[deleteUserData] auth admin deleteUser error:', authErr);
  }

  return { ok: true };
}
