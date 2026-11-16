import type { TypedVerdict } from '@/lib/answer-check';
import { cardKind, isTrueFalseOptions, normalizeChoice } from '@/lib/card-rules';
import { MIXED_PARTS, type StudyMode } from '@/lib/study-types';

// What the study screens share: the card and result types, how an answer is
// scored and reported (the server scores the same way, in lib/attempts.ts),
// and what Read aloud says. Moved here unchanged from StudyViewer.tsx when the
// flashcards moved onto the desk (desk redesign, phase 2).

export interface StudyItem {
  id?: string;
  question: string;
  answer: string;
  options?: string[] | null;
  // Shown after answering, e.g. the corrected fact for a false statement (#68).
  explanation?: string | null;
  // Where the card comes from in the uploaded file: the sentence it is based on
  // and where that sits, e.g. "Page 3" (lib/source-quotes.ts). Missing for older
  // sets, photos and files without pages or lines.
  source?: string | null;
  sourceLocation?: string | null;
}

export type FlashcardMark = 'got' | 'missed';

// What the student did with one card, in study order (#57).
export interface StudyAnswer {
  cardId?: string;
  // Multiple choice: the option picked, or null if skipped. Matching (#67):
  // the term picked for this card's clue.
  chosen?: string | null;
  // Flipped flashcards: the student's own mark, or null if not marked.
  result?: FlashcardMark | null;
  // Typed answers (#66): what the student typed, or null if not answered.
  typed?: string | null;
}

export interface StudyResult {
  // How a flashcard set was studied (#66); left out for the normal way.
  mode?: StudyMode;
  answers: StudyAnswer[];
  correct: number;
  total: number;
}

// How the student answers a card: flip and mark it, pick an option, type, or
// match it with a term in a round of cards (#67).
export type Interaction = 'flip' | 'choice' | 'typed' | 'match';

// What the student did with one card, while studying.
export interface CardAnswer {
  chosen?: string;
  result?: FlashcardMark;
  // Null for "I don't know".
  typed?: string | null;
  verdict?: TypedVerdict;
}

// Ends the text with a full stop unless it already ends a sentence, so the
// voice pauses between the parts it reads.
export const asSentence = (text: string) => (/[.?!…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

// What Read aloud says for what's on screen (#77): the question (with the
// choices, or "True or false?"), the answer once a flashcard is flipped, and the
// right answer and any explanation once a question is answered. In matching,
// the round's clues.
export function cardSpeech(
  interaction: Interaction,
  card: StudyItem | undefined,
  roundCards: { card: StudyItem }[],
  flipped: boolean,
  answer: CardAnswer | undefined
): string {
  if (interaction === 'match') {
    return ['Match each clue with its term.', ...roundCards.map((c, i) => `Clue ${i + 1}. ${asSentence(c.card.question)}`)].join(' ');
  }
  if (!card) return '';
  if (interaction === 'flip') return flipped ? card.answer : card.question;
  const trueFalse = isTrueFalseOptions(card.options);
  const parts = [trueFalse ? `True or false? ${asSentence(card.question)}` : asSentence(card.question)];
  if (interaction === 'choice' && !trueFalse && card.options?.length) parts.push(`Choices: ${card.options.map(asSentence).join(' ')}`);
  if (answer !== undefined) {
    parts.push(`The answer is ${asSentence(card.answer)}`);
    if (card.explanation) parts.push(asSentence(card.explanation));
  }
  return parts.join(' ');
}

// A matched term counts if it reads the same as this card's answer (two cards
// may share one), the same rule the server uses.
export const sameTerm = (a: string | undefined, b: string) => a !== undefined && normalizeChoice(a) === normalizeChoice(b);

export function isCorrect(interaction: Interaction, card: StudyItem, a: CardAnswer | undefined): boolean {
  if (!a) return false;
  if (interaction === 'choice') return a.chosen === card.answer;
  if (interaction === 'match') return sameTerm(a.chosen, card.answer);
  if (interaction === 'typed') return a.verdict === 'correct' || a.verdict === 'close';
  return a.result === 'got';
}

export function reportAnswer(interaction: Interaction, card: StudyItem, a: CardAnswer | undefined): StudyAnswer {
  if (interaction === 'choice' || interaction === 'match') return { cardId: card.id, chosen: a?.chosen ?? null };
  if (interaction === 'typed') return { cardId: card.id, typed: a?.typed ?? null };
  return { cardId: card.id, result: a?.result ?? null };
}

// A mixed quiz (#69) is studied part by part (I, II, III), keeping the saved
// order within each part.
export function byPart(cards: StudyItem[]): StudyItem[] {
  const part = (c: StudyItem) => MIXED_PARTS.findIndex((p) => p.kind === cardKind(c.options));
  return cards.map((c, i) => ({ c, i })).sort((a, b) => part(a.c) - part(b.c) || a.i - b.i).map(({ c }) => c);
}

// Fisher-Yates. A list of 2 or more never keeps its order, so in matching the
// answer is never just "the same position".
export function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((t, i) => t === items[i])) out.push(out.shift()!);
  return out;
}
