// @vitest-environment jsdom
// Whole live games (#26): the host's page and two players' pages, talking
// through the in-memory room (lib/live-room.ts memoryTransport) instead of
// Supabase Realtime, with the clock under the test's control.
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav, usePathname: () => '/play' }));

// The signed-in user and the rows the database would return.
const db = vi.hoisted(() => ({ user: null as null | { id: string }, tables: {} as Record<string, Record<string, unknown>[]> }));
vi.mock('@/lib/auth', () => ({ useUser: () => ({ user: db.user, loading: false }) }));
vi.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile: null }) }));
vi.mock('@/lib/supabase', () => {
  const query = (table: string) => {
    const filters: [string, unknown][] = [];
    const rows = () => (db.tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return q;
      },
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return q;
  };
  return { supabase: { auth: { getSession: async () => ({ data: { session: null } }) }, from: query } };
});

import HostRoom from '@/components/live/HostRoom';
import PlayerRoom from '@/components/live/PlayerRoom';
import { encodeEvent, PROGRESS_MIME, type ProgressEvent } from '@/lib/generation-progress';
import { newGame, REVEAL_MS, setDeck, toLiveCards, type LiveDeck } from '@/lib/live-game';
import { memoryTransport } from '@/lib/live-room';

const HOST = 'host-gabe-0000';
const AMY = 'player-amy-1111';
const BEN = 'player-ben-2222';
const USER = '11111111-1111-4111-8111-111111111111';
const SET_ID = '22222222-2222-4222-8222-222222222222';

const CARDS = [
  { question: 'Which organelle makes ATP?', answer: 'Mitochondria', options: ['Ribosome', 'Mitochondria', 'Nucleus', 'Golgi body'] },
  { question: 'Plant cells have a cell wall.', answer: 'True', options: ['True', 'False'], explanation: 'Made of cellulose.' },
  { question: 'The control center of the cell', answer: 'Nucleus', options: null },
];
const savedDeck: LiveDeck = { title: 'Cells', studyType: 'mixed', source: 'saved', cards: toLiveCards('mixed', CARDS) };

let hub = memoryTransport();
// Moves the clock on, letting every message and render through.
const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const screenOf = (ui: React.ReactElement) => within(render(ui).container);
type Screen = ReturnType<typeof screenOf>;
const text = (s: Screen) => s.getByRole('main').textContent ?? '';
const scoreOf = (s: Screen, name: string) =>
  Array.from(s.getByRole('region', { name: 'Scores' }).querySelectorAll('li')).find((li) => li.textContent?.includes(name))
    ?.lastElementChild?.textContent;

function room(deck: LiveDeck | null = savedDeck) {
  const start = newGame('K7MQ', HOST, 'Gabe', Date.now());
  const host = screenOf(<HostRoom initial={deck ? setDeck(start, deck) : start} transport={hub} />);
  const amy = screenOf(<PlayerRoom code="K7MQ" initialSeat={{ id: AMY, nickname: 'Amy' }} transport={hub} />);
  const ben = screenOf(<PlayerRoom code="K7MQ" initialSeat={{ id: BEN, nickname: 'Ben' }} transport={hub} />);
  return { host, amy, ben };
}

