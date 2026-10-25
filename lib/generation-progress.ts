// Progress while a study guide is being made. The upload page asks /api/generate for
// progress by accepting application/x-ndjson; the server then answers with one JSON
// event per line: a few "step" events as it works, then one "result" event holding
// what the plain JSON response would have been. Without that header nothing changes.
import type { SourceKind } from '@/lib/sources';

export const PROGRESS_MIME = 'application/x-ndjson';

export type ServerStep = 'reading' | 'writing';
export type StepEvent = { type: 'step'; step: ServerStep; attempt?: number; backup?: boolean };
export type ResultEvent = { type: 'result'; status: number; body: Record<string, unknown> };
export type ProgressEvent = StepEvent | ResultEvent;

export const encodeEvent = (event: ProgressEvent) => JSON.stringify(event) + '\n';

export function parseEvent(line: string): ProgressEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const e = value as Record<string, unknown>;
  if (e.type === 'step' && (e.step === 'reading' || e.step === 'writing')) {
    return {
      type: 'step',
      step: e.step,
      ...(typeof e.attempt === 'number' ? { attempt: e.attempt } : {}),
      ...(e.backup === true ? { backup: true } : {}),
    };
  }
  if (e.type === 'result' && typeof e.status === 'number' && e.body && typeof e.body === 'object') {
    return { type: 'result', status: e.status, body: e.body as Record<string, unknown> };
  }
  return null;
}

// "sending" is the page's own first step: it lasts until the server reports its first one.
export type ProgressStepId = 'sending' | ServerStep;
export const PROGRESS_STEP_IDS: ProgressStepId[] = ['sending', 'reading', 'writing'];

export interface ProgressState {
  step: ProgressStepId;
  // Requests made to the AI so far; above 1 means it is trying again.
  attempt: number;
  // True once a slower backup AI is answering.
  backup: boolean;
}

export const START_PROGRESS: ProgressState = { step: 'sending', attempt: 1, backup: false };

export function nextProgress(state: ProgressState, event: StepEvent): ProgressState {
  return { step: event.step, attempt: event.attempt ?? state.attempt, backup: event.backup ?? state.backup };
}

export type StepStatus = 'done' | 'current' | 'pending';

export function stepStatus(current: ProgressStepId, step: ProgressStepId): StepStatus {
  const at = PROGRESS_STEP_IDS.indexOf(step);
  const now = PROGRESS_STEP_IDS.indexOf(current);
  return at < now ? 'done' : at === now ? 'current' : 'pending';
}

// What the first two steps say for each kind of source. Every kind must be listed, so a
// new one can't end up with a file's words by mistake.
const SOURCE_STEP_LABELS: Record<SourceKind, { sending: string; reading: string }> = {
  file: { sending: 'Uploading your file', reading: 'Reading your file' },
  text: { sending: 'Sending your notes', reading: 'Checking your notes' },
  link: { sending: 'Sending your link', reading: 'Fetching the web page' },
  // The server looks the topic up on Wikipedia during its reading step (#79).
  topic: { sending: 'Sending your topic', reading: 'Looking it up on Wikipedia' },
};

// What each step says, for the kind of source being used.
export function progressLabels(source: SourceKind, photo: boolean): Record<ProgressStepId, string> {
  const labels =
    source === 'file' && photo ? { sending: 'Uploading your photo', reading: 'Preparing your photo' } : SOURCE_STEP_LABELS[source];
  return { ...labels, writing: 'Writing your study guide with AI' };
}

// The note under the "writing" step once the AI has needed more than one try.
export function retryNote(state: ProgressState): string | null {
  if (state.attempt <= 1) return null;
  return state.backup
    ? `Our AI is extra busy, so a slower backup is helping (try ${state.attempt}). This can take up to a minute.`
    : `That try didn't work out, so we're trying again (try ${state.attempt}).`;
}

export interface GenerationOutcome {
  status: number;
  body: Record<string, unknown>;
}

export const INTERRUPTED = 'The connection was interrupted before your study guide was ready. Please try again.';

// Reads the response of /api/generate and reports each step as it arrives. A plain JSON
// response (an old server, or an answer sent before streaming began) still works.
export async function readGeneration(res: Response, onStep: (event: StepEvent) => void): Promise<GenerationOutcome> {
  if (!res.headers.get('content-type')?.includes(PROGRESS_MIME) || !res.body) {
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of done ? [...lines, buffer] : lines) {
      if (!line.trim()) continue;
      const event = parseEvent(line);
      if (event?.type === 'step') onStep(event);
      else if (event?.type === 'result') {
        reader.cancel().catch(() => {});
        return { status: event.status, body: event.body };
      }
    }
    if (done) return { status: 502, body: { error: INTERRUPTED } };
  }
}
