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
  flashcard: `Create flashcards. Each item has a clear "question" and a concise "answer". No "options" field.`,
  multiple_choice: `Create multiple-choice questions. Each item has a "question", an "options" array of exactly 4 plausible choices (in random order), and an "answer" field that exactly matches one of the strings in "options" (the correct one).`,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
Produce exactly 10 items. ${TYPE_INSTRUCTIONS[studyType]}
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
            options: { type: 'ARRAY', items: { type: 'STRING' } },
            answer: { type: 'STRING' },
          },
          required: ['question', 'options', 'answer'],
        }
      : {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            answer: { type: 'STRING' },
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
        const { items, outputTokens } = await callModel(
          model,
          apiKey,
          body,
          Math.min(ATTEMPT_TIMEOUT_MS, remaining)
        );
        console.log(
          `[gemini] ${model} generated ${items.length} ${studyType} items in ${Date.now() - startedAt}ms` +
            ` (attempt ${attempt}, ${outputTokens ?? '?'} output tokens)`
        );
        return items.slice(0, 10);
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
