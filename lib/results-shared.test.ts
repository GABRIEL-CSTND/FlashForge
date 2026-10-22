import { describe, expect, it } from 'vitest';
import {
  classAverage,
  isLate,
  NOT_STARTED,
  percent,
  resultsCsvFilename,
  resultsToCsv,
  summarizeAttempts,
  type ResultSummary,
} from '@/lib/results-shared';

const DUE = '2026-10-20T17:00:00.000Z';
const BEFORE = '2026-10-19T10:00:00.000Z';
const AFTER = '2026-10-21T10:00:00.000Z';
const LATER = '2026-10-22T10:00:00.000Z';

describe('percent and isLate', () => {
  it('rounds to a whole percent', () => {
    expect([percent({ score: 8, total: 10 }), percent({ score: 2, total: 3 }), percent({ score: 1, total: 3 })]).toEqual([80, 67, 33]);
  });

  it('is late only after a due date', () => {
    expect(isLate(AFTER, null)).toBe(false);
    expect(isLate(BEFORE, DUE)).toBe(false);
    expect(isLate(DUE, DUE)).toBe(false);
    expect(isLate(AFTER, DUE)).toBe(true);
  });
});

describe('summarizeAttempts', () => {
  it('is "not started" with no attempts, never a 0 score', () => {
    expect(summarizeAttempts([], DUE)).toEqual({ status: 'not-started', attemptCount: 0, best: null, latest: null });
  });

  it('keeps the best percentage and the most recent finish, in any order', () => {
    const summary = summarizeAttempts(
      [
        { score: 7, total: 10, completedAt: LATER },
        { score: 4, total: 5, completedAt: BEFORE },
        { score: 6, total: 10, completedAt: AFTER },
      ],
      null
    );
    expect(summary).toEqual({
      status: 'done',
      attemptCount: 3,
      best: { score: 4, total: 5 },
      latest: { score: 7, total: 10, completedAt: LATER },
    });
  });

  it('is late when even the first finish came after the due date', () => {
    expect(summarizeAttempts([{ score: 9, total: 10, completedAt: AFTER }], DUE).status).toBe('late');
  });

  it('stays done when the student finished on time and practised again later', () => {
    const summary = summarizeAttempts(
      [
        { score: 9, total: 10, completedAt: AFTER },
        { score: 5, total: 10, completedAt: BEFORE },
      ],
      DUE
    );
    expect(summary).toMatchObject({ status: 'done', best: { score: 9, total: 10 } });
  });
});

describe('classAverage', () => {
  const done = (score: number, total: number): ResultSummary => ({
    status: 'done',
    attemptCount: 1,
    best: { score, total },
    latest: { score, total, completedAt: BEFORE },
  });

  it('averages best scores and leaves out students who have not started', () => {
    expect(classAverage([done(8, 10), NOT_STARTED, done(6, 10)])).toEqual({ average: 70, doneCount: 2 });
  });

  it('averages the exact fractions, then rounds', () => {
    expect(classAverage([done(1, 3), done(2, 3)])).toEqual({ average: 50, doneCount: 2 });
    expect(classAverage([done(2, 3)])).toEqual({ average: 67, doneCount: 1 });
  });

  it('has no average when nobody has finished', () => {
    expect(classAverage([NOT_STARTED, NOT_STARTED])).toEqual({ average: null, doneCount: 0 });
    expect(classAverage([])).toEqual({ average: null, doneCount: 0 });
  });
});

describe('resultsToCsv', () => {
  const late: ResultSummary = { status: 'late', attemptCount: 2, best: { score: 9, total: 10 }, latest: { score: 9, total: 10, completedAt: AFTER } };

  it('writes best %, attempts and status per assignment, plus the class average', () => {
    const csv = resultsToCsv({
      assignments: [
        { id: 'a1', setTitle: 'Cells', average: 90 },
        { id: 'a2', setTitle: 'Plants', average: null },
      ],
      students: [
        { displayName: 'Ana Reyes', email: 'ana@example.com', results: { a1: late, a2: NOT_STARTED } },
        { displayName: null, email: 'ben@example.com', results: { a1: NOT_STARTED } },
      ],
    });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      '"Student","Email","Cells: best %","Cells: attempts","Cells: status","Plants: best %","Plants: attempts","Plants: status"',
      '"Ana Reyes","ana@example.com","90","2","Late","","0","Not started"',
      // No display name: the email stands in; a missing cell counts as not started.
      '"ben@example.com","ben@example.com","","0","Not started","","0","Not started"',
      '"Class average","","90","","","","",""',
      '',
    ]);
  });

  it('escapes quotes and stops names from running as spreadsheet formulas', () => {
    const csv = resultsToCsv({
      assignments: [{ id: 'a1', setTitle: 'The "Calvin" cycle', average: null }],
      students: [
        { displayName: '=HYPERLINK("http://evil.example","Click")', email: '@me@example.com', results: {} },
        { displayName: '-2+3', email: null, results: {} },
      ],
    });
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toContain('"The ""Calvin"" cycle: best %"');
    expect(lines[1]).toMatch(/^"'=HYPERLINK\(""http:\/\/evil\.example"",""Click""\)","'@me@example\.com",/);
    expect(lines[2]).toMatch(/^"'-2\+3","",/);
  });
});

describe('resultsCsvFilename', () => {
  it('keeps the class name but drops characters files cannot have', () => {
    expect(resultsCsvFilename('Biology 101 — Period 3')).toBe('Biology 101 — Period 3 results.csv');
    expect(resultsCsvFilename('Bio: 3/4 "A"')).toBe('Bio- 3-4 -A- results.csv');
    expect(resultsCsvFilename('///')).toBe('- results.csv');
    expect(resultsCsvFilename('  ')).toBe('Class results.csv');
  });
});
