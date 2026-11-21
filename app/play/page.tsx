'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/components/ProfileProvider';
import { isUuid, newId } from '@/lib/ids';
import { cleanNickname, newGame, NICKNAME_MAX, normalizeRoomCode } from '@/lib/live-game';
import { claimRoomCode, realtimeTransport } from '@/lib/live-room';
import { lastNickname, openSeat, rememberNickname, saveHostGame, saveSeat } from '@/lib/live-session';

const noSubscribe = () => () => {};

// "Play live with friends" on a set's page comes here as /play?set=<id>; the
// room then opens with that deck.
function deckQuery(): string {
  const query = new URLSearchParams(window.location.search);
  const set = query.get('set');
  const guide = query.get('guide');
  if (set && isUuid(set)) return `?set=${set}`;
  if (guide && isUuid(guide)) return `?guide=${guide}`;
  return '';
}

// Play live (#26): host a game, or join one with its code.
export default function PlayPage() {
  const router = useRouter();
  const { profile } = useProfile();
  const remembered = useSyncExternalStore(noSubscribe, lastNickname, () => '');
  const withDeck = useSyncExternalStore(noSubscribe, deckQuery, () => '');
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [nameError, setNameError] = useState('');
  const [opening, setOpening] = useState(false);
  const nickname = name ?? (remembered || profile?.displayName?.split(/\s+/)[0] || '');

  const host = async () => {
    setOpening(true);
    const room = await claimRoomCode(realtimeTransport);
    const hostName = nickname.trim() ? cleanNickname(nickname) : 'Host';
    if (nickname.trim()) rememberNickname(hostName);
    saveHostGame(newGame(room, newId(), hostName, Date.now()));
    router.push(`/play/${room}${deckQuery()}`);
  };

  const join = () => {
    const room = normalizeRoomCode(code);
    setCodeError(room ? '' : 'Room codes are 4 letters and numbers, like K7MQ.');
    setNameError(nickname.trim() ? '' : 'Pick a nickname first.');
    if (!room || !nickname.trim()) return;
    const seat = openSeat(room);
    const clean = cleanNickname(nickname);
    saveSeat(room, { ...seat, nickname: clean });
    rememberNickname(clean);
    router.push(`/play/${room}`);
  };

  return (
    <main className="on-desk w-full pb-10 pt-1">
      <h1 className="font-serif text-[34px] leading-tight text-[#f3ecdd]">Play live</h1>
      <p className="mt-1 max-w-2xl text-[15.5px] text-on-desk/85">
        Quiz your friends at the same time. Everyone gets the same question at once, and right answers score more the faster they come.
      </p>

      <div className="mt-6 max-w-sm">
        <label htmlFor="nickname" className="text-xs font-semibold uppercase tracking-[0.16em] text-on-desk/80">
          Your nickname
        </label>
        <input
          id="nickname"
          value={nickname}
          onChange={(e) => {
            setName(e.target.value);
            setNameError('');
          }}
          maxLength={NICKNAME_MAX}
          autoComplete="nickname"
          className="paper mt-1.5 w-full rounded-md px-3.5 py-2.5 font-serif text-xl text-ink shadow-[0_8px_16px_-8px_rgb(0_0_0/0.6)]"
          aria-describedby="nickname-note"
        />
        <p id="nickname-note" className="mt-1.5 text-[13px] text-on-desk/75">
          {nameError ? <span className="font-semibold text-[#f0b2a8]">{nameError}</span> : 'Everyone in the room sees it.'}
        </p>
      </div>

      <div className="mt-7 grid items-start gap-7 lg:grid-cols-2">
        <section aria-labelledby="host-heading" className="paper paper-shadow rounded-md px-6 py-6 text-ink lg:-rotate-[0.7deg]">
          <h2 id="host-heading" className="font-serif text-[26px] leading-tight">
            Host a game
          </h2>
          <p className="mt-2 text-[15px] text-muted">
            {withDeck
              ? 'Open a room with the deck you picked. Share the code, and start when everyone is in.'
              : 'Open a room and share its code. While friends join, make a new deck right there, or pick one you made before.'}
          </p>
          <button type="button" onClick={host} disabled={opening} className="btn btn-primary btn-lg mt-5 rounded-full px-6">
            {opening ? 'Opening a room…' : 'Open a room'}
          </button>
        </section>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
          aria-labelledby="join-heading"
          className="paper paper-shadow rounded-md px-6 py-6 text-ink lg:rotate-[0.6deg]"
        >
          <h2 id="join-heading" className="font-serif text-[26px] leading-tight">
            Join a game
          </h2>
          <label htmlFor="room-code" className="mt-2 block text-[15px] text-muted">
            Type the code the host shared.
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              id="room-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setCodeError('');
              }}
              maxLength={6}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="K7MQ"
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? 'code-error' : undefined}
              className="w-40 rounded-lg border border-ink/20 bg-white/60 px-3 py-2 text-center font-serif text-3xl tracking-[0.2em] placeholder:text-ink/25"
            />
            <button type="submit" className="btn btn-primary btn-lg rounded-full px-6">
              Join
            </button>
          </div>
          {codeError && (
            <p id="code-error" role="alert" className="mt-2 text-sm font-medium text-pencil">
              {codeError}
            </p>
          )}
        </form>
      </div>

      <p className="mt-8 text-sm text-on-desk/75">
        Nothing about a game is saved: no scores and no nicknames.{' '}
        <Link href="/guide#play-live" className="font-semibold text-[#e2c887] hover:underline">
          How Play live works →
        </Link>
      </p>
    </main>
  );
}
