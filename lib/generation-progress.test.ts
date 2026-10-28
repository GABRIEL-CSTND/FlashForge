import { describe, expect, it, vi } from 'vitest';
import {
  encodeEvent,
  INTERRUPTED,
  nextProgress,
  parseEvent,
  PROGRESS_MIME,
  progressLabels,
  readGeneration,
  retryNote,
  START_PROGRESS,
  stepStatus,
  type ProgressEvent,
  type StepEvent,
} from '@/lib/generation-progress';

// A response that arrives in the given pieces, like a real network would send it.
function streamed(chunks: string[], type = PROGRESS_MIME) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': type } }
  );
}

const RESULT: ProgressEvent = { type: 'result', status: 200, body: { title: 'Cells', items: [] } };

describe('events', () => {
  it('writes one JSON event per line and reads it back', () => {
    const step: StepEvent = { type: 'step', step: 'writing', attempt: 2, backup: true };
    expect(encodeEvent(step).endsWith('\n')).toBe(true);
    expect(parseEvent(encodeEvent(step).trim())).toEqual(step);
    expect(parseEvent(encodeEvent(RESULT).trim())).toEqual(RESULT);
  });

  it('ignores lines that are not events', () => {
    expect(parseEvent('not json')).toBeNull();
    expect(parseEvent('42')).toBeNull();
    expect(parseEvent('{"type":"step","step":"dancing"}')).toBeNull();
    expect(parseEvent('{"type":"result","status":"ok","body":{}}')).toBeNull();
    expect(parseEvent('{"type":"result","status":200}')).toBeNull();
  });
});

describe('steps', () => {
  it('walks sending, reading, writing and remembers the AI tries', () => {
    let state = START_PROGRESS;
    expect(state.step).toBe('sending');
    state = nextProgress(state, { type: 'step', step: 'reading' });
    state = nextProgress(state, { type: 'step', step: 'writing' });
    expect(state).toEqual({ step: 'writing', attempt: 1, backup: false });
    state = nextProgress(state, { type: 'step', step: 'writing', attempt: 3, backup: true });
    expect(state).toEqual({ step: 'writing', attempt: 3, backup: true });
  });

  it('marks steps before the current one as done and the ones after as pending', () => {
    expect(['sending', 'reading', 'writing'].map((s) => stepStatus('reading', s as 'reading'))).toEqual([
      'done',
      'current',
      'pending',
    ]);
    expect(stepStatus('sending', 'writing')).toBe('pending');
    expect(stepStatus('writing', 'sending')).toBe('done');
  });

  it('words each step for the kind of source', () => {
    expect(progressLabels('file', false)).toEqual({
      sending: 'Uploading your file',
      reading: 'Reading your file',
      writing: 'Writing your study guide with AI',
    });
    expect(progressLabels('file', true).sending).toBe('Uploading your photo');
    expect(progressLabels('text', false).reading).toBe('Checking your notes');
    expect(progressLabels('link', false).reading).toBe('Fetching the web page');
  });

  it('only explains a retry after the first try', () => {
    expect(retryNote(START_PROGRESS)).toBeNull();
    expect(retryNote({ step: 'writing', attempt: 2, backup: false })).toMatch(/trying again \(try 2\)/);
    expect(retryNote({ step: 'writing', attempt: 3, backup: true })).toMatch(/slower backup.*up to a minute/);
  });
});

describe('readGeneration', () => {
  it('reports each step as it arrives and returns the result', async () => {
    const steps: StepEvent[] = [];
    const res = streamed([
      encodeEvent({ type: 'step', step: 'reading' }),
      encodeEvent({ type: 'step', step: 'writing' }),
      encodeEvent(RESULT),
    ]);
    const outcome = await readGeneration(res, (e) => steps.push(e));
    expect(steps.map((s) => s.step)).toEqual(['reading', 'writing']);
    expect(outcome).toEqual({ status: 200, body: RESULT.type === 'result' ? RESULT.body : {} });
  });

  it('copes with a line cut in half between two chunks', async () => {
    const line = encodeEvent({ type: 'step', step: 'writing', attempt: 2 });
    const onStep = vi.fn();
    const outcome = await readGeneration(streamed([line.slice(0, 10), line.slice(10) + encodeEvent(RESULT)]), onStep);
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenCalledWith({ type: 'step', step: 'writing', attempt: 2 });
    expect(outcome.status).toBe(200);
  });

  it('returns a failure result with its status', async () => {
    const failure: ProgressEvent = { type: 'result', status: 429, body: { error: 'Daily limit reached.' } };
    expect(await readGeneration(streamed([encodeEvent(failure)]), vi.fn())).toEqual({
      status: 429,
      body: { error: 'Daily limit reached.' },
    });
  });

  it('says so when the stream ends before a result', async () => {
    const outcome = await readGeneration(streamed([encodeEvent({ type: 'step', step: 'reading' })]), vi.fn());
    expect(outcome).toEqual({ status: 502, body: { error: INTERRUPTED } });
  });

  it('reads a last line that has no line break', async () => {
    const outcome = await readGeneration(streamed([encodeEvent(RESULT).trim()]), vi.fn());
    expect(outcome.status).toBe(200);
  });

  it('still reads a plain JSON response (no progress)', async () => {
    const onStep = vi.fn();
    const res = new Response(JSON.stringify({ error: 'Missing file' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(await readGeneration(res, onStep)).toEqual({ status: 400, body: { error: 'Missing file' } });
    expect(onStep).not.toHaveBeenCalled();
    expect(await readGeneration(new Response('<html>', { status: 500 }), onStep)).toEqual({ status: 500, body: {} });
  });
});
