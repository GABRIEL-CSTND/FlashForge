// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const state = vi.hoisted(() => ({
  role: 'admin',
  calls: [] as { method: string; path: string }[],
  deleteReply: null as null | { ok: boolean; status: number; data: Record<string, unknown> },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ProfileProvider', () => ({
  useProfile: () => ({ user: { id: 'u-admin' }, profile: { role: state.role, roleChosenAt: null, displayName: null }, loading: false, refreshProfile: vi.fn() }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init: { method?: string } = {}) => {
      const method = init.method ?? 'GET';
      state.calls.push({ method, path });
      if (method === 'DELETE') return state.deleteReply ?? { ok: true, status: 200, data: { deleted: true, assignments: 0 } };
      const sets = [
        { id: 's1', title: 'Cell parts', studyType: 'flashcard', createdAt: '2026-10-01T00:00:00Z', ownerId: 't1', ownerEmail: 'reyes@example.com', ownerName: 'Ms. Reyes', cardCount: 10, assignmentCount: 2 },
        { id: 's2', title: 'Old notes', studyType: 'multiple_choice', createdAt: '2026-09-01T00:00:00Z', ownerId: null, ownerEmail: null, ownerName: null, cardCount: 1, assignmentCount: 0 },
      ];
      return { ok: true, status: 200, data: { sets: path.includes('q=zzz') ? [] : sets } };
    }),
  };
});

import AdminSetsPage from '@/app/admin/sets/page';
import AdminPage from '@/app/admin/page';

const confirmMock = vi.fn(() => true);
beforeEach(() => {
  state.role = 'admin';
  state.calls = [];
  state.deleteReply = null;
  confirmMock.mockReset().mockReturnValue(true);
  vi.stubGlobal('confirm', confirmMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const rows = async () => within(await screen.findByRole('list', { name: 'Study sets' })).getAllByRole('listitem');

describe('admin sets page', () => {
  it('lists every set with its owner, cards, type and assignments, linking to the set', async () => {
    render(<AdminSetsPage />);
    const [cells, old] = await rows();
    expect(cells.textContent).toContain('Ms. Reyes');
    expect(cells.textContent).toContain('10 cards · Flashcards');
    expect(cells.textContent).toContain('Assigned to 2 classes');
    expect(within(cells).getByRole('link', { name: 'Cell parts' }).getAttribute('href')).toBe('/sets/s1');
    expect(old.textContent).toContain('No owner (old set)');
    expect(old.textContent).toContain('1 card · Multiple choice');
    expect(old.textContent).not.toContain('Assigned');
  });

  it('warns that an assigned set disappears for its classes, then deletes it', async () => {
    render(<AdminSetsPage />);
    fireEvent.click(within((await rows())[0]).getByRole('button', { name: 'Delete Cell parts' }));
    expect(confirmMock).toHaveBeenCalledWith(
      `Delete "Cell parts" by Ms. Reyes? It's assigned to 2 classes, so it will disappear for those students, and their saved scores on it will be deleted. This can't be undone.`
    );
    expect((await screen.findByRole('status')).textContent).toBe('Deleted "Cell parts".');
    expect((await rows()).map((li) => within(li).getByRole('link').textContent)).toEqual(['Old notes']);
    expect(state.calls.at(-1)).toEqual({ method: 'DELETE', path: '/api/admin/sets/s1' });
  });

  it('asks more simply for an unassigned set, and keeps it when cancelled', async () => {
    confirmMock.mockReturnValue(false);
    render(<AdminSetsPage />);
    fireEvent.click(within((await rows())[1]).getByRole('button', { name: 'Delete Old notes' }));
    expect(confirmMock).toHaveBeenCalledWith(`Delete "Old notes" by No owner (old set)? This can't be undone.`);
    expect(await rows()).toHaveLength(2);
    expect(state.calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it("shows the server's error and keeps the set", async () => {
    state.deleteReply = { ok: false, status: 404, data: { error: 'Study set not found.' } };
    render(<AdminSetsPage />);
    fireEvent.click(within((await rows())[0]).getByRole('button', { name: 'Delete Cell parts' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Study set not found.');
    expect(await rows()).toHaveLength(2);
  });

  it('searches by title or owner', async () => {
    render(<AdminSetsPage />);
    await rows();
    fireEvent.change(screen.getByLabelText('Search by title or owner'), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No sets match that search.')).toBeTruthy();
    expect(state.calls.map((c) => c.path)).toEqual(['/api/admin/sets?q=', '/api/admin/sets?q=zzz']);
  });

  it('is only for admins', async () => {
    state.role = 'teacher';
    render(<AdminSetsPage />);
    expect(await screen.findByText('The admin pages are only for admins.')).toBeTruthy();
    expect(state.calls).toEqual([]);
  });

  it('is linked from the admin home', () => {
    render(<AdminPage />);
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/', '/admin/users', '/admin/sets', '/admin/usage']);
  });
});
