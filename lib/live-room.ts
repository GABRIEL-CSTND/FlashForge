// The connection between the browsers in a live game (#26). lib/live-game.ts
// has the rules; this only carries messages.
//
// Each room uses two public Supabase Realtime broadcast channels, and nothing
// in the database:
// - `live:K7MQ`, the room: only the host sends on it (the room as everyone may
//   see it, a RoomView), and every browser in the room listens.
// - `live:K7MQ:host`, the host's inbox: only the host listens. Players send to
//   it through Realtime's REST API without joining it, so a join or an answer
//   reaches the host alone. Realtime counts a message once for every browser it
//   reaches, and the free plan allows about 100 a second per project: answers
//   sent to the whole room would use that up in a class-sized game, and every
//   player could read everyone's answers.

import { isPlayerId, MAX_ANSWER_CHARS, newRoomCode, type RoomView } from '@/lib/live-game';
import { supabase } from '@/lib/supabase';

// What players send to the host.
export type ToHost =
  // "Send me the room": when a page opens or comes back online.
  | { type: 'hello'; from: string }
  | { type: 'join'; from: string; nickname: string }
  | { type: 'answer'; from: string; index: number; given: string }
  // "Still here", every PING_MS.
  | { type: 'ping'; from: string }
  | { type: 'leave'; from: string };

// "connecting" until the channels are joined, "offline" while Realtime is
// reconnecting (supabase-js does that on its own).
export type LinkStatus = 'connecting' | 'live' | 'offline';

export interface HostLink {
  // Sends the room to every player. Dropped while offline: send it again once live.
  sendRoom(view: RoomView): void;
  close(): Promise<void>;
}

export interface PlayerLink {
  // True once Realtime has taken the message, which doesn't mean a host got it.
  send(message: ToHost, options?: { keepalive?: boolean }): Promise<boolean>;
  close(): Promise<void>;
}

export interface LiveTransport {
  openHost(code: string, on: { message(message: ToHost): void; status(status: LinkStatus): void }): HostLink;
  openPlayer(code: string, on: { room(view: RoomView): void; status(status: LinkStatus): void }): PlayerLink;
}

const roomTopic = (code: string) => `live:${code}`;
const inboxTopic = (code: string) => `live:${code}:host`;
const TO_HOST_TYPES = new Set<ToHost['type']>(['hello', 'join', 'answer', 'ping', 'leave']);

// A message from the inbox, checked, since anyone can send to a public channel.
export function readToHost(type: unknown, payload: unknown): ToHost | null {
  if (typeof type !== 'string' || !TO_HOST_TYPES.has(type as ToHost['type'])) return null;
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (!isPlayerId(p.from)) return null;
  switch (type) {
    case 'join':
      return typeof p.nickname === 'string' && p.nickname.length <= 200 ? { type, from: p.from, nickname: p.nickname } : null;
    case 'answer':
      return Number.isInteger(p.index) && typeof p.given === 'string'
        ? { type, from: p.from, index: p.index as number, given: p.given.slice(0, MAX_ANSWER_CHARS) }
        : null;
    default:
      return { type: type as 'hello' | 'ping' | 'leave', from: p.from };
  }
}

// The room from the host, if it looks like one, so a stray message can't break the page.
export function readRoom(payload: unknown, code: string): RoomView | null {
  if (!payload || typeof payload !== 'object') return null;
  const v = payload as Partial<RoomView>;
  const phases: unknown[] = ['lobby', 'question', 'reveal', 'end'];
  if (v.code !== code || !phases.includes(v.phase) || typeof v.hostId !== 'string' || !Array.isArray(v.players)) return null;
  if (!Array.isArray(v.answered) || !Array.isArray(v.refused)) return null;
  return v as RoomView;
}

// Whether a host is already in this room: asks for the room, and waits a moment
// for one to answer. If Realtime can't be reached, it says no, and the room
// page shows that it's reconnecting.
export function roomTaken(transport: LiveTransport, code: string, waitMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const from = `probe-${Math.random().toString(36).slice(2, 12)}`;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let link: PlayerLink | null = null;
    let settled = false;
    const finish = (taken: boolean) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      void link?.close();
      resolve(taken);
    };
    timers.push(setTimeout(() => finish(false), waitMs + 6000));
    let asked = false;
    link = transport.openPlayer(code, {
      room: () => finish(true),
      status: (status) => {
        if (status !== 'live' || asked) return;
        asked = true;
        void link?.send({ type: 'hello', from });
        timers.push(setTimeout(() => finish(false), waitMs));
      },
    });
  });
}

