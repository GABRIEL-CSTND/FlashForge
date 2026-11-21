'use client';

import { use, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import HostRoom from '@/components/live/HostRoom';
import PlayerRoom from '@/components/live/PlayerRoom';
import type { Preselect } from '@/components/live/DeckPicker';
import { normalizeRoomCode } from '@/lib/live-game';
import { loadHostGame, openSeat } from '@/lib/live-session';

// The page only knows whether this tab hosts the room once it runs in the
// browser (the game is kept in the tab), so the server sends a short wait.
const useHydrated = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

// "Play live with friends" on a set's page opens the room with that deck: /play/K7MQ?set=<id>.
function readPreselect(): Preselect {
  const query = new URLSearchParams(window.location.search);
  const set = query.get('set');
  const guide = query.get('guide');
  return set ? { kind: 'set', id: set } : guide ? { kind: 'guide', id: guide } : null;
}

function Room({ code }: { code: string }) {
  const [host] = useState(() => loadHostGame(code));
  const [seat] = useState(() => (host ? null : openSeat(code)));
  const [preselect] = useState(readPreselect);
  return host ? <HostRoom initial={host} preselect={preselect} /> : <PlayerRoom code={code} initialSeat={seat!} />;
}

// A live game's room (#26): the host's screen in the tab that opened it, and a
// player's screen everywhere else.
export default function PlayRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = use(params);
  const code = normalizeRoomCode(decodeURIComponent(raw));
  const hydrated = useHydrated();

  if (!code) {
    return (
      <main className="on-desk flex w-full flex-col items-center px-2 pb-10 pt-6 text-center">
        <div className="paper paper-shadow w-full max-w-md rounded-md px-6 py-6 text-ink">
          <h1 className="font-serif text-2xl">That isn&apos;t a room code</h1>
          <p className="mt-2 text-[15px] text-muted">Room codes are 4 letters and numbers, like K7MQ.</p>
          <Link href="/play" className="btn btn-primary mt-4 rounded-full px-5">
            Back to Play live
          </Link>
        </div>
      </main>
    );
  }
  if (!hydrated) {
    return (
      <main className="on-desk w-full pb-10 pt-6 text-center">
        <p className="text-on-desk/85">Opening room {code}…</p>
      </main>
    );
  }
  return <Room key={code} code={code} />;
}
