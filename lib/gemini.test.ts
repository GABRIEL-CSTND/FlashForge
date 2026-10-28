import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANSWER_LIMITS, generateStudyItems, minValidItems, mixedRequest, requestedCount } from '@/lib/gemini';
import { lineUnits, pageUnits } from '@/lib/source-quotes';

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
      responseSchema: { type: 'ARRAY', items: { required: ['question', 'answer', 'explanation', 'source'] } },
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
    const untyped: Record<string, unknown> = { ...idItem(1) };
    delete untyped.type;
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

describe('scanned PDFs (#73)', () => {
  const scan = { mimeType: 'application/pdf', data: 'JVBERi0=' };

  it('tells the AI the attachment is scanned pages', async () => {
    mockModel(() => reply(flashcards(6)));
    await generateStudyItems('', 'flashcard', { count: 5, attachment: scan });
    expect(sent[0].prompt).toContain('from the attached document (scanned pages)');
    expect(sent[0].prompt).toContain('If the document has no readable study material');
  });

  it('suggests a clearer scan when it finds nothing to study', async () => {
    mockModel(() => reply([]));
    await expect(generateStudyItems('', 'flashcard', { attachment: scan })).rejects.toMatchObject({
      unreadable: true,
      userMessage: "We couldn't find any notes to study in this file. Try a clearer scan, or paste the text.",
    });
  });
});

describe('short answers', () => {
  const mc = (i: number, options: string[], answer = options[0]) => ({ question: `Clue ${i}`, options, answer });
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('allows a little slack over the 1 to 4 words the prompt asks for', () => {
    expect(ANSWER_LIMITS).toEqual({ chars: 60, words: 6 });
  });

  it('drops flashcards with an overly long answer and keeps short ones', async () => {
    mockModel(() =>
      reply([
        { question: 'Clue 1', answer: 'Mitochondria' },
        { question: 'Clue 2', answer: 'Treaty of Paris' },
        { question: 'Clue 3', answer: 'one two three four five six' }, // 6 words: still fine
        { question: 'Clue 4', answer: 'one two three four five six seven' }, // 7 words
        { question: 'Clue 5', answer: 'The process by which plants convert light into chemical energy' },
        { question: 'Clue 6', answer: 'Supercalifragilisticexpialidocious Pneumonoultramicroscopicsilicovolcanoconiosis' }, // 80 chars
      ])
    );
    const { items } = await generateStudyItems('Some notes.', 'flashcard', { count: 5 });
    expect(items.map((i) => i.answer)).toEqual(['Mitochondria', 'Treaty of Paris', 'one two three four five six']);
  });

  it('drops a multiple-choice card when any choice is a long sentence', async () => {
    const colours = ['Red', 'Blue', 'Green', 'Yellow'];
    mockModel(() =>
      reply([
        mc(1, colours),
        mc(2, colours),
        mc(3, colours),
        // a wrong choice is a sentence
        mc(4, ['Red', 'Blue', 'Green', 'The colour that results from mixing blue and yellow pigments together']),
        // the correct answer itself is a sentence
        mc(5, ['The colour that results from mixing blue and yellow pigments together', 'Red', 'Blue', 'Green']),
      ])
    );
    const { items } = await generateStudyItems('Some notes.', 'multiple_choice', { count: 5 });
    expect(items.map((i) => i.question)).toEqual(['Clue 1', 'Clue 2', 'Clue 3']);
    for (const item of items) {
      expect(item.options).toHaveLength(4);
      for (const text of [item.answer, ...(item.options ?? [])]) expect(words(text)).toBeLessThanOrEqual(ANSWER_LIMITS.words);
    }
  });

  it('asks for short choices in the multiple-choice prompt', async () => {
    mockModel(() => reply([mc(1, ['A', 'B', 'C', 'D']), mc(2, ['A', 'B', 'C', 'D']), mc(3, ['A', 'B', 'C', 'D'])]));
    await generateStudyItems('Some notes.', 'multiple_choice', { count: 5 });
    expect(sent[0].prompt).toContain('Every choice is 1 to 4 words');
  });
});

