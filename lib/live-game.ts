// Live games (#26): one deck played by a room of friends at the same time, in
// the style of jklm.fun's PopSauce. Everyone gets the same question at once,
// races the same timer, and a right answer earns more the faster it comes.
//
// The host's browser runs the game with these rules, and the other browsers
// talk to it through Supabase Realtime (lib/live-room.ts). The cards, with their
// answers, stay in the host's browser: players only ever get a question without
// its answer (roomView), and the answer once time is up. Nothing here touches
// the database, and nothing about a game is saved.

import { checkTypedAnswer } from '@/lib/answer-check';
import { isTrueFalseOptions, kindFor, normalizeChoice, toTrueFalse, TRUE_FALSE_OPTIONS } from '@/lib/card-rules';
import { JOIN_CODE_ALPHABET } from '@/lib/classes-shared';
import type { StudyType } from '@/lib/study-types';

// Codes use the class codes' letters and digits, with no look-alikes, so they're
// easy to read out to a room.
export const ROOM_CODE_LENGTH = 4;
// A class fits in one room. Realtime's free plan allows about 100 messages a
// second per project, counting every browser a message reaches, so rooms can't
// grow much past this.
export const MAX_PLAYERS = 30;
export const NICKNAME_MAX = 20;
export const SECONDS_CHOICES = [10, 20, 30] as const;
export const DEFAULT_SECONDS = 20;
// How long the answer stays up before the next question.
export const REVEAL_MS = 4000;
// A right answer earns BASE_POINTS, plus up to SPEED_POINTS for answering fast.
export const BASE_POINTS = 50;
export const SPEED_POINTS = 50;
// A typed answer can be guessed again until it's right, up to this many tries.
export const MAX_GUESSES = 20;
// Longer answers are cut here before they're checked.
export const MAX_ANSWER_CHARS = 300;
// Players tell the host they're still there this often, and the host counts a
// player who's been quiet for PLAYER_TIMEOUT_MS as gone.
export const PING_MS = 10_000;
export const PLAYER_TIMEOUT_MS = 35_000;
// The host sends the room at least this often, and players give up on a host
// they haven't heard from for HOST_TIMEOUT_MS.
export const KEEPALIVE_MS = 8_000;
export const HOST_TIMEOUT_MS = 25_000;

const ROOM_CODE_PATTERN = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export function newRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += JOIN_CODE_ALPHABET[Math.floor(random() * JOIN_CODE_ALPHABET.length)];
  return code;
}

// What someone typed ("k7mq", "K7M Q") as a room code, or null if it can't be one.
export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

// Trimmed, on one line and at most NICKNAME_MAX characters; "Player" if empty.
export function cleanNickname(raw: unknown): string {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICKNAME_MAX)
    .trim();
  return name || 'Player';
}

// Player ids are made by each browser (crypto.randomUUID); anything else is turned away.
export function isPlayerId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

// How often the host sends the room while answers come in: often in a small
// room, so a typed guess gets its answer fast, and less often in a big one, so
// the room stays under Realtime's messages-per-second limit (each send reaches
// every browser in the room).
export function sendInterval(browsers: number): number {
  return Math.min(1500, Math.max(250, browsers * 50));
}

// ---------------------------------------------------------------------------
// The deck

// Picked from slips (multiple choice, true or false), or typed (flashcards and
// the mixed quiz's identification part).
export type LiveKind = 'choice' | 'typed';

export interface LiveCard {
  kind: LiveKind;
  // What the question card says: the question, the statement, or a flashcard's clue.
  prompt: string;
  answer: string;
  options: string[] | null;
  // Shown with the answer (true or false cards have one).
  explanation: string | null;
  // The line above the question.
  label: 'Multiple choice' | 'True or false' | 'Type the answer';
}

export interface DeckCard {
  question: string;
  answer: string;
  options?: string[] | null;
  explanation?: string | null;
}

