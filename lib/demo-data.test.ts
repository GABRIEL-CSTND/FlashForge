import { describe, expect, it } from 'vitest';
import {
  DEMO_ATTEMPTS,
  DEMO_CLASS,
  DEMO_IDS,
  DEMO_SET_FLASHCARDS,
  DEMO_SET_MIXED,
  DEMO_SET_QUIZ,
  DEMO_SET_TRUE_FALSE,
  DEMO_SETS,
  DEMO_USERS,
  isValidDemoJoinCode,
} from '@/lib/demo-data';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '@/lib/classes-shared';

describe('Demo data integrity (#92)', () => {
  it('defines 4 standard demo accounts with valid roles', () => {
    expect(DEMO_USERS).toHaveLength(4);
    const roles = DEMO_USERS.map((u) => u.role);
    expect(roles).toContain('teacher');
    expect(roles).toContain('admin');
    expect(roles.filter((r) => r === 'student')).toHaveLength(2);

    for (const user of DEMO_USERS) {
      expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(user.email).toContain('@');
      expect(user.displayName.trim().length).toBeGreaterThan(0);
    }
  });

  it('defines a valid demo class with a code matching the database constraints', () => {
    expect(DEMO_CLASS.name.length).toBeGreaterThan(0);
    expect(DEMO_CLASS.name.length).toBeLessThanOrEqual(80);
    expect(DEMO_CLASS.teacherId).toBe(DEMO_IDS.users.teacher);

    // Validate join code characters and length
    expect(DEMO_CLASS.joinCode).toHaveLength(JOIN_CODE_LENGTH);
    expect(isValidDemoJoinCode(DEMO_CLASS.joinCode)).toBe(true);

    // Ensure no look-alike characters (0, O, 1, I, L)
    for (const char of DEMO_CLASS.joinCode) {
      expect(JOIN_CODE_ALPHABET).toContain(char);
      expect(['0', 'O', '1', 'I', 'L']).not.toContain(char);
    }
  });

  it('covers all 4 study formats across the sample sets', () => {
    expect(DEMO_SETS).toHaveLength(4);
    const types = DEMO_SETS.map((s) => s.studyType);
    expect(types).toContain('flashcard');
    expect(types).toContain('multiple_choice');
    expect(types).toContain('true_false');
    expect(types).toContain('mixed');
  });

  it('verifies multiple-choice cards have 4 options and the answer matches one option', () => {
    for (const card of DEMO_SET_QUIZ.cards) {
      expect(card.options).toBeDefined();
      expect(card.options).toHaveLength(4);
      expect(card.options).toContain(card.answer);
      expect(card.sourceExcerpt).toBeDefined();
      expect(card.sourceLocation).toBeDefined();
    }
  });

  it('verifies true_false cards have boolean string answers and clear explanations', () => {
    for (const card of DEMO_SET_TRUE_FALSE.cards) {
      expect(['true', 'false']).toContain(card.answer);
      expect(card.explanation).toBeDefined();
      expect(card.explanation?.length).toBeGreaterThan(10);
      expect(card.options).toBeUndefined();
    }
  });

  it('verifies flashcards have terms and definitions without options', () => {
    for (const card of DEMO_SET_FLASHCARDS.cards) {
      expect(card.question.length).toBeGreaterThan(0);
      expect(card.answer.length).toBeGreaterThan(0);
      expect(card.options).toBeUndefined();
    }
  });

  it('verifies mixed sets contain multiple question kinds', () => {
    const hasOptions = DEMO_SET_MIXED.cards.some((c) => Array.isArray(c.options));
    const hasTrueFalse = DEMO_SET_MIXED.cards.some((c) => ['true', 'false'].includes(c.answer));
    const hasFlashcard = DEMO_SET_MIXED.cards.some((c) => !c.options && !['true', 'false'].includes(c.answer));

    expect(hasOptions).toBe(true);
    expect(hasTrueFalse).toBe(true);
    expect(hasFlashcard).toBe(true);
  });

  it('validates demo attempts against the assigned multiple choice set', () => {
    expect(DEMO_ATTEMPTS).toHaveLength(2);
    const quizCardIds = new Set(DEMO_SET_QUIZ.cards.map((c) => c.id));

    for (const attempt of DEMO_ATTEMPTS) {
      expect(attempt.setId).toBe(DEMO_SET_QUIZ.id);
      expect(attempt.assignmentId).toBe(DEMO_IDS.assignment);
      expect(attempt.total).toBe(DEMO_SET_QUIZ.cards.length);
      expect(attempt.score).toBeLessThanOrEqual(attempt.total);
      expect(attempt.score).toBeGreaterThanOrEqual(0);

      // Verify answers map to valid cards
      const correctCount = attempt.answers.filter((a) => a.correct).length;
      expect(correctCount).toBe(attempt.score);

      for (const ans of attempt.answers) {
        expect(quizCardIds.has(ans.cardId)).toBe(true);
      }
    }

    // Student 1 (Marcus) has 100%, Student 2 (Sofia) has 60%
    const [marcus, sofia] = DEMO_ATTEMPTS;
    expect(marcus.score).toBe(5);
    expect(sofia.score).toBe(3);
  });
});
