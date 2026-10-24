import { describe, expect, it } from 'vitest';
import { isStudyType, parseQuestionCount, QUESTION_COUNTS } from '@/lib/study-types';

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
