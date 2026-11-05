'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import PaperCard from '@/components/desk/PaperCard';
import { deckSpot, MAX_LAYERS, middleSpot, pileSpot, spotTransform, useDeskLayout, type DeskKind, type Spot } from '@/components/desk/useDeskLayout';
import { checkTypedAnswer } from '@/lib/answer-check';
import { CARD_LIMITS } from '@/lib/card-rules';
import { speak, stopSpeaking, useAutoRead, useCanSpeak } from '@/lib/speech';
import { matchRounds, type FlashcardMode, type StudyMode } from '@/lib/study-types';
import { cardSpeech, isCorrect, reportAnswer, sameTerm, type CardAnswer, type FlashcardMark, type Interaction, type StudyItem, type StudyResult } from './logic';
import MatchBoard from './MatchBoard';
import SourceNote from './SourceNote';
import StudyTools from './StudyTools';
import { ExitButton, TypedVerdictLine } from './parts';

type Pile = FlashcardMark;

// The deck as it lies on the desk.
interface DeckState {
  // This time through, in study order (positions in `cards`).
  order: number[];
  // How many cards of `order` are done.
  pos: number;
  // The pile each finished card lies on.
  pile: Record<number, Pile>;
  // Finished cards in the order they landed, so each pile stacks up in order.
  landed: number[];
  // Going through the Missed it pile again: practice, so it isn't reported.
  practice: boolean;
}

const freshDeck = (count: number): DeckState => ({
  order: Array.from({ length: count }, (_, i) => i),
  pos: 0,
  pile: {},
  landed: [],
  practice: false,
});

// Text sizes that keep a clue or a term on the card: the longer the text, the
// smaller the type (and the card scrolls if it still doesn't fit).
const CLUE_SIZES: Record<DeskKind, number[]> = { laptop: [29, 25, 21, 18, 16], phone: [22, 20, 18, 16, 15] };
const TERM_SIZES: Record<DeskKind, number[]> = { laptop: [60, 46, 36, 28, 22], phone: [42, 34, 28, 22, 18] };
function fitted(text: string, steps: number[], sizes: number[]): number {
  const i = steps.findIndex((s) => text.length <= s);
  return sizes[i === -1 ? sizes.length - 1 : i];
}
const clueSize = (text: string, kind: DeskKind) => fitted(text, [50, 90, 140, 220], CLUE_SIZES[kind]);
// Smaller when the card also shows a verdict or a quote.
const termSize = (text: string, kind: DeskKind, crowded: boolean) =>
  Math.min(fitted(text, [10, 18, 28, 44], TERM_SIZES[kind]), crowded ? (kind === 'phone' ? 30 : 44) : Infinity);

export interface FlashcardDeskProps {
  title: string;
  cards: StudyItem[];
  onFinish?: () => void;
  onExit?: () => void;
  // Shows the pencil, which opens the card editor.
  onEdit?: () => void;
  onComplete?: (result: StudyResult) => void;
  completionSlot?: ReactNode;
  saveSlot?: ReactNode;
  quoteLabel?: string;
}

