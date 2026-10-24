import { describe, expect, it } from 'vitest';
import { isStudyType, matchRounds, mixedSplit, parseQuestionCount, QUESTION_COUNTS } from '@/lib/study-types';

describe('parseQuestionCount (#65)', () => {
  it('accepts every count the upload page offers', () => {
    for (const n of QUESTION_COUNTS) {
      expect(parseQuestionCount(String(n))).toBe(n);
      expect(parseQuestionCount(n)).toBe(n);
    }
  });

  it('accepts any whole number from 5 to 30', () => {
    expect(parseQuestionCount('7')).toBe(7);
    expect(parseQuestionCount(' 25 ')).toBe(25);
  });

  it.each([null, undefined, '', 'abc', '4', '31', '1000', '-10', '10.5', '1e1', 12.5, {}])(
    'falls back to 10 for %j',
    (value) => {
      expect(parseQuestionCount(value)).toBe(10);
    }
  );
});

describe('isStudyType', () => {
  it('knows the study types', () => {
    expect(isStudyType('flashcard')).toBe(true);
    expect(isStudyType('multiple_choice')).toBe(true);
    expect(isStudyType('essay')).toBe(false);
    expect(isStudyType(null)).toBe(false);
  });
});

describe('matchRounds (#67)', () => {
  it('splits a set into rounds of up to 5, as evenly as possible', () => {
    expect(matchRounds(12)).toEqual([[0, 4], [4, 8], [8, 12]]);
    expect(matchRounds(11)).toEqual([[0, 4], [4, 8], [8, 11]]);
    expect(matchRounds(6)).toEqual([[0, 3], [3, 6]]);
    expect(matchRounds(5)).toEqual([[0, 5]]);
    expect(matchRounds(21).map(([a, b]) => b - a)).toEqual([5, 4, 4, 4, 4]);
    expect(matchRounds(1)).toEqual([[0, 1]]);
    expect(matchRounds(0)).toEqual([]);
  });

  it('never leaves a round of 1 or 2 when there are 3 or more cards', () => {
    for (let n = 3; n <= 50; n++) {
      const sizes = matchRounds(n).map(([a, b]) => b - a);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(3);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(5);
      expect(sizes.reduce((x, y) => x + y)).toBe(n);
    }
  });
});

describe('mixedSplit (#69)', () => {
  it('gives about 40% multiple choice, 30% true or false and 30% identification', () => {
    expect(mixedSplit(10)).toEqual({ multiple_choice: 4, true_false: 3, identification: 3 });
    expect(mixedSplit(20)).toEqual({ multiple_choice: 8, true_false: 6, identification: 6 });
    expect(mixedSplit(5)).toEqual({ multiple_choice: 2, true_false: 2, identification: 1 });
    for (const n of QUESTION_COUNTS) {
      const split = mixedSplit(n);
      expect(split.multiple_choice + split.true_false + split.identification).toBe(n);
      expect(Math.min(...Object.values(split))).toBeGreaterThanOrEqual(1);
    }
  });
});