describe('difficulty and focus (#79)', () => {
  it('asks for easy or hard questions, and nothing extra for medium', async () => {
    mockModel(() => reply(flashcards(11)));
    await generateStudyItems('Notes.', 'flashcard', { difficulty: 'hard' });
    await generateStudyItems('Notes.', 'flashcard', { difficulty: 'easy' });
    await generateStudyItems('Notes.', 'flashcard', { difficulty: 'medium' });
    expect(sent[0].prompt).toContain('Difficulty: hard. Ask about specific details');
    expect(sent[1].prompt).toContain('Difficulty: easy. Ask about the most important terms');
    expect(sent[2].prompt).not.toContain('Difficulty:');
  });

  it('focuses on a typed topic, without letting it break out of its quotes', async () => {
    mockModel(() => reply(flashcards(11)));
    await generateStudyItems('Article text.', 'flashcard', { focus: 'the "Calvin\ncycle"' });
    expect(sent[0].prompt).toContain('Focus on what the text says about “the Calvin cycle”.');
  });
});

describe('where a card came from', () => {
  const notes =
    'Cells are the basic unit of life.\nThe mitochondria is the organelle that produces most of the cell energy as ATP.\nRibosomes assemble proteins by translating messenger RNA.';
  const quoted = (i: number, source: unknown) => ({ question: `Quote clue ${i}`, answer: `Quote term ${i}`, source });
  // 11 cards, the first few with the given quotes and the rest without any.
  const cardsWith = (first: unknown[]) => [...first, ...flashcards(11).slice(first.length)];

  it('asks for the sentence on a text source, in the prompt and in the schema', async () => {
    mockModel(() => reply(flashcards(11)));
    await generateStudyItems(notes, 'flashcard');
    expect(sent[0].prompt).toContain('"source" field');
    expect(sent[0].body.generationConfig).toMatchObject({
      responseSchema: { type: 'ARRAY', items: { required: ['question', 'answer', 'source'] } },
    });
  });

  it('keeps a quote that is in the text, with the line it is on', async () => {
    const { text, units } = lineUnits(notes);
    mockModel(() => reply(cardsWith([quoted(1, 'Ribosomes assemble proteins by translating messenger RNA.')])));
    const { items } = await generateStudyItems(text, 'flashcard', { units });
    expect(items[0]).toMatchObject({
      question: 'Quote clue 1',
      source: 'Ribosomes assemble proteins by translating messenger RNA.',
      sourceLocation: 'Line 3',
    });
  });

  it('says which page a PDF quote is on', async () => {
    const { text, units } = pageUnits(['An introduction to the cell.', 'Ribosomes assemble proteins by translating messenger RNA.']);
    mockModel(() => reply(cardsWith([quoted(1, 'Ribosomes assemble proteins by translating messenger RNA.')])));
    const { items } = await generateStudyItems(text, 'flashcard', { units });
    expect(items[0].sourceLocation).toBe('Page 2');
  });

  it('keeps the quote without a place when the text has no pages or lines', async () => {
    mockModel(() => reply(cardsWith([quoted(1, 'The mitochondria is the organelle that produces most of the cell energy as ATP.')])));
    const { items } = await generateStudyItems(notes, 'flashcard');
    expect(items[0].source).toBe('The mitochondria is the organelle that produces most of the cell energy as ATP.');
    expect(items[0].sourceLocation).toBeUndefined();
  });

  it('drops a quote that is not in the text, but keeps the card', async () => {
    const { text, units } = lineUnits(notes);
    mockModel(() => reply(cardsWith([quoted(1, 'The nucleus is where the genetic material of the cell is stored.')])));
    const { items } = await generateStudyItems(text, 'flashcard', { units });
    expect(items[0]).toMatchObject({ question: 'Quote clue 1', answer: 'Quote term 1' });
    expect(items[0].source).toBeUndefined();
    expect(items[0].sourceLocation).toBeUndefined();
  });

  it('keeps the real pieces of a table row the PDF text keeps apart', async () => {
    const { text, units } = pageUnits([
      'down away from bad difficult painful de dys dehydrate to remove water dysphagia difficulty swallowing',
    ]);
    mockModel(() => reply(cardsWith([quoted(1, 'Down, away from de- Dehydrate (to remove water)')])));
    const { items } = await generateStudyItems(text, 'flashcard', { units });
    expect(items[0].source).toBe('Down, away from … de- … Dehydrate (to remove water)');
    expect(items[0].sourceLocation).toBe('Page 1');
  });

  it('works for multiple choice and true or false too', async () => {
    const { text, units } = lineUnits(notes);
    const choice = (source: string) => ({
      question: 'Which organelle makes most of the cell energy?',
      options: ['Mitochondria', 'Ribosome', 'Nucleus', 'Golgi'],
      answer: 'Mitochondria',
      source,
    });
    mockModel(() => reply(Array.from({ length: 12 }, (_, i) => ({ ...choice('The mitochondria is the organelle that produces most of the cell energy as ATP.'), question: `Which organelle makes energy, version ${i}?` }))));
    const { items } = await generateStudyItems(text, 'multiple_choice', { units });
    expect(items[0]).toMatchObject({ sourceLocation: 'Line 2' });
  });

  it('does not ask for a quote from a photo, and never returns one', async () => {
    mockModel(() => reply(flashcards(11).map((c) => ({ ...c, source: 'A sentence the AI says it can see in the photo.' }))));
    const { items } = await generateStudyItems('', 'flashcard', { attachment: { mimeType: 'image/png', data: 'AAAA' } });
    expect(sent[0].prompt).not.toContain('"source" field');
    expect(JSON.stringify(sent[0].body)).not.toContain('"source"');
    expect(items.every((i) => i.source === undefined && i.sourceLocation === undefined)).toBe(true);
  });

  it('tells Gemma about the field in the prompt', async () => {
    mockModel((req) => (req.model === 'gemma-4-26b-a4b-it' ? reply(flashcards(11)) : new Response('quota', { status: 429 })));
    await generateStudyItems(notes, 'flashcard');
    expect(sent.at(-1)!.model).toBe('gemma-4-26b-a4b-it');
    expect(sent.at(-1)!.prompt).toContain('Each object also has a string field "source".');
  });

  it('logs how many quotes were kept, never the text itself', async () => {
    const { text, units } = lineUnits(notes);
    mockModel(() =>
      reply(
        cardsWith([
          quoted(1, 'Ribosomes assemble proteins by translating messenger RNA.'),
          quoted(2, 'Something the notes never say anywhere at all.'),
        ])
      )
    );
    await generateStudyItems(text, 'flashcard', { units });
    const logged = vi.mocked(console.log).mock.calls.flat().join(' ');
    expect(logged).toContain('quotes: 1 whole / 0 in pieces / 1 dropped');
    expect(logged).not.toContain('Ribosomes');
    expect(logged).not.toContain('Something the notes');

  });
});

