// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const SET_ID = '00000000-0000-4000-8000-0000000000aa';
const OWNER = '00000000-0000-4000-8000-0000000000bb';
const CARD = '00000000-0000-4000-8000-0000000000cc';

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  set: null as null | Record<string, unknown>,
  cards: [] as Record<string, unknown>[],
  apiCalls: [] as { path: string; init: unknown }[],
  apiResult: null as null | { ok: boolean; status: number; data: Record<string, unknown> },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '00000000-0000-4000-8000-0000000000aa' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/lib/auth', () => ({ useUser: () => ({ user: state.user, loading: false }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'flashcard_sets'
            ? { single: async () => ({ data: state.set, error: state.set ? null : { message: 'not found' } }) }
            : { order: async () => ({ data: state.cards, error: null }) },
      }),
    }),
  },
}));
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(async (path: string, init: unknown) => {
    state.apiCalls.push({ path, init });
    return state.apiResult!;
  }),
  errorMessage: (data: { error?: string }) => data.error ?? 'Something went wrong. Please try again.',
}));

import SetPage from '@/app/sets/[id]/page';

beforeEach(() => {
  state.user = { id: OWNER };
  state.set = { id: SET_ID, title: 'Photosynthesis', source_filename: 'bio.pdf', study_type: 'flashcard', user_id: OWNER };
  state.cards = [{ id: CARD, question: 'Pigment that absorbs light', answer: 'Chlorophyll', options: null, position: 0 }];
  state.apiCalls = [];
  state.apiResult = null;
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('study set page', () => {
  it('lets the owner edit cards and shows the saved cards afterwards', async () => {
    state.apiResult = {
      ok: true,
      status: 200,
      data: { cards: [{ id: CARD, question: 'Green pigment that absorbs light', answer: 'Chlorophyll', options: null, position: 0 }] },
    };
    render(<SetPage />);
    fireEvent.click(await screen.findByRole('button', { name: '✏️ Edit cards' }));
    expect(screen.getByRole('heading', { name: 'Edit cards' })).toBeTruthy();

    fireEvent.change(within(screen.getByRole('listitem', { name: 'Card 1' })).getByLabelText('Question'), {
      target: { value: 'Green pigment that absorbs light' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Green pigment that absorbs light')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Edit cards' })).toBeNull();
    expect(state.apiCalls).toEqual([
      {
        path: `/api/sets/${SET_ID}/cards`,
        init: { method: 'PUT', body: { cards: [{ id: CARD, question: 'Green pigment that absorbs light', answer: 'Chlorophyll' }] } },
      },
    ]);
  });

  it('stays in the editor and shows the error when saving fails', async () => {
    state.apiResult = { ok: false, status: 400, data: { error: 'Card 1: write an answer.', cardIndex: 0 } };
    render(<SetPage />);
    fireEvent.click(await screen.findByRole('button', { name: '✏️ Edit cards' }));
    fireEvent.change(within(screen.getByRole('listitem', { name: 'Card 1' })).getByLabelText('Question'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Card 1: write an answer.');
    expect(screen.getByRole('heading', { name: 'Edit cards' })).toBeTruthy();
  });

  it.each([
    ['another signed-in user', () => (state.user = { id: '00000000-0000-4000-8000-0000000000dd' })],
    ['someone signed out', () => (state.user = null)],
    ['anyone, on a legacy set with no owner', () => (state.set = { ...state.set!, user_id: null })],
  ])('shows no edit controls to %s', async (_label, setup) => {
    setup();
    render(<SetPage />);
    await screen.findByText('Pigment that absorbs light');
    await waitFor(() => expect(screen.queryByRole('button', { name: '✏️ Edit cards' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Rename this set' })).toBeNull();
  });
});
