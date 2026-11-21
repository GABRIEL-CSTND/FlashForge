import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in for supabase.channel(): records what each channel listens to and
// lets the test say when Realtime has joined it.
interface FakeChannel {
  topic: string;
  handlers: { event: string; fn: (message: { event: string; payload: unknown }) => void }[];
  subscribed: (status: string) => void;
  send: ReturnType<typeof vi.fn>;
}
const channels: FakeChannel[] = [];
const removeChannel = vi.fn(async () => 'ok');

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: (topic: string) => {
      const ch: FakeChannel = { topic, handlers: [], subscribed: () => {}, send: vi.fn(async () => 'ok') };
      channels.push(ch);
      const api = {
        on: (_type: string, filter: { event: string }, fn: FakeChannel['handlers'][number]['fn']) => {
          ch.handlers.push({ event: filter.event, fn });
          return api;
        },
        subscribe: (cb: (status: string) => void) => {
          ch.subscribed = cb;
          return api;
        },
        send: ch.send,
      };
      return api;
    },
    removeChannel: (...args: unknown[]) => removeChannel(...(args as [])),
  },
}));

import { newGame, roomView } from '@/lib/live-game';
import { memoryTransport, readRoom, readToHost, realtimeTransport, type ToHost } from '@/lib/live-room';

const AMY = 'player-amy-1111';
const room = roomView(newGame('K7MQ', 'host-0000-aaaa', 'Gabe', 0), 0);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  channels.length = 0;
  removeChannel.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('checking messages', () => {
  it('takes the messages players send', () => {
    expect(readToHost('join', { from: AMY, nickname: 'Amy' })).toEqual({ type: 'join', from: AMY, nickname: 'Amy' });
    expect(readToHost('answer', { from: AMY, index: 2, given: 'Nucleus' })).toEqual({ type: 'answer', from: AMY, index: 2, given: 'Nucleus' });
    expect(readToHost('ping', { from: AMY, extra: 'ignored' })).toEqual({ type: 'ping', from: AMY });
    expect(readToHost('answer', { from: AMY, index: 0, given: 'x'.repeat(1000) })).toMatchObject({ given: 'x'.repeat(300) });
  });

  it('drops anything else', () => {
    expect(readToHost('room', { from: AMY })).toBeNull();
    expect(readToHost('join', { from: 'bad id', nickname: 'Amy' })).toBeNull();
    expect(readToHost('join', { from: AMY })).toBeNull();
    expect(readToHost('answer', { from: AMY, index: '1', given: 'x' })).toBeNull();
    expect(readToHost('answer', { from: AMY, index: 1.5, given: 'x' })).toBeNull();
    expect(readToHost('ping', null)).toBeNull();
  });

  it('only takes a room for this code', () => {
    expect(readRoom(room, 'K7MQ')).toEqual(room);
    expect(readRoom(room, 'ABCD')).toBeNull();
    expect(readRoom({ ...room, phase: 'dancing' }, 'K7MQ')).toBeNull();
    expect(readRoom({ ...room, players: null }, 'K7MQ')).toBeNull();
    expect(readRoom('hello', 'K7MQ')).toBeNull();
  });
});

