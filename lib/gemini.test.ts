import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateStudyItems, minValidItems, mixedRequest, requestedCount } from '@/lib/gemini';

// Gemini is never called for real here: fetch is replaced by canned responses.

interface SentRequest {
  model: string;
  prompt: string;
  body: Record<string, unknown>;
}

let sent: SentRequest[];

function reply(items: unknown[]) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(items) }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function mockModel(respond: (req: SentRequest) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const req = {
        model: url.split('/models/')[1].split(':')[0],
        prompt: body.contents[0].parts[0].text as string,
        body,
      };
      sent.push(req);
      return respond(req);
    })
  );
}

const flashcards = (n: number) => Array.from({ length: n }, (_, i) => ({ question: `Clue number ${i + 1}`, answer: `Term ${i + 1}` }));

beforeEach(() => {
  sent = [];
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('question count (#65)', () => {
  it('asks for a few spares and the right minimum', () => {
    expect(requestedCount('flashcard', 10)).toBe(11);
    expect(requestedCount('multiple_choice', 10)).toBe(12);
    expect(requestedCount('flashcard', 30)).toBe(33);
    expect(requestedCount('multiple_choice', 5)).toBe(6);
    expect(minValidItems(10)).toBe(6);
    expect(minValidItems(5)).toBe(3);
    expect(minValidItems(30)).toBe(18);
  });

  it('asks the AI for the chosen count plus spares, and returns no more than the count', async () => {
    mockModel(() => reply(flashcards(22)));
    const { items, model } = await generateStudyItems('Some notes about cells.', 'flashcard', { count: 20 });
    expect(sent).toHaveLength(1);
    expect(sent[0].prompt).toContain('Produce exactly 22 items.');
    expect(items).toHaveLength(20);
    expect(items[19]).toEqual({ question: 'Clue number 20', answer: 'Term 20' });
    expect(model).toBe('gemini-3.5-flash');
  });

  it('keeps fewer items than asked when enough of them are usable', async () => {
    mockModel(() => reply([...flashcards(3), { question: 'Broken', answer: '<b>html</b>' }]));
    const { items } = await generateStudyItems('Some notes.', 'flashcard', { count: 5 });
    expect(items).toHaveLength(3);
  });

  it('tries the next model when too few items are usable for the chosen count', async () => {
    // 11 usable items is fine for 10 questions but not for 20 (at least 12).
    mockModel((req) =>
      req.model === 'gemini-3.5-flash'
        ? new Response('quota', { status: 429 })
        : reply(req.model === 'gemini-3.5-flash-lite' ? flashcards(11) : flashcards(22))
    );
    const { items, model } = await generateStudyItems('Some notes.', 'flashcard', { count: 20 });
    // flash: 429 (skips ahead); flash-lite: too few twice; gemma: enough.
    expect(sent.map((r) => r.model)).toEqual([
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash-lite',
      'gemma-4-26b-a4b-it',
    ]);
    expect(model).toBe('gemma-4-26b-a4b-it');
    expect(items).toHaveLength(20);
  });

  it('defaults to 10 items and reports every request', async () => {
    const onRequest = vi.fn();
    mockModel(() => reply(flashcards(11)));
    const { items } = await generateStudyItems('Some notes.', 'flashcard', { onRequest });
    expect(sent[0].prompt).toContain('Produce exactly 11 items.');
    expect(items).toHaveLength(10);
    expect(onRequest).toHaveBeenCalledWith('gemini-3.5-flash');
  });
});

describe('true or false (#68)', () => {
  const statement = (i: number, answer: unknown, explanation?: unknown) => ({ question: `Statement number ${i} about cells.`, answer, explanation });

  it('asks for statements and keeps them as True/False cards with their corrections', async () => {
    mockModel(() =>
      reply([
        statement(1, 'True', ''),
        statement(2, 'false', 'The corrected fact.'),
        statement(3, 'Maybe'),
        statement(4, true),
        statement(5, 'False', '<b>broken</b>'),
        statement(6, 'False', 'Another correction.'),
      ])
    );
    const { items } = await generateStudyItems('Notes about cells.', 'true_false', { count: 5 });
    expect(sent[0].prompt).toContain('Create true-or-false statements.');
    expect(sent[0].prompt).toContain('Produce exactly 6 items.');
    expect(sent[0].body.generationConfig).toMatchObject({
      responseSchema: { type: 'ARRAY', items: { required: ['question', 'answer', 'explanation'] } },
    });
    // "Maybe" is dropped; a broken explanation is dropped but the statement kept.
    expect([...items].sort((a, b) => a.question.localeCompare(b.question))).toEqual([
      { question: 'Statement number 1 about cells.', answer: 'True', options: ['True', 'False'] },
      { question: 'Statement number 2 about cells.', answer: 'False', options: ['True', 'False'], explanation: 'The corrected fact.' },
      { question: 'Statement number 4 about cells.', answer: 'True', options: ['True', 'False'] },
      { question: 'Statement number 5 about cells.', answer: 'False', options: ['True', 'False'] },
      { question: 'Statement number 6 about cells.', answer: 'False', options: ['True', 'False'], explanation: 'Another correction.' },
    ]);
  });

  it('tells Gemma the format in the prompt', async () => {
    mockModel((req) =>
      req.model === 'gemma-4-26b-a4b-it'
        ? reply([statement(1, 'True'), statement(2, 'False', 'Fixed.'), statement(3, 'True')])
        : new Response('quota', { status: 429 })
    );
    await generateStudyItems('Notes.', 'true_false', { count: 5 });
    expect(sent.at(-1)!.prompt).toContain('"answer" ("True" or "False")');
  });
});

describe('mixed quiz (#69)', () => {
  const mcItem = (i: number) => ({ type: 'multiple_choice', question: `Clue for choice ${i}`, options: [`Right ${i}`, 'Wrong A', 'Wrong B', 'Wrong C'], answer: `Right ${i}` });
  const tfItem = (i: number) => ({ type: 'true_false', question: `Statement ${i} about cells.`, answer: i % 2 ? 'True' : 'False', explanation: i % 2 ? '' : 'Fixed.' });
  const idItem = (i: number) => ({ type: 'identification', question: `Clue for term ${i}`, answer: `Term ${i}` });
  const kinds = (items: { options?: string[] }[]) =>
    items.map((i) => (!i.options ? 'id' : i.options.length === 2 ? 'tf' : 'mc')).join(',');

  it('asks for each part with spares and keeps each part\'s share, in order', async () => {
    mockModel(() => reply([...[1, 2, 3, 4, 5].map(mcItem), ...[1, 2, 3, 4].map(tfItem), ...[1, 2, 3, 4].map(idItem)]));
    const { items } = await generateStudyItems('Notes.', 'mixed', { count: 10 });
    expect(mixedRequest(10)).toEqual({ multiple_choice: 5, true_false: 4, identification: 4 });
    expect(sent[0].prompt).toContain('Produce exactly 13 items.');
    expect(sent[0].prompt).toContain('Part I: exactly 5 items with "type": "multiple_choice".');
    expect(sent[0].prompt).toContain('Part III: exactly 4 items with "type": "identification".');
    expect(kinds(items)).toBe('mc,mc,mc,mc,tf,tf,tf,id,id,id');
    expect(items.slice(0, 4).map((i) => i.answer)).toEqual(['Right 1', 'Right 2', 'Right 3', 'Right 4']);
    expect(items[9]).toEqual({ question: 'Clue for term 3', answer: 'Term 3' });
  });

  it('fills a short part from the other parts\' spares, and guesses a missing type', async () => {
    const { type: _t, ...untyped } = idItem(1);
    mockModel(() => reply([...[1, 2, 3, 4, 5].map(mcItem), ...[1, 2, 3, 4].map(tfItem), untyped, { ...idItem(2), answer: 'x '.repeat(20) }]));
    const { items } = await generateStudyItems('Notes.', 'mixed', { count: 10 });
    // Identification has 1 usable item, so a spare multiple-choice and true-or-false one fill in.
    expect(kinds(items)).toBe('mc,mc,mc,mc,mc,tf,tf,tf,tf,id');
  });

  it('tries the next model when a whole part is missing', async () => {
    mockModel((req) =>
      reply(
        req.model === 'gemini-3.5-flash'
          ? [...[1, 2, 3, 4, 5, 6].map(mcItem), ...[1, 2, 3, 4, 5].map(tfItem)]
          : [...[1, 2, 3, 4].map(mcItem), ...[1, 2, 3].map(tfItem), ...[1, 2, 3].map(idItem)]
      )
    );
    const { items, model } = await generateStudyItems('Notes.', 'mixed', { count: 10 });
    expect(sent.map((r) => r.model)).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']);
    expect(model).toBe('gemini-3.5-flash-lite');
    expect(kinds(items)).toBe('mc,mc,mc,mc,tf,tf,tf,id,id,id');
  });
});

describe('photos (#72)', () => {
  const photo = { mimeType: 'image/jpeg', data: 'AAAA' };

  it('sends the photo with the prompt instead of text', async () => {
    mockModel(() => reply(flashcards(11)));
    const { items } = await generateStudyItems('', 'flashcard', { attachment: photo });
    expect(items).toHaveLength(10);
    const parts = (sent[0].body.contents as { parts: Record<string, unknown>[] }[])[0].parts;
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } });
    expect(sent[0].prompt).toContain('from the attached photo');
    expect(sent[0].prompt).toContain('If the photo has no readable study material, return an empty array []');
    expect(sent[0].prompt).not.toContain('TEXT:');
  });

  it('says so right away when the AI finds nothing to study in the photo', async () => {
    mockModel(() => reply([]));
    await expect(generateStudyItems('', 'flashcard', { attachment: photo })).rejects.toMatchObject({
      unreadable: true,
      retryable: false,
      userMessage: "We couldn't find any notes to study in this file. Try a clearer, brighter photo, or paste the text.",
    });
    expect(sent).toHaveLength(1);
  });
});