// A saved set, a History guide or a deck made in the lobby, as questions to play.
// A choice card whose answer isn't one of its slips is asked as a typed one.
export function toLiveCards(studyType: StudyType, cards: DeckCard[]): LiveCard[] {
  return cards.flatMap((c): LiveCard[] => {
    const prompt = String(c.question ?? '').trim();
    const answer = String(c.answer ?? '').trim();
    if (!prompt || !answer) return [];
    const explanation = c.explanation?.trim() || null;
    const kind = kindFor(studyType, c.options);
    const truth = toTrueFalse(answer);
    if (kind === 'true_false' && truth) {
      return [{ kind: 'choice', prompt, answer: truth, options: [...TRUE_FALSE_OPTIONS], explanation, label: 'True or false' }];
    }
    const options = (Array.isArray(c.options) ? c.options : []).map((o) => String(o).trim()).filter(Boolean);
    // The answer as its slip spells it, so the right slip can be marked.
    const slip = options.find((o) => normalizeChoice(o) === normalizeChoice(answer));
    if (kind === 'multiple_choice' && options.length >= 2 && slip) {
      return [{ kind: 'choice', prompt, answer: slip, options, explanation, label: 'Multiple choice' }];
    }
    return [{ kind: 'typed', prompt, answer, options: null, explanation, label: 'Type the answer' }];
  });
}

// The same rules as studying: a slip by its words (case, spaces and a final
// period don't matter), and a typed answer as in Type mode, where one small
// typo still counts.
export function isRightAnswer(card: LiveCard, given: string): boolean {
  if (card.kind === 'typed') {
    const verdict = checkTypedAnswer(given, card.answer);
    return verdict === 'correct' || verdict === 'close';
  }
  if (isTrueFalseOptions(card.options)) return toTrueFalse(given) === toTrueFalse(card.answer);
  return normalizeChoice(given) === normalizeChoice(card.answer);
}

// BASE_POINTS for a right answer, plus up to SPEED_POINTS for the time left.
export function pointsFor(msLeft: number, durationMs: number): number {
  const share = durationMs > 0 ? Math.min(1, Math.max(0, msLeft / durationMs)) : 0;
  return BASE_POINTS + Math.round(SPEED_POINTS * share);
}

// ---------------------------------------------------------------------------
// The game, as the host's browser holds it

// "new": made in the lobby for this game, so the host hasn't seen the cards.
// "saved": from the host's My Sets or History, so the host may know the answers.
export type DeckSource = 'new' | 'saved';

export interface LiveDeck {
  title: string;
  studyType: StudyType;
  source: DeckSource;
  cards: LiveCard[];
}

export interface Player {
  id: string;
  nickname: string;
  score: number;
  // The host, who plays only while hostPlays is on.
  host: boolean;
  connected: boolean;
  // When the host last heard from this player.
  lastSeen: number;
}

// One player's answer to one question. A typed question keeps its last guess.
export interface QuestionResult {
  correct: boolean;
  points: number;
  // How long after the question started.
  ms: number;
  guesses: number;
}

export type Phase =
  | { name: 'lobby' }
  | { name: 'question'; index: number; startedAt: number; endsAt: number }
  | { name: 'reveal'; index: number; until: number }
  | { name: 'end' };

export interface HostState {
  code: string;
  hostId: string;
  phase: Phase;
  deck: LiveDeck | null;
  // A deck being made in the lobby: how many cards the AI has written so far.
  making: { done: number; total: number } | null;
  seconds: number;
  hostPlays: boolean;
  // In the order they joined; the host first.
  players: Player[];
  // Players who came when the room was full (the last few).
  refused: string[];
  // results[question][player id]
  results: Record<string, QuestionResult>[];
}

export function newGame(code: string, hostId: string, hostNickname: string, now: number): HostState {
  return {
    code,
    hostId,
    phase: { name: 'lobby' },
    deck: null,
    making: null,
    seconds: DEFAULT_SECONDS,
    hostPlays: true,
    players: [{ id: hostId, nickname: cleanNickname(hostNickname), score: 0, host: true, connected: true, lastSeen: now }],
    refused: [],
    results: [],
  };
}

const isPlaying = (state: Pick<HostState, 'hostPlays'>, p: Pick<Player, 'host'>) => !p.host || state.hostPlays;