describe('over Supabase Realtime', () => {
  it("is live for the host once both the room and the host's inbox are joined", () => {
    const status = vi.fn();
    const message = vi.fn();
    const link = realtimeTransport.openHost('K7MQ', { status, message });
    expect(channels.map((c) => c.topic)).toEqual(['live:K7MQ', 'live:K7MQ:host']);
    const [roomChannel, inbox] = channels;

    // Nothing is sent before the room is joined.
    link.sendRoom(room);
    expect(roomChannel.send).not.toHaveBeenCalled();

    roomChannel.subscribed('SUBSCRIBED');
    expect(status).toHaveBeenLastCalledWith('connecting');
    inbox.subscribed('SUBSCRIBED');
    expect(status).toHaveBeenLastCalledWith('live');

    link.sendRoom(room);
    expect(roomChannel.send).toHaveBeenCalledWith({ type: 'broadcast', event: 'room', payload: room });

    // The inbox passes on checked messages only.
    inbox.handlers[0].fn({ event: 'answer', payload: { from: AMY, index: 0, given: 'Nucleus' } });
    inbox.handlers[0].fn({ event: 'answer', payload: { from: 'nope', index: 0, given: 'Nucleus' } });
    expect(message.mock.calls).toEqual([[{ type: 'answer', from: AMY, index: 0, given: 'Nucleus' }]]);

    // Losing the connection after being live is "offline".
    inbox.subscribed('CHANNEL_ERROR');
    expect(status).toHaveBeenLastCalledWith('offline');
  });

  it('closes both channels', async () => {
    const link = realtimeTransport.openHost('K7MQ', { status: vi.fn(), message: vi.fn() });
    await link.close();
    expect(removeChannel).toHaveBeenCalledTimes(2);
  });

  it("lets players hear the room, and send to the host's inbox without joining it", async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-key');
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const onRoom = vi.fn();
    const status = vi.fn();
    const link = realtimeTransport.openPlayer('K7MQ', { room: onRoom, status });

    expect(channels.map((c) => c.topic)).toEqual(['live:K7MQ']);
    channels[0].subscribed('SUBSCRIBED');
    expect(status).toHaveBeenLastCalledWith('live');
    channels[0].handlers[0].fn({ event: 'room', payload: room });
    channels[0].handlers[0].fn({ event: 'room', payload: { ...room, code: 'ZZZZ' } });
    expect(onRoom.mock.calls).toEqual([[room]]);

    await expect(link.send({ type: 'join', from: AMY, nickname: 'Amy' })).resolves.toBe(true);
    await link.send({ type: 'leave', from: AMY }, { keepalive: true });
    expect(fetchMock.mock.calls).toEqual([
      [
        'https://example.supabase.co/realtime/v1/api/broadcast/live%3AK7MQ%3Ahost/events/join',
        expect.objectContaining({
          method: 'POST',
          headers: { apikey: 'public-key', 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: AMY, nickname: 'Amy' }),
          keepalive: false,
        }),
      ],
      [expect.stringMatching(/\/events\/leave$/), expect.objectContaining({ keepalive: true })],
    ]);
  });

  it('says a send failed when Realtime is out of reach', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const link = realtimeTransport.openPlayer('K7MQ', { room: vi.fn(), status: vi.fn() });
    await expect(link.send({ type: 'ping', from: AMY })).resolves.toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    await expect(link.send({ type: 'ping', from: AMY })).resolves.toBe(false);
  });
});

describe('in memory', () => {
  it('carries the room to players and their messages to the host only', async () => {
    const hub = memoryTransport();
    const toHost: ToHost[] = [];
    const amySees = vi.fn();
    const benSees = vi.fn();
    const host = hub.openHost('K7MQ', { message: (m) => toHost.push(m), status: vi.fn() });
    const amy = hub.openPlayer('K7MQ', { room: amySees, status: vi.fn() });
    hub.openPlayer('K7MQ', { room: benSees, status: vi.fn() });
    hub.openPlayer('ZZZZ', { room: vi.fn(), status: vi.fn() });

    await amy.send({ type: 'join', from: AMY, nickname: 'Amy' });
    host.sendRoom(room);
    await flush();
    expect(toHost).toEqual([{ type: 'join', from: AMY, nickname: 'Amy' }]);
    expect(amySees).toHaveBeenCalledWith(room);
    expect(benSees).toHaveBeenCalledWith(room);
    // Each page gets its own copy, as over the network.
    expect(amySees.mock.calls[0][0]).not.toBe(room);

    await host.close();
    expect(hub.hostCount('K7MQ')).toBe(0);
    await expect(amy.send({ type: 'ping', from: AMY })).resolves.toBe(true);
  });
});
