// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const state = vi.hoisted(() => ({
  profile: { user: { id: 't1' } as unknown, profile: { role: 'teacher', roleChosenAt: '2026-10-20', displayName: 'T' } as unknown, loading: false },
  push: vi.fn(),
  params: { id: 'c1' },
  // A tiny in-memory version of the class API, keyed by "METHOD path".
  calls: [] as { method: string; path: string; body?: unknown }[],
  classes: [] as { id: string; name: string; joinCode: string; createdAt: string; studentCount: number; students: { studentId: string; displayName: string | null; email: string | null; joinedAt: string }[] }[],
  failNext: null as null | { status: number; error?: string; offline?: boolean },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: state.push }),
  useParams: () => state.params,
}));
vi.mock('@/components/ProfileProvider', () => ({ useProfile: () => state.profile }));
// The real api-client module imports the browser Supabase client, which needs env vars.
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
      const ok = (data: Record<string, unknown>, status = 200) => ({ ok: true, status, data });
      const find = (id: string) => state.classes.find((c) => c.id === id);
      let m: RegExpMatchArray | null;
      if (path === '/api/teacher/classes' && method === 'GET') {
        return ok({ classes: state.classes.map(({ students, ...c }) => ({ ...c, studentCount: students.length })) });
      }
      if (path === '/api/teacher/classes' && method === 'POST') {
        const cls = { id: `new-${state.classes.length}`, name: String((init.body as { name: string }).name).trim(), joinCode: 'NEWCD2', createdAt: '2026-10-20', studentCount: 0, students: [] };
        state.classes.unshift(cls);
        const { students, ...summary } = cls;
        void students;
        return ok({ class: summary }, 201);
      }
      if ((m = path.match(/^\/api\/teacher\/classes\/([^/]+)$/))) {
        const cls = find(m[1]);
        if (!cls) return { ok: false, status: 404, data: { error: 'Class not found.' } };
        if (method === 'GET') return ok({ class: { ...cls, studentCount: cls.students.length } });
        if (method === 'PATCH') return ok({ name: (cls.name = String((init.body as { name: string }).name).trim()) });
        if (method === 'DELETE') {
          state.classes = state.classes.filter((c) => c !== cls);
          return ok({ deleted: true });
        }
      }
      if ((m = path.match(/^\/api\/teacher\/classes\/([^/]+)\/join-code$/))) {
        const cls = find(m[1])!;
        return ok({ joinCode: (cls.joinCode = 'FRESH3') });
      }
      if ((m = path.match(/^\/api\/teacher\/classes\/([^/]+)\/students\/([^/]+)$/))) {
        const cls = find(m[1])!;
        cls.students = cls.students.filter((s) => s.studentId !== m![2]);
        return ok({ removed: true });
      }
      throw new Error(`unexpected ${method} ${path}`);
    }),
  };
});

import TeacherDashboardPage from '@/app/teacher/page';
import TeacherClassPage from '@/app/teacher/classes/[id]/page';

const confirmMock = vi.fn(() => true);
const clipboardMock = vi.fn(async () => {});

beforeEach(() => {
  state.profile = { user: { id: 't1' }, profile: { role: 'teacher', roleChosenAt: '2026-10-20', displayName: 'T' }, loading: false };
  state.push.mockReset();
  state.calls = [];
  state.failNext = null;
  state.params = { id: 'c1' };
  state.classes = [
    {
      id: 'c1', name: 'Biology 101', joinCode: 'K7M2QX', createdAt: '2026-10-19', studentCount: 2,
      students: [
        { studentId: 's1', displayName: 'Ana Reyes', email: 'ana@example.com', joinedAt: '2026-10-19T08:00:00Z' },
        { studentId: 's2', displayName: null, email: 'ben@example.com', joinedAt: '2026-10-19T09:00:00Z' },
      ],
    },
    { id: 'c2', name: 'Chemistry', joinCode: 'ABC234', createdAt: '2026-10-18', studentCount: 0, students: [] },
  ];
  confirmMock.mockReset().mockReturnValue(true);
  vi.stubGlobal('confirm', confirmMock);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: clipboardMock }, configurable: true });
  clipboardMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('teacher dashboard', () => {
  it('lists classes with their formatted join codes and student counts', async () => {
    render(<TeacherDashboardPage />);
    const bio = await screen.findByRole('link', { name: /Biology 101/ });
    expect(bio.getAttribute('href')).toBe('/teacher/classes/c1');
    expect(bio.textContent).toContain('K7M-2QX');
    expect(bio.textContent).toContain('2 students');
    expect(screen.getByRole('link', { name: /Chemistry/ }).textContent).toContain('0 students');
  });

  it('shows an empty state when there are no classes', async () => {
    state.classes = [];
    render(<TeacherDashboardPage />);
    expect(await screen.findByText(/No classes yet/)).toBeTruthy();
  });

  it('creates a class and shows it at the top', async () => {
    render(<TeacherDashboardPage />);
    await screen.findByRole('link', { name: /Biology 101/ });
    const button = screen.getByRole('button', { name: 'Create class' });
    expect(button.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('New class name'), { target: { value: 'Physics' } });
    fireEvent.click(button);

    const links = await waitFor(() => {
      const all = screen.getAllByRole('link', { name: /Physics|Biology|Chemistry/ });
      expect(all[0].textContent).toContain('Physics');
      return all;
    });
    expect(links[0].textContent).toContain('NEW-CD2');
    expect(state.calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'Physics' });
    expect((screen.getByLabelText('New class name') as HTMLInputElement).value).toBe('');
  });

  it('shows the server\'s error when creating fails', async () => {
    render(<TeacherDashboardPage />);
    await screen.findByRole('link', { name: /Biology 101/ });
    state.failNext = { status: 409, error: 'You can have up to 50 classes. Delete one to make room.' };
    fireEvent.change(screen.getByLabelText('New class name'), { target: { value: 'Too many' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create class' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/up to 50 classes/);
  });

  it('offers a retry when classes fail to load', async () => {
    state.failNext = { status: 0, offline: true };
    render(<TeacherDashboardPage />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach the server/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /Biology 101/ })).toBeTruthy();
  });

  it.each([
    ['a student', { user: { id: 's' }, profile: { role: 'student', roleChosenAt: 'x', displayName: null }, loading: false }, /only for teachers/],
    ['someone signed out', { user: null, profile: null, loading: false }, /Sign in to use the teacher dashboard/],
  ])('does not load anything for %s', async (_label, profile, message) => {
    state.profile = profile;
    render(<TeacherDashboardPage />);
    expect(screen.getByText(message)).toBeTruthy();
    expect(state.calls).toEqual([]);
  });
});

