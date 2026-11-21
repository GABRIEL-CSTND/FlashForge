import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  backToLobby,
  BASE_POINTS,
  cleanNickname,
  dropQuiet,
  endGame,
  everyoneDone,
  isPlayerId,
  markSeen,
  MAX_GUESSES,
  MAX_PLAYERS,
  newGame,
  newRoomCode,
  nextDeadline,
  normalizeRoomCode,
  PLAYER_TIMEOUT_MS,
  playerLeft,
  pointsFor,
  REVEAL_MS,
  roomView,
  sendInterval,
  setDeck,
  setMaking,
  setSettings,
  standings,
  startGame,
  startProblem,
  submitAnswer,
  tick,
  toLiveCards,
  type HostState,
  type LiveDeck,
} from '@/lib/live-game';

const HOST = 'host-0000-aaaa';
const AMY = 'player-amy-1111';
const BEN = 'player-ben-2222';
const T0 = 1_000_000;

const deck: LiveDeck = {
  title: 'Cells',
  studyType: 'mixed',
  source: 'new',
  cards: toLiveCards('mixed', [
    { question: 'Which organelle makes ATP?', answer: 'Mitochondria', options: ['Ribosome', 'Mitochondria', 'Nucleus', 'Golgi body'] },
    { question: 'Plant cells have a cell wall.', answer: 'true', options: ['True', 'False'], explanation: 'Made of cellulose.' },
    { question: 'The control center of the cell', answer: 'Nucleus' },
  ]),
};

// A lobby with the host, Amy and Ben, and the deck picked.
function lobby(): HostState {
  let s = newGame('K7MQ', HOST, 'Gabe', T0);
  s = addPlayer(s, AMY, 'Amy', T0);
  s = addPlayer(s, BEN, 'Ben', T0);
  return setDeck(s, deck);
}

const answer = (s: HostState, id: string, given: string, at: number, index?: number) =>
  submitAnswer(s, id, index ?? (s.phase.name === 'question' ? s.phase.index : -1), given, at);

describe('room codes and names', () => {
  it('makes 4-character codes with no look-alike characters', () => {
    let i = 0;
    const steps = [0, 0.99, 0.5, 0.25];
    const code = newRoomCode(() => steps[i++]);
    expect(code).toBe('2ZH9');
    for (let n = 0; n < 200; n++) expect(newRoomCode()).toMatch(/^[2-9A-HJKMNP-Z]{4}$/);
  });

  it('reads what people type as a code', () => {
    expect(normalizeRoomCode(' k7m q ')).toBe('K7MQ');
    expect(normalizeRoomCode('K7-MQ')).toBe('K7MQ');
    expect(normalizeRoomCode('K7M')).toBeNull();
    expect(normalizeRoomCode('K7MQX')).toBeNull();
    expect(normalizeRoomCode('KOMQ')).toBeNull(); // no O
  });

  it('cleans nicknames', () => {
    expect(cleanNickname('  Amy \n  Lee ')).toBe('Amy Lee');
    expect(cleanNickname('')).toBe('Player');
    expect(cleanNickname(null)).toBe('Player');
    expect(cleanNickname('x'.repeat(40))).toHaveLength(20);
  });

  it('only takes ids a browser would make', () => {
    expect(isPlayerId(crypto.randomUUID())).toBe(true);
    expect(isPlayerId('short')).toBe(false);
    expect(isPlayerId('has spaces in it')).toBe(false);
    expect(isPlayerId(42)).toBe(false);
  });

  it('sends the room less often as it grows', () => {
    expect(sendInterval(2)).toBe(250);
    expect(sendInterval(10)).toBe(500);
    expect(sendInterval(31)).toBe(1500);
    // About 20 sends a second reach browsers, whatever the size.
    for (const n of [5, 10, 20, 31]) expect((n * 1000) / sendInterval(n)).toBeLessThanOrEqual(21);
  });
});

describe('the deck', () => {
  it('asks each kind of card the right way', () => {
    expect(deck.cards.map((c) => [c.kind, c.label])).toEqual([
      ['choice', 'Multiple choice'],
      ['choice', 'True or false'],
      ['typed', 'Type the answer'],
    ]);
    expect(deck.cards[1]).toMatchObject({ answer: 'True', options: ['True', 'False'], explanation: 'Made of cellulose.' });
  });

  it('asks flashcards as typed questions and drops empty cards', () => {
    const cards = toLiveCards('flashcard', [
      { question: 'Powerhouse of the cell', answer: 'Mitochondria' },
      { question: '  ', answer: 'Nothing' },
      { question: 'No answer', answer: '' },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: 'typed', options: null });
  });

  it('types a choice card whose answer is not one of its slips', () => {
    const [card] = toLiveCards('multiple_choice', [{ question: 'Q', answer: 'D', options: ['A', 'B', 'C'] }]);
    expect(card.kind).toBe('typed');
  });
});

