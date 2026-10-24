// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const state = vi.hoisted(() => ({
  profile: { user: { id: 't1' } as unknown, profile: { role: 'teacher', roleChosenAt: '2026-10-20', displayName: 'T' } as unknown, loading: false },
  reply: null as null | { ok: boolean; status: number; data: Record<string, unknown> },
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'c1', assignmentId: 'a1' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ProfileProvider', () => ({ useProfile: () => state.profile }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path !== '/api/teacher/classes/c1/assignments/a1') throw new Error(`unexpected GET ${path}`);
      return state.reply!;
    }),
  };
});

import AssignmentQuestionsPage from '@/app/teacher/classes/[id]/assignments/[assignmentId]/page';

const data = (overrides: Record<string, unknown> = {}) => ({
  class: { id: 'c1', name: 'Networking X' },
  assignment: { id: 'a1', setTitle: 'Layers quiz', studyType: 'multiple_choice', dueAt: null },
  studentCount: 3,
  studentsDone: 2,
  questions: [
    { cardId: 'q2', question: 'Layer 3?', answer: 'Network', answered: 2, wrong: 2, percentWrong: 100, topWrongChoice: { choice: 'Session', count: 2 } },
    { cardId: 'q3', question: 'Resolves IP to MAC?', answer: 'ARP', answered: 2, wrong: 1, percentWrong: 50, topWrongChoice: null },
    { cardId: 'q4', question: 'Layer 7?', answer: 'Application', answered: 0, wrong: 0, percentWrong: null, topWrongChoice: null },
  ],
  ...overrides,
});

beforeEach(() => {
  state.reply = { ok: true, status: 200, data: data() };
});
afterEach(cleanup);

describe('most-missed questions page', () => {
  it('lists questions hardest first with % wrong, the answer, and the most picked wrong answer', async () => {
    render(<AssignmentQuestionsPage />);
    const items = within(await screen.findByRole('list', { name: 'Questions, hardest first' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Layer 3?100% wrongAnswer: Network · 2 of 2 students wrongMost common wrong answer: Session (2 students)',
      'Resolves IP to MAC?50% wrongAnswer: ARP · 1 of 2 students wrong',
      'Layer 7?No answers yetAnswer: Application',
    ]);
    expect(screen.getByRole('heading', { name: 'Layers quiz' })).toBeTruthy();
    expect(screen.getByText(/2 of 3 students have finished it/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '← Student results' }).getAttribute('href')).toBe('/teacher/classes/c1/results');
  });

  it('explains how flashcards are counted', async () => {
    state.reply = { ok: true, status: 200, data: data({ assignment: { id: 'a1', setTitle: 'Cells', studyType: 'flashcard', dueAt: null } }) };
    render(<AssignmentQuestionsPage />);
    expect(await screen.findByText(/count as wrong unless the student marked “Got it”/)).toBeTruthy();
  });

  it('says when no one has finished yet', async () => {
    state.reply = { ok: true, status: 200, data: data({ studentsDone: 0 }) };
    render(<AssignmentQuestionsPage />);
    expect(await screen.findByText('No one has finished this assignment yet.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows "Assignment not found" with a way back', async () => {
    state.reply = { ok: false, status: 404, data: { error: 'Assignment not found.' } };
    render(<AssignmentQuestionsPage />);
    expect(await screen.findByText('Assignment not found.')).toBeTruthy();
    expect(screen.getByRole('link', { name: '← All classes' }).getAttribute('href')).toBe('/teacher');
  });
});