describe('class page', () => {
  it('shows the class name, join code, and roster', async () => {
    render(<TeacherClassPage />);
    expect(await screen.findByRole('heading', { name: 'Biology 101' })).toBeTruthy();
    expect(screen.getByTestId('join-code').textContent).toBe('K7M-2QX');
    const roster = screen.getByRole('list');
    expect(within(roster).getByText('Ana Reyes')).toBeTruthy();
    expect(within(roster).getByText(/ana@example.com/)).toBeTruthy();
    // No display name: the email is the label.
    expect(within(roster).getByText('ben@example.com')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Students (2)' })).toBeTruthy();
  });

  it('shows "Class not found" for a class the API won\'t return', async () => {
    state.params = { id: 'someone-elses' };
    render(<TeacherClassPage />);
    expect(await screen.findByText('Class not found.')).toBeTruthy();
  });

  it('renames the class', async () => {
    render(<TeacherClassPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Class name'), { target: { value: 'Biology 102' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Biology 102' })).toBeTruthy();
    expect(state.calls.find((c) => c.method === 'PATCH')).toEqual({ method: 'PATCH', path: '/api/teacher/classes/c1', body: { name: 'Biology 102' } });
  });

  it('copies the formatted code', async () => {
    render(<TeacherClassPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy code' }));
    await waitFor(() => expect(clipboardMock).toHaveBeenCalledWith('K7M-2QX'));
    expect((await screen.findByRole('status')).textContent).toBe('Code copied.');
  });

  it('asks before replacing the join code, and does nothing on Cancel', async () => {
    render(<TeacherClassPage />);
    confirmMock.mockReturnValueOnce(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Get a new code' }));
    expect(confirmMock).toHaveBeenCalledWith(expect.stringMatching(/current code will stop working/));
    expect(state.calls.some((c) => c.path.endsWith('/join-code'))).toBe(false);
    expect(screen.getByTestId('join-code').textContent).toBe('K7M-2QX');
  });

  it('replaces the join code after confirming', async () => {
    render(<TeacherClassPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get a new code' }));
    await waitFor(() => expect(screen.getByTestId('join-code').textContent).toBe('FRE-SH3'));
    expect(screen.getByRole('status').textContent).toMatch(/old one no longer works/);
  });

  it('removes a student after confirming', async () => {
    render(<TeacherClassPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Ana Reyes' }));
    expect(confirmMock).toHaveBeenCalledWith('Remove Ana Reyes from Biology 101?');
    await waitFor(() => expect(screen.queryByText('Ana Reyes')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Students (1)' })).toBeTruthy();
    expect(state.calls.find((c) => c.method === 'DELETE')?.path).toBe('/api/teacher/classes/c1/students/s1');
  });

  it('deletes the class after confirming and goes back to the dashboard', async () => {
    render(<TeacherClassPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete this class' }));
    expect(confirmMock).toHaveBeenCalledWith(expect.stringMatching(/Delete "Biology 101"\? Its 2 students will be removed/));
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/teacher'));
  });

  it('shows the error and stays put when an action fails', async () => {
    render(<TeacherClassPage />);
    await screen.findByRole('heading', { name: 'Biology 101' });
    state.failNext = { status: 500, error: 'Something went wrong. Please try again.' };
    fireEvent.click(screen.getByRole('button', { name: 'Delete this class' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong. Please try again.');
    expect(state.push).not.toHaveBeenCalled();
  });
});
