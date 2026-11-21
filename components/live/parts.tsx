'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { CARD_LIMITS } from '@/lib/card-rules';
import { standings, type RoomView } from '@/lib/live-game';
import type { LinkStatus } from '@/lib/live-room';

// Small pieces of the live game's screens (#26).

// ---- The clock --------------------------------------------------------------

// One clock for every countdown on the page, ticking 4 times a second while
// one is shown. Components read the time it last ticked, so a render never
// reads the clock itself.
let clock = 0;
let ticker: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
function subscribeClock(listener: () => void) {
  listeners.add(listener);
  if (!ticker) {
    clock = Date.now();
    ticker = setInterval(() => {
      clock = Date.now();
      listeners.forEach((l) => l());
    }, 250);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

// Milliseconds left until `deadline`; the whole duration until the clock starts.
export function useMsLeft(deadline: number | null, durationMs: number): number {
  const now = useSyncExternalStore(subscribeClock, () => clock, () => 0);
  if (deadline === null) return 0;
  return now === 0 ? durationMs : Math.min(durationMs, Math.max(0, deadline - now));
}

// The seconds left, and a bar running down. Screen readers hear it only every
// 10 seconds ("20 seconds left", "10 seconds left", "Time's up").
export function Countdown({ deadline, durationMs }: { deadline: number | null; durationMs: number }) {
  const ms = useMsLeft(deadline, durationMs);
  const seconds = Math.ceil(ms / 1000);
  const tens = Math.ceil(seconds / 10) * 10;
  const low = seconds <= 5;
  return (
    <div className="flex items-center gap-3">
      <div aria-hidden="true" className="h-1.5 w-24 overflow-hidden rounded-full bg-black/25 sm:w-36">
        <div
          className={`h-full origin-left rounded-full transition-transform duration-[250ms] ease-linear motion-reduce:transition-none ${low ? 'bg-[#e08a7e]' : 'bg-brass'}`}
          style={{ transform: `scaleX(${durationMs ? ms / durationMs : 0})` }}
        />
      </div>
      <span
        aria-hidden="true"
        className={`brass inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-serif text-xl font-semibold tabular-nums ${low ? 'live-timer-low' : ''}`}
      >
        {seconds}
      </span>
      <span className="sr-only" role="status">
        {seconds === 0 ? "Time's up" : `${tens} seconds left`}
      </span>
    </div>
  );
}

// ---- The room ---------------------------------------------------------------

export function useOrigin(): string {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ''
  );
}

// The room code, big enough to read off a projector, and the link to send.
export function RoomCode({ code }: { code: string }) {
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  const link = `${origin}/play/${code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard (an older browser, or not https): the link is on show anyway.
    }
  };
  return (
    <section aria-label="Room code" className="paper paper-shadow rounded-md px-6 py-5 text-ink lg:-rotate-[0.8deg]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">Join with the code</p>
      <p className="mt-1 font-serif text-6xl font-semibold leading-none tracking-[0.18em] sm:text-7xl" aria-label={code.split('').join(' ')}>
        {code}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span className="min-w-0 break-all text-muted">{origin ? link.replace(/^https?:\/\//, '') : `/play/${code}`}</span>
        <button type="button" onClick={copy} className="font-semibold text-brass-ink hover:underline">
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </section>
  );
}

// "Connecting…" or "Reconnecting…", shown only while the room isn't live.
export function LinkNote({ status }: { status: LinkStatus }) {
  if (status === 'live') return null;
  return (
    <p role="status" className="rounded-full bg-black/25 px-3 py-1 text-[13px] text-on-desk">
      {status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
    </p>
  );
}

// ---- Who's playing ------------------------------------------------------------

const playerLabel = (p: { nickname: string }, me: string, id: string) =>
  `${p.nickname}${id === me ? ' (you)' : ''}`;

// The players in the lobby, as name slips.
export function PlayerSlips({ view, me }: { view: RoomView; me: string }) {
  const here = view.players.filter((p) => p.connected && (!p.host || view.hostPlays));
  return (
    <section aria-label="Players">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-on-desk/80">
        Players · {here.length}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2.5">
        {here.map((p, i) => (
          <li
            key={p.id}
            className={`paper paper-tag rounded px-3 py-1.5 text-[15px] font-semibold text-ink ${p.id === me ? 'ring-2 ring-brass' : ''}`}
            style={{ rotate: `${[-1.5, 1, -0.5, 1.6, -1][i % 5]}deg` }}
          >
            {playerLabel(p, me, p.id)}
            {p.host && <span className="ml-1.5 text-xs font-medium text-brass-ink">host</span>}
          </li>
        ))}
      </ul>
      {here.length === 0 && <p className="mt-2 text-sm text-on-desk/80">No one yet. Share the code.</p>}
    </section>
  );
}

// The standings during a game: who has answered this question, and once the
// answer is shown, who got it and their points.
export function Scoreboard({ view, me }: { view: RoomView; me: string }) {
  const rows = standings(view);
  const results = new Map(view.reveal?.results.map((r) => [r.id, r]));
  const typed = view.question?.kind === 'typed';
  return (
    <section aria-label="Scores" className="paper paper-shadow rounded-md px-4 py-3.5 text-ink">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">Scores</h2>
      <ol className="mt-2 space-y-1">
        {rows.map((p) => {
          const result = results.get(p.id);
          const answered = view.phase === 'question' && view.answered.includes(p.id);
          return (
            <li key={p.id} className={`flex items-center gap-2 text-[15px] ${p.connected ? '' : 'opacity-50'}`}>
              <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted">{p.rank}.</span>
              <span className={`min-w-0 flex-1 truncate ${p.id === me ? 'font-semibold' : ''}`}>
                {playerLabel(p, me, p.id)}
                {!p.connected && <span className="text-xs text-muted"> · left</span>}
              </span>
              {answered && (
                <span className="text-xs font-semibold text-brass-ink" title={typed ? 'Got it' : 'Picked'}>
                  {typed ? '✓ got it' : '✓'}
                  <span className="sr-only">{typed ? '' : ' picked'}</span>
                </span>
              )}
              {result && (
                <span className={`text-xs font-semibold tabular-nums ${result.correct ? 'text-brass-ink' : 'text-muted'}`}>
                  {result.correct ? `+${result.points}` : '–'}
                </span>
              )}
              <span className="w-12 shrink-0 text-right font-semibold tabular-nums">{p.score}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---- Answering ------------------------------------------------------------------

// A gap between guesses, so holding Enter doesn't flood the room.
const GUESS_GAP_MS = 600;

// A typed answer (flashcards, the mixed quiz's Part III): guess as often as
// you like until it's right, as in PopSauce. One small typo still counts.
export function GuessForm({
  onGuess,
  last,
}: {
  onGuess: (guess: string) => void;
  // The latest guess: still on its way to the host, or not it.
  last: { given: string; pending: boolean } | null;
}) {
  const [draft, setDraft] = useState('');
  const sentAt = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const guess = draft.trim();
        const now = Date.now();
        if (!guess || now - sentAt.current < GUESS_GAP_MS) return;
        sentAt.current = now;
        onGuess(guess);
        setDraft('');
        input.current?.focus();
      }}
      className="paper paper-shadow rounded-md px-5 pb-4 pt-3.5 text-ink"
    >
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <label className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brass-ink">
          <span aria-hidden="true">Your answer</span>
          <input
            ref={input}
            aria-label="Your answer"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={CARD_LIMITS.answer}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-h-10 w-full border-0 border-b-[1.5px] border-[#8c8270] bg-transparent px-0.5 pb-1 pt-0.5 font-serif text-2xl font-normal normal-case italic tracking-normal text-[#1f2a44]"
          />
        </label>
        <button type="submit" disabled={!draft.trim()} className="btn btn-primary min-h-11 rounded-full px-5">
          Guess
        </button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm">
        {last &&
          (last.pending ? (
            <span className="text-muted">Checking “{last.given}”…</span>
          ) : (
            <span className="text-pencil">“{last.given}” isn&apos;t it. Try again.</span>
          ))}
      </p>
    </form>
  );
}

// ---- The end ------------------------------------------------------------------

const PLACES = ['1st', '2nd', '3rd'];

// First, second and third on a podium (second on the left, third on the right),
// then everyone else.
export function Podium({ view, me }: { view: RoomView; me: string }) {
  const rows = standings(view);
  const top = rows.slice(0, 3);
  // Laid out 2nd, 1st, 3rd.
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights: Record<number, string> = { 0: 'h-32 sm:h-40', 1: 'h-24 sm:h-28', 2: 'h-16 sm:h-20' };
  return (
    <section aria-label="Final scores" className="w-full">
      <ol className="sr-only">
        {rows.map((p) => (
          <li key={p.id}>
            {PLACES[p.rank - 1] ?? `${p.rank}th`}: {playerLabel(p, me, p.id)}, {p.score} points
          </li>
        ))}
      </ol>
      <div aria-hidden="true" className="mx-auto flex max-w-xl items-end justify-center gap-2 sm:gap-4">
        {order.map((p) => {
          const place = rows.indexOf(p);
          return (
            <div key={p.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <p className={`max-w-full truncate px-1 text-center font-serif text-on-desk ${place === 0 ? 'text-2xl' : 'text-lg'}`}>
                {p.nickname}
                {p.id === me && <span className="text-on-desk/70"> (you)</span>}
              </p>
              <p className="text-sm tabular-nums text-on-desk/85">{p.score} points</p>
              <div className={`paper paper-shadow flex w-full items-start justify-center rounded-t-md pt-2 ${heights[place]}`}>
                <span className={`font-serif font-semibold ${place === 0 ? 'text-4xl text-brass-ink' : 'text-3xl text-ink'}`}>
                  {PLACES[p.rank - 1] ?? p.rank}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {rows.length > 3 && (
        <ol aria-hidden="true" start={4} className="paper paper-shadow mx-auto mt-6 max-w-md space-y-1 rounded-md px-5 py-3 text-ink">
          {rows.slice(3).map((p) => (
            <li key={p.id} className="flex gap-2 text-[15px]">
              <span className="w-6 text-right tabular-nums text-muted">{p.rank}.</span>
              <span className={`min-w-0 flex-1 truncate ${p.id === me ? 'font-semibold' : ''}`}>{playerLabel(p, me, p.id)}</span>
              <span className="font-semibold tabular-nums">{p.score}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
