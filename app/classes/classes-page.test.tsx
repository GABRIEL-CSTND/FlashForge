// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const state = vi.hoisted(() => ({
  profile: null as unknown,
  calls: [] as { method: string; path: string; body?: unknown }[],
  // What the fake /api/student/classes knows about.
  mine: [] as { id: string; name: string; teacherName: string | null; joinedAt: string; assignments: { id: string; setId: string; setTitle: string; studyType: string; dueAt: string | null; createdAt: string }[] }[],
  codes: {} as Record<string, { id: string; name: string; teacherName: string | null }>,
  failNext: null as null | { status: number; error?: string; offline?: boolean },
}));

vi.mock('@/components/ProfileProvider', () => ({ useProfile: () => state.profile }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init: { method?: string; body?: unknown } = {}) => {
      const method = init.method ?? 'GET';
      state.calls.push({ method, path, body: init.body });
      if (state.failNext) {
        const f = state.failNext;
        state.failNext = null;
        if (f.offline) throw new TypeError('Failed to fetch');
        return { ok: false, status: f.status, data: { error: f.error } };
      }
      if (path === '/api/student/classes' && method === 'GET') return { ok: true, status: 200, data: { classes: state.mine } };
      if (path === '/api/student/classes' && method === 'POST') {
        const cls = state.codes[(init.body as { code: string }).code];
        if (!cls) return { ok: false, status: 404, data: { error: 'No class uses that code. Check it with your teacher.' } };
        const already = state.mine.some((c) => c.id === cls.id);
        if (!already) state.mine.unshift({ ...cls, joinedAt: '2026-10-21T12:00:00Z', assignments: [] });
        return { ok: true, status: already ? 200 : 201, data: { class: cls, alreadyMember: already } };
      }
      const m = path.match(/^\/api\/student\/classes\/([^/]+)$/);
      if (m && method === 'DELETE') {
        state.mine = state.mine.filter((c) => c.id !== m[1]);
        return { ok: true, status: 200, data: { left: true } };
      }
      throw new Error(`unexpected ${method} ${path}`);
    }),
  };
});

import MyClassesPage from '@/app/classes/page';

const student = { user: { id: 's1' }, profile: { role: 'student', roleChosenAt: '2026-10-20', displayName: 'Sam' }, loading: false };
const confirmMock = vi.fn(() => true);

