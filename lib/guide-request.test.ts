import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: () => getSession() } } }));
const planPdfUpload = vi.fn();
vi.mock('@/lib/prepare-pdf', () => ({ planPdfUpload: (...args: unknown[]) => planPdfUpload(...args) }));

import { guideForm, guideSourceProblem, requestGuide, slowNoticeMs, UNREACHABLE, type GuideSettings } from '@/lib/guide-request';
import { encodeEvent, PROGRESS_MIME, type ProgressEvent } from '@/lib/generation-progress';

const settings: GuideSettings = { studyType: 'multiple_choice', count: 10, difficulty: 'medium' };
const NOTES = 'Mitochondria make ATP for the cell, and ribosomes build proteins.';
const fields = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `file:${v.name}`]));

async function formFor(...args: Parameters<typeof guideForm>) {
  const made = await guideForm(...args);
  if (made.kind !== 'form') throw new Error(made.message);
  return fields(made.form);
}

// The progress stream /api/generate sends when asked for it.
function streamed(events: ProgressEvent[]) {
  const body = events.map(encodeEvent).join('');
  return new Response(body, { status: 200, headers: { 'content-type': PROGRESS_MIME } });
}

const cards = [{ question: 'What makes ATP?', answer: 'Mitochondria', options: ['Mitochondria', 'Ribosome', 'Nucleus', 'Golgi body'] }];
const guide = { title: 'Cells', sourceFilename: null, source: null, studyType: 'multiple_choice', items: cards, historyId: 'h1' };

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: null } });
  planPdfUpload.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('what a deck is made from', () => {
  it('checks notes, links and topics before sending', () => {
    expect(guideSourceProblem({ kind: 'text', notes: 'too short', file: null })).toMatch(/at least a sentence/);
    expect(guideSourceProblem({ kind: 'link', notes: 'not a link', file: null })).toMatch(/full link/);
    expect(guideSourceProblem({ kind: 'topic', notes: 'x', file: null })).toMatch(/Type a topic/);
    expect(guideSourceProblem({ kind: 'file', notes: '', file: null })).toBe('Pick a file first.');
    expect(guideSourceProblem({ kind: 'text', notes: NOTES, file: null })).toBeNull();
  });

  it('sends notes, links and topics with the settings', async () => {
    expect(await formFor({ kind: 'text', notes: NOTES, file: null }, settings)).toEqual({
      text: NOTES,
      studyType: 'multiple_choice',
      count: '10',
      difficulty: 'medium',
    });
    expect(await formFor({ kind: 'link', notes: 'https://en.wikipedia.org/wiki/Cell', file: null }, settings)).toMatchObject({
      url: 'https://en.wikipedia.org/wiki/Cell',
    });
    expect(await formFor({ kind: 'topic', notes: '  Photosynthesis ', file: null }, settings)).toMatchObject({ topic: 'Photosynthesis' });
  });

  it('sends a file as it is, and a readable PDF as its pages', async () => {
    const docx = new File(['x'], 'notes.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    expect(await formFor({ kind: 'file', notes: '', file: docx }, settings)).toMatchObject({ file: 'file:notes.docx' });

    const pdf = new File(['%PDF'], 'lecture.pdf', { type: 'application/pdf' });
    const onRead = vi.fn();
    planPdfUpload.mockResolvedValueOnce({ kind: 'pages', pages: ['Page one', 'Page two'] });
    const sent = await formFor({ kind: 'file', notes: '', file: pdf }, settings, onRead);
    expect(sent).toMatchObject({ pages: JSON.stringify(['Page one', 'Page two']), fileName: 'lecture.pdf' });
    expect(sent).not.toHaveProperty('file');
    expect(planPdfUpload).toHaveBeenCalledWith(pdf, onRead);

    // Scanned: the server reads it.
    planPdfUpload.mockResolvedValueOnce({ kind: 'file' });
    expect(await formFor({ kind: 'file', notes: '', file: pdf }, settings)).toMatchObject({ file: 'file:lecture.pdf' });

    planPdfUpload.mockResolvedValueOnce({ kind: 'problem', message: 'This PDF is locked.' });
    expect(await guideForm({ kind: 'file', notes: '', file: pdf }, settings)).toEqual({ kind: 'problem', message: 'This PDF is locked.' });
  });

  it('waits longer for bigger decks', () => {
    expect(slowNoticeMs(10)).toBe(15_000);
    expect(slowNoticeMs(30)).toBe(35_000);
  });
});

describe('making the deck', () => {
  it('follows the steps and the first cards to the finished guide', async () => {
    const fetchMock = vi.fn(async () =>
      streamed([
        { type: 'step', step: 'reading' },
        { type: 'step', step: 'writing' },
        { type: 'cards', title: 'Cells', sourceFilename: null, source: null, studyType: 'multiple_choice', items: cards },
        { type: 'result', status: 200, body: guide },
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const step = vi.fn();
    const onCards = vi.fn();
    const outcome = await requestGuide(new FormData(), { step, cards: onCards });

    expect(outcome).toEqual({ ok: true, guide });
    expect(step.mock.calls.map(([e]) => e.step)).toEqual(['reading', 'writing']);
    expect(onCards).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cells', items: cards }));
    expect(fetchMock).toHaveBeenCalledWith('/api/generate', expect.objectContaining({ method: 'POST', headers: { Accept: PROGRESS_MIME } }));
  });

  it('sends the session token when signed in', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'token-1' } } });
    const fetchMock = vi.fn(async () => streamed([{ type: 'result', status: 200, body: guide }]));
    vi.stubGlobal('fetch', fetchMock);
    await requestGuide(new FormData());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/generate',
      expect.objectContaining({ headers: { Accept: PROGRESS_MIME, Authorization: 'Bearer token-1' } })
    );
  });

  it("says why it failed, and keeps the cards that came first", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamed([
          { type: 'cards', title: 'Cells', sourceFilename: null, source: null, studyType: 'multiple_choice', items: cards },
          { type: 'result', status: 502, body: { error: 'The AI stopped early.' } },
        ])
      )
    );
    const outcome = await requestGuide(new FormData());
    expect(outcome).toMatchObject({ ok: false, message: 'The AI stopped early.', partial: { title: 'Cells', items: cards } });
  });

  it('passes on the daily limit message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: "You've reached today's limit of 3 study guides." }, { status: 429 })));
    expect(await requestGuide(new FormData())).toEqual({
      ok: false,
      message: "You've reached today's limit of 3 study guides.",
      partial: null,
    });
  });

  it("says when the server can't be reached", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    expect(await requestGuide(new FormData())).toEqual({ ok: false, message: UNREACHABLE, partial: null });
  });
});
