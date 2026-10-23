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
    generateStudyItems: vi.fn((_text: string, _type: string, onRequest: (m: string) => void) => gemini.run!(onRequest)),
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

const STUDENT = { id: fakeUuid(), email: 'sam@example.com' };
const ITEMS = [{ question: 'Fluid inside the chloroplast', answer: 'Stroma' }];

beforeEach(() => {
  pending.callbacks = [];
  fake.current = createFakeSupabase({
    tables: { profiles: { unique: [['id']] }, generation_logs: {} },
    users: { sam: STUDENT },
  });
  fake.current.db.rows.profiles = [{ id: STUDENT.id, role: 'student' }];
  gemini.run = async (onRequest) => {
    onRequest('gemini-3.5-flash');
    onRequest('gemini-3.5-flash-lite');
    return { items: ITEMS, model: 'gemini-3.5-flash-lite' };
  };
});

function generate(text: string | null, token?: string) {
  const form = new FormData();
  if (text !== null) form.append('file', new File([text], 'notes.txt', { type: 'text/plain' }));
  form.append('studyType', 'multiple_choice');
  return POST(
    new NextRequest('http://localhost/api/generate', {
      method: 'POST',
      body: form,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
  );
}
const LONG_TEXT = 'Photosynthesis happens in the chloroplast; the stroma holds the Calvin cycle.';
const logged = () => fake.current!.db.rows.generation_logs;
const runAfter = () => Promise.all(pending.callbacks.map((fn) => fn()));

describe('/api/generate usage log (#62)', () => {
  it('logs a signed-in success after the response, with the model and every request it made', async () => {
    const res = await generate(LONG_TEXT, 'sam');
    expect(res.status).toBe(200);
    // Nothing is written while the response is being made.
    expect(logged()).toEqual([]);
    await runAfter();
    expect(logged()).toEqual([
      expect.objectContaining({
        user_id: STUDENT.id,
        role: 'student',
        model: 'gemini-3.5-flash-lite',
        study_type: 'multiple_choice',
        success: true,
        error_kind: null,
        requests: { 'gemini-3.5-flash': 1, 'gemini-3.5-flash-lite': 1 },
      }),
    ]);
    expect(logged()[0].duration_ms).toEqual(expect.any(Number));
  });

  it.each([
    ['all models busy', new GeminiError('429', { retryable: true, status: 429 }), 503, 'ai_busy'],
    ['a bad request to the AI', new GeminiError('400', { retryable: false, status: 400 }), 502, 'ai_failed'],
    ['an unexpected error', new Error('boom'), 500, 'server_error'],
  ])('logs a failure when %s', async (_label, error, status, kind) => {
    gemini.run = async (onRequest) => {
      onRequest('gemini-3.5-flash');
      throw error;
    };
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await generate(LONG_TEXT)).status).toBe(status);
    await runAfter();
    errorLog.mockRestore();
    expect(logged()).toEqual([
      expect.objectContaining({ user_id: null, role: null, model: null, success: false, error_kind: kind, requests: { 'gemini-3.5-flash': 1 } }),
    ]);
  });

  it('logs files that are missing or unreadable, with no AI requests', async () => {
    expect((await generate('too short')).status).toBe(422);
    expect((await generate(null)).status).toBe(400);
    await runAfter();
    expect(logged().map((r) => [r.error_kind, r.requests, r.success])).toEqual([
      ['unreadable', {}, false],
      ['no_file', {}, false],
    ]);
  });

  it('never lets a logging failure affect anything', async () => {
    fake.current!.db.failNext('generation_logs', 'insert');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await generate(LONG_TEXT, 'sam')).status).toBe(200);
    await expect(runAfter()).resolves.toBeDefined();
    expect(errorLog).toHaveBeenCalledWith('[generation-logs] could not log a generation:', expect.anything());
    errorLog.mockRestore();
  });
});
