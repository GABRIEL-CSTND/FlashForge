import { CARD_LIMITS, normalizeChoice, toTrueFalse, TRUE_FALSE_OPTIONS } from '@/lib/card-rules';
import { MAX_SOURCE_CHARS } from '@/lib/sources';
import { createSourceChecker, sampleText, type SourceUnits } from '@/lib/source-quotes';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_QUESTION_COUNT,
  MIXED_PARTS,
  mixedSplit,
  type Difficulty,
  type MixedPartKind,
  type StudyType,
} from '@/lib/study-types';

export type { StudyType };

// Models are tried in order; each has its own free-tier quota. A 429 (quota used
// up) moves to the next model immediately, so once both Gemini models hit their
// daily limit every request lands on Gemma 4 automatically, and goes back to
// Gemini as soon as its quota resets.
//
// Gemma 4 is only the last-resort backup: it's much slower (~26-33s) and less
// reliable (intermittent 500s and hangs). It also needs a different request:
// - `responseSchema` returns HTTP 500 and any `thinkingConfig` returns HTTP 400.
// - `responseJsonSchema` (with minItems) is fast (~9s) because it skips thinking,
//   but the output degenerates into garbage ("Taxonomy-set-3-A-R-C", repeated
//   phrases, HTML). Without minItems it just returns `[]`.
// - Plain JSON mode works and gives good cards, but Gemma always thinks first
//   (~860 thought tokens, ~26s for 10 cards) and returns the thoughts as separate
//   parts before the answer.
// - It intermittently returns HTTP 500 or hangs with no response.
// So Gemma gets plain JSON mode with the format described in the prompt, one long
// attempt, and every item is checked by looksBroken() before it reaches the UI.
type ModelFamily = 'gemini' | 'gemma';

interface ModelConfig {
  id: string;
  family: ModelFamily;
  attempts: number;
  // For a 10-question guide. Bigger guides take longer to write, so each
  // question over 10 adds perExtraItemMs (#65).
  timeoutMs: number;
  perExtraItemMs: number;
}

const MODEL_CHAIN: ModelConfig[] = [
  { id: 'gemini-3.5-flash', family: 'gemini', attempts: 2, timeoutMs: 25_000, perExtraItemMs: 500 },
  { id: 'gemini-3.5-flash-lite', family: 'gemini', attempts: 2, timeoutMs: 25_000, perExtraItemMs: 500 },
  { id: 'gemma-4-26b-a4b-it', family: 'gemma', attempts: 1, timeoutMs: 40_000, perExtraItemMs: 1_500 },
];
// The models in the order they're tried: the main one first, then the backups (#62).
export const MODEL_IDS = MODEL_CHAIN.map((m) => m.id);
// About how many requests a day the free tier allows on the main model (#45).
export const MAIN_MODEL_DAILY_QUOTA = 20;
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Gemini 3.x models "think" before answering by default. Flashcards don't need
// deep reasoning, so keep it low to cut latency.
const THINKING_LEVEL = 'low';

// Retry budget. The whole generation (all attempts + backoff) must finish
// within TOTAL_BUDGET_MS so the user isn't left waiting indefinitely.
const TOTAL_BUDGET_MS = 75_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// Items that fail validation are dropped, so ask for a few spares to still end
// up with the count the user chose (#65): 10 flashcards -> 11, 10 multiple
// choice -> 12. Multiple choice fails validation more often.
type SingleType = Exclude<StudyType, 'mixed'>;
const SPARE_RATIO: Record<SingleType, number> = {
  flashcard: 0.1,
  multiple_choice: 0.2,
  true_false: 0.1,
};
// A mixed quiz (#69) asks for each part's share plus that kind's spares.
const PART_TYPE: Record<MixedPartKind, SingleType> = {
  multiple_choice: 'multiple_choice',
  true_false: 'true_false',
  identification: 'flashcard',
};
export function mixedRequest(count: number): Record<MixedPartKind, number> {
  const split = mixedSplit(count);
  const ask = (kind: MixedPartKind) => split[kind] + Math.ceil(split[kind] * SPARE_RATIO[PART_TYPE[kind]]);
  return { multiple_choice: ask('multiple_choice'), true_false: ask('true_false'), identification: ask('identification') };
}
export function requestedCount(studyType: StudyType, count: number): number {
  if (studyType === 'mixed') return Object.values(mixedRequest(count)).reduce((a, b) => a + b, 0);
  return count + Math.ceil(count * SPARE_RATIO[studyType]);
}
// A response with fewer usable items than this (6 of 10) counts as a failed
// attempt, so the next model is tried.
export function minValidItems(count: number): number {
  return Math.ceil(count * 0.6);
}

