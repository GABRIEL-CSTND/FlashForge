// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createFakeSupabase, type FakeDb } from '@/test-utils/fake-supabase';

const state = vi.hoisted(() => ({ user: null as null | { id: string } }));
const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('@/test-utils/fake-supabase').createFakeSupabase> }));
vi.mock('@/lib/auth', () => ({ useUser: () => ({ user: state.user, loading: false }) }));
// The browser client. The fake has no RLS, so another user's rows here show
// that the page asks only for the user's own sets and scores.
vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => fake.current!.client.from(t) } }));

import MySetsPage from '@/app/my-sets/page';

const SAM = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
let db: FakeDb;

const set = (id: string, title: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  user_id: SAM,
  title,
  study_type: 'flashcard',
  created_at: createdAt,
  ...extra,
});
let attemptCount = 0;
const attempt = (setId: string, score: number, total: number, userId = SAM) => ({
  id: `attempt-${(attemptCount += 1)}`,
  user_id: userId,
  set_id: setId,
  score,
  total,
});

beforeEach(() => {
  state.user = { id: SAM };
  fake.current = createFakeSupabase({ tables: { flashcard_sets: { unique: [['id']] }, attempts: { unique: [['id']] } } });
  db = fake.current.db;
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const decks = async () => within(await screen.findByRole('list', { name: 'Your saved decks' })).getAllByRole('link');

describe('My Sets page', () => {
  it('asks a signed-out visitor to sign in', () => {
    state.user = null;
    render(<MySetsPage />);
    expect(screen.getByText('Sign in to view your saved sets.')).toBeTruthy();
  });

  it("lays the user's sets out as decks, newest first, each with its best score", async () => {
    db.rows.flashcard_sets.push(
      set('s1', 'Cells', '2026-10-28T10:00:00Z'),
      set('s2', 'Layers', '2026-10-29T10:00:00Z', { study_type: 'multiple_choice' }),
      set('s3', 'Not mine', '2026-10-30T10:00:00Z', { user_id: OTHER })
    );
    db.rows.attempts.push(attempt('s1', 6, 10), attempt('s1', 9, 10), attempt('s2', 3, 3, OTHER));
    render(<MySetsPage />);
    const links = await decks();
    // The last place on the desk is for a new deck.
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/sets/s2', '/sets/s1', '/']);
    expect(links[0].getAttribute('aria-label')).toMatch(/^Pick up Layers, Multiple choice, Saved .+\. Not studied yet$/);
    expect(links[1].textContent).toContain('Best 9 of 10');
    expect(links[2].textContent).toContain('New deck');
    expect(screen.getByText('2 saved decks. Pick one up to study it.')).toBeTruthy();
  });

  it('says when there are no saved sets yet, and still offers a new deck', async () => {
    render(<MySetsPage />);
    expect((await decks()).map((a) => a.getAttribute('href'))).toEqual(['/']);
    expect(screen.getByText('No saved decks yet. Save one after you make it, and it lands here.')).toBeTruthy();
  });

  it('deletes a set after asking', async () => {
    db.rows.flashcard_sets.push(set('s1', 'Cells', '2026-10-28T10:00:00Z'));
    render(<MySetsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Cells' }));
    expect(window.confirm).toHaveBeenLastCalledWith('Delete "Cells"? This can\'t be undone.');
    await waitFor(() => expect(screen.queryByRole('link', { name: /^Pick up Cells/ })).toBeNull());
    expect(db.rows.flashcard_sets).toEqual([]);
  });

  it('keeps the set when the user changes their mind', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    db.rows.flashcard_sets.push(set('s1', 'Cells', '2026-10-28T10:00:00Z'));
    render(<MySetsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Cells' }));
    expect(screen.getByRole('link', { name: /^Pick up Cells/ })).toBeTruthy();
    expect(db.rows.flashcard_sets).toHaveLength(1);
  });

  it("says so when the sets can't be loaded", async () => {
    db.failNext('flashcard_sets', 'select');
    render(<MySetsPage />);
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't load your sets. Please try again.");
  });
});
