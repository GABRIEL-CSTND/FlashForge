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

// The Gemini free quota resets at midnight Pacific time, so usage is counted
// by "quota day": the date in Pacific time, as YYYY-MM-DD (#62).
export function quotaDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export interface UsageDay {
  day: string;
  generations: number;
  failures: number;
  signedOut: number;
  avgMs: number;
  // Guides produced by each model.
  answered: Record<string, number>;
  // Requests made to each model, retries and fallbacks included.
  requests: Record<string, number>;
}

export interface TopGenerator {
  id: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  generations: number;
  failures: number;
}

interface DailyRow {
  day: string;
  generations: number | string;
  failures: number | string;
  signed_out: number | string;
  avg_ms: number;
  answered: Record<string, number>;
  requests: Record<string, number>;
}

interface TopRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  generations: number | string;
  failures: number | string;
}

// Generation usage for the last `days` quota days, from generation_logs.
export async function getUsage(
  days: number,
  client: SupabaseClient = supabaseAdmin
): Promise<{ days: UsageDay[]; topUsers: TopGenerator[] }> {
  const [daily, top] = await Promise.all([
    client.rpc('admin_generation_daily', { p_days: days }),
    client.rpc('admin_top_generators', { p_days: days, p_limit: 10 }),
  ]);
  if (daily.error) throw daily.error;
  if (top.error) throw top.error;
  return {
    days: ((daily.data ?? []) as DailyRow[]).map((r) => ({
      day: r.day,
      generations: Number(r.generations),
      failures: Number(r.failures),
      signedOut: Number(r.signed_out),
      avgMs: Number(r.avg_ms),
      answered: r.answered ?? {},
      requests: r.requests ?? {},
    })),
    topUsers: ((top.data ?? []) as TopRow[]).map((r) => ({
      id: r.user_id,
      email: r.email,
      displayName: r.display_name,
      role: r.role,
      generations: Number(r.generations),
      failures: Number(r.failures),
    })),
  };
}
