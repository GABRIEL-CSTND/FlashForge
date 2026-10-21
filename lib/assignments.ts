import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sortByDue } from '@/lib/due-dates';

// SERVER-ONLY (service-role client, which bypasses RLS). Assigning study sets
// to classes (#56). A teacher can only assign sets they own to classes they
// teach; everything else behaves like "not found".

export interface ClassOption {
  classId: string;
  className: string;
  assignmentId: string | null;
  dueAt: string | null;
}

export interface SetAssignments {
  setId: string;
  title: string;
  classes: ClassOption[];
}

export interface ClassAssignment {
  id: string;
  setId: string;
  setTitle: string;
  studyType: string;
  dueAt: string | null;
  createdAt: string;
}

export interface StudentAssignment extends ClassAssignment {
  classId: string;
}

async function ownsSet(teacherId: string, setId: string, client: SupabaseClient) {
  const { data, error } = await client
    .from('flashcard_sets')
    .select('id, title')
    .eq('id', setId)
    .eq('user_id', teacherId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; title: string } | null;
}

async function ownsClass(teacherId: string, classId: string, client: SupabaseClient) {
  const { data, error } = await client
    .from('classes')
    .select('id')
    .eq('id', classId)
    .eq('teacher_id', teacherId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

// The teacher's classes, marking which ones this set is already assigned to.
// Null if the set isn't the teacher's own.
export async function getSetAssignments(
  teacherId: string,
  setId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<SetAssignments | null> {
  const set = await ownsSet(teacherId, setId, client);
  if (!set) return null;

  const { data: classes, error } = await client
    .from('classes')
    .select('id, name')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!classes || classes.length === 0) return { setId, title: set.title, classes: [] };

  const { data: assigned, error: assignedError } = await client
    .from('assignments')
    .select('id, class_id, due_at')
    .eq('set_id', setId)
    .in(
      'class_id',
      classes.map((c) => c.id)
    );
  if (assignedError) throw assignedError;

  const byClass = new Map((assigned ?? []).map((a) => [a.class_id, a]));
  return {
    setId,
    title: set.title,
    classes: classes.map((c) => ({
      classId: c.id,
      className: c.name,
      assignmentId: byClass.get(c.id)?.id ?? null,
      dueAt: byClass.get(c.id)?.due_at ?? null,
    })),
  };
}

export type AssignResult =
  | { ok: true; assigned: string[]; alreadyAssigned: string[] }
  | { ok: false; reason: 'set-not-found' | 'class-not-found' };

// Assigns the set to each class. A class that already has it is reported in
// alreadyAssigned and left as it is (the unique key rejects the duplicate).
export async function assignSet(
  teacherId: string,
  setId: string,
  classIds: string[],
  dueAt: string | null,
  client: SupabaseClient = supabaseAdmin
): Promise<AssignResult> {
  if (!(await ownsSet(teacherId, setId, client))) return { ok: false, reason: 'set-not-found' };

  const unique = [...new Set(classIds)];
  const { data: owned, error } = await client
    .from('classes')
    .select('id')
    .eq('teacher_id', teacherId)
    .in('id', unique);
  if (error) throw error;
  if ((owned ?? []).length !== unique.length) return { ok: false, reason: 'class-not-found' };

  const assigned: string[] = [];
  const alreadyAssigned: string[] = [];
  for (const classId of unique) {
    const { error: insertError } = await client
      .from('assignments')
      .insert({ class_id: classId, set_id: setId, due_at: dueAt });
    if (!insertError) assigned.push(classId);
    else if (insertError.code === '23505') alreadyAssigned.push(classId);
    else throw insertError;
  }
  return { ok: true, assigned, alreadyAssigned };
}

async function withSetDetails(
  rows: { id: string; class_id: string; set_id: string; due_at: string | null; created_at: string }[],
  client: SupabaseClient
): Promise<StudentAssignment[]> {
  if (rows.length === 0) return [];
  const { data: sets, error } = await client
    .from('flashcard_sets')
    .select('id, title, study_type')
    .in('id', [...new Set(rows.map((r) => r.set_id))]);
  if (error) throw error;
  const setById = new Map((sets ?? []).map((s) => [s.id, s]));
  return rows.flatMap((r) => {
    const set = setById.get(r.set_id);
    return set
      ? [{ id: r.id, classId: r.class_id, setId: r.set_id, setTitle: set.title, studyType: set.study_type, dueAt: r.due_at, createdAt: r.created_at }]
      : [];
  });
}

const ASSIGNMENT_COLUMNS = 'id, class_id, set_id, due_at, created_at';

// A class's assignments, soonest due first. Null if the class isn't the teacher's.
export async function listClassAssignments(
  teacherId: string,
  classId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<ClassAssignment[] | null> {
  if (!(await ownsClass(teacherId, classId, client))) return null;
  const { data, error } = await client.from('assignments').select(ASSIGNMENT_COLUMNS).eq('class_id', classId);
  if (error) throw error;
  const detailed = await withSetDetails(data ?? [], client);
  return sortByDue(detailed).map((a) => ({
    id: a.id,
    setId: a.setId,
    setTitle: a.setTitle,
    studyType: a.studyType,
    dueAt: a.dueAt,
    createdAt: a.createdAt,
  }));
}

// Returns false if the class isn't the teacher's or the assignment isn't in it.
export async function updateAssignmentDue(
  teacherId: string,
  classId: string,
  assignmentId: string,
  dueAt: string | null,
  client: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  if (!(await ownsClass(teacherId, classId, client))) return false;
  const { data, error } = await client
    .from('assignments')
    .update({ due_at: dueAt })
    .eq('id', assignmentId)
    .eq('class_id', classId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

// Students immediately lose access to the set (RLS follows the assignment).
export async function unassign(
  teacherId: string,
  classId: string,
  assignmentId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  if (!(await ownsClass(teacherId, classId, client))) return false;
  const { data, error } = await client
    .from('assignments')
    .delete()
    .eq('id', assignmentId)
    .eq('class_id', classId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

// Every assignment in the student's classes, soonest due first.
export async function listStudentAssignments(
  studentId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<StudentAssignment[]> {
  const { data: memberships, error } = await client
    .from('class_members')
    .select('class_id')
    .eq('student_id', studentId);
  if (error) throw error;
  if (!memberships || memberships.length === 0) return [];

  const { data, error: assignmentsError } = await client
    .from('assignments')
    .select(ASSIGNMENT_COLUMNS)
    .in(
      'class_id',
      memberships.map((m) => m.class_id)
    );
  if (assignmentsError) throw assignmentsError;
  return sortByDue(await withSetDetails(data ?? [], client));
}
