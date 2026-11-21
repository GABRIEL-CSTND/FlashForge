'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addPlayer,
  backToLobby,
  dropQuiet,
  endGame,
  KEEPALIVE_MS,
  markSeen,
  nextDeadline,
  playerLeft,
  roomView,
  sendInterval,
  setDeck,
  setMaking,
  setSettings,
  startGame,
  submitAnswer,
  tick,
  type HostState,
  type LiveDeck,
} from '@/lib/live-game';
import type { HostLink, LinkStatus, LiveTransport, ToHost } from '@/lib/live-room';
import { saveHostGame } from '@/lib/live-session';

// What a message from a player does to the game.
export function applyMessage(state: HostState, message: ToHost, now: number): HostState {
  switch (message.type) {
    case 'join':
      return addPlayer(state, message.from, message.nickname, now);
    case 'answer':
      // The last answer in can show the answer straight away (tick).
      return tick(submitAnswer(state, message.from, message.index, message.given, now).state, now);
    case 'leave':
      return tick(playerLeft(state, message.from), now);
    default:
      return markSeen(state, message.from, now);
  }
}

// Changes of phase (a new question, the answer shown) go out at once; other
// changes (someone answered or joined) at most every sendInterval.
const phaseKey = (s: HostState) =>
  s.phase.name === 'question' || s.phase.name === 'reveal' ? `${s.phase.name}:${s.phase.index}` : s.phase.name;

// The host's side of a live game (#26): the game itself, run by this browser
// with the rules in lib/live-game.ts, kept in the tab (so a reload doesn't end
// it), and sent to the players whenever it changes.
export function useHostGame(initial: HostState, transport: LiveTransport) {
  const [state, setState] = useState(initial);
  const [status, setStatus] = useState<LinkStatus>('connecting');
  const link = useRef<HostLink | null>(null);
  const latest = useRef(state);
  const sent = useRef<{ at: number; key: string } | null>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendNow = useCallback(() => {
    if (sendTimer.current) clearTimeout(sendTimer.current);
    sendTimer.current = null;
    const now = Date.now();
    link.current?.sendRoom(roomView(latest.current, now));
    sent.current = { at: now, key: phaseKey(latest.current) };
  }, []);

  const scheduleSend = useCallback(() => {
    const s = latest.current;
    const now = Date.now();
    const last = sent.current;
    const browsers = s.players.filter((p) => p.connected).length;
    const due = !last || last.key !== phaseKey(s) ? now : last.at + sendInterval(browsers);
    if (due <= now) sendNow();
    else sendTimer.current ??= setTimeout(sendNow, due - now);
  }, [sendNow]);

  // The room's channels, open while the page is.
  useEffect(() => {
    const opened = transport.openHost(initial.code, {
      message: (message) => {
        const now = Date.now();
        setState((s) => applyMessage(s, message, now));
        // Someone asking for the room gets it, even if nothing changed.
        if (message.type === 'hello') scheduleSend();
      },
      status: (next) => {
        setStatus(next);
        // Back online: everyone gets the room as it is now.
        if (next === 'live') sendNow();
      },
    });
    link.current = opened;
    return () => {
      link.current = null;
      if (sendTimer.current) clearTimeout(sendTimer.current);
      sendTimer.current = null;
      void opened.close();
    };
  }, [transport, initial.code, sendNow, scheduleSend]);

  // Every change is kept in the tab and sent to the room.
  useEffect(() => {
    latest.current = state;
    saveHostGame(state);
    scheduleSend();
  }, [state, scheduleSend]);

  // The clock: time up on a question, the answer shown long enough.
  useEffect(() => {
    const at = nextDeadline(state);
    if (at === null) return;
    const id = setTimeout(() => {
      const now = Date.now();
      setState((s) => tick(s, now));
    }, Math.max(0, at - Date.now()));
    return () => clearTimeout(id);
  }, [state]);

  // Players who went quiet have left, and a quiet room still hears from the host.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setState((s) => tick(dropQuiet(s, now), now));
      if (sent.current && now - sent.current.at >= KEEPALIVE_MS) sendNow();
    }, 2000);
    return () => clearInterval(id);
  }, [sendNow]);

  const change = useCallback((fn: (s: HostState, now: number) => HostState) => {
    const now = Date.now();
    setState((s) => fn(s, now));
  }, []);

  const actions = useMemo(
    () => ({
      setDeck: (deck: LiveDeck | null) => change((s) => setDeck(s, deck)),
      setMaking: (making: { done: number; total: number } | null) => change((s) => setMaking(s, making)),
      setSettings: (settings: { seconds?: number; hostPlays?: boolean }) => change((s) => setSettings(s, settings)),
      start: () => change((s, now) => startGame(s, now)),
      // The host's own answer, when they play.
      answer: (given: string) =>
        change((s, now) => {
          if (s.phase.name !== 'question') return s;
          return tick(submitAnswer(s, s.hostId, s.phase.index, given, now).state, now);
        }),
      end: () => change((s) => endGame(s)),
      playAgain: () => change((s) => backToLobby(s)),
      // Tells everyone the room is closed, before the page leaves.
      close: () => link.current?.sendRoom({ ...roomView(latest.current, Date.now()), closed: true }),
    }),
    [change]
  );

  // What the host's own screen shows: the same room the players get, so the
  // host sees no more of the deck than they do.
  const view = useMemo(() => roomView(state, 0), [state]);
  const deadline = state.phase.name === 'question' ? state.phase.endsAt : null;
  return { state, view, deadline, status, actions };
}
