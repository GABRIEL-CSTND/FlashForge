import { describe, expect, it } from 'vitest';
import { bestByDeck, questionsWord, shortDate } from '@/lib/library';

describe('bestByDeck', () => {
  it("keeps each deck's attempt with the largest share right", () => {
    expect(
      bestByDeck([
        { set_id: 'a', score: 6, total: 10 },
        { set_id: 'a', score: 9, total: 10 },
        { set_id: 'a', score: 7, total: 10 },
        { set_id: 'b', score: 2, total: 3 },
      ])
    ).toEqual({ a: { score: 9, total: 10 }, b: { score: 2, total: 3 } });
  });

  it('breaks a tie with the bigger total, and skips attempts with nothing to score', () => {
    expect(
      bestByDeck([
        { set_id: 'a', score: 5, total: 5 },
        { set_id: 'a', score: 10, total: 10 },
        { set_id: 'b', score: 0, total: 0 },
      ])
    ).toEqual({ a: { score: 10, total: 10 } });
  });
});

describe('shortDate', () => {
  const now = new Date(2026, 10, 6, 15, 0);

  it('says Today and Yesterday by the calendar, not by 24 hours', () => {
    expect(shortDate(new Date(2026, 10, 6, 0, 5).toISOString(), now)).toBe('Today');
    expect(shortDate(new Date(2026, 10, 5, 23, 59).toISOString(), now)).toBe('Yesterday');
  });

  it('gives the month and day this year, and the year before that', () => {
    const thisYear = new Date(2026, 9, 29, 12).toISOString();
    const lastYear = new Date(2025, 9, 29, 12).toISOString();
    expect(shortDate(thisYear, now)).toBe(new Date(thisYear).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    expect(shortDate(lastYear, now)).toBe(new Date(lastYear).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }));
  });
});

describe('questionsWord', () => {
  it('counts questions', () => {
    expect(questionsWord(1)).toBe('1 question');
    expect(questionsWord(10)).toBe('10 questions');
  });
});
