'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { FlashcardMode } from '@/lib/study-types';
import type { CardAnswer, FlashcardMark, StudyItem } from './logic';

export type Pile = FlashcardMark;

export interface DeckState {
  // Study order (positions in `cards`), preserving shuffles and incoming cards
  order: number[];
  // How many cards of `order` are done (currentCardIndex)
  pos: number;
  // The pile each finished card lies on
  pile: Record<number, Pile>;
  // Finished cards in the order they landed
  landed: number[];
  // Practice pass for missed cards
  practice: boolean;
}

export const freshDeck = (count: number, initialOrder?: number[]): DeckState => ({
  order: initialOrder ?? Array.from({ length: count }, (_, i) => i),
  pos: 0,
  pile: {},
  landed: [],
  practice: false,
});

export interface SessionProgress {
  pos: number;
  pile: Record<number, Pile>;
  landed: number[];
  practice: boolean;
  answers: Record<number, CardAnswer>;
}

export interface StudySessionContextValue {
  // Aliases for lifted state requested by architecture
  currentCardIndex: number;
  deckOrder: number[];
  sessionProgress: SessionProgress;
  // Full deck and session state
  deck: DeckState;
  answers: Record<number, CardAnswer>;
  mode: FlashcardMode;
  run: number;

  // Actions
  setMode: (mode: FlashcardMode) => void;
  setDeck: React.Dispatch<React.SetStateAction<DeckState>>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, CardAnswer>>>;
  setRun: React.Dispatch<React.SetStateAction<number>>;
  land: (
    results: { index: number; pile: Pile; answer: CardAnswer }[],
    nextPos: number,
    onReport?: (answers: Record<number, CardAnswer>) => void
  ) => void;
  dealMissed: (missedList: number[], gotList: number[]) => void;
  restart: () => void;
}

export const StudySessionContext = createContext<StudySessionContextValue | null>(null);

export function useStudySession(): StudySessionContextValue {
  const ctx = useContext(StudySessionContext);
  if (!ctx) {
    throw new Error('useStudySession must be used within a StudySessionProvider');
  }
  return ctx;
}

export interface StudySessionProviderProps {
  cards: StudyItem[];
  initialMode?: FlashcardMode;
  deckKey?: string;
  children: ReactNode;
}

export function StudySessionProvider({
  cards,
  initialMode = 'flip',
  deckKey,
  children,
}: StudySessionProviderProps) {
  const count = cards.length;
  const [mode, setModeState] = useState<FlashcardMode>(initialMode);
  const [deck, setDeck] = useState<DeckState>(() => freshDeck(count));
  const [answers, setAnswers] = useState<Record<number, CardAnswer>>({});
  const [run, setRun] = useState(0);

  const prevCardsRef = useRef(cards);
  const prevDeckKeyRef = useRef(deckKey ?? cards[0]?.id ?? cards[0]?.question ?? '');
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Detect when selecting a brand new deck (different cards/set) or when cards arrive via streaming,
  // so the session only resets when selecting a new deck or explicitly clicking Restart.
  const currentDeckKey = deckKey ?? cards[0]?.id ?? cards[0]?.question ?? '';
  useEffect(() => {
    const prevKey = prevDeckKeyRef.current;
    const prevCards = prevCardsRef.current;
    prevCardsRef.current = cards;
    prevDeckKeyRef.current = currentDeckKey;

    const isDifferentDeck = prevKey !== currentDeckKey;
    const isExtension =
      !isDifferentDeck &&
      cards.length >= prevCards.length &&
      prevCards.every((c, i) => (c.id && cards[i].id ? c.id === cards[i].id : c.question === cards[i].question));

    if (isDifferentDeck || !isExtension) {
      setDeck(freshDeck(cards.length));
      setAnswers({});
      setModeState('flip');
      setRun((r) => r + 1);
    } else if (cards.length > prevCards.length) {
      // Append newly streamed cards to deck order without resetting position
      const diff = cards.length - prevCards.length;
      setDeck((d) => ({
        ...d,
        order: [...d.order, ...Array.from({ length: diff }, (_, k) => prevCards.length + k)],
      }));
    }
  }, [cards, currentDeckKey]);

  // Mode changes ONLY swap the mode without resetting currentCardIndex, deckOrder, or piles.
  const setMode = useCallback((nextMode: FlashcardMode) => {
    setModeState(nextMode);
  }, []);

  // Explicit restart (Start over / Restart button) resets the deck to index 0.
  const restart = useCallback(() => {
    setDeck(freshDeck(cards.length));
    setAnswers({});
    setRun((r) => r + 1);
  }, [cards.length]);

  const dealMissed = useCallback((missedList: number[], gotList: number[]) => {
    setDeck({
      order: missedList,
      pos: 0,
      pile: Object.fromEntries(gotList.map((i) => [i, 'got' as const])),
      landed: gotList,
      practice: true,
    });
    setRun((r) => r + 1);
  }, []);

  const land = useCallback(
    (
      results: { index: number; pile: Pile; answer: CardAnswer }[],
      nextPos: number,
      onReport?: (answers: Record<number, CardAnswer>) => void
    ) => {
      setDeck((prevDeck) => ({
        ...prevDeck,
        pos: nextPos,
        pile: { ...prevDeck.pile, ...Object.fromEntries(results.map((r) => [r.index, r.pile])) },
        landed: [...prevDeck.landed, ...results.map((r) => r.index)],
      }));

      if (deckRef.current.practice) return;

      const nextAnswers = {
        ...answersRef.current,
        ...Object.fromEntries(results.map((r) => [r.index, r.answer])),
      };
      setAnswers(nextAnswers);
      if (nextPos >= deckRef.current.order.length && onReport) {
        onReport(nextAnswers);
      }
    },
    []
  );

  const value = useMemo<StudySessionContextValue>(
    () => ({
      currentCardIndex: deck.pos,
      deckOrder: deck.order,
      sessionProgress: {
        pos: deck.pos,
        pile: deck.pile,
        landed: deck.landed,
        practice: deck.practice,
        answers,
      },
      deck,
      answers,
      mode,
      run,
      setMode,
      setDeck,
      setAnswers,
      setRun,
      land,
      dealMissed,
      restart,
    }),
    [deck, answers, mode, run, setMode, restart, dealMissed, land]
  );

  return (
    <StudySessionContext.Provider value={value}>
      {children}
    </StudySessionContext.Provider>
  );
}