const BUSY_MESSAGE = 'The AI is busy right now. Please try again in a minute.';
const GENERIC_MESSAGE = 'Something went wrong while generating your study guide. Please try again.';

export interface GeneratedItem {
  question: string;
  answer: string;
  options?: string[];
  // True or false (#68): the corrected fact for a false statement.
  explanation?: string;
  // Where the card comes from in the uploaded text: the sentence it is based on,
  // and where that sits, e.g. "Page 3" (lib/source-quotes.ts). Only for text
  // sources, and only when the sentence is really in the text.
  source?: string;
  sourceLocation?: string;
}

// `message` is the detailed reason for server logs; `userMessage` is safe to
// show in the UI. `unreadable`: the AI found nothing to study in an attached
// file (#72), so trying again won't help.
export class GeminiError extends Error {
  userMessage: string;
  retryable: boolean;
  status?: number;
  unreadable: boolean;

  constructor(
    message: string,
    opts: { retryable: boolean; status?: number; userMessage?: string; unreadable?: boolean }
  ) {
    super(message);
    this.name = 'GeminiError';
    this.retryable = opts.retryable;
    this.status = opts.status;
    this.unreadable = opts.unreadable ?? false;
    this.userMessage = opts.userMessage ?? (opts.retryable ? BUSY_MESSAGE : GENERIC_MESSAGE);
  }
}

// A photo (#72) or scanned PDF (#73) the AI reads itself, instead of text
// taken out of a file.
export interface Attachment {
  mimeType: string;
  // Base64.
  data: string;
}

// Reading a photo takes longer: a 5-question guide from one took 19.5s on
// gemini-3.5-flash (2026-10-24), against about 1.4-12s from text.
const ATTACHMENT_EXTRA_MS = 15_000;

const isPdf = (attachment: Attachment) => attachment.mimeType === 'application/pdf';
const nothingToRead = (attachment: Attachment) =>
  `We couldn't find any notes to study in this file. Try ${isPdf(attachment) ? 'a clearer scan' : 'a clearer, brighter photo'}, or paste the text.`;

const TYPE_INSTRUCTIONS: Record<SingleType, string> = {
  flashcard: `Create identification-style flashcards.
- "question": a clue, description, or definition that points to exactly one specific term, name, date, number, or concept from the text.
- "answer": that term itself, 1 to 4 words. Never a sentence or an explanation.
- Never ask "What is X?" when the answer would be a definition. Flip it: put the definition in the question and X as the answer.
- Do not write questions that ask the reader to explain, describe, compare, discuss, or list, and do not start questions with "Why" or "How".
- Every answer must be different; don't make two cards about the same term.
- No "options" field.

Examples of the format (not the content):
- question: "Pigment in chloroplasts that absorbs light energy for photosynthesis" → answer: "Chlorophyll"
- question: "Organelle that produces most of the cell's ATP" → answer: "Mitochondria"
- question: "Year the Treaty of Paris ended the Spanish-American War" → answer: "1898"`,
  multiple_choice: `Create multiple-choice questions.
- "question": a clue, description, or definition that points to exactly one specific term, name, date, number, or concept from the text.
- "answer": the correct choice, 1 to 4 words. It must be copied exactly, character for character, from "options".
- "options": exactly 4 different choices: the correct answer plus 3 wrong ones. Every choice is 1 to 4 words, never a sentence.
- Wrong choices must be the same kind of thing as the answer (all dates, all people, all organelles, all protocols, etc.) and should come from the text when possible, so that none is obviously wrong.
- Exactly one choice is correct. Never use "All of the above", "None of the above", or "Both A and B".`,
  true_false: `Create true-or-false statements.
- "question": one clear statement about a single fact from the text. Never a question.
- Make about half of the statements true and half false, mixed together.
- A false statement takes a real fact from the text and changes one key detail (a term, name, number, or date) so that it becomes wrong. Never make a statement false just by adding "not" or "never".
- "answer": "True" or "False".
- "explanation": for a false statement, the corrected true statement in one sentence. For a true statement, an empty string.
- No opinions, and no "always", "never", "all", or "none" unless the text says so.`,
};

