'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import Pencil from '@/components/desk/Pencil';
import { deckSpot, MAX_LAYERS, middleSpot, pileSpot, spotTransform, useDeskLayout, type Slots, type Spot } from '@/components/desk/useDeskLayout';
import { checkTypedAnswer } from '@/lib/answer-check';
import { cardKind } from '@/lib/card-rules';
import { speak, stopSpeaking, useAutoRead, useCanSpeak } from '@/lib/speech';
import { MIXED_PARTS, STUDY_TYPE_LABELS, type StudyType } from '@/lib/study-types';
import AnswerSlips from './AnswerSlips';
import { byPart, cardSpeech, isCorrect, reportAnswer, type CardAnswer, type FlashcardMark, type Interaction, type StudyItem, type StudyResult } from './logic';
import SourceNote from './SourceNote';
import StudyTools from './StudyTools';
import TypedForm from './TypedForm';
import { ChoiceVerdictLine, DeskHeader, TypedVerdictLine } from './parts';
import { clueSize } from './sizes';

// The Right pile lies where a flashcard deck's Got it pile does, and the Wrong
// pile where Missed it does, so the piles keep those names inside the desk.
type Pile = FlashcardMark;
const PILE_WORDS: Record<Pile, string> = { got: 'Right', missed: 'Wrong' };

type Part = (typeof MIXED_PARTS)[number];

// One sheet of the quiz deck: a question, or (mixed quiz, #69) the card that
// opens a part.
type Sheet = { kind: 'question'; index: number } | { kind: 'part'; part: Part; number: number; count: number };

// The deck in order. A mixed quiz has a card before each part (Part I, II, III).
function quizSheets(cards: StudyItem[], mixed: boolean): Sheet[] {
  if (!mixed) return cards.map((_, index) => ({ kind: 'question', index }));
  const sheets: Sheet[] = [];
  MIXED_PARTS.forEach((part, n) => {
    const inPart = cards.flatMap((c, index) => (cardKind(c.options) === part.kind ? [index] : []));
    if (inPart.length === 0) return;
    sheets.push({ kind: 'part', part, number: n + 1, count: inPart.length });
    for (const index of inPart) sheets.push({ kind: 'question', index });
  });
  return sheets;
}

// The deck as it lies on the desk.
interface QuizDeck {
  // This time through, in order (positions in the sheets).
  order: number[];
  // How many sheets of `order` are done.
  pos: number;
  // The pile each answered question lies on, by its position in the sheets.
  pile: Record<number, Pile>;
  // Answered questions in the order they landed, so each pile stacks up in order.
  landed: number[];
  // Going over the Wrong pile again: practice, so it isn't reported.
  practice: boolean;
}

const freshDeck = (sheetCount: number): QuizDeck => ({
  order: Array.from({ length: sheetCount }, (_, i) => i),
  pos: 0,
  pile: {},
  landed: [],
  practice: false,
});

const questionsWord = (n: number) => `${n} question${n === 1 ? '' : 's'}`;
const partOf = (c: StudyItem) => MIXED_PARTS.find((p) => p.kind === cardKind(c.options)) ?? MIXED_PARTS[0];

// A sheet that is done but goes on no pile (a part's card, once begun) is put
// aside: it lifts off above the card and fades.
function asideSpot(slots: Slots): Spot | null {
  const middle = slots.card;
  if (!middle) return null;
  return { x: middle.x, y: middle.y - middle.h * 0.9, r: -6, s: 0.8 };
}

export interface QuizDeskProps {
  title: string;
  studyType: StudyType;
  cards: StudyItem[];
  onFinish?: () => void;
  onExit?: () => void;
  // Shows the pencil, which opens the card editor.
  onEdit?: () => void;
  onComplete?: (result: StudyResult) => void;
  completionSlot?: ReactNode;
  saveSlot?: ReactNode;
  quoteLabel?: string;
  // Fade and rise in on mount (StudyViewer).
  arrive?: boolean;
  // How many questions the quiz will have, while the AI is still writing it, so the
  // count can read "4 of 10" and go up as each question is written.
  expected?: number;
}

