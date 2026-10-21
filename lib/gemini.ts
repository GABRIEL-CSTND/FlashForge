import { normalizeChoice } from '@/lib/card-rules';

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
  timeoutMs: number;
}

const MODEL_CHAIN: ModelConfig[] = [
  { id: 'gemini-3.5-flash', family: 'gemini', attempts: 2, timeoutMs: 25_000 },
  { id: 'gemini-3.5-flash-lite', family: 'gemini', attempts: 2, timeoutMs: 25_000 },
  { id: 'gemma-4-26b-a4b-it', family: 'gemma', attempts: 1, timeoutMs: 40_000 },
];
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Gemini 3.x models "think" before answering by default. Flashcards don't need
// deep reasoning, so keep it low to cut latency.
const THINKING_LEVEL = 'low';

// Retry budget. The whole generation (all attempts + backoff) must finish
// within TOTAL_BUDGET_MS so the user isn't left waiting indefinitely.
const TOTAL_BUDGET_MS = 75_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const ITEM_COUNT = 10;
// Multiple-choice items that fail validation are dropped, so ask for a few
// extra to still end up with ITEM_COUNT.
const REQUESTED_COUNT: Record<'flashcard' | 'multiple_choice', number> = {
  flashcard: ITEM_COUNT,
  multiple_choice: 12,
};
// A response with fewer usable items than this counts as a failed attempt.
const MIN_VALID_ITEMS = 6;

const BUSY_MESSAGE = 'The AI is busy right now. Please try again in a minute.';
const GENERIC_MESSAGE = 'Something went wrong while generating your study guide. Please try again.';

export type StudyType = 'flashcard' | 'multiple_choice';

export interface GeneratedItem {
  question: string;
  answer: string;
  options?: string[];
}

// `message` is the detailed reason for server logs; `userMessage` is safe to
// show in the UI.
export class GeminiError extends Error {
  userMessage: string;
  retryable: boolean;
  status?: number;

  constructor(message: string, opts: { retryable: boolean; status?: number; userMessage?: string }) {
    super(message);
    this.name = 'GeminiError';
    this.retryable = opts.retryable;
    this.status = opts.status;
    this.userMessage = opts.userMessage ?? (opts.retryable ? BUSY_MESSAGE : GENERIC_MESSAGE);
  }
}

const TYPE_INSTRUCTIONS: Record<StudyType, string> = {
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
- "options": exactly 4 different choices: the correct answer plus 3 wrong ones.
- Wrong choices must be the same kind of thing as the answer (all dates, all people, all organelles, all protocols, etc.) and should come from the text when possible, so that none is obviously wrong.
- Exactly one choice is correct. Never use "All of the above", "None of the above", or "Both A and B".`,
};

// Gemma gets no response schema (see top of file), so the format goes in the prompt.
const GEMMA_FORMAT: Record<StudyType, string> = {
  flashcard:
    'Return ONLY a JSON array of objects with string fields "question" and "answer". No other text.',
  multiple_choice:
    'Return ONLY a JSON array of objects with fields "question" (string), "options" (array of exactly 4 strings), and "answer" (string, copied exactly from "options"). No other text.',
};

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

function validateFlashcard(item: GeneratedItem): GeneratedItem | null {
  if (typeof item.question !== 'string' || typeof item.answer !== 'string') return null;
  const question = item.question.trim();
  const answer = item.answer.trim();
  if (looksBroken(question, 300) || looksBroken(answer, 80)) return null;
  if (answer.split(/\s+/).length > 8) return null;
  return { question, answer };
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
    .filter((o) => o && !looksBroken(o, 80) && !seen.has(normalize(o)) && seen.add(normalize(o)));
  if (options.length !== 4) return null;

  const matches = options.filter((o) => normalize(o) === normalize(item.answer));
  if (matches.length !== 1) return null;

  return { question: item.question.trim(), answer: matches[0], options: shuffle(options) };
}

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

async function callModel(
  model: string,
  apiKey: string,
  body: string,
  timeoutMs: number
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
    throw new GeminiError('response contained no study items', { retryable: true });
  }

  return { items: items as GeneratedItem[], outputTokens: data.usageMetadata?.candidatesTokenCount };
}

export async function generateStudyItems(
  sourceText: string,
  studyType: StudyType
): Promise<{ items: GeneratedItem[]; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY is not set', { retryable: false });

  const prompt = `You are creating a study guide from the text below.
Produce exactly ${REQUESTED_COUNT[studyType]} items. ${TYPE_INSTRUCTIONS[studyType]}
Base everything strictly on the provided text. Avoid trivial or overly broad questions.

TEXT:
"""
${sourceText.slice(0, 30000)}
"""`;

  const itemSchema =
    studyType === 'multiple_choice'
      ? {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            options: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 4, maxItems: 4 },
            answer: { type: 'STRING' },
          },
          required: ['question', 'options', 'answer'],
        }
      : {
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
        };

  const bodies: Record<ModelFamily, string> = {
    gemini: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'ARRAY', items: itemSchema },
        thinkingConfig: { thinkingLevel: THINKING_LEVEL },
      },
    }),
    gemma: JSON.stringify({
      contents: [{ parts: [{ text: `${prompt}\n\n${GEMMA_FORMAT[studyType]}` }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  };

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError: GeminiError | undefined;

  for (const { id: model, family, attempts, timeoutMs } of MODEL_CHAIN) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 2_000) break;

      const startedAt = Date.now();
      try {
        const { items: rawItems, outputTokens } = await callModel(
          model,
          apiKey,
          bodies[family],
          Math.min(timeoutMs, remaining)
        );
        const items = rawItems
          .map(studyType === 'multiple_choice' ? validateMultipleChoice : validateFlashcard)
          .filter((i): i is GeneratedItem => i !== null);
        if (items.length < MIN_VALID_ITEMS) {
          throw new GeminiError(`only ${items.length}/${rawItems.length} items passed validation`, {
            retryable: true,
          });
        }

        console.log(
          `[gemini] ${model} generated ${items.length}/${rawItems.length} valid ${studyType} items in ${Date.now() - startedAt}ms` +
            ` (attempt ${attempt}, ${outputTokens ?? '?'} output tokens)`
        );
        return { items: items.slice(0, ITEM_COUNT), model };
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