// Gemma gets no response schema (see top of file), so the format goes in the prompt.
const GEMMA_FORMAT: Record<StudyType, string> = {
  flashcard:
    'Return ONLY a JSON array of objects with string fields "question" and "answer". No other text.',
  multiple_choice:
    'Return ONLY a JSON array of objects with fields "question" (string), "options" (array of exactly 4 strings), and "answer" (string, copied exactly from "options"). No other text.',
  true_false:
    'Return ONLY a JSON array of objects with string fields "question" (the statement), "answer" ("True" or "False"), and "explanation" (the corrected statement if false, otherwise ""). No other text.',
  mixed:
    'Return ONLY a JSON array of objects with fields "type" ("multiple_choice", "true_false" or "identification"), "question" (string), "answer" (string), "options" (array of exactly 4 strings, multiple_choice only) and "explanation" (string, true_false only). No other text.',
};

// Asked for with every text source, so a card can show where its answer comes
// from. The copy is checked against the real text afterwards (lib/source-quotes.ts).
const SOURCE_INSTRUCTION = `Every item also has a "source" field: the one sentence from the TEXT that the item is based on, copied exactly, word for word. Do not paraphrase, shorten, or combine sentences. If the information is in a table, copy the row's text in the order it appears in the TEXT; never rearrange words or add words that are not there.`;

// Gemma gets the format in the prompt, so the extra field is added to it here.
const gemmaFormat = (studyType: StudyType, withSource: boolean) =>
  withSource
    ? GEMMA_FORMAT[studyType].replace('No other text.', 'Each object also has a string field "source". No other text.')
    : GEMMA_FORMAT[studyType];

// The parts of a mixed quiz (#69), with how many of each to write.
function mixedInstructions(count: number): string {
  const ask = mixedRequest(count);
  return `Create a quiz in three parts. Give every item a "type".
Part I: exactly ${ask.multiple_choice} items with "type": "multiple_choice".
- "question": a clue, description, or definition that points to exactly one specific term, name, date, number, or concept from the text.
- "options": exactly 4 different choices of the same kind (all dates, all people, etc.), each 1 to 4 words, from the text when possible. Exactly one is correct. Never "All of the above" or "None of the above".
- "answer": the correct choice, 1 to 4 words, copied exactly from "options".
Part II: exactly ${ask.true_false} items with "type": "true_false".
- "question": one clear statement about a single fact from the text, never a question. About half are true and half false. A false statement changes one key detail (a term, name, number, or date) of a real fact; never just add "not".
- "answer": "True" or "False".
- "explanation": for a false statement, the corrected true statement in one sentence; otherwise "".
Part III: exactly ${ask.identification} items with "type": "identification".
- "question": a clue or definition that points to exactly one term; "answer": that term, 1 to 4 words, never a sentence. No "options".
List Part I first, then Part II, then Part III. Every item is about a different fact.`;
}

// How hard the questions are (#79). Medium adds nothing: it's how guides were
// always made.
const DIFFICULTY_INSTRUCTIONS: Record<Difficulty, string> = {
  easy: 'Difficulty: easy. Ask about the most important terms and main ideas, with clear, direct clues. Any wrong choices should be clearly different from the right answer.',
  medium: '',
  hard: 'Difficulty: hard. Ask about specific details, less obvious facts and how ideas connect, not only definitions. Any wrong choices should be close and believable, and false statements should change a subtle detail.',
};

