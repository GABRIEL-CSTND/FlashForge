const PRIMARY_MODEL = 'gemini-3.5-flash';
// Lighter model with its own free-tier quota, used when the primary model is
// overloaded (503) or out of quota (429).
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Gemini 3.x models "think" before answering by default. Flashcards don't need
// deep reasoning, so keep it low to cut latency.
const THINKING_LEVEL = 'low';

// Retry budget. The whole generation (all attempts + backoff) must finish
// within TOTAL_BUDGET_MS so the user isn't left waiting indefinitely.
const ATTEMPTS_PER_MODEL = 2;
const ATTEMPT_TIMEOUT_MS = 25_000;
const TOTAL_BUDGET_MS = 50_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const ITEM_COUNT = 10;
// Multiple-choice items that fail validation are dropped, so ask for a few
// extra to still end up with ITEM_COUNT.
const REQUESTED_COUNT: Record<'flashcard' | 'multiple_choice', number> = {
  flashcard: ITEM_COUNT,
  multiple_choice: 12,
};

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/[.]+$/, '').toLowerCase();

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The model doesn't reliably follow the "answer must match one option" rule,
// and tends to put the correct answer in the same position. Returns null for
// items the UI couldn't grade (no single matching option, wrong option count).
function validateMultipleChoice(item: GeneratedItem): GeneratedItem | null {
  if (!item.question?.trim() || !item.answer?.trim() || !Array.isArray(item.options)) return null;

  const seen = new Set<string>();
  const options = item.options
    .map((o) => (typeof o === 'string' ? o.trim() : ''))
    .filter((o) => o && !seen.has(normalize(o)) && seen.add(normalize(o)));
  if (options.length !== 4) return null;

  const matches = options.filter((o) => normalize(o) === normalize(item.answer));
  if (matches.length !== 1) return null;

  return { question: item.question.trim(), answer: matches[0], options: shuffle(options) };
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
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
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
): Promise<GeneratedItem[]> {
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

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'ARRAY', items: itemSchema },
      thinkingConfig: { thinkingLevel: THINKING_LEVEL },
    },
  });

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError: GeminiError | undefined;

  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 2_000) break;

      const startedAt = Date.now();
      try {
        const { items: rawItems, outputTokens } = await callModel(
          model,
          apiKey,
          body,
          Math.min(ATTEMPT_TIMEOUT_MS, remaining)
        );
        const items =
          studyType === 'multiple_choice'
            ? rawItems.map(validateMultipleChoice).filter((i): i is GeneratedItem => i !== null)
            : rawItems;
        if (items.length === 0) {
          throw new GeminiError(`all ${rawItems.length} items failed validation`, { retryable: true });
        }

        console.log(
          `[gemini] ${model} generated ${items.length}/${rawItems.length} valid ${studyType} items in ${Date.now() - startedAt}ms` +
            ` (attempt ${attempt}, ${outputTokens ?? '?'} output tokens)`
        );
        return items.slice(0, ITEM_COUNT);
      } catch (err) {
        const error =
          err instanceof GeminiError ? err : new GeminiError(String(err), { retryable: false });
        console.error(
          `[gemini] ${model} attempt ${attempt} failed after ${Date.now() - startedAt}ms: ${error.message}`
        );
        lastError = error;

        if (!error.retryable) throw error;
        // Quota errors won't clear in a few seconds; go straight to the fallback model.
        if (error.status === 429) break;

        if (attempt < ATTEMPTS_PER_MODEL) {
          const backoff = 1_000 * 2 ** (attempt - 1) + Math.random() * 500;
          await sleep(Math.min(backoff, Math.max(0, deadline - Date.now() - 2_000)));
        }
      }
    }
  }

  throw lastError ?? new GeminiError('retry budget exhausted', { retryable: true });
}
