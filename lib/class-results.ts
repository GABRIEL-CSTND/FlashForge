import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getClass, type RosterEntry } from '@/lib/classes';
import { listClassAssignments, type ClassAssignment } from '@/lib/assignments';
import { classAverage, isLate, summarizeAttempts, type ResultSummary, type TimedScore } from '@/lib/results-shared';
import { typedAnswerKey } from '@/lib/answer-check';
import type { StudyMode } from '@/lib/study-types';

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
  mode: StudyMode | null;
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
    .select('id, user_id, assignment_id, mode, score, total, completed_at')
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
  // Newest first. mode: how a flashcard set was studied (#66), null for the
  // normal way (self-marked flashcards).
  attempts: { id: string; mode: StudyMode | null; score: number; total: number; completedAt: string; late: boolean }[];
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
          mode: t.mode ?? null,
          score: t.score,
          total: t.total,
          completedAt: t.completed_at,
          late: isLate(t.completed_at, a.dueAt),
        })),
      };
    }),
  };
}

export interface QuestionStat {
  cardId: string;
  question: string;
  answer: string;
  // Students whose latest attempt included this card.
  answered: number;
  wrong: number;
  // Null when nobody has answered it yet (e.g. a card added since).
  percentWrong: number | null;
  // The wrong answer given most often: the option picked (multiple choice) or
  // the text typed (#66, grouped ignoring capitals, spaces and punctuation). A
  // skipped question counts as wrong but isn't an answer.
  topWrongChoice: { choice: string; count: number } | null;
}

interface StoredAnswer {
  cardId: string;
  chosen?: string | null;
  typed?: string | null;
  correct: boolean;
}

// Hardest first (#59). Each student counts once, by their latest attempt, and
// answers are matched to the set's current cards by id, so deleted cards drop
// out and edited ones keep their history.
export function questionStats(
  cards: { id: string; question: string; answer: string }[],
  latestAnswers: StoredAnswer[][]
): QuestionStat[] {
  const stats = cards.map((card, position) => {
    let answered = 0;
    let wrong = 0;
    // By grouping key: the answer as first written, and how often it was given.
    const wrongChoices = new Map<string, { choice: string; count: number }>();
    const countWrong = (groupKey: string, choice: string) => {
      const seen = wrongChoices.get(groupKey);
      wrongChoices.set(groupKey, { choice: seen?.choice ?? choice, count: (seen?.count ?? 0) + 1 });
    };
    for (const answers of latestAnswers) {
      const a = answers.find((x) => x.cardId === card.id);
      if (!a) continue;
      answered += 1;
      if (a.correct) continue;
      wrong += 1;
      if (typeof a.chosen === 'string' && a.chosen) countWrong(`chosen:${a.chosen}`, a.chosen);
      else if (typeof a.typed === 'string' && typedAnswerKey(a.typed)) countWrong(`typed:${typedAnswerKey(a.typed)}`, a.typed);
    }
    let topWrongChoice: QuestionStat['topWrongChoice'] = null;
    for (const entry of wrongChoices.values()) {
      if (!topWrongChoice || entry.count > topWrongChoice.count) topWrongChoice = entry;
    }
    const percentWrong = answered > 0 ? Math.round((wrong / answered) * 100) : null;
    return { position, stat: { cardId: card.id, question: card.question, answer: card.answer, answered, wrong, percentWrong, topWrongChoice } };
  });
  return stats
    .sort(
      (a, b) =>
        (b.stat.percentWrong ?? -1) - (a.stat.percentWrong ?? -1) || b.stat.wrong - a.stat.wrong || a.position - b.position
    )
    .map((s) => s.stat);
}

export type AssignmentQuestionsLookup =
  | {
      kind: 'ok';
      class: { id: string; name: string };
      assignment: ClassAssignment;
      studentCount: number;
      // Current students with at least one attempt on this assignment.
      studentsDone: number;
      questions: QuestionStat[];
    }
  | { kind: 'not-found' };

// One assignment's questions for the teacher, hardest first. Not found if the
// class isn't the teacher's or the assignment isn't in it.
export async function getAssignmentQuestions(
  teacherId: string,
  classId: string,
  assignmentId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<AssignmentQuestionsLookup> {
  const cls = await getClass(teacherId, classId, client);
  if (!cls) return { kind: 'not-found' };
  const assignment = ((await listClassAssignments(teacherId, classId, client)) ?? []).find((a) => a.id === assignmentId);
  if (!assignment) return { kind: 'not-found' };

  const { data: cards, error: cardsError } = await client
    .from('flashcards')
    .select('id, question, answer, position')
    .eq('set_id', assignment.setId)
    .order('position', { ascending: true });
  if (cardsError) throw cardsError;

  const latest: StoredAnswer[][] = [];
  const studentIds = cls.students.map((s) => s.studentId);
  if (studentIds.length > 0) {
    const { data: rows, error } = await client
      .from('attempts')
      .select('user_id, answers, completed_at')
      .eq('assignment_id', assignment.id)
      .in('user_id', studentIds)
      .order('completed_at', { ascending: false });
    if (error) throw error;
    const seen = new Set<string>();
    for (const row of rows ?? []) {
      // Newest first, so the first row per student is their latest attempt.
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      latest.push(Array.isArray(row.answers) ? (row.answers as StoredAnswer[]) : []);
    }
  }

  return {
    kind: 'ok',
    class: { id: cls.id, name: cls.name },
    assignment,
    studentCount: studentIds.length,
    studentsDone: latest.length,
    questions: questionStats(cards ?? [], latest),
  };
}
