import { randomInt } from 'node:crypto';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '@/lib/classes-shared';

// SERVER-ONLY (service-role client, which bypasses RLS). Every function takes
// the acting teacher's id and only touches classes they own; another
// teacher's class behaves exactly like one that doesn't exist.

export interface ClassSummary {
  id: string;
  name: string;
  joinCode: string;
  createdAt: string;
  studentCount: number;
}

export interface RosterEntry {
  studentId: string;
  displayName: string | null;
  email: string | null;
  joinedAt: string;
}

export interface ClassDetail extends ClassSummary {
  students: RosterEntry[];
}

// Self-selecting "teacher" needs no approval, so cap how many classes one
// account can create.
export const MAX_CLASSES_PER_TEACHER = 50;

// Re-exported so existing imports keep working; the check lives in lib/ids.ts.
export { isUuid } from '@/lib/ids';

export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

// About 887 million possible codes, so a clash is very unlikely, but the
// unique constraint decides: on a clash (23505), try a fresh code.
const MAX_CODE_ATTEMPTS = 5;

async function withFreshJoinCode<T>(
  write: (code: string) => PromiseLike<{ data: T | null; error: PostgrestError | null }>
): Promise<T | null> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const { data, error } = await write(generateJoinCode());
    if (!error) return data;
    if (error.code !== '23505') throw error;
  }
  throw new Error(`No unique join code after ${MAX_CODE_ATTEMPTS} attempts`);
}

interface ClassRow {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
}

const CLASS_COLUMNS = 'id, name, join_code, created_at';

function toSummary(row: ClassRow, studentCount: number): ClassSummary {
  return {
    id: row.id,
    name: row.name,
    joinCode: row.join_code,
    createdAt: row.created_at,
    studentCount,
  };
}

export async function listClasses(
  teacherId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<ClassSummary[]> {
  const { data: rows, error } = await client
    .from('classes')
    .select(CLASS_COLUMNS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const { data: members, error: membersError } = await client
    .from('class_members')
    .select('class_id')
    .in(
      'class_id',
      rows.map((r) => r.id)
    );
  if (membersError) throw membersError;

  const counts = new Map<string, number>();
  for (const m of members ?? []) counts.set(m.class_id, (counts.get(m.class_id) ?? 0) + 1);
  return (rows as ClassRow[]).map((row) => toSummary(row, counts.get(row.id) ?? 0));
}

export type CreateClassResult = { ok: true; class: ClassSummary } | { ok: false; reason: 'limit' };

export async function createClass(
  teacherId: string,
  name: string,
  client: SupabaseClient = supabaseAdmin
): Promise<CreateClassResult> {
  const { count, error: countError } = await client
    .from('classes')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacherId);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_CLASSES_PER_TEACHER) return { ok: false, reason: 'limit' };

  const row = await withFreshJoinCode<ClassRow>((code) =>
    client
      .from('classes')
      .insert({ teacher_id: teacherId, name, join_code: code })
      .select(CLASS_COLUMNS)
      .single()
  );
  return { ok: true, class: toSummary(row!, 0) };
}

export async function getClass(
  teacherId: string,
  classId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<ClassDetail | null> {
  const { data: row, error } = await client
    .from('classes')
    .select(CLASS_COLUMNS)
    .eq('id', classId)
    .eq('teacher_id', teacherId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: roster, error: rosterError } = await client.rpc('class_roster', {
    p_class_id: classId,
    p_teacher_id: teacherId,
  });
  if (rosterError) throw rosterError;

  const students: RosterEntry[] = (roster ?? []).map(
    (r: { student_id: string; display_name: string | null; email: string | null; joined_at: string }) => ({
      studentId: r.student_id,
      displayName: r.display_name,
      email: r.email,
      joinedAt: r.joined_at,
    })
  );
  return { ...toSummary(row as ClassRow, students.length), students };
}

// Returns false if the class doesn't exist or belongs to another teacher.
export async function renameClass(
  teacherId: string,
  classId: string,
  name: string,
  client: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  const { data, error } = await client
    .from('classes')
    .update({ name })
    .eq('id', classId)
    .eq('teacher_id', teacherId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

// The old code stops working immediately; students already in the class stay.
// Returns the new code, or null if the class isn't this teacher's.
export async function regenerateJoinCode(
  teacherId: string,
  classId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<string | null> {
  const rows = await withFreshJoinCode<{ join_code: string }[]>((code) =>
    client
      .from('classes')
      .update({ join_code: code })
      .eq('id', classId)
      .eq('teacher_id', teacherId)
      .select('join_code')
  );
  return rows && rows.length > 0 ? rows[0].join_code : null;
}

// Members are removed with it (ON DELETE CASCADE).
export async function deleteClass(
  teacherId: string,
  classId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  const { data, error } = await client
    .from('classes')
    .delete()
    .eq('id', classId)
    .eq('teacher_id', teacherId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

export type RemoveStudentResult = 'removed' | 'class-not-found' | 'student-not-found';

export async function removeStudent(
  teacherId: string,
  classId: string,
  studentId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<RemoveStudentResult> {
  const { data: owned, error } = await client
    .from('classes')
    .select('id')
    .eq('id', classId)
    .eq('teacher_id', teacherId)
    .maybeSingle();
  if (error) throw error;
  if (!owned) return 'class-not-found';

  const { data: removed, error: removeError } = await client
    .from('class_members')
    .delete()
    .eq('class_id', classId)
    .eq('student_id', studentId)
    .select('student_id');
  if (removeError) throw removeError;
  return (removed ?? []).length > 0 ? 'removed' : 'student-not-found';
}