const instructionsFor = (studyType: StudyType, count: number) =>
  studyType === 'mixed' ? mixedInstructions(count) : TYPE_INSTRUCTIONS[studyType];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Same comparison the card editor uses (#55).
const normalize = normalizeChoice;

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Catches degenerate model output: HTML, a short chunk repeated 4+ times in a
// row, slug-like tokens ("status-code-404-not-found"), and long whitespace runs.
function looksBroken(s: string, maxLength: number): boolean {
  return (
    s.length === 0 ||
    s.length > maxLength ||
    /<\/?[a-z][^>]*>/i.test(s) ||
    /(.{2,30}?)\1{3,}/.test(s) ||
    /(?:^|\s)[^\s-]+(?:-[^\s-]+){3,}(?:\s|$)/.test(s) ||
    /\s{5,}/.test(s)
  );
}

// The prompt asks for answers of 1 to 4 words. The code allows a little more, so a
// good card isn't lost over one extra word, but drops anything longer: every card
// must stay short enough to identify at a glance. Used for flashcard and
// identification answers and for every multiple-choice choice.
export const ANSWER_LIMITS = { chars: 60, words: 6 } as const;

function answerTooLong(s: string): boolean {
  return looksBroken(s, ANSWER_LIMITS.chars) || s.trim().split(/\s+/).length > ANSWER_LIMITS.words;
}

// The sentence a card is based on (lib/source-quotes.ts). Optional: a missing or
// broken one is dropped, not the card.
function cleanSource(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  return s.length >= 10 && !looksBroken(s, 400) ? s : undefined;
}

function validateFlashcard(item: GeneratedItem): GeneratedItem | null {
  if (typeof item.question !== 'string' || typeof item.answer !== 'string') return null;
  const question = item.question.trim();
  const answer = item.answer.trim();
  if (looksBroken(question, 300) || answerTooLong(answer)) return null;
  return { question, answer, source: cleanSource(item.source) };
}

// The model doesn't reliably follow the "answer must match one option" rule,
// and tends to put the correct answer in the same position. Returns null for
// items the UI couldn't grade (no single matching option, wrong option count).
function validateMultipleChoice(item: GeneratedItem): GeneratedItem | null {
  if (typeof item.question !== 'string' || typeof item.answer !== 'string') return null;
  if (!Array.isArray(item.options) || looksBroken(item.question.trim(), 300)) return null;

  const seen = new Set<string>();
  const options = item.options
    .map((o) => (typeof o === 'string' ? o.trim() : ''))
    .filter((o) => o && !answerTooLong(o) && !seen.has(normalize(o)) && seen.add(normalize(o)));
  if (options.length !== 4) return null;

  const matches = options.filter((o) => normalize(o) === normalize(item.answer));
  if (matches.length !== 1) return null;

  return {
    question: item.question.trim(),
    answer: matches[0],
    options: shuffle(options),
    source: cleanSource(item.source),
  };
}

// True or false (#68): stored like a multiple-choice card with the options
// True and False. The explanation is optional: one that's missing or broken is
// dropped, not the statement.
function validateTrueFalse(item: GeneratedItem): GeneratedItem | null {
  if (typeof item.question !== 'string') return null;
  const question = item.question.trim();
  const answer = toTrueFalse(item.answer);
  if (looksBroken(question, 300) || !answer) return null;
  const explanation = typeof item.explanation === 'string' ? item.explanation.trim() : '';
  return {
    question,
    answer,
    options: [...TRUE_FALSE_OPTIONS],
    source: cleanSource(item.source),
    ...(explanation && !looksBroken(explanation, CARD_LIMITS.explanation) ? { explanation } : {}),
  };
}

const VALIDATORS: Record<SingleType, (item: GeneratedItem) => GeneratedItem | null> = {
  flashcard: validateFlashcard,
  multiple_choice: validateMultipleChoice,
  true_false: validateTrueFalse,
};

// A mixed-quiz item (#69) is checked as its own kind. When "type" is missing
// or unknown, the kind is guessed from the item itself.
function mixedKind(item: GeneratedItem & { type?: unknown }): MixedPartKind {
  if (item.type === 'multiple_choice' || item.type === 'true_false' || item.type === 'identification') return item.type;
  if (Array.isArray(item.options) && item.options.length > 2) return 'multiple_choice';
  return toTrueFalse(item.answer) ? 'true_false' : 'identification';
}

// Keeps each part's share of the chosen count, fills a short part from the
// other parts' spares, and orders the parts I, II, III. Every part needs at
// least one usable item, or the attempt has failed.
function assembleMixed(rawItems: GeneratedItem[], count: number): GeneratedItem[] {
  const byKind: Record<MixedPartKind, GeneratedItem[]> = { multiple_choice: [], true_false: [], identification: [] };
  for (const raw of rawItems) {
    const kind = mixedKind(raw);
    const valid = VALIDATORS[PART_TYPE[kind]](raw);
    if (valid) byKind[kind].push(valid);
  }
  const missing = MIXED_PARTS.filter((p) => byKind[p.kind].length === 0);
  if (missing.length > 0) {
    throw new GeminiError(`no usable ${missing.map((p) => p.kind).join(', ')} items`, { retryable: true });
  }
  const split = mixedSplit(count);
  const kept = Object.fromEntries(MIXED_PARTS.map((p) => [p.kind, byKind[p.kind].slice(0, split[p.kind])])) as Record<
    MixedPartKind,
    GeneratedItem[]
  >;
  let total = MIXED_PARTS.reduce((n, p) => n + kept[p.kind].length, 0);
  for (const p of MIXED_PARTS) {
    for (const spare of byKind[p.kind].slice(split[p.kind])) {
      if (total >= count) break;
      kept[p.kind].push(spare);
      total += 1;
    }
  }
  return MIXED_PARTS.flatMap((p) => (p.kind === 'true_false' ? shuffle(kept[p.kind]) : kept[p.kind]));
}

// The guide to return: valid items only, up to the chosen count.
function finalItems(studyType: StudyType, rawItems: GeneratedItem[], count: number): GeneratedItem[] {
  if (studyType === 'mixed') return assembleMixed(rawItems, count);
  const kept = rawItems
    .map(VALIDATORS[studyType])
    .filter((i): i is GeneratedItem => i !== null)
    .slice(0, count);
  // The model tends to write its true statements first.
  return studyType === 'true_false' ? shuffle(kept) : kept;
}

const ITEM_SCHEMAS: Record<StudyType, object> = {
  flashcard: {
    type: 'OBJECT',
    properties: {
      question: {
        type: 'STRING',
        description: 'A clue or definition that identifies one specific term from the text',
      },
      answer: {
        type: 'STRING',
        description: 'The term being identified: 1 to 4 words, never a full sentence',
      },
    },
    required: ['question', 'answer'],
  },
  multiple_choice: {
    type: 'OBJECT',
    properties: {
      question: { type: 'STRING' },
      options: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 4, maxItems: 4 },
      answer: { type: 'STRING' },
    },
    required: ['question', 'options', 'answer'],
  },
  true_false: {
    type: 'OBJECT',
    properties: {
      question: { type: 'STRING', description: 'A statement about one fact from the text' },
      answer: { type: 'STRING', description: 'True or False' },
      explanation: { type: 'STRING', description: 'If false, the corrected true statement; otherwise empty' },
    },
    required: ['question', 'answer', 'explanation'],
  },
  mixed: {
    type: 'OBJECT',
    properties: {
      type: { type: 'STRING', description: 'multiple_choice, true_false or identification' },
      question: { type: 'STRING' },
      options: { type: 'ARRAY', items: { type: 'STRING' }, description: 'multiple_choice only: exactly 4 choices' },
      answer: { type: 'STRING' },
      explanation: { type: 'STRING', description: 'true_false only: the corrected statement if false' },
    },
    required: ['type', 'question', 'answer'],
  },
};

