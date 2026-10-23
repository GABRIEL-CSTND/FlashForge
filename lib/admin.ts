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

export interface AdminSet {
  id: string;
  title: string;
  studyType: string;
  createdAt: string;
  // Null for legacy sets made before sign-in was required.
  ownerId: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  cardCount: number;
  assignmentCount: number;
}

interface SetRow {
  set_id: string;
  title: string;
  study_type: string;
  created_at: string;
  owner_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
  card_count: number | string;
  assignment_count: number | string;
}

// Every study set, newest first (#61); `search` matches part of a title or the
// owner's email or name.
export async function listSets(search: string, client: SupabaseClient = supabaseAdmin): Promise<AdminSet[]> {
  const { data, error } = await client.rpc('admin_list_sets', { p_search: search.trim() || null, p_limit: 200 });
  if (error) throw error;
  return ((data ?? []) as SetRow[]).map((r) => ({
    id: r.set_id,
    title: r.title,
    studyType: r.study_type,
    createdAt: r.created_at,
    ownerId: r.owner_id,
    ownerEmail: r.owner_email,
    ownerName: r.owner_name,
    cardCount: Number(r.card_count),
    assignmentCount: Number(r.assignment_count),
  }));
}

// public.admin_delete_set() logs the deletion and deletes the set (its cards,
// assignments and saved results cascade) in one transaction. Returns how many
// classes it was assigned to, or null if there's no such set.
export async function deleteAnySet(
  actorId: string,
  setId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<{ assignments: number } | null> {
  const { data, error } = await client.rpc('admin_delete_set', { p_actor_id: actorId, p_set_id: setId });
  if (!error) return { assignments: Number(data) };
  if (error.code === 'P0002') return null;
  throw error;
}
