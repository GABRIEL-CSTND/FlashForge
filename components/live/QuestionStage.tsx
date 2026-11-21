'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import AnswerSlips from '@/components/study/AnswerSlips';
import type { RoomView } from '@/lib/live-game';
import { Countdown, GuessForm } from './parts';

const WIDE = '(min-width: 640px)';
function subscribeWide(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
// Slips sit two by two on a wider screen and one under another on a phone.
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => typeof window.matchMedia !== 'function' || window.matchMedia(WIDE).matches,
    () => true
  );
}

// Long questions get smaller type, so they still fit a phone.
const promptSize = (text: string) =>
  text.length > 220 ? 'text-lg sm:text-xl' : text.length > 120 ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-[32px]';

// A question of a live game (#26) and, once time is up, its answer. Everyone
// sees the same card at once; `playing` is whether this screen can answer
// (the host can only watch, on a projector for example).
export default function QuestionStage({
  view,
  me,
  deadline,
  playing,
  myAnswer,
  onAnswer,
}: {
  view: RoomView;
  me: string;
  deadline: number | null;
  playing: boolean;
  // This screen's answer to the question, and whether it's still on its way.
  myAnswer: { given: string; pending: boolean } | null;
  onAnswer: (given: string) => void;
}) {
  const wide = useWide();
  const promptRef = useRef<HTMLParagraphElement>(null);
  const q = view.question!;
  const reveal = view.phase === 'reveal' ? view.reveal : null;
  const typed = q.kind === 'typed';
  const gotIt = view.answered.includes(me);
  const result = reveal?.results.find((r) => r.id === me);

  // A new question: screen readers start on its words (a typed one starts on
  // the answer line instead, which takes the focus itself).
  useEffect(() => {
    if (view.phase === 'question' && (!typed || !playing)) promptRef.current?.focus();
  }, [q.index, view.phase, typed, playing]);

  const verdict = !reveal || !playing
    ? null
    : result?.correct
      ? `Right! +${result.points} points`
      : myAnswer
        ? 'Not this time.'
        : 'No answer this time.';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-on-desk/85">
          Question {q.index + 1} of {q.total} · {q.label}
        </p>
        {view.phase === 'question' ? (
          <Countdown key={q.index} deadline={deadline} durationMs={q.durationMs} />
        ) : (
          <p className="text-sm font-semibold text-on-desk">Time&apos;s up</p>
        )}
      </div>

      <article aria-label={`Question ${q.index + 1}`} className="paper paper-shadow rounded-md px-6 pb-6 pt-5 text-ink">
        <p ref={promptRef} tabIndex={-1} className={`font-serif leading-[1.3] [text-wrap:pretty] focus:outline-none ${promptSize(q.prompt)}`}>
          {q.prompt}
        </p>
        {reveal && (
          <div className="mt-4 space-y-2 border-t border-ink/10 pt-3">
            <p className="font-serif text-xl">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">Answer </span>
              <span className="italic">{reveal.answer}</span>
            </p>
            {reveal.explanation && <p className="border-l-2 border-brass pl-3 text-[15px] leading-snug text-ink/80">{reveal.explanation}</p>}
            {verdict && (
              <p role="status" className={`text-[15px] font-semibold ${result?.correct ? 'text-brass-ink' : 'text-pencil'}`}>
                {verdict}
              </p>
            )}
          </div>
        )}
      </article>

      {!typed && q.options && (
        <div className="flex flex-col gap-2">
          <AnswerSlips
            key={q.index}
            options={q.options}
            answer={reveal ? reveal.answer : null}
            picked={myAnswer?.given}
            onPick={onAnswer}
            kind={wide ? 'laptop' : 'phone'}
            locked={!playing || !!reveal}
          />
          {view.phase === 'question' && playing && myAnswer && (
            <p role="status" className="text-sm text-on-desk/85">
              {myAnswer.pending ? 'Sending your pick…' : 'Locked in. Waiting for the others…'}
            </p>
          )}
        </div>
      )}

      {typed && view.phase === 'question' && playing && !gotIt && (
        <GuessForm key={q.index} onGuess={onAnswer} last={myAnswer} />
      )}
      {typed && view.phase === 'question' && playing && gotIt && (
        <p role="status" className="paper paper-shadow rounded-md px-5 py-3 text-[15px] font-semibold text-brass-ink">
          You got it! Waiting for the others…
        </p>
      )}
      {typed && view.phase === 'question' && !playing && (
        <p className="text-sm text-on-desk/85">Everyone is typing their answers.</p>
      )}
    </div>
  );
}