// Thinking models can return "thought" parts before the answer, and Gemma
// sometimes wraps JSON in a markdown code fence.
function extractResponseText(data: {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
}): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

// Text sources also get a "source" field on every card (see SOURCE_INSTRUCTION).
// A photo or scanned PDF doesn't: there is no text to check the sentence against.
function withSourceField(schema: object): object {
  const s = schema as { properties: Record<string, object>; required: string[] };
  return {
    ...s,
    properties: {
      ...s.properties,
      source: { type: 'STRING', description: 'The exact sentence from the text this card is based on' },
    },
    required: [...s.required, 'source'],
  };
}

async function callModel(
  model: string,
  apiKey: string,
  body: string,
  timeoutMs: number,
  // For an attachment, an empty list means the AI found nothing to study.
  attachment?: Attachment
): Promise<{ items: GeneratedItem[]; outputTokens?: number }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new GeminiError(
      timedOut ? `timed out after ${timeoutMs}ms` : `network error: ${String(err)}`,
      { retryable: true }
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new GeminiError(`HTTP ${res.status}: ${errText.slice(0, 500)}`, {
      status: res.status,
      retryable: RETRYABLE_STATUSES.has(res.status),
    });
  }

  // Empty or malformed output is usually a one-off, so it's worth retrying.
  const data = await res.json();
  const text = extractResponseText(data);
  if (!text) {
    throw new GeminiError(
      `no content (finishReason: ${data.candidates?.[0]?.finishReason ?? 'unknown'})`,
      { retryable: true }
    );
  }

  let items: unknown;
  try {
    items = JSON.parse(text);
  } catch {
    throw new GeminiError('response was not valid JSON', { retryable: true });
  }
  if (!Array.isArray(items) || items.length === 0) {
    if (attachment && Array.isArray(items)) {
      throw new GeminiError('nothing to study in the attachment', {
        retryable: false,
        unreadable: true,
        userMessage: nothingToRead(attachment),
      });
    }
    throw new GeminiError('response contained no study items', { retryable: true });
  }

  return { items: items as GeneratedItem[], outputTokens: data.usageMetadata?.candidatesTokenCount };
}

