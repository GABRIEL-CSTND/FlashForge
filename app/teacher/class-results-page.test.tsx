// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

type Reply = { ok: boolean; status: number; data: Record<string, unknown> } | 'offline';

const state = vi.hoisted(() => ({
  profile: { user: { id: 't1' } as unknown, profile: { role: 'teacher', roleChosenAt: '2026-10-20', displayName: 'T' } as unknown, loading: false },
  params: { id: 'c1' },
  calls: [] as string[],
  replies: {} as Record<string, unknown>,
}));

vi.mock('next/navigation', () => ({ useParams: () => state.params, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ProfileProvider', () => ({ useProfile: () => state.profile }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      state.calls.push(path);
      const reply = state.replies[path] as Reply | undefined;
      if (!reply) throw new Error(`unexpected GET ${path}`);
      if (reply === 'offline') throw new TypeError('Failed to fetch');
      return reply;
    }),
  };
});

import ClassResultsPage from '@/app/teacher/classes/[id]/results/page';
import { formatDueDate } from '@/lib/due-dates';

const ok = (data: Record<string, unknown>) => ({ ok: true, status: 200, data });
const PAST_DUE = '2020-01-10T17:00:00.000Z';
const done = (score: number, total: number, attemptCount = 1, status = 'done') => ({
  status,
  attemptCount,
  best: { score, total },
  latest: { score, total, completedAt: '2026-10-21T10:00:00Z' },
});
const notStarted = { status: 'not-started', attemptCount: 0, best: null, latest: null };

function classResults() {
  return {
    class: { id: 'c1', name: 'Biology X' },
    assignments: [
      { id: 'a1', setId: 's1', setTitle: 'Cell parts quiz', studyType: 'multiple_choice', dueAt: PAST_DUE, average: 70, doneCount: 2 },
      { id: 'a2', setId: 's2', setTitle: 'Photosynthesis', studyType: 'flashcard', dueAt: null, average: null, doneCount: 0 },
    ],
    students: [
      { studentId: 'u1', displayName: 'Ana Reyes', email: 'ana@example.com', joinedAt: '2026-10-01T00:00:00Z', results: { a1: done(9, 10, 2), a2: notStarted } },
      { studentId: 'u2', displayName: null, email: 'ben@example.com', joinedAt: '2026-10-02T00:00:00Z', results: { a1: done(5, 10, 1, 'late'), a2: notStarted } },
      { studentId: 'u3', displayName: 'Cara Diaz', email: 'cara@example.com', joinedAt: '2026-10-03T00:00:00Z', results: { a1: notStarted, a2: notStarted } },
    ],
  };
}

