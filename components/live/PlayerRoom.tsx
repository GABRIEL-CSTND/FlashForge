'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/components/ProfileProvider';
import { MAX_PLAYERS, NICKNAME_MAX } from '@/lib/live-game';
import { realtimeTransport, type LiveTransport } from '@/lib/live-room';
import { lastNickname, type Seat } from '@/lib/live-session';
import LiveScreen from './LiveScreen';
import { LinkNote } from './parts';
import { usePlayerGame } from './usePlayerGame';

// A message on the desk instead of the game: no game with this code, the room
// is full, the host left.
function DeskMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="on-desk flex w-full flex-col items-center px-2 pb-10 pt-6 text-center">
      <div className="paper paper-shadow w-full max-w-md rounded-md px-6 py-6 text-ink">
        <h1 className="font-serif text-2xl">{title}</h1>
        <div className="mt-2 space-y-3 text-[15px] text-muted">{children}</div>
      </div>
    </main>
  );
}

const backToPlay = (
  <Link href="/play" className="btn btn-primary rounded-full px-5">
    Back to Play live
  </Link>
);

// A player's screen of a live game (#26): pick a nickname, then the game as
// the host's browser sends it.
export default function PlayerRoom({
  code,
  initialSeat,
  transport = realtimeTransport,
}: {
  code: string;
  initialSeat: Seat;
  transport?: LiveTransport;
}) {
  const router = useRouter();
  const { profile } = useProfile();
  const { seat, view, deadline, status, lost, myAnswer, actions } = usePlayerGame(code, initialSeat, transport);
  const [name, setName] = useState<string | null>(() => lastNickname() || null);
  const suggested = name ?? profile?.displayName?.split(/\s+/)[0] ?? '';

  if (view?.closed) {
    return (
      <DeskMessage title="The host closed the room">
        <p>Thanks for playing.</p>
        {backToPlay}
      </DeskMessage>
    );
  }
  if (lost === 'no-game' && !view) {
    return (
      <DeskMessage title={`No game with the code ${code}`}>
        <p>Check the code with the host. The room only exists while the host has it open.</p>
        {backToPlay}
      </DeskMessage>
    );
  }
  if (lost === 'host-gone') {
    return (
      <DeskMessage title="We lost the host">
        <p>The host&apos;s page may have closed or lost its connection. If they come back, the game picks up here.</p>
        {backToPlay}
      </DeskMessage>
    );
  }
  if (view?.refused.includes(seat.id)) {
    return (
      <DeskMessage title="This room is full">
        <p>A room holds {MAX_PLAYERS} players.</p>
        {backToPlay}
      </DeskMessage>
    );
  }

  // Not joined yet: a nickname first.
  if (!seat.nickname) {
    const waiting = view?.players.filter((p) => p.connected && (!p.host || view.hostPlays)).length ?? 0;
    return (
      <main className="on-desk flex w-full flex-col items-center px-2 pb-10 pt-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (suggested.trim()) actions.join(suggested);
          }}
          className="paper paper-shadow w-full max-w-md rounded-md px-6 py-6 text-ink"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">Live game · Room {code}</p>
          <h1 className="mt-1 font-serif text-[28px] leading-tight">Join the game</h1>
          <p className="mt-1 text-[15px] text-muted" role="status">
            {!view
              ? 'Finding the room…'
              : view.phase === 'lobby'
                ? `${waiting} ${waiting === 1 ? 'player is' : 'players are'} waiting.`
                : 'A game is on. You’ll join from the next question.'}
          </p>
          <label className="mt-5 block text-sm font-semibold" htmlFor="nickname">
            Your nickname
          </label>
          <input
            id="nickname"
            value={suggested}
            onChange={(e) => setName(e.target.value)}
            maxLength={NICKNAME_MAX}
            autoComplete="nickname"
            autoFocus
            className="mt-1 w-full rounded-lg border border-ink/20 bg-white/60 px-3 py-2.5 text-lg"
          />
          <p className="mt-1 text-xs text-muted">Everyone in the room sees it. Nothing about the game is saved.</p>
          <button type="submit" disabled={!suggested.trim()} className="btn btn-primary btn-lg mt-5 w-full rounded-full">
            Join
          </button>
          <div className="mt-3 flex justify-center">
            <LinkNote status={status} />
          </div>
        </form>
      </main>
    );
  }

  if (!view || !view.players.some((p) => p.id === seat.id)) {
    return (
      <DeskMessage title={view ? 'Joining…' : 'Finding the room…'}>
        <p>Room {code}</p>
        <LinkNote status={status} />
      </DeskMessage>
    );
  }

  return (
    <LiveScreen
      view={view}
      me={seat.id}
      status={status}
      deadline={deadline}
      playing
      myAnswer={myAnswer}
      onAnswer={actions.answer}
      endActions={
        <>
          <p className="w-full text-center text-sm text-on-desk/85">The host can start another round.</p>
          <button
            type="button"
            onClick={() => {
              actions.leave();
              router.push('/play');
            }}
            className="brass-ring min-h-11 rounded-full px-5 text-sm font-semibold"
          >
            Leave the room
          </button>
        </>
      }
    />
  );
}
