// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const SET_ID = '00000000-0000-4000-8000-0000000000aa';
const OWNER = '00000000-0000-4000-8000-0000000000bb';
const CARD = '00000000-0000-4000-8000-0000000000cc';
const STUDENT = '00000000-0000-4000-8000-0000000000dd';
const ASSIGNMENT = '00000000-0000-4000-8000-0000000000ee';

type ApiResult = { ok: boolean; status: number; data: Record<string, unknown> };

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  set: null as null | Record<string, unknown>,
  cards: [] as Record<string, unknown>[],
  apiCalls: [] as { path: string; init: unknown }[],
  apiResult: null as null | ApiResult,
  // For tests that make more than one call: answers each call by path.
  respond: null as null | ((path: string, init: unknown) => ApiResult | Promise<ApiResult>),
  role: 'student' as string,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '00000000-0000-4000-8000-0000000000aa' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/lib/auth', () => ({ useUser: () => ({ user: state.user, loading: false }) }));
vi.mock('@/components/ProfileProvider', () => ({
  useProfile: () => ({ profile: state.user ? { role: state.role, roleChosenAt: '2026-10-20', displayName: null } : null }),
}));
// The assign dialog has its own tests; here it only needs to open.
vi.mock('@/components/AssignPanel', () => ({ default: ({ setTitle }: { setTitle: string }) => <div role="dialog">Assign {setTitle}</div> }));
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
    return state.respond ? state.respond(path, init) : state.apiResult!;
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
  state.respond = null;
  state.role = 'student';
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
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

  it.each([['teacher'], ['admin']])('offers a %s who owns the set "Assign to class"', async (role) => {
    state.role = role;
    render(<SetPage />);
    fireEvent.click(await screen.findByRole('button', { name: '📌 Assign to class' }));
    expect(screen.getByRole('dialog').textContent).toBe('Assign Photosynthesis');
  });

  it('does not offer "Assign to class" to a student who owns the set', async () => {
    render(<SetPage />);
    await screen.findByRole('button', { name: '✏️ Edit cards' });
    expect(screen.queryByRole('button', { name: '📌 Assign to class' })).toBeNull();
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
    expect(screen.queryByRole('button', { name: '📌 Assign to class' })).toBeNull();
  });
});