// Quizzes on the desk (desk redesign, phase 4): multiple choice, true or false
// (#68) and the mixed quiz (#69). The deck lies on the left, the question card
// in the middle with its answers as paper slips underneath, and each answered
// card goes to the Right or Wrong pile on the right (on a phone, the deck peeks
// out above the card and the piles are trays at the bottom). A mixed quiz goes
// part by part, each opened by its own card, and Part III is typed. At the end,
// the Wrong pile can be gone over again for practice.
export default function QuizDesk({
  title,
  studyType,
  cards: givenCards,
  onFinish,
  onExit,
  onEdit,
  onComplete,
  completionSlot,
  saveSlot,
  quoteLabel = 'From the document',
  arrive = false,
  expected,
}: QuizDeskProps) {
  const mixed = studyType === 'mixed';
  // A mixed quiz goes part by part (#69), keeping the saved order within each.
  const cards = useMemo(() => (mixed ? byPart(givenCards) : givenCards), [givenCards, mixed]);
  const sheets = useMemo(() => quizSheets(cards, mixed), [cards, mixed]);
  const total = cards.length;

  const [deck, setDeck] = useState<QuizDeck>(() => freshDeck(sheets.length));
  // Questions can arrive while the student is already answering (the AI is still
  // writing the quiz): each new one goes to the back of the deck. Done during
  // render, so a new sheet is never drawn without its place. (A mixed quiz always
  // arrives whole.)
  const [seenSheets, setSeenSheets] = useState(sheets.length);
  if (sheets.length > seenSheets) {
    setSeenSheets(sheets.length);
    setDeck((d) => ({
      ...d,
      order: [...d.order, ...Array.from({ length: sheets.length - seenSheets }, (_, k) => seenSheets + k)],
    }));
  }
  // The first time through: the answer to each question (by position in
  // `cards`), for the score.
  const [answers, setAnswers] = useState<Record<number, CardAnswer>>({});
  // The answer to the card in the middle, until it goes to a pile.
  const [answer, setAnswer] = useState<CardAnswer | null>(null);
  // The sheet on its way to a pile (or aside) keeps its words until it lands.
  const [flying, setFlying] = useState<number | null>(null);
  // Bumped on every restart and every new pass, so slips and typed answers
  // start fresh.
  const [run, setRun] = useState(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const doneRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  // The words of the card in the middle (a question, or a part's name), for
  // focus to land on after Next.
  const questionRef = useRef<HTMLParagraphElement>(null);
  const partRef = useRef<HTMLHeadingElement>(null);
  const movedOn = useRef(false);
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

  // Part III of a mixed quiz is typed; everything else is picked from slips.
  const interactionFor = (c: StudyItem): Interaction => (mixed && cardKind(c.options) === 'identification' ? 'typed' : 'choice');

  const finished = deck.pos >= deck.order.length;
  const current = finished ? undefined : deck.order[deck.pos];
  const sheet = current === undefined ? undefined : sheets[current];
  const card = sheet?.kind === 'question' ? cards[sheet.index] : undefined;
  const interaction: Interaction = card ? interactionFor(card) : 'choice';
  const rightList = deck.landed.filter((s) => deck.pile[s] === 'got');
  const wrongList = deck.landed.filter((s) => deck.pile[s] === 'missed');
  const isQuestion = (s: number) => sheets[s].kind === 'question';
  const passCount = deck.order.filter(isQuestion).length;
  const passDone = deck.order.slice(0, deck.pos).filter(isQuestion).length;

  const { stageRef, slot, kind, card: flashcard, slots, settled } = useDeskLayout(`${finished}|${run}|${deck.pos}|${answer ? 1 : 0}`);
  // On a laptop the question card is lower than a flashcard (about 290 high), so
  // the answers and Next fit under it on a 768-pixel-high screen. On a phone
  // it's taller than a flashcard, as the narrow card also has to hold the
  // verdict, the correction and the quote.
  const size =
    kind === 'laptop'
      ? { w: flashcard.w, h: Math.max(290, Math.round(flashcard.w * 0.52)) }
      : { w: flashcard.w, h: Math.round(Math.min(420, Math.max(260, flashcard.w * 0.9))) };

  // Read aloud (#77). With Auto on, each card is read as it comes to the
  // middle. Moving on stops what's being read.
  const speechAvailable = useCanSpeak();
  const [autoRead, setAutoRead] = useAutoRead();
  const speech = !sheet
    ? ''
    : sheet.kind === 'part'
      ? `Part ${sheet.number}. ${sheet.part.label}. ${questionsWord(sheet.count)}.`
      : cardSpeech(interaction, card, [], false, answer ?? undefined);
  useEffect(() => {
    if (autoRead && speech) speak(speech);
    else stopSpeaking();
    // Only when another card is shown, not again after each answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, finished, deck.pos, run]);
  useEffect(() => stopSpeaking, []);

  // Keyboard focus follows the work: to Next once a question is answered, to
  // the next card's words after Next (a typed question puts it on the line to
  // type on instead), and to the score when the quiz is done.
  useEffect(() => {
    if (answer) nextRef.current?.focus();
  }, [answer]);
  useEffect(() => {
    if (!movedOn.current) return;
    movedOn.current = false;
    if (finished) doneRef.current?.focus();
    else (questionRef.current ?? partRef.current)?.focus();
  }, [deck.pos, run, finished]);

  const fly = (s: number) => {
    setFlying(s);
    later(() => setFlying((f) => (f === s ? null : f)), 700);
  };

  const report = (final: Record<number, CardAnswer>) =>
    onComplete?.({
      answers: cards.map((c, i) => reportAnswer(interactionFor(c), c, final[i])),
      correct: cards.filter((c, i) => isCorrect(interactionFor(c), c, final[i])).length,
      total,
    });

  const pick = (option: string) => {
    if (!card || answer || interaction !== 'choice') return;
    setAnswer({ chosen: option });
  };

  const checkTyped = (typed: string | null) => {
    if (!card || answer || interaction !== 'typed') return;
    setAnswer(typed === null ? { typed: null, verdict: 'wrong' } : { typed, verdict: checkTypedAnswer(typed, card.answer) });
  };

  // On to the next sheet. An answered question goes to the Right or Wrong
  // pile; the first time through, its answer counts, and the last question
  // reports the run (#57). A part's card is put aside.
  const next = () => {
    if (current === undefined || !sheet) return;
    if (sheet.kind === 'question' && !answer) return;
    movedOn.current = true;
    fly(current);
    const nextPos = deck.pos + 1;
    if (sheet.kind === 'part' || !answer) {
      setDeck({ ...deck, pos: nextPos });
      return;
    }
    const right = isCorrect(interaction, cards[sheet.index], answer);
    setDeck({ ...deck, pos: nextPos, pile: { ...deck.pile, [current]: right ? 'got' : 'missed' }, landed: [...deck.landed, current] });
    setAnswer(null);
    if (deck.practice) return;
    const nextAnswers = { ...answers, [sheet.index]: answer };
    setAnswers(nextAnswers);
    if (nextPos >= deck.order.length) report(nextAnswers);
  };

  // The Wrong pile, dealt again: those questions go back into the deck and the
  // Right pile stays where it is.
  const goOverWrong = () => {
    if (!finished || wrongList.length === 0) return;
    movedOn.current = true;
    setDeck({ order: wrongList, pos: 0, pile: Object.fromEntries(rightList.map((s) => [s, 'got' as const])), landed: rightList, practice: true });
    setAnswer(null);
    setRun((r) => r + 1);
  };

  const startOver = () => {
    movedOn.current = true;
    setDeck(freshDeck(sheets.length));
    setAnswers({});
    setAnswer(null);
    setRun((r) => r + 1);
  };

  // Where each sheet lies: on a pile, in the middle, in the deck, or put aside.
  const placed = slots ?? {};
  const place = (s: number): { spot: Spot | null; z: number; shown: boolean } => {
    const pile = deck.pile[s];
    if (pile) {
      const list = pile === 'got' ? rightList : wrongList;
      const j = list.indexOf(s);
      return { spot: pileSpot(kind, placed, size, pile, j), z: 200 + j, shown: list.length - j <= MAX_LAYERS };
    }
    if (s === current) return { spot: middleSpot(placed, false), z: 300, shown: true };
    const k = deck.order.indexOf(s);
    if (k > deck.pos) {
      const depth = k - deck.pos - 1;
      return { spot: deckSpot(kind, placed, size, depth), z: 100 - Math.min(depth, 90), shown: depth < MAX_LAYERS };
    }
    return { spot: asideSpot(placed), z: 250, shown: false };
  };

  const pad = kind === 'phone' ? 'px-5 pb-4 pt-4' : 'px-[34px] pb-[22px] pt-[26px]';

  // A question card. `full` adds what you see and use on the card in the
  // middle: the verdict, the correction and the quote once it's answered, or
  // the line to type on.
  const questionFace = (i: number, full: boolean) => {
    const c = cards[i];
    const part = partOf(c);
    const typed = interactionFor(c) === 'typed';
    const given = full ? answer : null;
    // The question keeps all its lines: when the card holds more than fits, the
    // whole card scrolls rather than squeezing the question.
    return (
      <div className={`flex h-full flex-col gap-2 overflow-y-auto ${pad}`}>
        <div className="flex items-baseline justify-between gap-3 text-left">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">{mixed ? `Part ${part.numeral} · ${part.label}` : part.label}</span>
          <span className="text-[12.5px] tabular-nums text-muted">
            {i + 1}/{total}
          </span>
        </div>
        <div className="flex flex-1 shrink-0">
          <p
            ref={full && !typed ? questionRef : undefined}
            tabIndex={full && !typed ? -1 : undefined}
            className="my-auto font-serif leading-[1.3] [text-wrap:pretty]"
            style={{ fontSize: clueSize(c.question, kind, full && (!!given || typed)) }}
          >
            {c.question}
          </p>
        </div>
        {given &&
          (typed ? (
            <TypedVerdictLine card={c} answer={given} className="font-serif text-[17px] italic" />
          ) : (
            <ChoiceVerdictLine card={c} picked={given.chosen} className="font-serif text-[17px] italic" />
          ))}
        {given && c.explanation && <p className="border-l-2 border-brass pl-3 text-[14.5px] leading-snug text-ink/80">{c.explanation}</p>}
        {given && <SourceNote card={c} label={quoteLabel} className="[&>p:last-child]:line-clamp-2" />}
        {full && typed && !given && <TypedForm key={`${run}-${i}`} onCheck={checkTyped} />}
      </div>
    );
  };

  // The card that opens a part of a mixed quiz.
  const partFace = (sh: Extract<Sheet, { kind: 'part' }>, full: boolean) => (
    <div className={`flex h-full flex-col items-center justify-center gap-1.5 text-center ${pad}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-ink">{`${STUDY_TYPE_LABELS.mixed} · ${title}`}</p>
      <h2
        ref={full ? partRef : undefined}
        tabIndex={full ? -1 : undefined}
        className={`font-serif leading-none ${kind === 'phone' ? 'text-5xl' : 'text-[58px]'}`}
      >
        Part {sh.part.numeral}
      </h2>
      <p className="font-serif text-[22px] italic text-ink/80">{sh.part.label}</p>
      <p className="text-[13px] text-muted">
        {questionsWord(sh.count)}
        {sh.part.kind === 'identification' ? ' · write the term' : ''}
      </p>
    </div>
  );

  const face = (s: number, full: boolean) => {
    const sh = sheets[s];
    return sh.kind === 'part' ? partFace(sh, full) : questionFace(sh.index, full);
  };

  // Every sheet, drawn where it lies. Only the card in the middle is there for
  // screen readers; the rest are paper on the desk.
  const cardLayer = (
    <div className="pointer-events-none absolute inset-0 z-10">
      {sheets.map((_, s) => {
        const { spot, z, shown } = place(s);
        const isCurrent = s === current;
        const isFlying = s === flying && !isCurrent;
        return (
          <div
            key={s}
            aria-hidden={isCurrent ? undefined : true}
            className={`desk-card absolute left-0 top-0 ${settled ? 'is-settled' : ''} ${isCurrent ? 'is-up' : ''}`}
            style={{
              width: size.w,
              height: size.h,
              transform: spot ? spotTransform(spot, size) : undefined,
              zIndex: z,
              opacity: spot && shown ? 1 : 0,
              pointerEvents: isCurrent ? 'auto' : 'none',
              willChange: isCurrent || isFlying ? 'transform' : undefined,
            }}
          >
            <div className="paper paper-card-face text-ink">{isCurrent || isFlying ? face(s, isCurrent) : null}</div>
          </div>
        );
      })}
    </div>
  );

  const right = rightList.length;
  const wrong = wrongList.length;
  const small = { w: Math.round(size.w * 0.42), h: Math.round(size.h * 0.42) };
  const countClass = (pile: Pile, onDesk: boolean) =>
    `ml-1.5 tabular-nums ${pile === 'got' ? (onDesk ? 'text-[#e2c887]' : 'text-brass-ink') : onDesk ? 'text-[#efb2a8]' : 'text-pencil'}`;
  const pileCount = (pile: Pile) => (pile === 'got' ? right : wrong);

  // The piles are only paper on the desk: answers are given on the slips, and
  // their counts are read out with the progress above the desk.
  const piles =
    kind === 'laptop' ? (
      <div aria-hidden="true" className="flex flex-col items-center gap-7 pt-2">
        {(['got', 'missed'] as const).map((pile, k) => (
          <div key={pile} className="flex flex-col items-start">
            <div
              className={`paper relative z-20 -mb-3 ml-3.5 rounded px-3.5 py-1 text-[13.5px] font-semibold text-ink shadow-[0_6px_12px_-8px_rgb(0_0_0/0.6)] ${k ? 'rotate-[1.5deg]' : '-rotate-2'}`}
            >
              {PILE_WORDS[pile]}
              <span className={countClass(pile, false)}>{pileCount(pile)}</span>
            </div>
            <div ref={slot(pile)} className="desk-spot" style={{ width: small.w + 28, height: small.h + 28 }} />
          </div>
        ))}
      </div>
    ) : (
      <div aria-hidden="true" className="mt-5 grid w-full grid-cols-2 gap-2">
        {(['missed', 'got'] as const).map((pile) => (
          <div key={pile} ref={slot(pile)} className="desk-spot flex h-24 w-full items-start px-3 py-2">
            <span className="text-[13px] font-semibold text-on-desk">
              {PILE_WORDS[pile]}
              <span className={countClass(pile, true)}>{pileCount(pile)}</span>
            </span>
          </div>
        ))}
      </div>
    );

  // Mixed quiz (#69): the score of each part as well.
  const partScores = mixed
    ? MIXED_PARTS.map((p) => {
        const inPart = sheets.flatMap((sh, s) => (sh.kind === 'question' && cardKind(cards[sh.index].options) === p.kind ? [s] : []));
        return { ...p, total: inPart.length, right: inPart.filter((s) => deck.pile[s] === 'got').length };
      }).filter((p) => p.total > 0)
    : [];
  const typos = Object.values(answers).filter((a) => a.verdict === 'close').length;

  const doneNote = (
    <section ref={doneRef} tabIndex={-1} aria-labelledby={doneId} className="paper paper-shadow w-full max-w-[460px] -rotate-1 rounded-lg px-7 pb-6 pt-7 text-left text-ink">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass-ink">{deck.practice ? 'Practice round done' : `${STUDY_TYPE_LABELS[studyType]} · done`}</p>
      <h2 id={doneId} className="mt-2 text-4xl tabular-nums">
        {right} / {total}
      </h2>
      <p className="mt-1 text-muted">{deck.practice ? 'on the Right pile' : `${Math.round((right / total) * 100)}% correct`}</p>
      {partScores.length > 0 && (
        <ul aria-label="Score by part" className="mt-3 border-t border-ink/15">
          {partScores.map((p) => (
            <li key={p.kind} className="flex items-baseline justify-between gap-4 border-b border-ink/15 py-2">
              <span>
                <span className="font-serif text-lg">Part {p.numeral}</span>
                <span className="text-sm text-muted"> · {p.label}</span>
              </span>
              <span className="font-serif text-lg tabular-nums">
                {p.right} / {p.total}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!deck.practice && typos > 0 && <p className="mt-2 text-sm text-muted">{typos} with a small typo</p>}
      <p className="mt-3 text-[15px] text-ink/80">
        {wrong > 0
          ? `The Wrong pile has ${wrong === 1 ? 'one question' : `${wrong} questions`} to go over.`
          : deck.practice
            ? 'Every question is on the Right pile now.'
            : 'Every answer was right.'}
      </p>
      {deck.practice && onComplete && <p className="mt-1 text-sm text-muted">Your saved score is from the first time through.</p>}
      {completionSlot && <div className="mt-4">{completionSlot}</div>}
      <div className="mt-5 flex flex-wrap gap-3">
        {wrong > 0 && (
          <button type="button" onClick={goOverWrong} className="btn btn-primary w-full">
            Try the wrong ones again
          </button>
        )}
        <button type="button" onClick={startOver} className="btn btn-secondary flex-1">
          Start over
        </button>
        {onFinish && (
          <button type="button" onClick={onFinish} className={`btn flex-1 ${wrong > 0 ? 'btn-secondary' : 'btn-primary'}`}>
            Done
          </button>
        )}
      </div>
    </section>
  );

  // What Next says: begin a part, go on to the next one, or see the score.
  const after = current === undefined ? undefined : sheets[deck.order[deck.pos + 1]];
  const nextLabel =
    sheet?.kind === 'part'
      ? `Begin Part ${sheet.part.numeral} →`
      : !after
        ? 'See your score →'
        : after.kind === 'part'
          ? `On to Part ${after.part.numeral} →`
          : card && cardKind(card.options) === 'true_false'
            ? 'Next statement →'
            : 'Next question →';
  const ready = sheet?.kind === 'part' || !!answer;

  // Under the card: the answers to pick from, then Next. Next keeps its place
  // while it's hidden, so the desk doesn't jump when it appears.
  const underCard = finished ? null : (
    <div className="mt-4 flex w-full flex-col items-center gap-4" style={{ maxWidth: size.w }}>
      {card && interaction === 'choice' && (
        <AnswerSlips key={`${run}-${current}`} options={card.options ?? []} answer={card.answer} picked={answer?.chosen} onPick={pick} kind={kind} />
      )}
      <div className="flex min-h-12 w-full items-center justify-center">
        {ready && (
          <button ref={nextRef} type="button" onClick={next} className={`btn btn-primary min-h-12 rounded-full px-7 text-[15px] ${kind === 'phone' ? 'w-full' : ''}`}>
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );

  // The card in the middle sits on this slot.
  const center = finished ? doneNote : <div ref={slot('card')} className="shrink-0" style={{ width: size.w, height: size.h }} />;

  const progress = finished
    ? 'All done'
    : sheet?.kind === 'part'
      ? `Part ${sheet.part.numeral} · ${sheet.part.label}`
      : `Question ${passDone + 1} of ${Math.max(passCount, expected ?? 0)}`;
  const header = <DeskHeader onExit={onExit} progress={progress} tally={`. Right ${right}, Wrong ${wrong}.`} />;

  const label = (
    <div className="paper paper-shadow -rotate-1 rounded px-4 py-2.5 text-ink">
      <h1 className="text-[19px] leading-tight">{title}</h1>
      <p className="mt-0.5 text-[12.5px] text-muted">{expected !== undefined && expected > total ? `${STUDY_TYPE_LABELS[studyType]} · ${total} of ${expected} questions written` : `${STUDY_TYPE_LABELS[studyType]} · ${questionsWord(total)}`}</p>
    </div>
  );
  const notes = saveSlot ? <div className="paper paper-shadow rounded px-4 py-3 text-sm text-ink">{saveSlot}</div> : null;
  const pencil = onEdit ? <Pencil onClick={onEdit} /> : null;
  const tools =
    finished || !speechAvailable ? null : (
      <StudyTools speechAvailable={speechAvailable} onSpeak={() => speak(speech)} autoRead={autoRead} onAutoRead={setAutoRead} />
    );

  if (kind === 'phone') {
    return (
      <main className={`on-desk w-full pb-4${arrive ? ' desk-arrive' : ''}`}>
        <div ref={stageRef} className="relative mx-auto w-full">
          {header}
          <div className="mt-2">{label}</div>
          <div className="mt-4 flex flex-col items-center">
            {/* Where the deck peeks out above the card. */}
            {!finished && <div aria-hidden="true" className="h-9" />}
            {cardLayer}
            {center}
            {underCard}
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
    <main className={`on-desk w-full pb-6${arrive ? ' desk-arrive' : ''}`}>
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
            {underCard}
          </div>
          {piles}
          {tools && <div className="col-start-2">{tools}</div>}
        </div>
      </div>
    </main>
  );
}
