'use client';

import type { ReactNode } from 'react';
import type { RoomView } from '@/lib/live-game';
import type { LinkStatus } from '@/lib/live-room';
import { STUDY_TYPE_LABELS } from '@/lib/study-types';
import { sourceNote } from './DeckPicker';
import { LinkNote, PlayerSlips, Podium, RoomCode, Scoreboard } from './parts';
import QuestionStage from './QuestionStage';

// What players see of the deck while they wait in the lobby.
function DeckNote({ view }: { view: RoomView }) {
  return (
    <section aria-label="The deck" className="paper paper-shadow rounded-md px-6 py-5 text-ink lg:rotate-[0.6deg]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">The deck</p>
      {view.making ? (
        <p role="status" className="mt-1 font-serif text-xl">
          The host is making a new deck…
          {view.making.done > 0 && <span className="text-muted"> {`${view.making.done} of ${view.making.total} written`}</span>}
        </p>
      ) : view.deck ? (
        <>
          <p className="mt-1 font-serif text-2xl leading-tight">{view.deck.title}</p>
          <p className="text-[15px] text-muted">
            {view.deck.count} {view.deck.count === 1 ? 'question' : 'questions'} · {STUDY_TYPE_LABELS[view.deck.studyType]}
          </p>
          <p className="mt-2 text-[14.5px] text-ink/80">{sourceNote(view.deck.source)}</p>
        </>
      ) : (
        <p className="mt-1 font-serif text-xl">The host is picking a deck.</p>
      )}
    </section>
  );
}

// One screen of a live game (#26), the same for the host and the players: the
// lobby, a question and its answer, and the podium. The host adds their
// controls through the slots.
export default function LiveScreen({
  view,
  me,
  status,
  deadline,
  playing,
  myAnswer,
  onAnswer,
  lobbyControls,
  toolbar,
  endActions,
}: {
  view: RoomView;
  // This screen's player id (the host's id on the host's screen).
  me: string;
  status: LinkStatus;
  deadline: number | null;
  // Whether this screen answers questions.
  playing: boolean;
  myAnswer: { given: string; pending: boolean } | null;
  onAnswer: (given: string) => void;
  // The host's deck and settings; players get a note about the deck instead.
  lobbyControls?: ReactNode;
  // Next to the room's name during a game (the host's End game).
  toolbar?: ReactNode;
  endActions: ReactNode;
}) {
  const heading =
    view.phase === 'lobby' ? 'Waiting room' : view.phase === 'end' ? 'Final scores' : view.deck?.title ?? 'Live game';
  return (
    <main className="on-desk w-full pb-10 pt-1">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-on-desk/75">Live game · Room {view.code}</p>
          <h1 className="font-serif text-[28px] leading-tight text-[#f3ecdd]">{heading}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LinkNote status={status} />
          {toolbar}
        </div>
      </div>

      {view.phase === 'lobby' && (
        <div className="grid items-start gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="flex flex-col gap-7">
            <RoomCode code={view.code} />
            <PlayerSlips view={view} me={me} />
          </div>
          <div className="flex flex-col gap-5">
            {lobbyControls ?? (
              <>
                <DeckNote view={view} />
                <p role="status" className="text-[15px] italic text-on-desk/85">
                  Waiting for the host to start…
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {(view.phase === 'question' || view.phase === 'reveal') && view.question && (
        <div className="grid items-start gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <QuestionStage view={view} me={me} deadline={deadline} playing={playing} myAnswer={myAnswer} onAnswer={onAnswer} />
          <Scoreboard view={view} me={me} />
        </div>
      )}

      {view.phase === 'end' && (
        <div className="flex flex-col items-center gap-8 pt-2">
          <Podium view={view} me={me} />
          <div className="flex flex-wrap items-center justify-center gap-3">{endActions}</div>
        </div>
      )}
    </main>
  );
}
