// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

type Option = { classId: string; className: string; assignmentId: string | null; dueAt: string | null };

const state = vi.hoisted(() => ({
  classes: [] as { classId: string; className: string; assignmentId: string | null; dueAt: string | null }[],
  calls: [] as { method: string; path: string; body?: unknown }[],
  failNext: null as null | { status: number; error: string },
}));

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
        return { ok: false, status: f.status, data: { error: f.error } };
      }
      if (method === 'GET') return { ok: true, status: 200, data: { setId: 's1', title: 'Photosynthesis', classes: state.classes } };
      const { classIds, dueAt } = init.body as { classIds: string[]; dueAt: string | null };
      const assigned: string[] = [];
      const alreadyAssigned: string[] = [];
      for (const id of classIds) {
        const c = state.classes.find((x) => x.classId === id)!;
        if (c.assignmentId) alreadyAssigned.push(id);
        else {
          c.assignmentId = `a-${id}`;
          c.dueAt = dueAt;
          assigned.push(id);
        }
      }
      return { ok: true, status: 201, data: { ok: true, assigned, alreadyAssigned } };
    }),
  };
});

import AssignPanel from '@/components/AssignPanel';
import { toLocalInputValue } from '@/lib/due-dates';

const onClose = vi.fn();
const panel = () => render(<AssignPanel setId="s1" setTitle="Photosynthesis" onClose={onClose} />);
const checkbox = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) }) as HTMLInputElement;
const nextWeekLocal = () => toLocalInputValue(new Date(Date.now() + 7 * 86_400_000).toISOString());

beforeEach(() => {
  const options: Option[] = [
    { classId: 'c1', className: 'Bio 101', assignmentId: null, dueAt: null },
    { classId: 'c2', className: 'Bio 102', assignmentId: null, dueAt: null },
    { classId: 'c3', className: 'Chem', assignmentId: 'a-c3', dueAt: '2099-01-15T17:00:00Z' },
  ];
  state.classes = options;
  state.calls = [];
  state.failNext = null;
  onClose.mockReset();
});
afterEach(cleanup);

describe('AssignPanel', () => {
  it('lists the teacher\'s classes and marks ones that already have the set', async () => {
    panel();
    expect(await screen.findByRole('checkbox', { name: /Bio 101/ })).toBeTruthy();
    expect(checkbox('Chem').checked).toBe(true);
    expect(checkbox('Chem').disabled).toBe(true);
    expect(checkbox('Chem').closest('label')!.textContent).toMatch(/Assigned · due /);
    expect(screen.getByRole('button', { name: 'Assign' }).hasAttribute('disabled')).toBe(true);
  });

  it('assigns to the chosen classes with a due date and confirms by name', async () => {
    panel();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Bio 101/ }));
    fireEvent.click(checkbox('Bio 102'));
    const due = nextWeekLocal();
    fireEvent.change(screen.getByLabelText('Due date (optional)'), { target: { value: due } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));

    expect((await screen.findByRole('status')).textContent).toBe('Assigned to Bio 101 and Bio 102.');
    expect(state.calls.find((c) => c.method === 'POST')?.body).toEqual({ classIds: ['c1', 'c2'], dueAt: new Date(due).toISOString() });
    await waitFor(() => expect(checkbox('Bio 101').disabled).toBe(true));
  });

  it('assigns with no due date when the date is left empty', async () => {
    panel();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Bio 101/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await screen.findByRole('status');
    expect(state.calls.find((c) => c.method === 'POST')?.body).toEqual({ classIds: ['c1'], dueAt: null });
  });

  it('refuses a due date in the past without calling the server', async () => {
    panel();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Bio 101/ }));
    fireEvent.change(screen.getByLabelText('Due date (optional)'), { target: { value: '2020-01-01T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect((await screen.findByRole('alert')).textContent).toBe('That due date has already passed.');
    expect(state.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows the server\'s error', async () => {
    panel();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Bio 101/ }));
    state.failNext = { status: 404, error: 'Class not found.' };
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Class not found.');
  });

  it('points to the Teacher dashboard when there are no classes yet', async () => {
    state.classes = [];
    panel();
    const link = await screen.findByRole('link', { name: 'Create one on the Teacher dashboard' });
    expect(link.getAttribute('href')).toBe('/teacher');
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
  });

  it('closes with the Close button or Escape', async () => {
    panel();
    await screen.findByRole('checkbox', { name: /Bio 101/ });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
