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
const pdf = vi.hoisted(() => ({ text: '' }));
// The page a link "fetches" (#74); its real checks are in lib/web-page.test.ts.
const web = vi.hoisted(() => ({ fetch: null as null | ((url: string) => Promise<unknown>) }));
vi.mock('@/lib/web-page', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/web-page')>();
  return { ...actual, fetchWebPage: vi.fn((url: string) => web.fetch!(url)) };
});
vi.mock('unpdf', () => ({
  getDocumentProxy: async () => ({}),
  extractText: async () => ({ text: pdf.text, totalPages: 1 }),
}));
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

describe('/api/generate with pasted notes (#70)', () => {
  const paste = (text: string) => {
    const form = new FormData();
    form.append('text', text);
    form.append('studyType', 'flashcard');
    return POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: form, headers: asSam }));
  };

  it('makes a guide from the text, titled by its first line', async () => {
    const res = await paste('Photosynthesis basics\nThe stroma holds the Calvin cycle; chlorophyll absorbs light.');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: 'Photosynthesis basics', sourceFilename: null, studyType: 'flashcard' });
    expect(vi.mocked(generateStudyItems).mock.calls[0][0]).toBe(
      'Photosynthesis basics\nThe stroma holds the Calvin cycle; chlorophyll absorbs light.'
    );
  });

  it('counts each line break as one character, as the upload page does', async () => {
    const text = 'Photosynthesis line.\n'.repeat(1_428); // 29,988 characters with \n, 31,416 with \r\n
    expect(text.length).toBe(29_988);
    expect((await paste(text)).status).toBe(200);
  });

  it.each([
    ['too short', 'Stroma', 'Paste at least a sentence or two of your notes.'],
    ['too long', 'x'.repeat(30_001), "That's 30,001 characters. Paste up to 30,000, or upload it as a file."],
  ])('refuses text that is %s, without calling the AI', async (_label, text, error) => {
    const res = await paste(text);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error });
    expect(generateStudyItems).not.toHaveBeenCalled();
    await runAfter();
    expect(logged().map((r) => r.error_kind)).toEqual(['unreadable']);
  });
});

describe('/api/generate with Word and PowerPoint files (#71)', () => {
  const upload = (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('studyType', 'flashcard');
    return POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: form, headers: asSam }));
  };
  const docx = async () => {
    const { strToU8, zipSync } = await import('fflate');
    const xml = '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>The stroma holds the Calvin cycle and RuBisCO.</w:t></w:r></w:p></w:body></w:document>';
    return new File([zipSync({ 'word/document.xml': strToU8(xml) }) as BlobPart], 'Bio handout.docx');
  };

  it('reads the text of a Word file and titles the guide after it', async () => {
    const res = await upload(await docx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: 'Bio handout', sourceFilename: 'Bio handout.docx' });
    expect(vi.mocked(generateStudyItems).mock.calls[0][0]).toBe('The stroma holds the Calvin cycle and RuBisCO.');
  });

  it.each([
    ['an old .ppt file', new File(['x'], 'lecture.ppt'), "Older PowerPoint (.ppt) files can't be read. Save it as .pptx or PDF first."],
    ['a broken .docx', new File(['not a zip at all'], 'broken.docx'), "We couldn't read this file. Please try a different file, or paste the text."],
  ])('refuses %s without calling the AI', async (_label, file, error) => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await upload(file);
    errorLog.mockRestore();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error });
    expect(generateStudyItems).not.toHaveBeenCalled();
  });
});

