// What a live game (#26) keeps in this browser tab, so reloading the page
// doesn't lose it: the host's whole game, or a player's id and nickname
// (sessionStorage, which ends with the tab). The last nickname used is kept for
// next time (localStorage). Storage can be off (private windows), so every read
// and write is allowed to fail: the game still works (a copy is kept in memory
// for the move from /play to the room), it just won't survive a reload.

import type { HostState } from '@/lib/live-game';
import { newId } from '@/lib/ids';

const hostKey = (code: string) => `flashforge-live-host:${code}`;
const seatKey = (code: string) => `flashforge-live-seat:${code}`;
const NICKNAME_KEY = 'flashforge-live-nickname';
const memory = new Map<string, unknown>();

function read<T>(storage: () => Storage, key: string): T | null {
  try {
    const raw = storage().getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // Storage is off, or what's there isn't ours.
  }
  return (memory.get(key) as T | undefined) ?? null;
}

function write(storage: () => Storage, key: string, value: unknown) {
  memory.set(key, value);
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    // Storage is off or full.
  }
}

// The game this tab is hosting with this code, if it is.
export function loadHostGame(code: string): HostState | null {
  const state = read<HostState>(() => sessionStorage, hostKey(code));
  return state && state.code === code && Array.isArray(state.players) ? state : null;
}

export function saveHostGame(state: HostState) {
  write(() => sessionStorage, hostKey(state.code), state);
}

export function forgetHostGame(code: string) {
  memory.delete(hostKey(code));
  try {
    sessionStorage.removeItem(hostKey(code));
  } catch {
    // Storage is off.
  }
}

// A player's place in a room: their id, made once per tab, and the nickname
// they joined with (null until they join).
export interface Seat {
  id: string;
  nickname: string | null;
}

// This tab's seat in the room, made the first time.
export function openSeat(code: string): Seat {
  const seat = read<Seat>(() => sessionStorage, seatKey(code));
  if (seat && typeof seat.id === 'string') return seat;
  const fresh: Seat = { id: newId(), nickname: null };
  saveSeat(code, fresh);
  return fresh;
}

export function saveSeat(code: string, seat: Seat) {
  write(() => sessionStorage, seatKey(code), seat);
}

export function lastNickname(): string {
  return read<string>(() => localStorage, NICKNAME_KEY) ?? '';
}

export function rememberNickname(nickname: string) {
  write(() => localStorage, NICKNAME_KEY, nickname);
}
