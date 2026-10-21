import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';

// SERVER-ONLY (service-role client, which bypasses RLS). Joining, listing and
// leaving classes for one student (#54). Every function is scoped to the given
// student's own memberships; who may call them is decided in the routes.

export interface JoinedClass {
  id: string;
  name: string;
  teacherName: string | null;
  joinedAt: string;
}

export interface ClassToJoin {
  id: string;
  name: string;
  teacherId: string;
}

// Basic protection against guessing codes: after this many wrong codes within
// the window, the student has to wait. Codes with an impossible format don't
// count; they're rejected before any lookup.
export const MAX_FAILED_JOINS = 10;
export const FAILED_JOIN_WINDOW_MINUTES = 15;
const WINDOW_MS = FAILED_JOIN_WINDOW_MINUTES * 60_000;

// 0 if the student may try a code now, otherwise whole minutes to wait.
export async function minutesUntilJoinAllowed(
  studentId: string,
  client: SupabaseClient = supabaseAdmin,
  now: Date = new Date()
): Promise<number> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const { data, error } = await client
    .from('class_join_failures')
    .select('attempted_at')
    .eq('user_id', studentId)
    .gte('attempted_at', since)
    .order('attempted_at', { ascending: true })
    .limit(MAX_FAILED_JOINS);
  if (error) throw error;
  if (!data || data.length < MAX_FAILED_JOINS) return 0;

  // Allowed again once the oldest counted failure falls out of the window.
  const oldest = new Date(data[0].attempted_at).getTime();
  return Math.max(1, Math.ceil((oldest + WINDOW_MS - now.getTime()) / 60_000));
}

export async function recordFailedJoin(
  studentId: string,
  client: SupabaseClient = supabaseAdmin,
  now: Date = new Date()
): Promise<void> {
  const { error } = await client.from('class_join_failures').insert({ user_id: studentId });
  if (error) throw error;

  // Keep the table small: this student's attempts older than the window no
  // longer matter.
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const { error: cleanupError } = await client
    .from('class_join_failures')
    .delete()
    .eq('user_id', studentId)
    .lt('attempted_at', since);
  if (cleanupError) throw cleanupError;
}

// `code` must already be normalized (see normalizeJoinCode).
export async function findClassByCode(
  code: string,
  client: SupabaseClient = supabaseAdmin
): Promise<ClassToJoin | null> {
  const { data, error } = await client
    .from('classes')
    .select('id, name, teacher_id')
    .eq('join_code', code)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, name: data.name, teacherId: data.teacher_id } : null;
}

export async function getTeacherName(
  teacherId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<string | null> {
  const { data, error } = await client
    .from('profiles')
    .select('display_name')
    .eq('id', teacherId)
    .maybeSingle();
  if (error) throw error;
  return data?.display_name ?? null;
}

// Joining twice is harmless: the (class_id, student_id) primary key rejects the
// second row, which we report as "already a member".
export async function joinClass(
  studentId: string,
  classId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<'joined' | 'already-member'> {
  const { error } = await client.from('class_members').insert({ class_id: classId, student_id: studentId });
  if (!error) return 'joined';
  if (error.code === '23505') return 'already-member';
  throw error;
}

// The student's classes, most recently joined first, with each teacher's name.
export async function listJoinedClasses(
  studentId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<JoinedClass[]> {
  const { data: memberships, error } = await client
    .from('class_members')
    .select('class_id, joined_at')
    .eq('student_id', studentId)
    .order('joined_at', { ascending: false });
  if (error) throw error;
  if (!memberships || memberships.length === 0) return [];

  const { data: classes, error: classesError } = await client
    .from('classes')
    .select('id, name, teacher_id')
    .in(
      'id',
      memberships.map((m) => m.class_id)
    );
  if (classesError) throw classesError;

  const teacherIds = [...new Set((classes ?? []).map((c) => c.teacher_id))];
  const { data: teachers, error: teachersError } = teacherIds.length
    ? await client.from('profiles').select('id, display_name').in('id', teacherIds)
    : { data: [], error: null };
  if (teachersError) throw teachersError;

  const classById = new Map((classes ?? []).map((c) => [c.id, c]));
  const teacherName = new Map((teachers ?? []).map((t) => [t.id, t.display_name as string | null]));
  return memberships.flatMap((m) => {
    const cls = classById.get(m.class_id);
    return cls
      ? [{ id: cls.id, name: cls.name, teacherName: teacherName.get(cls.teacher_id) ?? null, joinedAt: m.joined_at }]
      : [];
  });
}

// Returns false if the student wasn't in that class.
export async function leaveClass(
  studentId: string,
  classId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  const { data, error } = await client
    .from('class_members')
    .delete()
    .eq('class_id', classId)
    .eq('student_id', studentId)
    .select('class_id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