// Flashcards on the desk (desk redesign, phase 2): the deck on the left, the
// card in the middle and the Got it / Missed it piles on the right (on a phone,
// the deck peeks out above the card and the piles are trays underneath).
// Flip and sort the card by clicking a pile or with ← and →, type the term on
// the card, or match a round of up to five. At the end, the Missed it pile
// deals its cards again for practice.
export default function FlashcardDesk({
  title,
  cards,
  onFinish,
  onExit,
  onEdit,
  onComplete,
  completionSlot,
  saveSlot,
  quoteLabel = 'From the document',
}: FlashcardDeskProps) {
  const count = cards.length;
  const [mode, setMode] = useState<FlashcardMode>('flip');
  const [deck, setDeck] = useState<DeckState>(() => freshDeck(count));
  // The first time through: what was done with each card, for the score.
  const [answers, setAnswers] = useState<Record<number, CardAnswer>>({});
  const [flipped, setFlipped] = useState(false);
  // The back of the current card has been shown, so it keeps its words while
  // it turns back over.
  const [backSeen, setBackSeen] = useState(false);
  const [lifted, setLifted] = useState(false);
  // Type mode: the current card's checked answer.
  const [checked, setChecked] = useState<CardAnswer | null>(null);
  // The card on its way to a pile keeps its words until it lands.
  const [flying, setFlying] = useState<number | null>(null);
  // Bumped on every restart and every new pass, so typed cards and Match
  // rounds start fresh.
  const [run, setRun] = useState(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const doneRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const doneId = useId();

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => clearTimeout(id));
  }, []);
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  const interaction: Interaction = mode === 'type' ? 'typed' : mode === 'match' ? 'match' : 'flip';
  const studyMode: StudyMode | null = mode === 'flip' ? null : mode;
  const finished = deck.pos >= deck.order.length;
  const rounds = matchRounds(deck.order.length);
  const roundIndex = mode === 'match' && !finished ? rounds.findIndex(([start]) => start === deck.pos) : -1;
  const round = roundIndex >= 0 ? deck.order.slice(rounds[roundIndex][0], rounds[roundIndex][1]) : [];
  const current = !finished && mode !== 'match' ? deck.order[deck.pos] : undefined;
  const gotList = deck.landed.filter((i) => deck.pile[i] === 'got');
  const missedList = deck.landed.filter((i) => deck.pile[i] === 'missed');

  const { stageRef, slot, kind, card: size, slots, settled } = useDeskLayout(`${mode}|${finished}|${roundIndex}|${run}`);

  // Read aloud (#77). With Auto on, each card is read as it appears, and the
  // term when it's turned over. Moving on stops what's being read.
  const speechAvailable = useCanSpeak();
  const [autoRead, setAutoRead] = useAutoRead();
  const speech = finished
    ? ''
    : cardSpeech(interaction, current === undefined ? undefined : cards[current], round.map((i) => ({ card: cards[i] })), flipped, checked ?? undefined);
  useEffect(() => {
    if (autoRead && speech) speak(speech);
    else stopSpeaking();
    // Only when another card or side is shown, not again after each answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, finished, deck.pos, flipped, mode, run]);
  useEffect(() => stopSpeaking, []);

  // Keyboard focus follows the work: to the finish note when the deck is done,
  // and to Next card once a typed answer is checked.
  useEffect(() => {
    if (finished) doneRef.current?.focus();
  }, [finished, run]);
  useEffect(() => {
    if (checked) nextRef.current?.focus();
  }, [checked]);

  const lift = () => {
    setLifted(true);
    later(() => setLifted(false), 280);
  };
  const fly = (i: number) => {
    setFlying(i);
    later(() => setFlying((f) => (f === i ? null : f)), 700);
  };

  const report = (final: Record<number, CardAnswer>) =>
    onComplete?.({
      ...(studyMode ? { mode: studyMode } : {}),
      answers: cards.map((c, i) => reportAnswer(interaction, c, final[i])),
      correct: cards.filter((c, i) => isCorrect(interaction, c, final[i])).length,
      total: count,
    });

  // Puts cards on their piles and moves on. The first time through, what was
  // done with them counts, and the last card reports the run (#57).
  const land = (results: { index: number; pile: Pile; answer: CardAnswer }[], nextPos: number) => {
    setDeck({
      ...deck,
      pos: nextPos,
      pile: { ...deck.pile, ...Object.fromEntries(results.map((r) => [r.index, r.pile])) },
      landed: [...deck.landed, ...results.map((r) => r.index)],
    });
    setFlipped(false);
    setBackSeen(false);
    setChecked(null);
    if (deck.practice) return;
    const nextAnswers = { ...answers, ...Object.fromEntries(results.map((r) => [r.index, r.answer])) };
    setAnswers(nextAnswers);
    if (nextPos >= deck.order.length) report(nextAnswers);
  };

  const flip = () => {
    if (current === undefined || mode !== 'flip') return;
    if (!flipped) setBackSeen(true);
    setFlipped(!flipped);
    lift();
  };

  // The Missed it pile, dealt again: the cards go back into the deck and the
  // Got it pile stays where it is.
  const dealMissed = () => {
    if (!finished || missedList.length === 0) return;
    setDeck({ order: missedList, pos: 0, pile: Object.fromEntries(gotList.map((i) => [i, 'got' as const])), landed: gotList, practice: true });
    setFlipped(false);
    setBackSeen(false);
    setChecked(null);
    setRun((r) => r + 1);
  };

  const sortTo = (pile: Pile) => {
    if (finished) {
      if (pile === 'missed') dealMissed();
      return;
    }
    if (mode !== 'flip' || current === undefined) return;
    fly(current);
    land([{ index: current, pile, answer: { result: pile } }], deck.pos + 1);
  };

  // ← and → sort the card while the card or a pile has focus.
  const onDeskKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (!finished && mode !== 'flip') return;
    e.preventDefault();
    sortTo(e.key === 'ArrowRight' ? 'got' : 'missed');
  };

  const checkTyped = (typed: string | null) => {
    if (current === undefined || checked) return;
    setChecked(typed === null ? { typed: null, verdict: 'wrong' } : { typed, verdict: checkTypedAnswer(typed, cards[current].answer) });
    setFlipped(true);
    setBackSeen(true);
    lift();
  };

  // A checked card goes to the pile its verdict says (a small typo still
  // counts, as it always has).
  const nextTyped = () => {
    if (current === undefined || !checked) return;
    fly(current);
    land([{ index: current, pile: checked.verdict === 'wrong' ? 'missed' : 'got', answer: checked }], deck.pos + 1);
  };

  const finishRound = (firstPicks: Record<number, string>) => {
    if (roundIndex < 0) return;
    land(
      round.map((index) => ({
        index,
        pile: (sameTerm(firstPicks[index], cards[index].answer) ? 'got' : 'missed') as Pile,
        answer: { chosen: firstPicks[index] },
      })),
      rounds[roundIndex][1]
    );
  };

  const restart = () => {
    setDeck(freshDeck(count));
    setAnswers({});
    setFlipped(false);
    setBackSeen(false);
    setChecked(null);
    setRun((r) => r + 1);
  };

  const changeMode = (next: FlashcardMode) => {
    setMode(next);
    restart();
  };

  // Where each card lies: on a pile, in the middle, out on the desk as a Match
  // slip (hidden), or in the deck.
  const placed = slots ?? {};
  const place = (i: number): { spot: Spot | null; z: number; shown: boolean; turned: boolean } => {
    const pile = deck.pile[i];
    if (pile) {
      const list = pile === 'got' ? gotList : missedList;
      const j = list.indexOf(i);
      return { spot: pileSpot(kind, placed, size, pile, j), z: 200 + j, shown: list.length - j <= MAX_LAYERS, turned: true };
    }
    if (i === current) return { spot: middleSpot(placed, lifted), z: 300, shown: true, turned: flipped };
    if (round.includes(i)) return { spot: deckSpot(kind, placed, size, 0), z: 150, shown: false, turned: false };
    const top = roundIndex >= 0 ? rounds[roundIndex][1] : deck.pos + (current === undefined ? 0 : 1);
    const depth = Math.max(0, deck.order.indexOf(i) - top);
    return { spot: deckSpot(kind, placed, size, depth), z: 100 - Math.min(depth, 90), shown: depth < MAX_LAYERS, turned: false };
  };

  const pad = kind === 'phone' ? 'px-5 pb-4 pt-4' : 'px-[34px] pb-[22px] pt-[26px]';
  const cardHead = (label: string, i: number) => (
    <div className="flex items-baseline justify-between gap-3 text-left">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">{label}</span>
      <span className="text-[12.5px] tabular-nums text-muted">
        {i + 1}/{count}
      </span>
    </div>
  );

  // The clue side. `full` adds what you use on the card in the middle.
  const front = (i: number, full: boolean) => (
    <div className={`flex h-full flex-col gap-3 ${pad}`}>
      {cardHead('Clue', i)}
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <p className="my-auto font-serif leading-[1.3] [text-wrap:pretty]" style={{ fontSize: clueSize(cards[i].question, kind) }}>
          {cards[i].question}
        </p>
      </div>
      {full && mode === 'flip' && <p className="text-[13px] text-muted">{kind === 'phone' ? 'Tap the card to flip it' : 'Click the card to flip it'}</p>}
      {full && mode === 'type' && <TypedForm key={`${run}-${i}`} onCheck={checkTyped} />}
    </div>
  );

  // The term side, with the verdict and the quote once it's been turned over.
  const back = (i: number, full: boolean) => {
    const c = cards[i];
    return (
      <div className={`flex h-full flex-col gap-2.5 text-center ${pad}`}>
        {cardHead('Term', i)}
        <div className="flex min-h-0 flex-1 overflow-y-auto">
          <p
            className="m-auto font-serif font-medium leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere]"
            style={{ fontSize: termSize(c.answer, kind, full && (!!c.source || !!checked)) }}
          >
            {c.answer}
          </p>
        </div>
        {full && mode === 'type' && checked && (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <TypedVerdictLine card={c} answer={checked} className="font-serif text-[17px] italic" />
            <button ref={nextRef} type="button" onClick={nextTyped} className="btn btn-primary min-h-11 rounded-full px-5">
              {deck.pos + 1 >= deck.order.length ? 'Finish' : 'Next card →'}
            </button>
          </div>
        )}
        {full && <SourceNote card={c} label={quoteLabel} className="w-full [&>p:last-child]:line-clamp-2" />}
        {full && mode === 'flip' && (
          <p className="text-[13px] text-muted">{kind === 'phone' ? 'Did you know it? Tap a tray.' : 'Did you know it? Click a pile, or press → or ←.'}</p>
        )}
      </div>
    );
  };

  // Every card, drawn where it lies. Only the card in the middle is there for
  // screen readers; the rest are paper on the desk.
  const cardLayer = (
    <div className="pointer-events-none absolute inset-0 z-10">
      {cards.map((_, i) => {
        const { spot, z, shown, turned } = place(i);
        const isCurrent = i === current;
        const isFlying = i === flying && !isCurrent;
        return (
          <div
            key={i}
            aria-hidden={isCurrent ? undefined : true}
            className={`desk-card absolute left-0 top-0 ${settled ? 'is-settled' : ''} ${isCurrent ? (lifted ? 'is-lifted' : 'is-up') : ''}`}
            style={{
              width: size.w,
              height: size.h,
              transform: spot ? spotTransform(spot, size) : undefined,
              zIndex: z,
              opacity: spot && shown ? 1 : 0,
              pointerEvents: isCurrent && mode === 'type' ? 'auto' : 'none',
              willChange: isCurrent || isFlying ? 'transform' : undefined,
            }}
          >
            <PaperCard
              flipped={turned}
              front={isCurrent || isFlying ? front(i, isCurrent) : null}
              back={isCurrent ? (backSeen ? back(i, true) : null) : isFlying ? back(i, false) : null}
            />
          </div>
        );
      })}
    </div>
  );

  const got = gotList.length;
  const missed = missedList.length;
  const pileWord = (pile: Pile) => (pile === 'got' ? 'Got it' : 'Missed it');
  const cardsWord = (n: number) => `${n} card${n === 1 ? '' : 's'}`;
  const pileLabel = (pile: Pile) => {
    const n = pile === 'got' ? got : missed;
    if (!finished) return mode === 'flip' ? pileWord(pile) : `${pileWord(pile)} pile, ${cardsWord(n)}`;
    if (pile === 'missed' && n > 0) return `Study the ${n} missed card${n === 1 ? '' : 's'} again`;
    return `${pileWord(pile)} pile, ${n === 0 ? 'empty' : cardsWord(n)}`;
  };
  const pileOpen = (pile: Pile) => (finished ? pile === 'missed' && missed > 0 : mode === 'flip');
  const small = { w: Math.round(size.w * 0.42), h: Math.round(size.h * 0.42) };

  const pileButton = (pile: Pile, extra: ReactNode = null) => (
    <button
      ref={slot(pile)}
      type="button"
      onClick={() => sortTo(pile)}
      onKeyDown={onDeskKey}
      disabled={!pileOpen(pile)}
      aria-label={pileLabel(pile)}
      className={`desk-spot ${kind === 'phone' ? 'flex h-24 w-full items-start px-3 py-2 text-left' : 'block'}`}
      style={kind === 'laptop' ? { width: small.w + 28, height: small.h + 28 } : undefined}
    >
      {extra}
    </button>
  );

  const countClass = (pile: Pile, onDesk: boolean) =>
    `ml-1.5 tabular-nums ${pile === 'got' ? (onDesk ? 'text-[#e2c887]' : 'text-brass-ink') : onDesk ? 'text-[#efb2a8]' : 'text-pencil'}`;

  const piles =
    kind === 'laptop' ? (
      <div role="group" aria-label="Did you know it?" className="flex flex-col items-center gap-7 pt-2">
        {(['got', 'missed'] as const).map((pile, k) => (
          <div key={pile} className="flex flex-col items-start">
            <div
              aria-hidden="true"
              className={`paper relative z-20 -mb-3 ml-3.5 rounded px-3.5 py-1 text-[13.5px] font-semibold text-ink shadow-[0_6px_12px_-8px_rgb(0_0_0/0.6)] ${k ? 'rotate-[1.5deg]' : '-rotate-2'}`}
            >
              {pileWord(pile)}
              <span className={countClass(pile, false)}>{pile === 'got' ? got : missed}</span>
            </div>
            {pileButton(pile)}
          </div>
        ))}
      </div>
    ) : (
      <div role="group" aria-label="Did you know it?" className="mt-4 grid w-full grid-cols-2 gap-2">
        {(['missed', 'got'] as const).map((pile) => (
          <div key={pile}>
            {pileButton(
              pile,
              <span aria-hidden="true" className="text-[13px] font-semibold text-on-desk">
                {pileWord(pile)}
                <span className={countClass(pile, true)}>{pile === 'got' ? got : missed}</span>
              </span>
            )}
          </div>
        ))}
      </div>
    );

  const typos = Object.values(answers).filter((a) => a.verdict === 'close').length;
  const doneNote = (
    <section ref={doneRef} tabIndex={-1} aria-labelledby={doneId} className="paper paper-shadow w-full max-w-[440px] -rotate-1 rounded-lg px-7 pb-6 pt-7 text-left text-ink">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">{deck.practice ? 'Practice round done' : 'Session done'}</p>
      <h2 id={doneId} className="mt-2 text-4xl tabular-nums">
        {got} / {count}
      </h2>
      <p className="mt-1 text-muted">{deck.practice || mode === 'flip' ? 'in Got it' : `${Math.round((got / count) * 100)}% correct`}</p>
      {!deck.practice && typos > 0 && <p className="text-sm text-muted">{typos} with a small typo</p>}
      <p className="mt-3 text-[15px] text-ink/80">
        {missed > 0
          ? `${kind === 'phone' ? 'Tap the Missed it tray' : 'Click the Missed it pile'} to go through ${missed === 1 ? 'that card' : `those ${missed} cards`} again.`
          : 'Every card ended up in Got it.'}
      </p>
      {deck.practice && onComplete && <p className="mt-1 text-sm text-muted">Your saved score is from the first time through.</p>}
      {completionSlot && <div className="mt-4">{completionSlot}</div>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={restart} className="btn btn-secondary flex-1">
          {mode === 'flip' ? 'Review Again' : 'Try Again'}
        </button>
        {onFinish && (
          <button type="button" onClick={onFinish} className="btn btn-primary flex-1">
            Done
          </button>
        )}
      </div>
    </section>
  );

  // The card in the middle sits on this slot. In Flip it's the button that
  // turns the card over: it stays put from card to card, so focus is never lost.
  const center = finished ? (
    doneNote
  ) : roundIndex >= 0 ? (
    <MatchBoard
      key={`${run}-${roundIndex}`}
      cards={round.map((index) => ({ card: cards[index], index }))}
      isLastRound={roundIndex === rounds.length - 1}
      onDone={finishRound}
      kind={kind}
      quoteLabel={quoteLabel}
    />
  ) : mode === 'flip' ? (
    <button
      ref={slot('card')}
      type="button"
      onClick={flip}
      onKeyDown={onDeskKey}
      aria-label={flipped ? 'Flip back' : 'Flip the card'}
      className="block shrink-0 rounded-[10px]"
      style={{ width: size.w, height: size.h }}
    />
  ) : (
    <div ref={slot('card')} className="shrink-0" style={{ width: size.w, height: size.h }} />
  );

  const progress = finished
    ? 'All done'
    : roundIndex >= 0
      ? `Round ${roundIndex + 1} of ${rounds.length}`
      : `Card ${deck.pos + 1} of ${deck.order.length}`;
  const header = (
    <div className="flex items-center justify-between gap-4">
      <ExitButton onExit={onExit} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-on-desk/80 hover:text-on-desk" />
      <p aria-live="polite" className="text-sm font-medium text-on-desk/85">
        <span>{progress}</span>
        <span className="sr-only">{`. Got it ${got}, Missed it ${missed}.`}</span>
      </p>
    </div>
  );

  const toGo = deck.order.length - deck.pos;
  const label = (
    <div className="paper paper-shadow -rotate-1 rounded px-4 py-2.5 text-ink">
      <h1 className="text-[19px] leading-tight">{title}</h1>
      <p className="mt-0.5 text-[12.5px] text-muted">{finished ? `All done · ${cardsWord(count)}` : `${toGo} to go · ${cardsWord(count)}`}</p>
    </div>
  );
  const notes = saveSlot ? <div className="paper paper-shadow rounded px-4 py-3 text-sm text-ink">{saveSlot}</div> : null;
  const pencil = onEdit ? <Pencil onClick={onEdit} /> : null;
  const tools = finished ? null : (
    <StudyTools mode={mode} onMode={changeMode} speechAvailable={speechAvailable} onSpeak={() => speak(speech)} autoRead={autoRead} onAutoRead={setAutoRead} />
  );

  if (kind === 'phone') {
    return (
      <main className="on-desk w-full pb-4">
        <div ref={stageRef} className="relative mx-auto w-full">
          {header}
          <div className="mt-2">{label}</div>
          <div className="mt-4 flex flex-col items-center">
            {/* Where the deck peeks out above the card. */}
            {current !== undefined && <div aria-hidden="true" className="h-9" />}
            {cardLayer}
            {center}
            {piles}
            {tools && <div className="mt-5">{tools}</div>}
            {(notes || pencil) && (
              <div className="mt-6 flex w-full flex-col items-start gap-3">
                {notes}
                {pencil}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="on-desk w-full pb-6">
      <div ref={stageRef} className="relative mx-auto w-full">
        {header}
        <div className="mt-3 grid items-start gap-x-6 gap-y-7" style={{ gridTemplateColumns: `minmax(0, 1fr) ${size.w}px minmax(0, 1fr)` }}>
          <div className="flex flex-col items-center gap-7 pt-7">
            <div ref={slot('deck')} aria-hidden="true" style={{ width: small.w, height: small.h }} />
            <div className="flex w-full max-w-[260px] flex-col items-start gap-4">
              {label}
              {notes}
              {pencil}
            </div>
          </div>
          <div className="flex flex-col items-center">
            {cardLayer}
            {center}
          </div>
          {piles}
          {tools && <div className="col-start-2">{tools}</div>}
        </div>
      </div>
    </main>
  );
}

// Type mode: the answer is written on the card, on the line under the clue.
function TypedForm({ onCheck }: { onCheck: (typed: string | null) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) onCheck(draft.trim());
      }}
      className="flex flex-wrap items-end gap-x-2.5 gap-y-2"
    >
      <label className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brass-ink">
        <span aria-hidden="true">Your answer</span>
        <input
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
      <button type="button" onClick={() => onCheck(null)} className="min-h-11 px-1.5 text-[13.5px] font-semibold text-muted hover:underline">
        I don&apos;t know
      </button>
      <button type="submit" disabled={!draft.trim()} className="btn btn-primary min-h-11 rounded-full px-[18px]">
        Check
      </button>
    </form>
  );
}

// The pencil lying on the desk: opens the card editor.
function Pencil({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="desk-pencil flex min-h-11 flex-col items-start gap-1.5 text-xs font-medium text-on-desk/80 hover:text-on-desk">
      <svg width="132" height="22" viewBox="0 0 132 22" aria-hidden="true" className="-rotate-6 drop-shadow-[0_4px_4px_rgb(0_0_0/0.45)]">
        <path d="M1 11 L17 4 L17 18 Z" fill="#e8cfa6" />
        <path d="M1 11 L7 8.4 L7 13.6 Z" fill="#3a332a" />
        <rect x="17" y="4" width="87" height="14" fill="#d9a23f" />
        <rect x="17" y="9.5" width="87" height="3" fill="#c38c2c" />
        <rect x="104" y="3.5" width="12" height="15" rx="1" fill="#c9a45c" />
        <rect x="116" y="3.5" width="14" height="15" rx="3" fill="#c9786a" />
      </svg>
      Edit cards
    </button>
  );
}