// A new room code no host is using yet.
export async function claimRoomCode(transport: LiveTransport, random: () => number = Math.random): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const code = newRoomCode(random);
    if (!(await roomTaken(transport, code))) return code;
  }
  return newRoomCode(random);
}

// ---------------------------------------------------------------------------
// Over Supabase Realtime

// Realtime's REST broadcast: no channel to join, and with keepalive it still
// goes out while the page closes (for "leave").
async function restSend(topic: string, message: ToHost, keepalive = false): Promise<boolean> {
  const { type, ...payload } = message;
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${encodeURIComponent(type)}`,
      {
        method: 'POST',
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive,
      }
    );
    return res.status === 202;
  } catch {
    return false;
  }
}

type Channel = ReturnType<typeof supabase.channel>;

// Follows a channel's state, as reported by subscribe(), until it's closed.
function join(channel: Channel, onChange: (live: boolean) => void, closed: () => boolean) {
  channel.subscribe((status) => {
    if (closed()) return;
    if (status === 'SUBSCRIBED') onChange(true);
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onChange(false);
  });
}

export const realtimeTransport: LiveTransport = {
  openHost(code, on) {
    let closed = false;
    const live = { room: false, inbox: false };
    let seenLive = false;
    const report = () => {
      const now = live.room && live.inbox;
      seenLive ||= now;
      on.status(now ? 'live' : seenLive ? 'offline' : 'connecting');
    };
    const room = supabase.channel(roomTopic(code), { config: { broadcast: { self: false } } });
    const inbox = supabase.channel(inboxTopic(code), { config: { broadcast: { self: false } } });
    inbox.on('broadcast', { event: '*' }, ({ event, payload }) => {
      const message = readToHost(event, payload);
      if (message && !closed) on.message(message);
    });
    join(room, (ok) => ((live.room = ok), report()), () => closed);
    join(inbox, (ok) => ((live.inbox = ok), report()), () => closed);
    return {
      sendRoom(view) {
        if (live.room && !closed) void room.send({ type: 'broadcast', event: 'room', payload: view });
      },
      async close() {
        closed = true;
        await Promise.all([supabase.removeChannel(room), supabase.removeChannel(inbox)]);
      },
    };
  },

  openPlayer(code, on) {
    let closed = false;
    let seenLive = false;
    const room = supabase.channel(roomTopic(code), { config: { broadcast: { self: false } } });
    room.on('broadcast', { event: 'room' }, ({ payload }) => {
      const view = readRoom(payload, code);
      if (view && !closed) on.room(view);
    });
    join(
      room,
      (ok) => {
        seenLive ||= ok;
        on.status(ok ? 'live' : seenLive ? 'offline' : 'connecting');
      },
      () => closed
    );
    return {
      send: (message, options) => restSend(inboxTopic(code), message, options?.keepalive),
      async close() {
        closed = true;
        await supabase.removeChannel(room);
      },
    };
  },
};

// ---------------------------------------------------------------------------
// In memory, for tests: every page in one test talks through one of these.
// Messages arrive a moment later (a microtask), copied, as over the network.

export function memoryTransport(): LiveTransport & { hostCount(code: string): number } {
  const hosts = new Map<string, Set<(message: ToHost) => void>>();
  const players = new Map<string, Set<(view: RoomView) => void>>();
  const add = <T>(map: Map<string, Set<T>>, code: string, fn: T) => map.set(code, (map.get(code) ?? new Set()).add(fn));
  const deliver = <T>(fns: Set<(value: T) => void> | undefined, value: T) => {
    const copy = JSON.parse(JSON.stringify(value)) as T;
    for (const fn of fns ?? []) queueMicrotask(() => fn(copy));
  };
  return {
    hostCount: (code) => hosts.get(code)?.size ?? 0,
    openHost(code, on) {
      const fn = (message: ToHost) => on.message(message);
      add(hosts, code, fn);
      queueMicrotask(() => on.status('live'));
      return {
        sendRoom: (view) => deliver(players.get(code), view),
        close: async () => void hosts.get(code)?.delete(fn),
      };
    },
    openPlayer(code, on) {
      const fn = (view: RoomView) => on.room(view);
      add(players, code, fn);
      queueMicrotask(() => on.status('live'));
      return {
        // Like Realtime, a message to a room with no host is taken and lost.
        send: async (message) => {
          const checked = readToHost(message.type, { ...message });
          if (checked) deliver(hosts.get(code), checked);
          return true;
        },
        close: async () => void players.get(code)?.delete(fn),
      };
    },
  };
}
