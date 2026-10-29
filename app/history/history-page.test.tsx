// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createFakeSupabase, type FakeDb } from '@/test-utils/fake-supabase';

const state = vi.hoisted(() => ({ user: null as null | { id: string } }));
const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('@/test-utils/fake-supabase').createFakeSupabase> }));
vi.mock('@/lib/auth', () => ({ useUser: () => ({ user: state.user, loading: false }) }));
// The browser client. The fake has no RLS (that's in supabase/tests/history-rls-check.sql),
// so another user's entry here shows that the page asks only for the user's own.
vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => fake.current!.client.from(t) } }));

import HistoryPage from '@/app/history/page';

const SAM = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
let db: FakeDb;

const entry = (id: string, title: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  user_id: SAM,
  title,
  study_type: 'flashcard',
  item_count: 10,
  set_id: null,
  created_at: createdAt,
  ...extra,
});

beforeEach(() => {
  state.user = { id: SAM };
  fake.current = createFakeSupabase({ tables: { guide_history: { unique: [['id']] } } });
  db = fake.current.db;
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('History page', () => {
  it('asks a signed-out visitor to sign in', () => {
    state.user = null;
    render(<HistoryPage />);
    expect(screen.getByText("Sign in to see the study guides you've made.")).toBeTruthy();
  });

  it("lists the user's guides, newest first, and marks the saved ones", async () => {
    db.rows.guide_history.push(
      entry('h1', 'Cells', '2026-10-28T10:00:00Z', { set_id: 'set-1' }),
      entry('h2', 'Photosynthesis', '2026-10-29T09:00:00Z', { study_type: 'multiple_choice', item_count: 1 }),
      entry('h3', 'Not mine', '2026-10-29T10:00:00Z', { user_id: OTHER })
    );
    render(<HistoryPage />);
    const items = within(await screen.findByRole('list', { name: 'Your study guides' })).getAllByRole('listitem');
    expect(items.map((li) => within(li).getByRole('link').getAttribute('href'))).toEqual(['/history/h2', '/history/h1']);
    expect(items[0].textContent).toContain('Photosynthesis');
    expect(items[0].textContent).toContain('Multiple choice · 1 question ·');
    expect(items[0].textContent).not.toContain('Saved');
    expect(items[1].textContent).toContain('Flashcards · 10 questions ·');
    expect(items[1].textContent).toContain('Saved');
  });

  it('says when there are no guides yet', async () => {
    render(<HistoryPage />);
    expect(await screen.findByText('No study guides yet. The ones you make while signed in will show up here.')).toBeTruthy();
  });

  it('removes a guide after asking, saying whether it was saved', async () => {
    db.rows.guide_history.push(
      entry('h1', 'Cells', '2026-10-28T10:00:00Z', { set_id: 'set-1' }),
      entry('h2', 'Photosynthesis', '2026-10-29T09:00:00Z')
    );
    render(<HistoryPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Photosynthesis from history' }));
    await waitFor(() => expect(screen.queryByText('Photosynthesis')).toBeNull());
    expect(window.confirm).toHaveBeenLastCalledWith(
      'Remove "Photosynthesis" from your history? It was never saved, so it will be gone for good.'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove Cells from history' }));
    await waitFor(() => expect(screen.queryByText('Cells')).toBeNull());
    expect(window.confirm).toHaveBeenLastCalledWith('Remove "Cells" from your history? The saved set stays in My Sets.');
    expect(db.rows.guide_history).toEqual([]);
  });

  it('keeps the guide when the user changes their mind', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    db.rows.guide_history.push(entry('h1', 'Cells', '2026-10-28T10:00:00Z'));
    render(<HistoryPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Cells from history' }));
    expect(screen.getByText('Cells')).toBeTruthy();
    expect(db.rows.guide_history).toHaveLength(1);
  });

  it("says so when the history can't be loaded", async () => {
    db.failNext('guide_history', 'select');
    render(<HistoryPage />);
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't load your history. Please try again.");
  });
});