describe('/api/generate with photos (#72)', () => {
  const upload = (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('studyType', 'flashcard');
    return POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: form, headers: asSam }));
  };
  const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'Whiteboard.jpg', { type: 'image/jpeg' });

  it('sends the photo itself to the AI', async () => {
    const res = await upload(photo());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: 'Whiteboard', sourceFilename: 'Whiteboard.jpg' });
    const [text, , opts] = vi.mocked(generateStudyItems).mock.calls[0];
    expect(text).toBe('');
    expect(opts?.attachment).toEqual({ mimeType: 'image/jpeg', data: '/9j/4A==' });
  });

  it('answers 422 when the AI finds nothing to study in it', async () => {
    gemini.run = async (onRequest) => {
      onRequest('gemini-3.5-flash');
      throw new GeminiError('nothing to study in the attachment', {
        retryable: false,
        unreadable: true,
        userMessage: "We couldn't find any notes to study in this file. Try a clearer, brighter photo, or paste the text.",
      });
    };
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await upload(photo());
    errorLog.mockRestore();
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Try a clearer, brighter photo/);
    await runAfter();
    expect(logged().map((r) => [r.error_kind, r.requests])).toEqual([['unreadable', { 'gemini-3.5-flash': 1 }]]);
  });
});

describe('/api/generate with scanned PDFs (#73)', () => {
  const upload = () => {
    const form = new FormData();
    form.append('file', new File(['%PDF-1.4 scanned pages'], 'Chapter 2.pdf', { type: 'application/pdf' }));
    form.append('studyType', 'flashcard');
    return POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: form, headers: asSam }));
  };

  it('sends a PDF with (almost) no text in it to the AI as it is', async () => {
    pdf.text = ' 1 \n 2 ';
    expect((await upload()).status).toBe(200);
    const [text, , opts] = vi.mocked(generateStudyItems).mock.calls[0];
    expect(text).toBe('');
    expect(opts?.attachment).toEqual({
      mimeType: 'application/pdf',
      data: Buffer.from('%PDF-1.4 scanned pages').toString('base64'),
    });
  });

  it('keeps reading the text of a PDF that has 100 characters or more', async () => {
    pdf.text = 'x'.repeat(100);
    expect((await upload()).status).toBe(200);
    const [text, , opts] = vi.mocked(generateStudyItems).mock.calls[0];
    expect(text).toBe('x'.repeat(100));
    expect(opts?.attachment).toBeUndefined();
  });
});

describe('/api/generate with a web link (#74)', () => {
  const sendLink = (url: string) => {
    const form = new FormData();
    form.append('url', url);
    form.append('studyType', 'flashcard');
    return POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: form, headers: asSam }));
  };

  it('makes a guide from the page text, titled after the page', async () => {
    web.fetch = async () => ({
      title: 'Photosynthesis - Biology Online',
      text: 'The stroma holds the Calvin cycle; chlorophyll absorbs light.',
      url: 'https://example.org/photosynthesis',
    });
    const res = await sendLink('https://example.org/photosynthesis');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      title: 'Photosynthesis - Biology Online',
      sourceFilename: 'https://example.org/photosynthesis',
    });
    expect(vi.mocked(generateStudyItems).mock.calls[0][0]).toBe('The stroma holds the Calvin cycle; chlorophyll absorbs light.');
  });

  it("passes on the fetcher's reason, without calling the AI", async () => {
    const { WebPageError } = await import('@/lib/web-page');
    web.fetch = async () => {
      throw new WebPageError('private address 10.0.0.5', "This link points to a private address, so it can't be used.");
    };
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await sendLink('http://intranet.example/');
    errorLog.mockRestore();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "This link points to a private address, so it can't be used." });
    expect(generateStudyItems).not.toHaveBeenCalled();
  });

  it('checks the daily limit before fetching anything', async () => {
    limit.refuse = true;
    web.fetch = vi.fn();
    expect((await sendLink('https://example.org/')).status).toBe(429);
    expect(web.fetch).not.toHaveBeenCalled();
  });

  it('says so when a page has almost no text', async () => {
    web.fetch = async () => ({ title: '', text: 'Sign in', url: 'https://example.org/private' });
    const res = await sendLink('https://example.org/private');
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Pages that need signing in can't be read/);
  });
});