beforeEach(() => {
  state.profile = student;
  state.calls = [];
  state.failNext = null;
  state.mine = [{ id: 'c1', name: 'Biology 101', teacherName: 'Ms. Reyes', joinedAt: '2026-10-19T08:00:00Z', assignments: [] }];
  state.codes = {
    K7M2QX: { id: 'c1', name: 'Biology 101', teacherName: 'Ms. Reyes' },
    ABC234: { id: 'c2', name: 'Chemistry', teacherName: null },
  };
  confirmMock.mockReset().mockReturnValue(true);
  vi.stubGlobal('confirm', confirmMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const codeInput = () => screen.getByLabelText('Class code') as HTMLInputElement;
async function joinWith(code: string) {
  await screen.findByRole('heading', { name: /Your classes \(/ });
  fireEvent.change(codeInput(), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Join' }));
}
// Top-level class cards only (each class card also contains its assignments list).
const classItems = () => [...document.querySelectorAll('section[aria-labelledby="classes-heading"] > ul > li')] as HTMLElement[];
const classNames = () => classItems().map((li) => li.querySelector('p.font-medium')!.textContent);

describe('my classes page', () => {
  it('lists the student\'s classes with the teacher\'s name', async () => {
    render(<MyClassesPage />);
    expect(await screen.findByRole('heading', { name: 'Your classes (1)' })).toBeTruthy();
    const item = classItems()[0];
    expect(item.textContent).toContain('Biology 101');
    expect(item.textContent).toContain('Ms. Reyes');
  });

  it("lists each class's assigned sets with due dates and an Overdue badge, linking to the set", async () => {
    state.mine[0].assignments = [
      { id: 'a1', setId: 'set-1', setTitle: 'Photosynthesis', studyType: 'flashcard', dueAt: '2099-01-15T17:00:00Z', createdAt: '2026-10-20' },
      { id: 'a2', setId: 'set-2', setTitle: 'Cell parts', studyType: 'flashcard', dueAt: '2020-01-01T00:00:00Z', createdAt: '2026-10-19' },
      { id: 'a3', setId: 'set-3', setTitle: 'Extra reading', studyType: 'flashcard', dueAt: null, createdAt: '2026-10-18' },
    ];
    render(<MyClassesPage />);
    const list = await screen.findByRole('list', { name: 'Assigned in Biology 101' });
    const links = within(list).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/sets/set-1', '/sets/set-2', '/sets/set-3']);
    // Shown in the viewer's own time zone, via toLocaleString.
    const due = new Date('2099-01-15T17:00:00Z').toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    expect(links[0].textContent).toContain(`Due ${due}`);
    expect(links[0].textContent).not.toContain('Overdue');
    expect(links[1].textContent).toContain('Overdue');
    expect(links[2].textContent).toContain('No due date');
  });

  it('says when a class has nothing assigned', async () => {
    render(<MyClassesPage />);
    expect(await screen.findByText('No assigned sets yet.')).toBeTruthy();
  });

  it('shows an empty state with a hint', async () => {
    state.mine = [];
    render(<MyClassesPage />);
    expect(await screen.findByText(/haven't joined any classes yet/)).toBeTruthy();
  });

  it('tells students what their teacher will see before they join', async () => {
    render(<MyClassesPage />);
    expect(await screen.findByText("Your teacher will see your name, email, and your scores on this class's assignments.")).toBeTruthy();
  });

  it('joins with a normalized code, confirms it, and refreshes the list', async () => {
    render(<MyClassesPage />);
    await joinWith('abc-234');
    expect((await screen.findByRole('status')).textContent).toBe('You joined Chemistry.');
    await waitFor(() => expect(classNames()).toEqual(['Chemistry', 'Biology 101']));
    expect(state.calls.find((c) => c.method === 'POST')?.body).toEqual({ code: 'ABC234' });
    expect(codeInput().value).toBe('');
  });

  it('says so when the student is already in the class', async () => {
    render(<MyClassesPage />);
    await joinWith('K7M 2QX');
    expect((await screen.findByRole('status')).textContent).toBe("You're already in Biology 101.");
    expect(classNames()).toEqual(['Biology 101']);
  });

  it('rejects an impossible code without calling the server', async () => {
    render(<MyClassesPage />);
    await joinWith('hello');
    expect((await screen.findByRole('alert')).textContent).toMatch(/doesn't look like a class code/);
    expect(state.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it.each([
    [404, 'No class uses that code. Check it with your teacher.'],
    [429, 'Too many wrong codes. Try again in 12 minutes.'],
  ])('shows the server\'s message for a %i', async (status, error) => {
    render(<MyClassesPage />);
    await screen.findByRole('heading', { name: /Your classes/ });
    state.failNext = { status, error };
    await joinWith('QQQ222');
    expect((await screen.findByRole('alert')).textContent).toBe(error);
  });

  it('leaves a class after confirming', async () => {
    render(<MyClassesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Leave Biology 101' }));
    expect(confirmMock).toHaveBeenCalledWith(expect.stringMatching(/^Leave Biology 101\? Your teacher will no longer see your scores/));
    expect((await screen.findByRole('status')).textContent).toBe('You left Biology 101.');
    expect(classItems()).toEqual([]);
    expect(state.calls.find((c) => c.method === 'DELETE')?.path).toBe('/api/student/classes/c1');
  });

  it('stays in the class when the student cancels', async () => {
    confirmMock.mockReturnValue(false);
    render(<MyClassesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Leave Biology 101' }));
    expect(state.calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(classItems()[0].textContent).toContain('Biology 101');
  });

  it('offers a retry when the list fails to load', async () => {
    state.failNext = { status: 0, offline: true };
    render(<MyClassesPage />);
    expect(await screen.findByText(/Could not reach the server/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Your classes (1)' })).toBeTruthy();
  });

  it.each([
    ['a teacher', { user: { id: 't' }, profile: { role: 'teacher', roleChosenAt: 'x', displayName: null }, loading: false }, /Joining classes is for students/],
    ['an admin', { user: { id: 'a' }, profile: { role: 'admin', roleChosenAt: 'x', displayName: null }, loading: false }, /Joining classes is for students/],
    ['someone signed out', { user: null, profile: null, loading: false }, /Sign in to join a class/],
    ['a user whose profile failed to load', { user: { id: 'x' }, profile: null, loading: false }, /Couldn't load your account/],
  ])('shows a message and loads nothing for %s', (_label, profile, message) => {
    state.profile = profile;
    render(<MyClassesPage />);
    expect(screen.getByText(message)).toBeTruthy();
    expect(state.calls).toEqual([]);
  });

  it('points teachers to their dashboard', () => {
    state.profile = { user: { id: 't' }, profile: { role: 'teacher', roleChosenAt: 'x', displayName: null }, loading: false };
    render(<MyClassesPage />);
    expect(screen.getByRole('link', { name: 'Go to the Teacher dashboard' }).getAttribute('href')).toBe('/teacher');
  });
});
