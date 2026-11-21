'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SECONDS_CHOICES, startProblem, type HostState } from '@/lib/live-game';
import { realtimeTransport, type LiveTransport } from '@/lib/live-room';
import { forgetHostGame } from '@/lib/live-session';
import DeckPicker, { type Preselect } from './DeckPicker';
import LiveScreen from './LiveScreen';
import { useHostGame } from './useHostGame';

// The host's screen of a live game (#26): the lobby with the deck and the
// settings, then the game as everyone sees it, with End game; and on the
// podium, Play again. The game runs in this tab (useHostGame).
export default function HostRoom({
  initial,
  preselect = null,
  transport = realtimeTransport,
}: {
  initial: HostState;
  preselect?: Preselect;
  transport?: LiveTransport;
}) {
  const router = useRouter();
  const { state, view, deadline, status, actions } = useHostGame(initial, transport);
  // The host's own picks and guesses, when they play.
  const [mine, setMine] = useState<{ index: number; given: string } | null>(null);
  const [confirming, setConfirming] = useState<'end' | 'close' | null>(null);
  const problem = startProblem(state);

  const answer = (given: string) => {
    if (view.phase !== 'question' || !view.question) return;
    setMine({ index: view.question.index, given });
    actions.answer(given);
  };
  const myAnswer = mine && view.question?.index === mine.index ? { given: mine.given, pending: false } : null;

  const close = () => {
    actions.close();
    forgetHostGame(state.code);
    router.push('/play');
  };

  // Ending or closing asks once more, right where the button was.
  const confirm = (what: 'end' | 'close', label: string, question: string, run: () => void, className: string) =>
    confirming === what ? (
      <span className="flex items-center gap-2 text-sm text-on-desk">
        {question}
        <button type="button" onClick={run} className="brass min-h-9 rounded-full px-3.5 font-semibold">
          Yes
        </button>
        <button type="button" onClick={() => setConfirming(null)} className="min-h-9 px-1.5 font-semibold hover:underline">
          No
        </button>
      </span>
    ) : (
      <button type="button" onClick={() => setConfirming(what)} className={className}>
        {label}
      </button>
    );

  const lobbyControls = (
    <>
      <DeckPicker deck={view.deck} making={view.making} preselect={preselect} onDeck={actions.setDeck} onMaking={actions.setMaking} />
      <section aria-label="Game settings" className="paper paper-shadow rounded-md px-6 py-5 text-ink">
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">Time for each question</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SECONDS_CHOICES.map((s) => (
              <label key={s} className={`flex min-h-10 cursor-pointer items-center rounded-full px-4 text-sm font-semibold ${state.seconds === s ? 'brass' : 'border border-ink/20 hover:border-brass'}`}>
                <input
                  type="radio"
                  name="seconds"
                  value={s}
                  checked={state.seconds === s}
                  onChange={() => actions.setSettings({ seconds: s })}
                  className="sr-only"
                />
                {s} seconds
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={state.hostPlays}
            onChange={(e) => actions.setSettings({ hostPlays: e.target.checked })}
            className="mt-1 h-4 w-4 accent-[#7a5c22]"
          />
          <span>
            <span className="block text-[15px] font-semibold">Play too</span>
            <span className="block text-sm text-muted">Switch it off to only run the game, on a projector for example.</span>
          </span>
        </label>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={actions.start} disabled={!!problem} className="btn btn-primary btn-lg rounded-full px-6">
            Start the game
          </button>
          {problem && <p className="text-sm text-muted">{problem}</p>}
        </div>
      </section>
      <div>{confirm('close', 'Close the room', 'Close it for everyone?', close, 'text-sm font-semibold text-on-desk/85 hover:underline')}</div>
    </>
  );

  const toolbar =
    view.phase === 'question' || view.phase === 'reveal'
      ? confirm(
          'end',
          'End game',
          'End it now?',
          () => {
            setConfirming(null);
            actions.end();
          },
          'brass-ring min-h-9 rounded-full px-3.5 text-sm font-semibold'
        )
      : null;

  const endActions = (
    <>
      <button
        type="button"
        onClick={() => {
          setMine(null);
          actions.playAgain();
        }}
        className="btn btn-primary btn-lg rounded-full px-6"
      >
        Play again
      </button>
      {confirm('close', 'Close the room', 'Close it for everyone?', close, 'brass-ring min-h-11 rounded-full px-5 text-sm font-semibold')}
    </>
  );

  return (
    <LiveScreen
      view={view}
      me={state.hostId}
      status={status}
      deadline={deadline}
      playing={state.hostPlays}
      myAnswer={myAnswer}
      onAnswer={answer}
      lobbyControls={lobbyControls}
      toolbar={toolbar}
      endActions={endActions}
    />
  );
}