describe('points', () => {
  it('gives 50 for a right answer plus up to 50 for speed', () => {
    expect(pointsFor(20_000, 20_000)).toBe(100);
    expect(pointsFor(10_000, 20_000)).toBe(75);
    expect(pointsFor(0, 20_000)).toBe(BASE_POINTS);
    expect(pointsFor(-5, 20_000)).toBe(BASE_POINTS);
  });
});

describe('joining and leaving', () => {
  it('lists players in the order they came, with unique names', () => {
    let s = lobby();
    s = addPlayer(s, 'player-amy-3333', 'amy', T0);
    expect(s.players.map((p) => p.nickname)).toEqual(['Gabe', 'Amy', 'Ben', 'amy 2']);
  });

  it('counts a second join from the same player as being seen', () => {
    const s = addPlayer(lobby(), AMY, 'Someone else', T0 + 5000);
    expect(s.players).toHaveLength(3);
    expect(s.players[1]).toMatchObject({ nickname: 'Amy', lastSeen: T0 + 5000 });
  });

  it('ignores bad ids and the host joining as a player', () => {
    const s = lobby();
    expect(addPlayer(s, 'bad id', 'X', T0)).toBe(s);
    expect(addPlayer(s, HOST, 'X', T0)).toBe(s);
  });

  it(`turns players away past ${MAX_PLAYERS}`, () => {
    let s = newGame('K7MQ', HOST, 'Gabe', T0);
    for (let i = 0; i < MAX_PLAYERS; i++) s = addPlayer(s, `player-${String(i).padStart(4, '0')}`, `P${i}`, T0);
    s = addPlayer(s, 'player-late-9999', 'Late', T0);
    expect(s.players).toHaveLength(MAX_PLAYERS + 1);
    expect(s.refused).toEqual(['player-late-9999']);
    // Once someone leaves, there's room again.
    s = playerLeft(s, 'player-0000');
    s = addPlayer(s, 'player-late-9999', 'Late', T0);
    expect(s.players.at(-1)?.nickname).toBe('Late');
    expect(s.refused).toEqual([]);
  });

  it('takes players who leave off the lobby list, but keeps them greyed out in a game', () => {
    expect(playerLeft(lobby(), AMY).players.map((p) => p.id)).toEqual([HOST, BEN]);
    let s = startGame(lobby(), T0);
    s = answer(s, AMY, 'Mitochondria', T0 + 1000).state;
    s = playerLeft(s, AMY);
    expect(s.players.find((p) => p.id === AMY)).toMatchObject({ connected: false });
    // Back again.
    s = markSeen(s, AMY, T0 + 2000);
    expect(s.players.find((p) => p.id === AMY)).toMatchObject({ connected: true });
  });

  it('counts players who go quiet as gone, never the host', () => {
    let s = startGame(lobby(), T0);
    s = markSeen(s, BEN, T0 + 20_000);
    s = dropQuiet(s, T0 + PLAYER_TIMEOUT_MS + 1);
    expect(s.players.map((p) => p.connected)).toEqual([true, false, true]);
  });

  it('lets players join in the middle of a game, from 0 points', () => {
    let s = startGame(lobby(), T0);
    s = addPlayer(s, 'player-cara-4444', 'Cara', T0 + 3000);
    const result = answer(s, 'player-cara-4444', 'Mitochondria', T0 + 4000);
    expect(result.outcome).toBe('locked');
  });
});

describe('the lobby', () => {
  it('needs a deck, a finished deck and someone to play', () => {
    const s = newGame('K7MQ', HOST, 'Gabe', T0);
    expect(startProblem(s)).toBe('Pick a deck first.');
    expect(startProblem(setMaking(setDeck(s, deck), { done: 2, total: 10 }))).toBe('Wait for the deck to be ready.');
    const watching = setSettings(setDeck(s, deck), { hostPlays: false });
    expect(startProblem(watching)).toBe('Wait for someone to join, or play too.');
    expect(startProblem(setDeck(s, deck))).toBeNull(); // the host can play alone
    expect(startGame(s, T0)).toBe(s);
  });

  it('takes only the offered timer lengths', () => {
    const s = lobby();
    expect(setSettings(s, { seconds: 10 }).seconds).toBe(10);
    expect(setSettings(s, { seconds: 7 }).seconds).toBe(20);
  });

  it('clears the deck while a new one is being made', () => {
    const s = setMaking(lobby(), { done: 0, total: 10 });
    expect(s.deck).toBeNull();
    expect(setDeck(s, deck)).toMatchObject({ making: null, deck });
  });

  it("can't change the deck or settings once the game started", () => {
    const s = startGame(lobby(), T0);
    expect(setDeck(s, null)).toBe(s);
    expect(setSettings(s, { seconds: 10 })).toBe(s);
    expect(setMaking(s, { done: 1, total: 2 })).toBe(s);
  });
});

