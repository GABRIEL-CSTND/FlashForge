// Shared by server and client: how a student's attempts on one assignment are
// summed up for the teacher's results view (#58), and the CSV export.

import { studentLabel } from '@/lib/classes-shared';

export type ResultStatus = 'not-started' | 'done' | 'late';

export interface Score {
  score: number;
  total: number;
}

export interface TimedScore extends Score {
  completedAt: string;
}

export interface ResultSummary {
  status: ResultStatus;
  attemptCount: number;
  // The highest percentage, or null if not started.
  best: Score | null;
  // The most recent finish, or null if not started.
  latest: TimedScore | null;
}

export const NOT_STARTED: ResultSummary = { status: 'not-started', attemptCount: 0, best: null, latest: null };

export const STATUS_LABELS: Record<ResultStatus, string> = {
  'not-started': 'Not started',
  done: 'Done',
  late: 'Late',
};

export function percent({ score, total }: Score): number {
  return total > 0 ? Math.round((score / total) * 100) : 0;
}

// Finished after the due date. Without a due date nothing is late.
export function isLate(completedAt: string, dueAt: string | null): boolean {
  return dueAt !== null && Date.parse(completedAt) > Date.parse(dueAt);
}

// Late only if even the first finish came after the due date: a student who
// finished on time and practised again later is done.
export function summarizeAttempts(attempts: TimedScore[], dueAt: string | null): ResultSummary {
  if (attempts.length === 0) return NOT_STARTED;
  const byTime = [...attempts].sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));
  const best = attempts.reduce((top, a) => (a.score / a.total > top.score / top.total ? a : top));
  const latest = byTime[byTime.length - 1];
  return {
    status: isLate(byTime[0].completedAt, dueAt) ? 'late' : 'done',
    attemptCount: attempts.length,
    best: { score: best.score, total: best.total },
    latest: { score: latest.score, total: latest.total, completedAt: latest.completedAt },
  };
}

// One assignment's class average: the mean of each student's best percentage,
// over the students who finished it. Not started counts as missing, not 0%.
export function classAverage(results: ResultSummary[]): { average: number | null; doneCount: number } {
  const ratios = results.flatMap((r) => (r.best ? [r.best.score / r.best.total] : []));
  if (ratios.length === 0) return { average: null, doneCount: 0 };
  const mean = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  return { average: Math.round(mean * 100), doneCount: ratios.length };
}

export interface ResultsTable {
  assignments: { id: string; setTitle: string; average: number | null }[];
  students: { displayName: string | null; email: string | null; results: Record<string, ResultSummary> }[];
}

// Spreadsheet apps treat a cell starting with one of these as a formula, so a
// student named "=HYPERLINK(...)" could run one. Such cells get a leading '.
const FORMULA_START = /^[=+\-@\t\r]/;

function csvField(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// Three columns per assignment: best %, attempts, status. The byte-order mark
// makes Excel read the file as UTF-8 (names with accents).
export function resultsToCsv({ assignments, students }: ResultsTable): string {
  const header = [
    'Student',
    'Email',
    ...assignments.flatMap((a) => [`${a.setTitle}: best %`, `${a.setTitle}: attempts`, `${a.setTitle}: status`]),
  ];
  const rows = students.map((s) => [
    studentLabel(s),
    s.email ?? '',
    ...assignments.flatMap((a) => {
      const r = s.results[a.id] ?? NOT_STARTED;
      return [r.best ? percent(r.best) : null, r.attemptCount, STATUS_LABELS[r.status]];
    }),
  ]);
  const averages = ['Class average', '', ...assignments.flatMap((a) => [a.average, null, null])];
  return '﻿' + [header, ...rows, averages].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export function resultsCsvFilename(className: string): string {
  const safe = className.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim();
  return `${safe || 'Class'} results.csv`;
}
