import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeUuid } from '@/test-utils/fake-supabase';

// after() needs a Next.js request scope; collect the callbacks to run them by hand.
const pending = vi.hoisted(() => ({ callbacks: [] as (() => unknown)[] }));
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: () => unknown) => pending.callbacks.push(fn) };
});
const gemini = vi.hoisted(() => ({ run: null as null | ((onRequest: (m: string) => void) => Promise<unknown>) }));
vi.mock('@/lib/gemini', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gemini')>();
  return {
    ...actual,
    generateStudyItems: vi.fn((_text: string, _type: string, opts: { onRequest: (m: string) => void }) =>
      gemini.run!(opts.onRequest)
    ),
  };
});
const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('@/test-utils/fake-supabase').createFakeSupabase> }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (t: string) => fake.current!.client.from(t),
    rpc: (n: string, a: Record<string, unknown>) => fake.current!.client.rpc(n, a),
    auth: { getUser: (token: string) => fake.current!.client.auth.getUser(token) },
  },
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/generate/route';
import { GeminiError } from '@/lib/gemini';
import { PROGRESS_MIME, readGeneration, type StepEvent } from '@/lib/generation-progress';

const STUDENT = { id: fakeUuid(), email: 'sam@example.com' };
const ITEMS = [{ question: 'Fluid inside the chloroplast', answer: 'Stroma' }];
const LONG_TEXT = 'Photosynthesis happens in the chloroplast; the stroma holds the Calvin cycle.';
const FIRST = 'gemini-3.5-flash';
const BACKUP = 'gemma-4-26b-a4b-it';

let limit: { refuse: boolean };

beforeEach(() => {
  pending.callbacks = [];
  limit = { refuse: false };
  fake.current = createFakeSupabase({
    tables: { profiles: { unique: [['id']] }, generation_logs: { unique: [['id']] } },
    users: { sam: STUDENT },
    rpc: {
      start_generation: (args, db) => {
        const id = db.rows.generation_logs.length + 1;
        const row = { id, user_id: args.p_user_id, role: args.p_role, study_type: args.p_study_type };
        if (limit.refuse) {
          db.rows.generation_logs.push({ ...row, success: false, error_kind: 'limit' });
          return { allowed: false, limit: 5, resets_at: '2026-10-24T07:00:00+00:00' };
        }
        db.rows.generation_logs.push({ ...row, success: null, error_kind: null, model: null, requests: {} });
        return { allowed: true, id, limit: 5 };
      },
    },
  });
  fake.current.db.rows.profiles = [{ id: STUDENT.id, role: 'student' }];
  gemini.run = async (onRequest) => {
    onRequest(FIRST);
    return { items: ITEMS, model: FIRST };
  };
});

function request(text: string, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new File([text], 'notes.txt', { type: 'text/plain' }));
  form.append('studyType', 'flashcard');
  return POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: form, headers }));
}

// Asks for progress, like the upload page, and collects what came back.
async function withProgress(text: string, headers: Record<string, string> = {}) {
  const res = await request(text, { accept: PROGRESS_MIME, ...headers });
  const steps: StepEvent[] = [];
  const outcome = await readGeneration(res, (e) => steps.push(e));
  return { res, steps, outcome };
}

describe('/api/generate progress', () => {
  it('sends each step as it starts, then the same answer the JSON response gives', async () => {
    const { res, steps, outcome } = await withProgress(LONG_TEXT);
    expect(res.headers.get('content-type')).toContain(PROGRESS_MIME);
    expect(steps).toEqual([
      { type: 'step', step: 'reading' },
      { type: 'step', step: 'writing' },
    ]);
    expect(outcome.status).toBe(200);
    expect(outcome.body).toEqual({
      title: 'notes',
      sourceFilename: 'notes.txt',
      // Credit for a web page or Wikipedia article (#79); files have none.
      source: null,
      studyType: 'flashcard',
      items: ITEMS,
      model: FIRST,
    });
  });

  it('says when the AI is trying again, and when a backup has taken over', async () => {
    gemini.run = async (onRequest) => {
      onRequest(FIRST);
      onRequest(FIRST);
      onRequest(BACKUP);
      return { items: ITEMS, model: BACKUP };
    };
    const { steps, outcome } = await withProgress(LONG_TEXT);
    expect(steps).toEqual([
      { type: 'step', step: 'reading' },
      { type: 'step', step: 'writing' },
      { type: 'step', step: 'writing', attempt: 2 },
      { type: 'step', step: 'writing', attempt: 3, backup: true },
    ]);
    expect(outcome.status).toBe(200);
  });

  it('sends only the refusal when the daily limit is reached', async () => {
    limit.refuse = true;
    const { steps, outcome } = await withProgress(LONG_TEXT);
    expect(steps).toEqual([]);
    expect(outcome.status).toBe(429);
    expect(outcome.body).toEqual(expect.objectContaining({ limit: 5 }));
  });

  it('passes an AI failure on with its own status and message', async () => {
    const failure = new GeminiError('429', { retryable: true, status: 429 });
    gemini.run = async (onRequest) => {
      onRequest(FIRST);
      throw failure;
    };
    const { steps, outcome } = await withProgress(LONG_TEXT);
    expect(steps.map((s) => s.step)).toEqual(['reading', 'writing']);
    expect(outcome).toEqual({ status: 503, body: { error: failure.userMessage } });
  });

  it('explains a file with nothing to read, after the reading step', async () => {
    const { steps, outcome } = await withProgress('hi');
    expect(steps).toEqual([{ type: 'step', step: 'reading' }]);
    expect(outcome.status).toBe(422);
    expect(outcome.body).toEqual({ error: 'Could not extract enough readable text from this file.' });
  });

  it('still writes the usage log once the stream is done', async () => {
    await withProgress(LONG_TEXT, { authorization: 'Bearer sam' });
    await Promise.all(pending.callbacks.map((fn) => fn()));
    expect(fake.current!.db.rows.generation_logs).toEqual([
      expect.objectContaining({ user_id: STUDENT.id, success: true, model: FIRST, requests: { [FIRST]: 1 } }),
    ]);
  });

  it('logs the real outcome even when the browser leaves before the guide is ready', async () => {
    let release!: () => void;
    const aiWorking = new Promise<void>((resolve) => (release = resolve));
    gemini.run = async (onRequest) => {
      onRequest(FIRST);
      await aiWorking;
      return { items: ITEMS, model: FIRST };
    };
    const res = await request(LONG_TEXT, { accept: PROGRESS_MIME, authorization: 'Bearer sam' });
    const reader = res.body!.getReader();
    // Read up to the "writing" step, then leave, like closing the page.
    let received = '';
    while (!received.includes('"writing"')) received += new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();

    // The response is over, so the usage log starts now, while the AI is still working.
    const logging = Promise.all(pending.callbacks.map((fn) => fn()));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.current!.db.rows.generation_logs).toEqual([expect.objectContaining({ success: null })]);

    release();
    await logging;
    expect(fake.current!.db.rows.generation_logs).toEqual([
      expect.objectContaining({ user_id: STUDENT.id, success: true, error_kind: null, model: FIRST, requests: { [FIRST]: 1 } }),
    ]);
  });

  it('answers with plain JSON, exactly as before, when progress is not asked for', async () => {
    const res = await request(LONG_TEXT);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ items: ITEMS, model: FIRST }));
  });
});