describe('whole document coverage (#38)', () => {
  it('instructs the model to spread questions across the entire text', async () => {
    mockModel(() => reply(flashcards(11)));
    await generateStudyItems('Notes about biology.', 'flashcard');
    expect(sent[0].prompt).toContain('Spread questions across the entire text, covering the beginning, middle, and end.');
  });

  it('samples a 40+ page PDF and preserves quotes from the beginning and end (#38)', async () => {
    const pages = Array.from({ length: 45 }, (_, i) =>
      i === 0
        ? 'Photosynthesis occurs within plant chloroplasts.'.padEnd(1000, '.')
        : i === 44
        ? 'Ribosomes synthesize cellular proteins from amino acids.'.padEnd(1000, '.')
        : `Page ${i + 1} content. `.padEnd(1000, '.')
    );
    const { text, units } = pageUnits(pages);

    mockModel(() =>
      reply([
        { question: 'What synthesizes proteins?', answer: 'Ribosomes', source: 'Ribosomes synthesize cellular proteins from amino acids.' },
        { question: 'Where does photosynthesis happen?', answer: 'Chloroplasts', source: 'Photosynthesis occurs within plant chloroplasts.' },
        ...flashcards(9),
      ])
    );

    const { items } = await generateStudyItems(text, 'flashcard', { units });
    expect(items[0]).toMatchObject({
      answer: 'Ribosomes',
      sourceLocation: 'Page 45',
    });
    expect(items[1]).toMatchObject({
      answer: 'Chloroplasts',
      sourceLocation: 'Page 1',
    });
  });

  it('checks quotes in a long text file against the same parts the AI read', async () => {
    // About 60,000 characters in 200 paragraphs; the last one is on line 399.
    const last = 'Ribosomes translate messenger RNA into chains of amino acids.';
    const raw = Array.from({ length: 200 }, (_, i) =>
      i === 199 ? last : `Paragraph ${i + 1}. ${'Cells divide and grow. '.repeat(13)}`
    ).join('\n\n');
    const { text, units } = lineUnits(raw);
    mockModel(() => reply([{ question: 'What translates mRNA?', answer: 'Ribosomes', source: last }, ...flashcards(10)]));

    const { items } = await generateStudyItems(text, 'flashcard', { units });
    expect(sent[0].prompt).toContain(text);
    expect(items[0]).toMatchObject({ answer: 'Ribosomes', source: last, sourceLocation: 'Line 399' });
  });
});
