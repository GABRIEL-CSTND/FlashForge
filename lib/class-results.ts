import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getClass, type RosterEntry } from '@/lib/classes';
import { listClassAssignments, type ClassAssignment } from '@/lib/assignments';
import { classAverage, isLate, summarizeAttempts, type ResultSummary, type TimedScore } from '@/lib/results-shared';

// SERVER-ONLY (service-role client, which bypasses RLS). A teacher's view of
// their students' results (#58), following the same rule as the attempts RLS
// policy: only the teacher's own class, only students who are in it now, and
// only attempts made from that class's assignments, never private study.

export interface AssignmentResults extends ClassAssignment {
  // Mean of each student's best percentage, over students who finished it;
  // null if nobody has.
  average: number | null;
  doneCount: number;
}

export interface StudentResultsRow extends RosterEntry {
  // By assignment id; every assignment has an entry.
  results: Record<string, ResultSummary>;
}

export interface ClassResults {
  class: { id: string; name: string };
  assignments: AssignmentResults[];
  students: StudentResultsRow[];
}

interface AttemptRow {
  id: string;
  user_id: string;
  assignment_id: string;
  score: number;
  total: number;
  completed_at: string;
}

// These students' attempts on these assignments, newest first.
async function attemptsFor(
  studentIds: string[],
  assignmentIds: string[],
  client: SupabaseClient
): Promise<AttemptRow[]> {
  if (studentIds.length === 0 || assignmentIds.length === 0) return [];
  const { data, error } = await client
    .from('attempts')
    .select('id, user_id, assignment_id, score, total, completed_at')
    .in('user_id', studentIds)
    .in('assignment_id', assignmentIds)
    .order('completed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AttemptRow[];
}

const toTimedScore = (row: AttemptRow): TimedScore => ({
  score: row.score,
  total: row.total,
  completedAt: row.completed_at,
});

// Every current student × every assignment of the class, plus each
// assignment's class average. Null if the class isn't this teacher's.
export async function getClassResults(
  teacherId: string,
  classId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<ClassResults | null> {
  const cls = await getClass(teacherId, classId, client);
  if (!cls) return null;
  const assignments = (await listClassAssignments(teacherId, classId, client)) ?? [];
  const attempts = await attemptsFor(
    cls.students.map((s) => s.studentId),
    assignments.map((a) => a.id),
    client
  );

  const byStudentAndAssignment = new Map<string, TimedScore[]>();
  for (const row of attempts) {
    const key = `${row.user_id}/${row.assignment_id}`;
    byStudentAndAssignment.set(key, [...(byStudentAndAssignment.get(key) ?? []), toTimedScore(row)]);
  }

  const students = cls.students.map((s) => ({
    ...s,
    results: Object.fromEntries(
      assignments.map((a) => [
        a.id,
        summarizeAttempts(byStudentAndAssignment.get(`${s.studentId}/${a.id}`) ?? [], a.dueAt),
      ])
    ),
  }));
  return {
    class: { id: cls.id, name: cls.name },
    assignments: assignments.map((a) => ({ ...a, ...classAverage(students.map((s) => s.results[a.id])) })),
    students,
  };
}

export interface StudentAssignmentResults extends ClassAssignment {
  result: ResultSummary;
  // Newest first.
  attempts: { id: string; score: number; total: number; completedAt: string; late: boolean }[];
}

export type StudentResultsLookup =
  | { kind: 'ok'; student: RosterEntry; assignments: StudentAssignmentResults[] }
  | { kind: 'class-not-found' }
  | { kind: 'student-not-found' };

// One student's attempts on each of the class's assignments. A student who
// isn't in the class (or has left) is "not found".
export async function getStudentResults(
  teacherId: string,
  classId: string,
  studentId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<StudentResultsLookup> {
  const cls = await getClass(teacherId, classId, client);
  if (!cls) return { kind: 'class-not-found' };
  const student = cls.students.find((s) => s.studentId === studentId);
  if (!student) return { kind: 'student-not-found' };

  const assignments = (await listClassAssignments(teacherId, classId, client)) ?? [];
  const attempts = await attemptsFor(
    [student.studentId],
    assignments.map((a) => a.id),
    client
  );
  return {
    kind: 'ok',
    student,
    assignments: assignments.map((a) => {
      const mine = attempts.filter((t) => t.assignment_id === a.id);
      return {
        ...a,
        result: summarizeAttempts(mine.map(toTimedScore), a.dueAt),
        attempts: mine.map((t) => ({
          id: t.id,
          score: t.score,
          total: t.total,
          completedAt: t.completed_at,
          late: isLate(t.completed_at, a.dueAt),
        })),
      };
    }),
  };
}