function typeGuess(s: Screen, guess: string) {
  fireEvent.change(s.getByLabelText('Your answer'), { target: { value: guess } });
  fireEvent.click(s.getByRole('button', { name: 'Guess' }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
  hub = memoryTransport();
  db.user = null;
  db.tables = {};
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a live game', () => {
  it('plays a whole game: a pick, a true or false, and a typed answer', async () => {
    const { host, amy, ben } = room();
    await flush(500);

    // The lobby: everyone is in, and the players know the host picked a saved deck.
    expect(host.getByRole('region', { name: 'Players' }).textContent).toMatch(/Gabe.*Amy.*Ben/);
    expect(text(amy)).toContain('Waiting for the host to start');
    expect(text(amy)).toContain('From the host’s saved decks: the host may know the answers.');
    expect(text(ben)).toContain('3 questions · Mixed');

    fireEvent.click(host.getByRole('button', { name: 'Start the game' }));
    await flush();
    for (const s of [host, amy, ben]) expect(text(s)).toContain('Question 1 of 3 · Multiple choice');

    // Question 1: the host picks at once, Amy a second later, Ben last and wrong.
    fireEvent.click(host.getByRole('button', { name: 'Mitochondria' }));
    await flush(1000);
    fireEvent.click(amy.getByRole('button', { name: 'Mitochondria' }));
    expect(text(amy)).toContain('Sending your pick…');
    await flush(300);
    expect(text(amy)).toContain('Locked in. Waiting for the others…');
    // Others see that Amy picked, not what.
    expect(within(ben.getByRole('region', { name: 'Scores' })).getAllByText('✓')).toHaveLength(2);
    fireEvent.click(ben.getByRole('button', { name: 'Nucleus' }));
    await flush(300);

    // Everyone answered, so the answer shows before time is up.
    for (const s of [host, amy, ben]) expect(text(s)).toContain('Answer Mitochondria');
    expect(text(amy)).toContain('Right! +98 points');
    expect(text(ben)).toContain('Not this time.');
    expect(scoreOf(ben, 'Gabe')).toBe('100');
    expect(scoreOf(ben, 'Amy')).toBe('98');
    expect(scoreOf(ben, 'Ben')).toBe('0');

    // Question 2 comes on its own. Only Amy answers, wrong, and time runs out.
    await flush(REVEAL_MS);
    expect(text(amy)).toContain('Question 2 of 3 · True or false');
    fireEvent.click(amy.getByRole('button', { name: 'False' }));
    await flush(19_000);
    expect(text(ben)).not.toContain('Answer True');
    await flush(1_000);
    expect(text(ben)).toContain('Answer True');
    expect(text(ben)).toContain('Made of cellulose.');
    expect(text(ben)).toContain('No answer this time.');

    // Question 3 is typed: guess until it's right, with one typo allowed.
    await flush(REVEAL_MS);
    expect(text(amy)).toContain('Question 3 of 3 · Type the answer');
    await flush(1000);
    typeGuess(amy, 'Ribosome');
    await flush(700);
    expect(text(amy)).toContain('“Ribosome” isn\'t it. Try again.');
    typeGuess(amy, 'nucleas');
    await flush(300);
    expect(text(amy)).toContain('You got it! Waiting for the others…');
    expect(within(ben.getByRole('region', { name: 'Scores' })).getByText('✓ got it')).toBeTruthy();
    await flush(8_000);
    typeGuess(host, 'Nucleus');
    await flush(10_000);
    expect(text(ben)).toContain('Answer Nucleus');

    // The podium. Each question here started 300 ms before the test's clock, so
    // Amy got 98 + 95 (2 s in) and Gabe 100 + 74 (10.3 s in).
    await flush(REVEAL_MS);
    for (const s of [host, amy, ben]) expect(text(s)).toContain('Final scores');
    const final = within(amy.getByRole('region', { name: 'Final scores' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(final).toEqual(['1st: Amy (you), 193 points', '2nd: Gabe, 174 points', '3rd: Ben, 0 points']);

    // Play again: back to the lobby with the same deck and no points.
    fireEvent.click(host.getByRole('button', { name: 'Play again' }));
    await flush(300);
    expect(text(amy)).toContain('Waiting for the host to start');
    expect(host.getByRole('button', { name: 'Start the game' })).toBeTruthy();
  });

  it('makes a new deck in the lobby without showing its cards to the host', async () => {
    const encoder = new TextEncoder();
    let server!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start: (c) => void (server = c) });
    const fetchMock = vi.fn(async () => new Response(stream, { status: 200, headers: { 'Content-Type': PROGRESS_MIME } }));
    vi.stubGlobal('fetch', fetchMock);
    const send = (event: ProgressEvent) => server.enqueue(encoder.encode(encodeEvent(event)));
    const items = [
      { question: 'What do plants make in photosynthesis?', answer: 'Glucose', options: ['Glucose', 'Protein', 'Salt', 'Iron'] },
      { question: 'Where does photosynthesis happen?', answer: 'Chloroplast', options: ['Chloroplast', 'Nucleus', 'Root', 'Stem'] },
      { question: 'What gas do plants take in?', answer: 'Carbon dioxide', options: ['Oxygen', 'Carbon dioxide', 'Helium', 'Neon'] },
    ];
    const { host, amy } = room(null);
    await flush(500);
    expect(text(amy)).toContain('The host is picking a deck.');

    fireEvent.change(host.getByRole('textbox', { name: 'Your notes, a link or a topic' }), {
      target: { value: 'Plants make glucose from carbon dioxide and water, using light, in their chloroplasts.' },
    });
    fireEvent.click(host.getByRole('button', { name: 'Make my deck' }));
    await flush(300);
    expect(fetchMock).toHaveBeenCalledWith('/api/generate', expect.objectContaining({ method: 'POST' }));
    const form = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(Object.fromEntries(form.entries())).toMatchObject({ studyType: 'multiple_choice', count: '10', difficulty: 'medium' });
    expect(text(amy)).toContain('The host is making a new deck…');

    send({ type: 'step', step: 'writing' });
    send({ type: 'cards', title: 'Photosynthesis', sourceFilename: null, source: null, studyType: 'multiple_choice', items: items.slice(0, 2) });
    await flush(300);
    expect(text(host)).toContain('2 of 10 questions written.');
    expect(text(amy)).toContain('2 of 10 written');

    send({
      type: 'result',
      status: 200,
      body: { title: 'Photosynthesis', sourceFilename: null, source: null, studyType: 'multiple_choice', items, historyId: null },
    });
    server.close();
    await flush(300);
    expect(text(host)).toContain('The deck is ready');
    expect(text(host)).toContain('3 questions · Multiple choice');
    expect(text(amy)).toContain('A new deck, made for this game: nobody has seen the cards, the host included.');
    // Not a word of the cards on the host's screen.
    for (const card of items) {
      for (const words of [card.question, card.answer]) expect(text(host)).not.toContain(words);
    }
  });

  it("plays a deck from the host's My Sets, and says the host may know it", async () => {
    db.user = { id: USER };
    db.tables = {
      flashcard_sets: [{ id: SET_ID, user_id: USER, title: 'Cells', study_type: 'mixed' }],
      flashcards: CARDS.map((c, i) => ({ ...c, explanation: c.explanation ?? null, set_id: SET_ID, position: i })),
    };
    const { host, amy } = room(null);
    await flush(500);
    fireEvent.click(host.getByRole('tab', { name: 'My Sets' }));
    await flush();
    fireEvent.click(host.getByRole('button', { name: /Cells/ }));
    await flush(300);
    expect(text(host)).toContain('The deck is ready');
    expect(text(amy)).toContain('Cells');
    expect(text(amy)).toContain('3 questions · Mixed');
    expect(text(amy)).toContain('the host may know the answers');
  });

  it('opens with the deck picked on a set page', async () => {
    db.user = { id: USER };
    db.tables = {
      flashcard_sets: [{ id: SET_ID, user_id: USER, title: 'Cells', study_type: 'mixed' }],
      flashcards: CARDS.map((c, i) => ({ ...c, explanation: c.explanation ?? null, set_id: SET_ID, position: i })),
    };
    const host = screenOf(
      <HostRoom initial={newGame('K7MQ', HOST, 'Gabe', Date.now())} preselect={{ kind: 'set', id: SET_ID }} transport={hub} />
    );
    await flush(300);
    expect(text(host)).toContain('The deck is ready');
    expect(text(host)).toContain('Cells');
  });

  it('lets the host only watch, and shows a late player the question under way', async () => {
    const start = setDeck(newGame('K7MQ', HOST, 'Gabe', Date.now()), savedDeck);
    const host = screenOf(<HostRoom initial={start} transport={hub} />);
    const amy = screenOf(<PlayerRoom code="K7MQ" initialSeat={{ id: AMY, nickname: 'Amy' }} transport={hub} />);
    await flush(500);
    fireEvent.click(host.getByLabelText(/Play too/));
    await flush(300);
    expect(host.getByRole('region', { name: 'Players' }).textContent).not.toContain('Gabe');
    fireEvent.click(host.getByRole('button', { name: 'Start the game' }));
    await flush();
    // Watching: the slips are there to read, but can't be picked.
    expect((host.getByRole('button', { name: 'Mitochondria' }) as HTMLButtonElement).disabled).toBe(true);

    const ben = screenOf(<PlayerRoom code="K7MQ" initialSeat={{ id: BEN, nickname: 'Ben' }} transport={hub} />);
    await flush(500);
    expect(text(ben)).toContain('Question 1 of 3');
    expect(scoreOf(host, 'Ben')).toBe('0');
    expect(scoreOf(host, 'Gabe')).toBeUndefined();
  });

  it('tells players when the host closes the room', async () => {
    const { host, amy } = room();
    await flush(500);
    fireEvent.click(host.getByRole('button', { name: 'Close the room' }));
    fireEvent.click(host.getByRole('button', { name: 'Yes' }));
    await flush();
    expect(nav.push).toHaveBeenCalledWith('/play');
    expect(text(amy)).toContain('The host closed the room');
  });

  it('says when there is no game with the code', async () => {
    const amy = screenOf(<PlayerRoom code="ZZZZ" initialSeat={{ id: AMY, nickname: null }} transport={hub} />);
    await flush(1000);
    expect(text(amy)).toContain('Finding the room…');
    await flush(9000);
    expect(text(amy)).toContain('No game with the code ZZZZ');
  });

  it('asks for a nickname before joining', async () => {
    const host = screenOf(<HostRoom initial={setDeck(newGame('K7MQ', HOST, 'Gabe', Date.now()), savedDeck)} transport={hub} />);
    const amy = screenOf(<PlayerRoom code="K7MQ" initialSeat={{ id: AMY, nickname: null }} transport={hub} />);
    await flush(500);
    expect(text(amy)).toContain('1 player is waiting.');
    fireEvent.change(amy.getByLabelText('Your nickname'), { target: { value: '  Amy  ' } });
    fireEvent.click(amy.getByRole('button', { name: 'Join' }));
    await flush(500);
    expect(host.getByRole('region', { name: 'Players' }).textContent).toContain('Amy');
    expect(text(amy)).toContain('Amy (you)');
    expect(localStorage.getItem('flashforge-live-nickname')).toBe('"Amy"');
  });
});
