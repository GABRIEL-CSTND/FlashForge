import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Role } from '@/lib/role-types';

// SERVER-ONLY (service-role client). Admin tools (#60). Routes check that the
// caller is an admin first, and the database functions check again.

export interface AdminUser {
  id: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  signedUpAt: string;
  setCount: number;
}

interface UserRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  signed_up_at: string;
  set_count: number | string;
}

// Newest sign-ups first; `search` matches part of an email or name.
export async function listUsers(search: string, client: SupabaseClient = supabaseAdmin): Promise<AdminUser[]> {
  const { data, error } = await client.rpc('admin_list_users', { p_search: search.trim() || null, p_limit: 200 });
  if (error) throw error;
  return ((data ?? []) as UserRow[]).map((r) => ({
    id: r.user_id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    signedUpAt: r.signed_up_at,
    setCount: Number(r.set_count),
  }));
}

export type ChangeRoleResult =
  | { ok: true; from: Role; to: Role }
  | { ok: false; reason: 'not-found' | 'last-admin' };

// public.admin_change_role() locks the admin rows, refuses to demote the last
// admin, and writes the change to audit_log, all in one transaction.
export async function changeUserRole(
  actorId: string,
  userId: string,
  role: Role,
  client: SupabaseClient = supabaseAdmin
): Promise<ChangeRoleResult> {
  const { data, error } = await client.rpc('admin_change_role', {
    p_actor_id: actorId,
    p_user_id: userId,
    p_role: role,
  });
  if (!error) return { ok: true, from: data as Role, to: role };
  if (error.code === 'P0002') return { ok: false, reason: 'not-found' };
  if (error.code === 'P0001' && error.message === 'last_admin') return { ok: false, reason: 'last-admin' };
  throw error;
}