describe('answering', () => {
  it('locks one pick per choice question, and keeps it secret', () => {
    const start = startGame(lobby(), T0);
    const first = answer(start, AMY, 'Nucleus', T0 + 1000);
    expect(first.outcome).toBe('locked');
    const s = first.state;
    // A second pick, or the same one sent again, changes nothing.
    expect(answer(s, AMY, 'Mitochondria', T0 + 2000)).toEqual({ state: s, outcome: 'locked' });
    // Everyone learns that Amy picked, but not what, or whether it's right.
    const view = roomView(s, T0 + 2000);
    expect(view.answered).toEqual([AMY]);
    expect({ ...view, answered: [] }).toEqual(roomView(start, T0 + 2000));
    expect(view.question).toMatchObject({ index: 0, total: 3, kind: 'choice', msLeft: 18_000 });
  });

  it('never sends the answer before the reveal', () => {
    const s = startGame(lobby(), T0);
    expect(roomView(s, T0).question).not.toHaveProperty('answer');
    expect(roomView(s, T0).reveal).toBeNull();
    const typed = { ...s, phase: { name: 'question' as const, index: 2, startedAt: T0, endsAt: T0 + 20_000 } };
    expect(JSON.stringify(roomView(typed, T0))).not.toContain('Nucleus');
  });

  it('checks true or false picks in any case', () => {
    let s = startGame(lobby(), T0);
    s = tick(s, T0 + 20_000); // reveal
    s = tick(s, T0 + 20_000 + REVEAL_MS); // question 2
    s = answer(s, AMY, 'TRUE', s.phase.name === 'question' ? s.phase.startedAt + 1000 : 0).state;
    expect(s.results[1][AMY].correct).toBe(true);
  });

  it('lets typed answers be guessed until right, with one typo allowed', () => {
    let s: HostState = { ...startGame(lobby(), T0), phase: { name: 'question' as const, index: 2, startedAt: T0, endsAt: T0 + 20_000 } };
    let r = answer(s, AMY, 'Ribosome', T0 + 1000);
    expect(r.outcome).toBe('wrong');
    s = r.state;
    expect(roomView(s, T0 + 1000)).toMatchObject({ answered: [], tries: { [AMY]: 1 } });
    r = answer(s, AMY, 'nucleas', T0 + 4000);
    expect(r.outcome).toBe('right');
    s = r.state;
    expect(s.results[2][AMY]).toMatchObject({ correct: true, guesses: 2, points: pointsFor(16_000, 20_000) });
    expect(roomView(s, T0 + 4000)).toMatchObject({ answered: [AMY], tries: {} });
    // Right stays right.
    expect(answer(s, AMY, 'wrong now', T0 + 5000)).toEqual({ state: s, outcome: 'right' });
  });

  it(`stops taking guesses after ${MAX_GUESSES}`, () => {
    let s: HostState = { ...startGame(lobby(), T0), phase: { name: 'question' as const, index: 2, startedAt: T0, endsAt: T0 + 20_000 } };
    for (let i = 0; i < MAX_GUESSES; i++) s = answer(s, AMY, `guess ${i}`, T0 + i).state;
    expect(answer(s, AMY, 'Nucleus', T0 + 100).outcome).toBe('ignored');
  });

  it('ignores late answers, answers to another question and unknown players', () => {
    const s = startGame(lobby(), T0);
    expect(answer(s, AMY, 'Mitochondria', T0 + 20_001).outcome).toBe('ignored');
    expect(answer(s, AMY, 'Mitochondria', T0 + 1000, 1).outcome).toBe('ignored');
    expect(answer(s, 'player-nobody-0', 'Mitochondria', T0 + 1000).outcome).toBe('ignored');
    expect(answer(s, AMY, '   ', T0 + 1000).outcome).toBe('ignored');
    expect(submitAnswer(s, AMY, 0, 42, T0 + 1000).outcome).toBe('ignored');
  });

  it("doesn't let the host answer when they only host", () => {
    let s = setSettings(lobby(), { hostPlays: false });
    s = startGame(s, T0);
    expect(answer(s, HOST, 'Mitochondria', T0 + 1000).outcome).toBe('ignored');
  });
});