beforeEach(() => {
  state.calls = [];
  state.replies = { '/api/teacher/classes/c1/results': ok(classResults()) };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const table = () => screen.findByRole('table');
const row = async (name: string) =>
  (await table()).querySelectorAll('tbody tr')[['Ana Reyes', 'ben@example.com', 'Cara Diaz'].indexOf(name)] as HTMLElement;

describe('class results page', () => {
  it('shows a students × assignments table with best scores and attempts', async () => {
    render(<ClassResultsPage />);
    const headers = within(await table()).getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['Student', expect.stringMatching(/^Cell parts quiz.*Due/), 'PhotosynthesisNo due date']);

    const ana = within(await row('Ana Reyes')).getAllByRole('cell');
    expect(ana[0].textContent).toBe('9/10 · 90%2 attempts');
    expect(within(await row('ben@example.com')).getAllByRole('cell')[0].textContent).toBe('5/10 · 50%1 attemptLate');
  });

  it('shows students who have not started as "Not started", never 0%, and flags past-due ones', async () => {
    render(<ClassResultsPage />);
    const cara = await row('Cara Diaz');
    const [quiz, cards] = within(cara).getAllByRole('cell');
    expect(quiz.textContent).toBe('Not startedPast due');
    expect(cards.textContent).toBe('Not started');
    expect(cara.textContent).not.toContain('%');
  });

  it('shows the class average per assignment, or a dash when nobody has finished', async () => {
    render(<ClassResultsPage />);
    const footer = (await table()).querySelector('tfoot tr') as HTMLElement;
    expect(within(footer).getByRole('rowheader').textContent).toBe('Class average');
    expect(within(footer).getAllByRole('cell').map((td) => td.textContent)).toEqual(['70%2 of 3 done', '—0 of 3 done']);
  });

  it("opens a student's attempts, and closes with the button or Escape", async () => {
    state.replies['/api/teacher/classes/c1/students/u1'] = ok({
      student: { studentId: 'u1' },
      assignments: [
        {
          id: 'a1',
          setTitle: 'Cell parts quiz',
          dueAt: PAST_DUE,
          result: done(9, 10, 2),
          attempts: [
            { id: 't2', score: 9, total: 10, completedAt: '2026-10-21T10:00:00Z', late: true },
            { id: 't1', score: 6, total: 10, completedAt: '2020-01-09T10:00:00Z', late: false },
          ],
        },
        { id: 'a2', setTitle: 'Photosynthesis', dueAt: null, result: notStarted, attempts: [] },
      ],
    });
    render(<ClassResultsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ana Reyes' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ana Reyes' });
    const attempts = await within(dialog).findByRole('list', { name: 'Attempts on Cell parts quiz' });
    const [latest, first] = within(attempts).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(latest.startsWith(formatDueDate('2026-10-21T10:00:00Z'))).toBe(true);
    expect(latest.endsWith('Late9/1090%')).toBe(true);
    expect(first.endsWith('6/1060%')).toBe(true);
    expect(first).not.toContain('Late');
    expect(within(dialog).getByText('Not started')).toBeTruthy();
    expect(within(dialog).queryByRole('list', { name: 'Attempts on Photosynthesis' })).toBeNull();
    expect(state.calls).toContain('/api/teacher/classes/c1/students/u1');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ana Reyes' }));
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says how each flashcard attempt was made: self-marked or typed (#66)', async () => {
    state.replies['/api/teacher/classes/c1/students/u1'] = ok({
      student: { studentId: 'u1' },
      assignments: [
        {
          id: 'a2',
          setTitle: 'Photosynthesis',
          studyType: 'flashcard',
          dueAt: null,
          result: done(4, 5, 2),
          attempts: [
            { id: 't2', mode: 'type', score: 4, total: 5, completedAt: '2026-10-21T10:00:00Z', late: false },
            { id: 't1', mode: null, score: 3, total: 5, completedAt: '2026-10-20T10:00:00Z', late: false },
          ],
        },
        {
          id: 'a1',
          setTitle: 'Cell parts quiz',
          studyType: 'multiple_choice',
          dueAt: null,
          result: done(9, 10),
          attempts: [{ id: 't3', mode: null, score: 9, total: 10, completedAt: '2026-10-21T10:00:00Z', late: false }],
        },
      ],
    });
    render(<ClassResultsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ana Reyes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ana Reyes' });
    const flash = await within(dialog).findByRole('list', { name: 'Attempts on Photosynthesis' });
    expect(within(flash).getAllByRole('listitem').map((li) => (li.textContent ?? '').replace(/^.*?(Typed|Self-marked)/, '$1'))).toEqual([
      'Typed4/580%',
      'Self-marked3/560%',
    ]);
    const mc = within(dialog).getByRole('list', { name: 'Attempts on Cell parts quiz' });
    expect(mc.textContent).not.toMatch(/Typed|Self-marked/);
  });

  it("shows the error if a student's attempts can't be loaded", async () => {
    state.replies['/api/teacher/classes/c1/students/u3'] = { ok: false, status: 404, data: { error: 'Student not found.' } };
    render(<ClassResultsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cara Diaz' }));
    expect((await within(await screen.findByRole('dialog')).findByRole('alert')).textContent).toBe('Student not found.');
  });

  it('downloads the table as a CSV named after the class', async () => {
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
    render(<ClassResultsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download CSV' }));

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('Biology X results.csv');
    const prefix = 'data:text/csv;charset=utf-8,';
    expect(clicked[0].href.startsWith(prefix)).toBe(true);
    const lines = decodeURIComponent(clicked[0].href.slice(prefix.length)).replace(/^﻿/, '').split('\r\n');
    expect(lines[1]).toBe('"Ana Reyes","ana@example.com","90","2","Done","","0","Not started"');
    expect(lines[2]).toBe('"ben@example.com","ben@example.com","50","1","Late","","0","Not started"');
    expect(lines[4]).toBe('"Class average","","70","","","","",""');
    // The link doesn't stay in the page.
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it.each([
    ['nothing is assigned', () => ({ ...classResults(), assignments: [] }), /Nothing assigned yet/],
    ['the class has no students', () => ({ ...classResults(), students: [] }), /No students yet/],
  ])('explains when %s, with no table or CSV button', async (_label, data, message) => {
    state.replies['/api/teacher/classes/c1/results'] = ok(data());
    render(<ClassResultsPage />);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
  });

  it.each([
    ['not found', { ok: false, status: 404, data: { error: 'Class not found.' } }, 'Class not found.'],
    ['an error', { ok: false, status: 500, data: { error: 'Something went wrong. Please try again.' } }, 'Something went wrong. Please try again.'],
    ['offline', 'offline' as const, 'Could not reach the server. Check your connection and try again.'],
  ])('shows %s with a way back', async (_label, reply, text) => {
    state.replies['/api/teacher/classes/c1/results'] = reply;
    render(<ClassResultsPage />);
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.getByRole('link', { name: '← All classes' }).getAttribute('href')).toBe('/teacher');
  });

  it('links back to the class page', async () => {
    render(<ClassResultsPage />);
    await table();
    expect(screen.getByRole('link', { name: '← Biology X' }).getAttribute('href')).toBe('/teacher/classes/c1');
    // Each assignment header opens its hardest questions (#59).
    expect(screen.getByRole('link', { name: 'Cell parts quiz' }).getAttribute('href')).toBe('/teacher/classes/c1/assignments/a1');
    await waitFor(() => expect(state.calls).toEqual(['/api/teacher/classes/c1/results']));
  });
});