describe('saving study results (#57)', () => {
  const attempt = (overrides: Record<string, unknown> = {}) => ({
    id: '00000000-0000-4000-8000-000000000111',
    setId: SET_ID,
    assignmentId: ASSIGNMENT,
    studyType: 'flashcard',
    score: 1,
    total: 1,
    completedAt: '2026-10-22T09:30:00Z',
    ...overrides,
  });

  // A student studying a set their teacher assigned.
  beforeEach(() => {
    state.user = { id: STUDENT };
  });

  const finishByMarkingGotIt = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Tap to flip/ }));
    fireEvent.click(screen.getByRole('button', { name: '✓ Got it' }));
  };

  it('saves the run to the assignment it was opened from, then lists recent scores', async () => {
    window.history.replaceState(null, '', `/sets/${SET_ID}?assignment=${ASSIGNMENT}`);
    let finishSave: (r: ApiResult) => void = () => {};
    state.respond = (path) =>
      path === '/api/attempts'
        ? new Promise<ApiResult>((resolve) => (finishSave = resolve))
        : { ok: true, status: 200, data: { attempts: [attempt(), attempt({ id: '00000000-0000-4000-8000-000000000222', score: 0 })] } };
    render(<SetPage />);
    await finishByMarkingGotIt();

    expect((await screen.findByRole('status')).textContent).toBe('Saving your score...');
    finishSave({ ok: true, status: 201, data: { attempt: attempt() } });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('✓ Saved to your scores. Your teacher can see it.'));

    const [save, recent] = state.apiCalls;
    expect(save.path).toBe('/api/attempts');
    expect(save.init).toMatchObject({
      method: 'POST',
      body: { setId: SET_ID, assignmentId: ASSIGNMENT, mode: null, answers: [{ cardId: CARD, result: 'got' }] },
    });
    expect((save.init as { body: { id: string } }).body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(recent.path).toBe(`/api/attempts?setId=${SET_ID}`);
    const scores = await screen.findByRole('list', { name: 'Your recent scores' });
    expect(within(scores).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('1 / 1 got it'),
      expect.stringContaining('0 / 1 got it'),
    ]);
  });

  it('saves a typed run with how it was studied, and labels typed scores (#66)', async () => {
    state.respond = (path) =>
      path === '/api/attempts'
        ? { ok: true, status: 201, data: { attempt: attempt({ mode: 'type' }) } }
        : { ok: true, status: 200, data: { attempts: [attempt({ mode: 'type' }), attempt({ id: '00000000-0000-4000-8000-000000000222', mode: null, score: 0 })] } };
    render(<SetPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Type' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: 'chlorophyl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    const scores = await screen.findByRole('list', { name: 'Your recent scores' });
    expect(state.apiCalls[0].init).toMatchObject({
      method: 'POST',
      body: { setId: SET_ID, mode: 'type', answers: [{ cardId: CARD, typed: 'chlorophyl' }] },
    });
    expect(within(scores).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('1 / 1 typed'),
      expect.stringContaining('0 / 1 got it'),
    ]);
  });

  it('says only the student can see a run that is not for an assignment', async () => {
    state.respond = (path) =>
      path === '/api/attempts'
        ? { ok: true, status: 201, data: { attempt: attempt({ assignmentId: null }) } }
        : { ok: true, status: 200, data: { attempts: [attempt({ assignmentId: null })] } };
    render(<SetPage />);
    await finishByMarkingGotIt();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('✓ Saved to your scores. Only you can see this one.'));
    expect(state.apiCalls[0].init).toMatchObject({ body: { assignmentId: null } });
  });

  it('uses a new attempt id for each finish, so retries are the only duplicates', async () => {
    state.respond = (path) =>
      path === '/api/attempts'
        ? { ok: true, status: 201, data: { attempt: attempt() } }
        : { ok: true, status: 200, data: { attempts: [] } };
    render(<SetPage />);
    await finishByMarkingGotIt();
    await screen.findByText('✓ Saved to your scores. Your teacher can see it.');
    fireEvent.click(screen.getByRole('button', { name: 'Review Again' }));
    await finishByMarkingGotIt();
    await waitFor(() => expect(state.apiCalls.filter((c) => c.path === '/api/attempts')).toHaveLength(2));
    const [first, second] = state.apiCalls
      .filter((c) => c.path === '/api/attempts')
      .map((c) => (c.init as { body: { id: string } }).body.id);
    expect(first).not.toBe(second);
  });

  it('asks a signed-out visitor to sign in instead of saving', async () => {
    state.user = null;
    state.set = { ...state.set!, user_id: null };
    render(<SetPage />);
    await finishByMarkingGotIt();
    expect((await screen.findByRole('status')).textContent).toBe('Sign in to save your scores.');
    expect(state.apiCalls).toEqual([]);
  });

  it("shows the server's reason when the score can't be saved", async () => {
    state.respond = () => ({
      ok: false,
      status: 409,
      data: { error: 'This set changed while you were studying, so the score couldn’t be saved.' },
    });
    render(<SetPage />);
    await finishByMarkingGotIt();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This set changed while you were studying, so the score couldn’t be saved.'
    );
    // No history fetch after a failed save.
    expect(state.apiCalls).toHaveLength(1);
  });

  it('says so when the server is unreachable', async () => {
    state.respond = () => Promise.reject(new TypeError('Failed to fetch'));
    render(<SetPage />);
    await finishByMarkingGotIt();
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't reach the server, so your score wasn't saved.");
  });
});

describe('where a saved card came from', () => {
  const QUOTE = 'Chlorophyll is the pigment that absorbs light.';
  const flipCard = async () => fireEvent.click(await screen.findByRole('button', { name: /Tap to flip/ }));

  it('shows the saved quote and its page once the card is flipped', async () => {
    state.cards = [
      { id: CARD, question: 'Pigment that absorbs light', answer: 'Chlorophyll', options: null, position: 0, source_excerpt: QUOTE, source_location: 'Page 6' },
    ];
    render(<SetPage />);
    await flipCard();
    expect(screen.getByText('From your document · Page 6')).toBeTruthy();
    expect(screen.getByText(new RegExp(QUOTE.replace('.', '\\.')))).toBeTruthy();
  });

  it('shows nothing for a card saved before quotes existed', async () => {
    render(<SetPage />);
    await flipCard();
    expect(screen.queryByText(/From your document/)).toBeNull();
  });

  it('keeps the quote after the owner edits the cards', async () => {
    state.cards = [
      { id: CARD, question: 'Pigment that absorbs light', answer: 'Chlorophyll', options: null, position: 0, source_excerpt: QUOTE, source_location: 'Page 6' },
    ];
    // The reply to an edit has the card's text but not where it came from.
    state.apiResult = {
      ok: true,
      status: 200,
      data: { cards: [{ id: CARD, question: 'Green pigment that absorbs light', answer: 'Chlorophyll', options: null, position: 0 }] },
    };
    render(<SetPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Edit cards/ }));
    fireEvent.change(within(screen.getByRole('listitem', { name: 'Card 1' })).getByLabelText('Question'), {
      target: { value: 'Green pigment that absorbs light' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Green pigment that absorbs light')).toBeTruthy();

    await flipCard();
    expect(screen.getByText('From your document · Page 6')).toBeTruthy();
  });
});