describe('a whole game', () => {
  it('reveals when everyone has answered, scores, and moves on', () => {
    let s = startGame(lobby(), T0);
    s = answer(s, HOST, 'Mitochondria', T0 + 2000).state;
    s = answer(s, AMY, 'Mitochondria', T0 + 5000).state;
    expect(everyoneDone(s)).toBe(false);
    s = answer(s, BEN, 'Nucleus', T0 + 6000).state;
    expect(everyoneDone(s)).toBe(true);

    s = tick(s, T0 + 6000);
    expect(s.phase).toEqual({ name: 'reveal', index: 0, until: T0 + 6000 + REVEAL_MS });
    const view = roomView(s, T0 + 6000);
    expect(view.reveal).toEqual({
      answer: 'Mitochondria',
      explanation: null,
      results: [
        { id: HOST, correct: true, points: 95 },
        { id: AMY, correct: true, points: 88 },
        { id: BEN, correct: false, points: 0 },
      ],
    });
    expect(view.players.map((p) => p.score)).toEqual([95, 88, 0]);
    expect(nextDeadline(s)).toBe(T0 + 6000 + REVEAL_MS);

    // Nothing happens before the reveal is over.
    expect(tick(s, T0 + 7000)).toBe(s);
    s = tick(s, T0 + 6000 + REVEAL_MS);
    expect(s.phase).toMatchObject({ name: 'question', index: 1 });

    // Nobody answers question 2 or 3: time runs out each time.
    for (let q = 1; q < 3; q++) {
      const ends = nextDeadline(s)!;
      s = tick(s, ends - 1);
      expect(s.phase.name).toBe('question');
      s = tick(s, ends);
      expect(s.phase.name).toBe('reveal');
      s = tick(s, nextDeadline(s)!);
    }
    expect(s.phase).toEqual({ name: 'end' });
    expect(nextDeadline(s)).toBeNull();
    expect(standings(roomView(s, T0)).map((p) => [p.nickname, p.score, p.rank])).toEqual([
      ['Gabe', 95, 1],
      ['Amy', 88, 2],
      ['Ben', 0, 3],
    ]);
  });

  it("doesn't wait for players who left", () => {
    let s = startGame(lobby(), T0);
    s = answer(s, HOST, 'Mitochondria', T0 + 1000).state;
    s = answer(s, AMY, 'Mitochondria', T0 + 1000).state;
    s = playerLeft(s, BEN);
    expect(everyoneDone(s)).toBe(true);
  });

  it('shares places on the same score, and leaves out a host who only hosts', () => {
    const view = {
      hostPlays: false,
      players: [
        { id: HOST, nickname: 'Gabe', score: 0, host: true, connected: true },
        { id: AMY, nickname: 'Amy', score: 150, host: false, connected: true },
        { id: BEN, nickname: 'Ben', score: 150, host: false, connected: false },
        { id: 'player-cara-4444', nickname: 'Cara', score: 90, host: false, connected: true },
      ],
    };
    expect(standings(view).map((p) => [p.nickname, p.rank])).toEqual([
      ['Amy', 1],
      ['Ben', 1],
      ['Cara', 3],
    ]);
    expect(standings({ ...view, hostPlays: true }).at(-1)).toMatchObject({ nickname: 'Gabe', rank: 4 });
  });

  it('ends early without counting the open question, then plays again from 0', () => {
    let s = startGame(lobby(), T0);
    s = answer(s, AMY, 'Mitochondria', T0 + 1000).state;
    s = tick(s, T0 + 20_000);
    s = tick(s, T0 + 20_000 + REVEAL_MS);
    s = answer(s, AMY, 'True', T0 + 25_000).state;
    s = playerLeft(s, BEN);
    s = endGame(s);
    expect(s.phase).toEqual({ name: 'end' });
    expect(s.players.find((p) => p.id === AMY)?.score).toBe(pointsFor(19_000, 20_000));
    expect(endGame(s)).toBe(s);

    s = backToLobby(s);
    expect(s.phase).toEqual({ name: 'lobby' });
    expect(s.deck).toBe(deck);
    expect(s.results).toEqual([]);
    expect(s.players.map((p) => [p.nickname, p.score])).toEqual([
      ['Gabe', 0],
      ['Amy', 0],
    ]);
  });
});
