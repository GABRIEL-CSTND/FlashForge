'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanNickname, HOST_TIMEOUT_MS, PING_MS, type RoomView } from '@/lib/live-game';
import type { LinkStatus, LiveTransport, PlayerLink, ToHost } from '@/lib/live-room';
import { rememberNickname, saveSeat, type Seat } from '@/lib/live-session';

// A player's latest answer to a question (for a typed one, their latest guess).
export interface MyAnswer {
  index: number;
  given: string;
  // Which guess this is.
  n: number;
  sentAt: number;
}

// Whether the host has this answer yet: the room lists the player as having
// picked (or got it), or counts the wrong guess.
export function answerSeen(view: RoomView, id: string, mine: MyAnswer): boolean {
  if (view.phase !== 'question' || view.question?.index !== mine.index) return true;
  if (view.answered.includes(id)) return true;
  return view.question.kind === 'typed' && (view.tries[id] ?? 0) >= mine.n;
}

// A message as the page writes it; `from` is added on the way out.
type Outgoing = ToHost extends infer M ? (M extends ToHost ? Omit<M, 'from'> : never) : never;

// With no answer from a room for this long, there's no game with that code.
export const NO_GAME_MS = 8000;
// An answer, or a join, the host hasn't shown yet is sent again after this long.
const RESEND_MS = 3000;

// A player's side of a live game (#26): hears the room from the host, and
// sends the host their join, answers and "still here". Nothing is decided here;
// the host's browser runs the game.
export function usePlayerGame(code: string, initialSeat: Seat, transport: LiveTransport) {
  const [seat, setSeat] = useState(initialSeat);
  const [view, setView] = useState<RoomView | null>(null);
  // When this browser's countdown reaches 0.
  const [deadline, setDeadline] = useState<number | null>(null);
  const [status, setStatus] = useState<LinkStatus>('connecting');
  const [lost, setLost] = useState<'no-game' | 'host-gone' | null>(null);
  const [mine, setMine] = useState<MyAnswer | null>(null);

  const link = useRef<PlayerLink | null>(null);
  const seatRef = useRef(seat);
  const viewRef = useRef(view);
  const mineRef = useRef(mine);
  const times = useRef({ live: 0, heard: 0, hello: 0, join: 0, ping: 0 });

  useEffect(() => {
    seatRef.current = seat;
    viewRef.current = view;
    mineRef.current = mine;
  }, [seat, view, mine]);

  const send = useCallback((message: Outgoing, keepalive = false) => {
    const now = Date.now();
    if (message.type === 'hello') times.current.hello = now;
    if (message.type === 'join') times.current.join = now;
    times.current.ping = now;
    void link.current?.send({ ...message, from: seatRef.current.id } as ToHost, { keepalive });
  }, []);

  const sendJoin = useCallback(() => {
    const nickname = seatRef.current.nickname;
    if (nickname) send({ type: 'join', nickname });
  }, [send]);

  useEffect(() => {
    const opened = transport.openPlayer(code, {
      room: (next) => {
        const now = Date.now();
        times.current.heard = now;
        setView(next);
        setDeadline(next.phase === 'question' && next.question ? now + next.question.msLeft : null);
        setLost(null);
      },
      status: (next) => {
        setStatus(next);
        if (next !== 'live') return;
        times.current.live ||= Date.now();
        send({ type: 'hello' });
        sendJoin();
      },
    });
    link.current = opened;
    return () => {
      link.current = null;
      void opened.close();
    };
  }, [transport, code, send, sendJoin]);

  // Joined but not in the room yet (the join got lost, or the host reloaded):
  // ask again.
  useEffect(() => {
    if (!view || view.closed || !seat.nickname) return;
    const inRoom = view.players.some((p) => p.id === seat.id) || view.refused.includes(seat.id);
    if (!inRoom && Date.now() - times.current.join > RESEND_MS) sendJoin();
  }, [view, seat, sendJoin]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const t = times.current;
      const current = viewRef.current;
      if (seatRef.current.nickname && now - t.ping >= PING_MS) send({ type: 'ping' });
      if (t.heard && now - t.heard > HOST_TIMEOUT_MS && !current?.closed) setLost('host-gone');
      // No room yet: ask again, and after a while say there's no game.
      if (!t.heard && t.live) {
        if (now - t.live > NO_GAME_MS) setLost('no-game');
        else if (now - t.hello > RESEND_MS) send({ type: 'hello' });
      }
      // An answer the host hasn't shown yet goes again.
      const answer = mineRef.current;
      if (current && answer && !answerSeen(current, seatRef.current.id, answer) && now - answer.sentAt > RESEND_MS) {
        const again = { ...answer, sentAt: now };
        mineRef.current = again;
        setMine(again);
        send({ type: 'answer', index: answer.index, given: answer.given });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [send]);

  // Leaving says goodbye, so the lobby doesn't wait for the timeout. Coming back
  // to the tab asks for the room, which may have moved on meanwhile.
  useEffect(() => {
    const onHide = () => {
      if (seatRef.current.nickname) send({ type: 'leave' }, true);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') send({ type: 'hello' });
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [send]);

  const join = useCallback(
    (nickname: string) => {
      const next = { ...seatRef.current, nickname: cleanNickname(nickname) };
      saveSeat(code, next);
      rememberNickname(next.nickname);
      seatRef.current = next;
      setSeat(next);
      sendJoin();
    },
    [code, sendJoin]
  );

  const answer = useCallback(
    (given: string) => {
      const current = viewRef.current;
      if (current?.phase !== 'question' || !current.question) return;
      const index = current.question.index;
      const before = mineRef.current;
      const next: MyAnswer = { index, given, n: before?.index === index ? before.n + 1 : 1, sentAt: Date.now() };
      mineRef.current = next;
      setMine(next);
      send({ type: 'answer', index, given });
    },
    [send]
  );

  const leave = useCallback(() => {
    if (seatRef.current.nickname) send({ type: 'leave' }, true);
  }, [send]);

  // This question's answer, if any, and whether it's still on its way.
  const current = view?.question && mine?.index === view.question.index ? mine : null;
  const myAnswer = current && view ? { ...current, pending: !answerSeen(view, seat.id, current) } : null;
  return { seat, view, deadline, status, lost, myAnswer, actions: { join, answer, leave } };
}
