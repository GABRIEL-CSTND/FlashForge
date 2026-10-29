// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createFakeSupabase, type FakeDb } from '@/test-utils/fake-supabase';

const ENTRY = '00000000-0000-4000-8000-0000000000b1';
const SET = '00000000-0000-4000-8000-0000000000b2';
const SAM = '00000000-0000-4000-8000-0000000000b3';
const WIKI = 'https://en.wikipedia.org/wiki/Photosynthesis';

type ApiResult = { ok: boolean; status: number; data: Record<string, unknown> };

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  id: '',
  push: vi.fn(),
  apiCalls: [] as { path: string; init: unknown }[],
  apiResult: null as null | ApiResult,
}));
const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('@/test-utils/fake-supabase').createFakeSupabase> }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: state.id }), useRouter: () => ({ push: state.push }) }));
vi.mock('@/lib/auth', () => ({ useUser: () => ({ user: state.user, loading: false }) }));
// The browser client. Only the owner can read an entry (RLS, checked in
// supabase/tests/history-rls-check.sql); the fake has every row.
vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => fake.current!.client.from(t) } }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(async (path: string, init: unknown) => {
    state.apiCalls.push({ path, init });
    return state.apiResult!;
  }),
  errorMessage: (data: { error?: string }, fallback = 'Something went wrong. Please try again.') => data.error ?? fallback,
}));

import HistoryGuidePage from '@/app/history/[id]/page';

const CARDS = [{ question: 'Pigment that absorbs light', answer: 'Chlorophyll' }];
let db: FakeDb;

function addEntry(extra: Record<string, unknown> = {}) {
  db.rows.guide_history.push({
    id: ENTRY,
    user_id: SAM,
    title: 'Photosynthesis',
    study_type: 'flashcard',
    source_filename: 'bio.pdf',
    source_credit: null,
    items: CARDS,
    set_id: null,
    ...extra,
  });
}

beforeEach(() => {
  state.user = { id: SAM };
  state.id = ENTRY;
  state.push.mockClear();
  state.apiCalls = [];
  state.apiResult = null;
  fake.current = createFakeSupabase({ tables: { guide_history: { unique: [['id']] } } });
  db = fake.current.db;
});
afterEach(cleanup);

describe('a guide from History', () => {
  it('shows its cards to study again', async () => {
    addEntry();
    render(<HistoryGuidePage />);
    expect(await screen.findByText('Pigment that absorbs light')).toBeTruthy();
  });

  it('saves an unsaved guide to My Sets, with its History entry, then opens the set', async () => {
    addEntry();
    state.apiResult = { ok: true, status: 200, data: { id: SET } };
    render(<HistoryGuidePage />);
    fireEvent.click(await screen.findByRole('button', { name: '💾 Save to My Sets' }));
    await waitFor(() => expect(state.push).toHaveBeenCalledWith(`/sets/${SET}`));
    expect(state.apiCalls).toEqual([
      {
        path: '/api/save-set',
        init: {
          method: 'POST',
          body: { title: 'Photosynthesis', sourceFilename: 'bio.pdf', studyType: 'flashcard', items: CARDS, historyId: ENTRY },
        },
      },
    ]);
  });

  it('says what went wrong when saving fails', async () => {
    addEntry();
    state.apiResult = { ok: false, status: 500, data: { error: 'Failed to create set' } };
    render(<HistoryGuidePage />);
    fireEvent.click(await screen.findByRole('button', { name: '💾 Save to My Sets' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Failed to create set');
    expect(state.push).not.toHaveBeenCalled();
  });

  it('shows a saved guide as saved, with a link to its set instead of Save', async () => {
    addEntry({ set_id: SET });
    render(<HistoryGuidePage />);
    expect((await screen.findByRole('link', { name: 'Open it in My Sets' })).getAttribute('href')).toBe(`/sets/${SET}`);
    expect(screen.queryByRole('button', { name: '💾 Save to My Sets' })).toBeNull();
  });

  it('credits the Wikipedia article it came from', async () => {
    addEntry({ source_filename: WIKI, source_credit: { name: 'Wikipedia: Photosynthesis', url: WIKI } });
    render(<HistoryGuidePage />);
    expect((await screen.findByRole('link', { name: 'Wikipedia: Photosynthesis' })).getAttribute('href')).toBe(WIKI);
  });

  it('goes back to History on Exit', async () => {
    addEntry();
    render(<HistoryGuidePage />);
    fireEvent.click(await screen.findByRole('button', { name: '← Exit' }));
    expect(state.push).toHaveBeenCalledWith('/history');
  });

  it.each([
    ['an entry that is not there', ENTRY],
    ['a link that is not an id', 'not-an-id'],
  ])('says the guide is not found for %s', async (_label, id) => {
    state.id = id;
    render(<HistoryGuidePage />);
    expect(await screen.findByText('Study guide not found.')).toBeTruthy();
    expect(screen.getByRole('link', { name: '← Back to History' }).getAttribute('href')).toBe('/history');
  });

  it('asks a signed-out visitor to sign in', () => {
    state.user = null;
    addEntry();
    render(<HistoryGuidePage />);
    expect(screen.getByText("Sign in to see the study guides you've made.")).toBeTruthy();
  });
});