export async function generateStudyItems(
  sourceText: string,
  studyType: StudyType,
  {
    count = DEFAULT_QUESTION_COUNT,
    onRequest,
    attachment,
    difficulty = DEFAULT_DIFFICULTY,
    focus,
    units,
  }: {
    // How many items the guide should have (#65); callers check the range.
    count?: number;
    // Called before each request to a model, retries and fallbacks included,
    // so callers can count what uses up the quota (#62).
    onRequest?: (model: string) => void;
    // A photo to read instead of `sourceText` (#72).
    attachment?: Attachment;
    // How hard the questions are, and what to focus on, e.g. a typed topic (#79).
    difficulty?: Difficulty;
    focus?: string;
    // How `sourceText` splits into PDF pages or text lines, so a card's quote can
    // say where it is (lib/source-quotes.ts).
    units?: SourceUnits;
  } = {}
): Promise<{ items: GeneratedItem[]; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY is not set', { retryable: false });

  const material = attachment && isPdf(attachment) ? 'document' : 'photo';
  // Difficulty and focus lines (#79); none for a medium guide with no focus.
  const focusText = focus?.replace(/["“”\s]+/g, ' ').trim().slice(0, 100);
  const extra = [DIFFICULTY_INSTRUCTIONS[difficulty], focusText ? `Focus on what the text says about “${focusText}”.` : '']
    .filter(Boolean)
    .map((line) => `\n${line}`)
    .join('');
  // Text that comes with its pages or lines was sampled along with them (pageUnits,
  // lineUnits), so the AI reads exactly what the quote check searches; other long
  // text is sampled here (#38).
  const sampledText = units ? sourceText.slice(0, MAX_SOURCE_CHARS) : sampleText(sourceText, MAX_SOURCE_CHARS);
  // Questions from the whole text (#38), except for a typed topic, whose guide
  // should stay on the topic rather than cover its whole article (#79).
  const coverage = focusText ? '' : '\nSpread questions across the entire text, covering the beginning, middle, and end.';
  const prompt = attachment
    ? `You are creating a study guide from the attached ${
        material === 'document' ? 'document (scanned pages)' : 'photo (of notes, a whiteboard, or a page)'
      }.
Produce exactly ${requestedCount(studyType, count)} items. ${instructionsFor(studyType, count)}${extra}
Base everything strictly on what the ${material} shows. Avoid trivial or overly broad questions.
If the ${material} has no readable study material, return an empty array [].`
    : `You are creating a study guide from the text below.
Produce exactly ${requestedCount(studyType, count)} items. ${instructionsFor(studyType, count)}${extra}
${SOURCE_INSTRUCTION}${coverage}
Base everything strictly on the provided text. Avoid trivial or overly broad questions.

TEXT:
"""
${sampledText}
"""`;
  const attachmentParts = attachment ? [{ inlineData: { mimeType: attachment.mimeType, data: attachment.data } }] : [];
  // Quotes are only asked for with text; a photo or scanned PDF has none to check.
  const withSource = !attachment;

  const bodies: Record<ModelFamily, string> = {
    gemini: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, ...attachmentParts] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: withSource ? withSourceField(ITEM_SCHEMAS[studyType]) : ITEM_SCHEMAS[studyType],
        },
        thinkingConfig: { thinkingLevel: THINKING_LEVEL },
      },
    }),
    gemma: JSON.stringify({
      contents: [{ parts: [{ text: `${prompt}\n\n${gemmaFormat(studyType, withSource)}` }, ...attachmentParts] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  };

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError: GeminiError | undefined;

  const minValid = minValidItems(count);

  for (const { id: model, family, attempts, timeoutMs, perExtraItemMs } of MODEL_CHAIN) {
    const modelTimeoutMs =
      timeoutMs + Math.max(0, count - DEFAULT_QUESTION_COUNT) * perExtraItemMs + (attachment ? ATTACHMENT_EXTRA_MS : 0);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 2_000) break;

      const startedAt = Date.now();
      try {
        onRequest?.(model);
        const { items: rawItems, outputTokens } = await callModel(
          model,
          apiKey,
          bodies[family],
          Math.min(modelTimeoutMs, remaining),
          attachment
        );
        const valid = finalItems(studyType, rawItems, count);
        if (valid.length < minValid) {
          throw new GeminiError(`only ${valid.length}/${rawItems.length} items passed validation`, {
            retryable: true,
          });
        }

        // Each card's quote is checked against the real text, so one is only shown
        // when it is really in the document. A photo has no text to check against,
        // so its cards never carry one. The card itself always stays.
        const checker = withSource ? createSourceChecker(sampledText, MAX_SOURCE_CHARS, units) : undefined;
        const items = valid.map((item) =>
          checker ? checker.check(item) : { ...item, source: undefined, sourceLocation: undefined }
        );

        // Counts only: the document's own text never goes in the log.
        const quotes = checker
          ? `, quotes: ${checker.stats.whole} whole / ${checker.stats.pieces} in pieces / ${checker.stats.dropped} dropped`
          : '';
        console.log(
          `[gemini] ${model} generated ${items.length}/${rawItems.length} valid ${studyType} items in ${Date.now() - startedAt}ms` +
            ` (attempt ${attempt}, ${outputTokens ?? '?'} output tokens${quotes})`
        );
        return { items, model };
      } catch (err) {
        const error =
          err instanceof GeminiError ? err : new GeminiError(String(err), { retryable: false });
        console.error(
          `[gemini] ${model} attempt ${attempt} failed after ${Date.now() - startedAt}ms: ${error.message}`
        );
        lastError = error;

        if (!error.retryable) throw error;
        // Quota errors won't clear in a few seconds; go straight to the next model.
        if (error.status === 429) break;

        if (attempt < attempts) {
          const backoff = 1_000 * 2 ** (attempt - 1) + Math.random() * 500;
          await sleep(Math.min(backoff, Math.max(0, deadline - Date.now() - 2_000)));
        }
      }
    }
  }

  throw lastError ?? new GeminiError('retry budget exhausted', { retryable: true });
}