// Two players can't share a name: the second "Sam" is "Sam 2".
function uniqueNickname(players: Player[], wanted: string): string {
  const taken = new Set(players.map((p) => p.nickname.toLowerCase()));
  if (!taken.has(wanted.toLowerCase())) return wanted;
  for (let n = 2; ; n++) {
    const name = `${wanted.slice(0, NICKNAME_MAX - String(n).length - 1).trim()} ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

// Someone asks to join. They join with 0 points, also in the middle of a game.
// A player who's already in (their message came twice, or they reloaded the
// page) just counts as seen. Past MAX_PLAYERS, they're turned away.
export function addPlayer(state: HostState, id: string, nickname: unknown, now: number): HostState {
  if (!isPlayerId(id) || id === state.hostId) return state;
  if (state.players.some((p) => p.id === id)) return markSeen(state, id, now);
  if (state.players.filter((p) => !p.host && p.connected).length >= MAX_PLAYERS) {
    return state.refused.includes(id) ? state : { ...state, refused: [...state.refused, id].slice(-50) };
  }
  const player: Player = { id, nickname: uniqueNickname(state.players, cleanNickname(nickname)), score: 0, host: false, connected: true, lastSeen: now };
  return { ...state, players: [...state.players, player], refused: state.refused.filter((r) => r !== id) };
}

// Any message from a player shows they're still here.
export function markSeen(state: HostState, id: string, now: number): HostState {
  if (!state.players.some((p) => p.id === id && !p.host)) return state;
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, connected: true, lastSeen: now } : p)) };
}

// A player left (closed the page, or went quiet). In the lobby they're taken
// off the list; in a game they stay, greyed out, with their points.
export function playerLeft(state: HostState, id: string): HostState {
  const player = state.players.find((p) => p.id === id);
  if (!player || player.host || (!player.connected && state.phase.name !== 'lobby')) return state;
  if (state.phase.name === 'lobby') return { ...state, players: state.players.filter((p) => p.id !== id) };
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, connected: false } : p)) };
}

// Players the host hasn't heard from for PLAYER_TIMEOUT_MS have left.
export function dropQuiet(state: HostState, now: number): HostState {
  return state.players
    .filter((p) => !p.host && p.connected && now - p.lastSeen > PLAYER_TIMEOUT_MS)
    .reduce((s, p) => playerLeft(s, p.id), state);
}

// The deck to play (null takes it away), set in the lobby.
export function setDeck(state: HostState, deck: LiveDeck | null): HostState {
  if (state.phase.name !== 'lobby') return state;
  return { ...state, deck, making: null };
}

// A deck is being made in the lobby (null: it's done, or it failed).
export function setMaking(state: HostState, making: { done: number; total: number } | null): HostState {
  if (state.phase.name !== 'lobby') return state;
  return { ...state, making, ...(making ? { deck: null } : {}) };
}

export function setSettings(state: HostState, settings: { seconds?: number; hostPlays?: boolean }): HostState {
  if (state.phase.name !== 'lobby') return state;
  const seconds = (SECONDS_CHOICES as readonly number[]).includes(settings.seconds ?? -1) ? settings.seconds! : state.seconds;
  return { ...state, seconds, hostPlays: settings.hostPlays ?? state.hostPlays };
}

// What the host still needs before starting, or null when the game can start.
export function startProblem(state: HostState): string | null {
  if (state.phase.name !== 'lobby') return 'The game has already started.';
  if (state.making) return 'Wait for the deck to be ready.';
  if (!state.deck || state.deck.cards.length === 0) return 'Pick a deck first.';
  if (!state.players.some((p) => p.connected && isPlaying(state, p))) return 'Wait for someone to join, or play too.';
  return null;
}

const questionPhase = (state: HostState, index: number, now: number): Phase => ({
  name: 'question',
  index,
  startedAt: now,
  endsAt: now + state.seconds * 1000,
});

// From the lobby: everyone starts from 0.
export function startGame(state: HostState, now: number): HostState {
  if (startProblem(state)) return state;
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, score: 0 })),
    results: [],
    phase: questionPhase(state, 0, now),
  };
}

// "locked": a pick on a choice question, which stays a secret until the reveal.
export type AnswerOutcome = 'right' | 'wrong' | 'locked' | 'ignored';

// An answer from a player (or the host, when they play). One pick per choice
// question; typed answers can be guessed again until right. Answers that come
// late, for another question, or from someone not playing are ignored. The
// same answer arriving twice gets the same outcome and changes nothing.
export function submitAnswer(
  state: HostState,
  playerId: string,
  index: unknown,
  given: unknown,
  now: number
): { state: HostState; outcome: AnswerOutcome } {
  const ignored = { state, outcome: 'ignored' as const };
  const phase = state.phase;
  if (phase.name !== 'question' || phase.index !== index || !state.deck || now > phase.endsAt) return ignored;
  const player = state.players.find((p) => p.id === playerId);
  if (!player || !isPlaying(state, player)) return ignored;
  const card = state.deck.cards[phase.index];
  const text = typeof given === 'string' ? given.slice(0, MAX_ANSWER_CHARS).trim() : '';
  if (!card || !text) return ignored;

  const before = state.results[phase.index]?.[playerId];
  if (before) {
    if (card.kind === 'choice') return { state, outcome: 'locked' };
    if (before.correct) return { state, outcome: 'right' };
    if (before.guesses >= MAX_GUESSES) return ignored;
  }

  const correct = isRightAnswer(card, text);
  const result: QuestionResult = {
    correct,
    points: correct ? pointsFor(phase.endsAt - now, phase.endsAt - phase.startedAt) : 0,
    ms: now - phase.startedAt,
    guesses: (before?.guesses ?? 0) + 1,
  };
  const results = [...state.results];
  results[phase.index] = { ...results[phase.index], [playerId]: result };
  const seen = player.host ? state : markSeen(state, playerId, now);
  return { state: { ...seen, results }, outcome: card.kind === 'choice' ? 'locked' : correct ? 'right' : 'wrong' };
}

// Everyone still here who's playing has picked (or, for a typed question, got
// it or run out of guesses), so the answer can be shown before time is up.
export function everyoneDone(state: HostState): boolean {
  if (state.phase.name !== 'question' || !state.deck) return false;
  const card = state.deck.cards[state.phase.index];
  const answers = state.results[state.phase.index] ?? {};
  const playing = state.players.filter((p) => p.connected && isPlaying(state, p));
  const done = (r: QuestionResult | undefined) => !!r && (card.kind === 'choice' || r.correct || r.guesses >= MAX_GUESSES);
  return playing.length > 0 && playing.every((p) => done(answers[p.id]));
}

// Time's up (or everyone answered): the answer shows, and the points count.
export function revealNow(state: HostState, now: number): HostState {
  if (state.phase.name !== 'question') return state;
  const { index } = state.phase;
  const answers = state.results[index] ?? {};
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, score: p.score + (answers[p.id]?.points ?? 0) })),
    phase: { name: 'reveal', index, until: now + REVEAL_MS },
  };
}

export function nextQuestion(state: HostState, now: number): HostState {
  if (state.phase.name !== 'reveal' || !state.deck) return state;
  const next = state.phase.index + 1;
  return { ...state, phase: next < state.deck.cards.length ? questionPhase(state, next, now) : { name: 'end' } };
}

// What the clock moves on: a question whose time is up, or everyone has
// answered; a reveal that's been up long enough.
export function tick(state: HostState, now: number): HostState {
  if (state.phase.name === 'question' && (now >= state.phase.endsAt || everyoneDone(state))) return revealNow(state, now);
  if (state.phase.name === 'reveal' && now >= state.phase.until) return nextQuestion(state, now);
  return state;
}

// When the clock next needs to move the game on, or null.
export function nextDeadline(state: HostState): number | null {
  if (state.phase.name === 'question') return state.phase.endsAt;
  if (state.phase.name === 'reveal') return state.phase.until;
  return null;
}

// The host ends the game early. A question that was still open doesn't count.
export function endGame(state: HostState): HostState {
  return state.phase.name === 'lobby' || state.phase.name === 'end' ? state : { ...state, phase: { name: 'end' } };
}

// Play again: back to the lobby with the same deck, the scores cleared, and
// players who left taken off the list.
export function backToLobby(state: HostState): HostState {
  return {
    ...state,
    phase: { name: 'lobby' },
    results: [],
    players: state.players.filter((p) => p.host || p.connected).map((p) => ({ ...p, score: 0 })),
  };
}

// ---------------------------------------------------------------------------
// What every browser in the room sees

export interface DeckInfo {
  title: string;
  studyType: StudyType;
  count: number;
  source: DeckSource;
}

export interface PlayerView {
  id: string;
  nickname: string;
  score: number;
  host: boolean;
  connected: boolean;
}

export interface QuestionView {
  index: number;
  total: number;
  kind: LiveKind;
  label: LiveCard['label'];
  prompt: string;
  options: string[] | null;
  durationMs: number;
  // Time left when this view was sent; each browser counts down from when it arrives.
  msLeft: number;
}

export interface RevealView {
  answer: string;
  explanation: string | null;
  // Everyone playing, in the order they joined.
  results: { id: string; correct: boolean; points: number }[];
}

export interface RoomView {
  code: string;
  hostId: string;
  phase: Phase['name'];
  deck: DeckInfo | null;
  making: { done: number; total: number } | null;
  seconds: number;
  hostPlays: boolean;
  players: PlayerView[];
  refused: string[];
  question: QuestionView | null;
  // During a question: who has picked (a typed question: who has got it), and
  // how many wrong guesses each typed answer has had. Never what anyone picked.
  answered: string[];
  tries: Record<string, number>;
  // Once time is up: the answer, and how each player did.
  reveal: RevealView | null;
  // The host closed the room.
  closed?: boolean;
}

export function deckInfo(deck: LiveDeck): DeckInfo {
  return { title: deck.title, studyType: deck.studyType, count: deck.cards.length, source: deck.source };
}

export function roomView(state: HostState, now: number): RoomView {
  const phase = state.phase;
  const index = phase.name === 'question' || phase.name === 'reveal' ? phase.index : null;
  const card = index === null ? undefined : state.deck?.cards[index];
  const answers = index === null ? {} : (state.results[index] ?? {});
  const asking = phase.name === 'question' && !!card;
  return {
    code: state.code,
    hostId: state.hostId,
    phase: phase.name,
    deck: state.deck ? deckInfo(state.deck) : null,
    making: state.making,
    seconds: state.seconds,
    hostPlays: state.hostPlays,
    players: state.players.map(({ id, nickname, score, host, connected }) => ({ id, nickname, score, host, connected })),
    refused: state.refused,
    question:
      card && index !== null
        ? {
            index,
            total: state.deck!.cards.length,
            kind: card.kind,
            label: card.label,
            prompt: card.prompt,
            options: card.options,
            durationMs: state.seconds * 1000,
            msLeft: phase.name === 'question' ? Math.max(0, phase.endsAt - now) : 0,
          }
        : null,
    answered: asking ? Object.keys(answers).filter((id) => card!.kind === 'choice' || answers[id].correct) : [],
    tries:
      asking && card!.kind === 'typed'
        ? Object.fromEntries(Object.entries(answers).filter(([, r]) => !r.correct).map(([id, r]) => [id, r.guesses]))
        : {},
    reveal:
      phase.name === 'reveal' && card
        ? {
            answer: card.answer,
            explanation: card.explanation,
            results: state.players
              .filter((p) => isPlaying(state, p))
              .map((p) => ({ id: p.id, correct: !!answers[p.id]?.correct, points: answers[p.id]?.points ?? 0 })),
          }
        : null,
  };
}

export interface Standing {
  id: string;
  nickname: string;
  score: number;
  connected: boolean;
  // Players on the same score share a place: 1, 1, 3.
  rank: number;
}

// The players in the game, best score first.
export function standings(room: { players: PlayerView[]; hostPlays: boolean }): Standing[] {
  const sorted = room.players
    .filter((p) => isPlaying(room, p))
    .map(({ id, nickname, score, connected }) => ({ id, nickname, score, connected }))
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
  return sorted.map((p) => ({ ...p, rank: sorted.findIndex((q) => q.score === p.score) + 1 }));
}
