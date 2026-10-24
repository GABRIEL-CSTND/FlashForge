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
import { GeminiError, generateStudyItems } from '@/lib/gemini';

const STUDENT = { id: fakeUuid(), email: 'sam@example.com' };
const ITEMS = [{ question: 'Fluid inside the chloroplast', answer: 'Stroma' }];
const RESETS_AT = '2026-10-24T07:00:00+00:00';

// What start_generation() was asked, and how it answers. Its real counting is
// checked in supabase/tests/generation-limits-check.sql.
let limit: { refuse: boolean; fail: boolean; calls: Record<string, unknown>[] };

beforeEach(() => {
  pending.callbacks = [];
  limit = { refuse: false, fail: false, calls: [] };
  fake.current = createFakeSupabase({
    tables: { profiles: { unique: [['id']] }, generation_logs: { unique: [['id']] } },
    users: { sam: STUDENT },
    rpc: {
      start_generation: (args, db) => {
        limit.calls.push(args);
        if (limit.fail) throw { code: 'XX000', message: 'database down' };
        const row = { user_id: args.p_user_id, role: args.p_role, ip_hash: args.p_ip_hash, study_type: args.p_study_type, duration_ms: 0 };
        if (limit.refuse) {
          db.rows.generation_logs.push({ ...row, id: db.rows.generation_logs.length + 1, success: false, error_kind: 'limit' });
          return { allowed: false, limit: 5, resets_at: RESETS_AT };
        }
        const id = db.rows.generation_logs.length + 1;
        db.rows.generation_logs.push({ ...row, id, success: null, error_kind: null, model: null, requests: {} });
        return { allowed: true, id, limit: 5 };
      },
    },
  });
  fake.current.db.rows.profiles = [{ id: STUDENT.id, role: 'student' }];
  gemini.run = async (onRequest) => {
    onRequest('gemini-3.5-flash');
    onRequest('gemini-3.5-flash-lite');
    return { items: ITEMS, model: 'gemini-3.5-flash-lite' };
  };
  vi.mocked(generateStudyItems).mockClear();
});

function generate(text: string | null, headers: Record<string, string> = {}, fields: Record<string, string> = {}) {
  const form = new FormData();
  if (text !== null) form.append('file', new File([text], 'notes.txt', { type: 'text/plain' }));
  form.append('studyType', 'multiple_choice');
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: form, headers }));
}
const asSam = { authorization: 'Bearer sam' };
const LONG_TEXT = 'Photosynthesis happens in the chloroplast; the stroma holds the Calvin cycle.';
const logged = () => fake.current!.db.rows.generation_logs;
const runAfter = () => Promise.all(pending.callbacks.map((fn) => fn()));

describe('/api/generate usage log (#62) and daily limits (#63)', () => {
  it('reserves a running row first, and fills it in after the response', async () => {
    const res = await generate(LONG_TEXT, asSam);
    expect(res.status).toBe(200);
    expect(limit.calls).toEqual([{ p_user_id: STUDENT.id, p_role: 'student', p_ip_hash: null, p_study_type: 'multiple_choice' }]);
    // While the response is being made, the row is only reserved (still running).
    expect(logged()).toEqual([expect.objectContaining({ id: 1, success: null })]);
    await runAfter();
    expect(logged()).toEqual([
      expect.objectContaining({
        id: 1,
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

  it("refuses once the daily limit is reached, without calling the AI", async () => {
    limit.refuse = true;
    const res = await generate(LONG_TEXT, asSam);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "You've reached today's limit of 5 study guides.", limit: 5, resetsAt: RESETS_AT });
    expect(generateStudyItems).not.toHaveBeenCalled();
    await runAfter();
    // Only the refusal start_generation() logged; nothing is added after.
    expect(logged().map((r) => r.error_kind)).toEqual(['limit']);
  });

  it('counts signed-out visitors by a hash of their IP, never the IP itself', async () => {
    await generate(LONG_TEXT, { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    await generate(LONG_TEXT, { 'x-forwarded-for': '203.0.113.7' });
    await generate(LONG_TEXT, { 'x-forwarded-for': '198.51.100.2' });
    const [first, again, other] = limit.calls.map((c) => c.p_ip_hash as string);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(again).toBe(first);
    expect(other).not.toBe(first);
    expect(JSON.stringify(limit.calls)).not.toContain('203.0.113.7');
    expect(limit.calls.every((c) => c.p_user_id === null && c.p_role === null)).toBe(true);
  });

  it.each([
    ['all models busy', new GeminiError('429', { retryable: true, status: 429 }), 503, 'ai_busy'],
    ['a bad request to the AI', new GeminiError('400', { retryable: false, status: 400 }), 502, 'ai_failed'],
    ['an unexpected error', new Error('boom'), 500, 'server_error'],
  ])('fills in a failure when %s', async (_label, error, status, kind) => {
    gemini.run = async (onRequest) => {
      onRequest('gemini-3.5-flash');
      throw error;
    };
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await generate(LONG_TEXT)).status).toBe(status);
    await runAfter();
    errorLog.mockRestore();
    expect(logged()).toEqual([
      expect.objectContaining({ user_id: null, model: null, success: false, error_kind: kind, requests: { 'gemini-3.5-flash': 1 } }),
    ]);
  });

  it('fills in files that are missing or unreadable, with no AI requests', async () => {
    expect((await generate('too short')).status).toBe(422);
    expect((await generate(null)).status).toBe(400);
    await runAfter();
    expect(logged().map((r) => [r.error_kind, r.requests, r.success])).toEqual([
      ['unreadable', {}, false],
      ['no_file', {}, false],
    ]);
  });

  it('generates anyway if the limit check itself fails, and still logs it', async () => {
    limit.fail = true;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await generate(LONG_TEXT, asSam)).status).toBe(200);
    await runAfter();
    expect(errorLog).toHaveBeenCalledWith('[generate] daily limit check failed:', expect.anything());
    errorLog.mockRestore();
    expect(logged()).toEqual([expect.objectContaining({ user_id: STUDENT.id, role: 'student', success: true, ip_hash: null })]);
  });

  it('never lets a logging failure affect anything', async () => {
    fake.current!.db.failNext('generation_logs', 'update');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await generate(LONG_TEXT, asSam)).status).toBe(200);
    await expect(runAfter()).resolves.toBeDefined();
    expect(errorLog).toHaveBeenCalledWith('[generation-logs] could not log a generation:', expect.anything());
    errorLog.mockRestore();
  });
});

describe('/api/generate options', () => {
  const sentOptions = () => vi.mocked(generateStudyItems).mock.calls.map(([, type, opts]) => [type, opts?.count]);

  it('passes the chosen question count to the AI (#65)', async () => {
    expect((await generate(LONG_TEXT, asSam, { count: '20' })).status).toBe(200);
    expect(sentOptions()).toEqual([['multiple_choice', 20]]);
  });

  it.each(['', '3', '31', 'lots'])('uses 10 questions when the count is %j', async (count) => {
    expect((await generate(LONG_TEXT, asSam, { count })).status).toBe(200);
    expect(sentOptions()).toEqual([['multiple_choice', 10]]);
  });

  it('uses flashcards when the study type is unknown', async () => {
    expect((await generate(LONG_TEXT, asSam, { studyType: 'essay' })).status).toBe(200);
    expect(sentOptions()).toEqual([['flashcard', 10]]);
  });
});
