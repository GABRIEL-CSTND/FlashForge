import { describe, expect, it } from 'vitest';
import {
  createSourceChecker,
  GAP_MARKER,
  joinUnits,
  lineUnits,
  pageUnits,
  samplePages,
  sampleText,
  sourceKey,
} from '@/lib/source-quotes';

const MAX = 30_000;

describe('sourceKey', () => {
  it('ignores case, punctuation, dashes, curly quotes and line breaks', () => {
    expect(sourceKey('Brady-\n  Slow “Bradycardia” (slow heart rate)')).toBe('brady slow bradycardia slow heart rate');
    expect(sourceKey('Brady – Slow: Bradycardia, slow heart rate')).toBe('brady slow bradycardia slow heart rate');
  });

  it('turns ligatures into letters', () => {
    expect(sourceKey('the o\uFB03ce')).toBe('the office');
  });

  it('is empty for punctuation alone', () => {
    expect(sourceKey('..........')).toBe('');
  });
});

describe('pageUnits and lineUnits', () => {
  it('join the units with the separator the checker expects', () => {
    expect(pageUnits(['one', 'two']).text).toBe('one\n\ntwo');
    expect(lineUnits('a\r\nb\rc').text).toBe('a\nb\nc');
    expect(lineUnits('a\r\nb\rc').units.texts).toEqual(['a', 'b', 'c']);
  });
});

describe('createSourceChecker: whole quotes', () => {
  const pages = [
    'The mitochondria is the organelle that produces most of the cell energy as ATP.',
    'The Golgi apparatus modifies and packages proteins for secretion.',
    'The nucleus stores the genetic material of the cell as DNA.',
  ];
  const { text, units } = pageUnits(pages);

  it('keeps a quote that is in the document and says which page it is on', () => {
    const { check } = createSourceChecker(text, MAX, units);
    expect(check({ source: 'The Golgi apparatus modifies and packages proteins for secretion.' })).toEqual({
      source: 'The Golgi apparatus modifies and packages proteins for secretion.',
      sourceLocation: 'Page 2',
    });
    expect(check({ source: 'the nucleus stores the genetic material of the cell as DNA' }).sourceLocation).toBe('Page 3');
  });

  it('reports a quote that runs over a page break at the page it starts on', () => {
    const across = pageUnits(['The cell membrane controls which substances', 'can enter or leave the cell.']);
    const { check } = createSourceChecker(across.text, MAX, across.units);
    const out = check({ source: 'controls which substances can enter or leave the cell' });
    expect(out.source).toBe('controls which substances can enter or leave the cell');
    expect(out.sourceLocation).toBe('Page 1');
  });

  it('gives a line number for plain text, even with Windows line endings', () => {
    const lines = lineUnits('First line about cells.\r\nRibosomes assemble proteins by translating mRNA.\r\nThird line.');
    const { check } = createSourceChecker(lines.text, MAX, lines.units);
    expect(check({ source: 'Ribosomes assemble proteins by translating mRNA.' }).sourceLocation).toBe('Line 2');
  });

  it('keeps the quote without a location when the text was not split', () => {
    const { check } = createSourceChecker('Plants make glucose by photosynthesis in the chloroplast.', MAX);
    expect(check({ source: 'Plants make glucose by photosynthesis' })).toEqual({
      source: 'Plants make glucose by photosynthesis',
      sourceLocation: undefined,
    });
  });

  it('accepts a quote whose punctuation differs from the document', () => {
    const { check } = createSourceChecker('bi-\nTwo,  double Bilateral (affecting both sides)', MAX);
    expect(check({ source: 'bi- Two, double Bilateral (affecting both sides)' }).source).toBe(
      'bi- Two, double Bilateral (affecting both sides)'
    );
    expect(check({ source: 'Bi Two double Bilateral affecting both sides' }).source).toBeDefined();
  });

  it('does not match from the middle of a longer word', () => {
    const { check } = createSourceChecker('The patient was dehydrated after the long walk.', MAX);
    expect(check({ source: 'hydrated after the long walk' }).source).toBeUndefined();
  });

  it('only counts the part of the text the AI was given', () => {
    const { check } = createSourceChecker('Early facts about cells. Late facts about tissues.', 24);
    expect(check({ source: 'Early facts about cells.' }).source).toBeDefined();
    expect(check({ source: 'Late facts about tissues.' }).source).toBeUndefined();
  });
});

describe('createSourceChecker: quotes that are not in the document', () => {
  const { text, units } = pageUnits(['The mitochondria is the organelle that produces most of the cell energy as ATP.']);

  it('removes a made-up or paraphrased quote but keeps the card', () => {
    const { check } = createSourceChecker(text, MAX, units);
    const out = check({ question: 'Q', source: 'Mitochondria are the powerhouses of every living organism.' });
    expect(out).toEqual({ question: 'Q', source: undefined, sourceLocation: undefined });
  });

  it('removes a quote with nothing in it', () => {
    const { check } = createSourceChecker(text, MAX, units);
    expect(check({ source: '..........' }).source).toBeUndefined();
    expect(check({ source: 'cell' }).source).toBeUndefined();
  });

  it('leaves a card with no quote alone', () => {
    const { check, stats } = createSourceChecker(text, MAX, units);
    expect(check({ question: 'Q' })).toEqual({ question: 'Q' });
    expect(stats).toEqual({ whole: 0, pieces: 0, dropped: 0 });
  });
});

// A table the PDF text reads column by column: every meaning, then every prefix,
// then every example, so no row is ever in one piece.
describe('createSourceChecker: table rows kept in pieces', () => {
  const doc =
    'down away from bad difficult painful green blue de dys chlor cyano dehydrate to remove water ' +
    'dysphagia difficulty swallowing chlorophyll green pigment in plants cyanosis bluish discoloration ' +
    'of the skin due to lack of oxygen hyperalgesia increased sensitivity to pain';
  const { text, units } = pageUnits([doc]);

  it.each([
    ['Down, away from de- Dehydrate (to remove water)', 'Down, away from … de- … Dehydrate (to remove water)'],
    [
      'Bad, difficult, painful dys- Dysphagia (difficulty swallowing)',
      'Bad, difficult, painful … dys- … Dysphagia (difficulty swallowing)',
    ],
    [
      'dys- Bad, difficult, painful Dysphagia (difficulty swallowing)',
      'dys- … Bad, difficult, painful … Dysphagia (difficulty swallowing)',
    ],
  ])('shows the real pieces of "%s"', (quote, expected) => {
    const { check, stats } = createSourceChecker(text, MAX, units);
    const out = check({ source: quote });
    expect(out.source).toBe(expected);
    expect(out.sourceLocation).toBe('Page 1');
    expect(stats).toEqual({ whole: 0, pieces: 1, dropped: 0 });
  });

  it('drops a word the document does not have, and the bracket it leaves behind', () => {
    const { check } = createSourceChecker(text, MAX, units);
    expect(check({ source: 'Hyperalgesia (greatly increased sensitivity to pain)' }).source).toBe(
      'Hyperalgesia increased sensitivity to pain'
    );
  });

  it('removes a quote made of words the document lacks', () => {
    const { check } = createSourceChecker(text, MAX, units);
    expect(check({ source: 'hyper- Over Hypertension (high blood pressure)' }).source).toBeUndefined();
  });

  it('removes a quote made only of common words', () => {
    const { check } = createSourceChecker(text, MAX, units);
    expect(check({ source: 'The patient had pain of the skin in the left leg after surgery' }).source).toBeUndefined();
  });

  it('removes a quote with no solid run, only short scraps', () => {
    const { check } = createSourceChecker(text, MAX, units);
    // The same four prefixes in an order the document doesn't have them in.
    expect(check({ source: 'de- chlor- dys- cyano-' }).source).toBeUndefined();
  });

  it('counts whole, rebuilt and removed quotes', () => {
    const { check, stats } = createSourceChecker(text, MAX, units);
    check({ source: 'dysphagia difficulty swallowing chlorophyll green pigment in plants' });
    check({ source: 'Down, away from de- Dehydrate (to remove water)' });
    check({ source: 'Something the document never says at all' });
    expect(stats).toEqual({ whole: 1, pieces: 1, dropped: 1 });
  });
});

describe('sampling long documents across beginning, middle, and end (#38)', () => {
  it('leaves short documents (<= maxChars) intact without sampling', () => {
    const pages = ['Page 1 content.', 'Page 2 content.', 'Page 3 content.'];
    const { text, units } = pageUnits(pages, 1000);
    expect(text).toBe('Page 1 content.\n\nPage 2 content.\n\nPage 3 content.');
    expect(units.texts).toEqual(pages);
    expect(units.numbers).toBeUndefined();
  });

  it('samples pages from a 40+ page document covering beginning, middle, and end', () => {
    // 40 pages of 1,000 characters each = 40,000+ characters, exceeding 30,000 budget.
    const pages = Array.from({ length: 40 }, (_, i) => `Page ${i + 1} content about biological cells. `.padEnd(1000, '.'));
    const { text, units } = pageUnits(pages, 30_000);

    expect(text.length).toBeLessThanOrEqual(30_000);
    // Covers beginning (page 1)
    expect(units.numbers![0]).toBe(1);
    // Covers end (page 40)
    expect(units.numbers!.at(-1)).toBe(40);
    // Covers middle
    expect(units.numbers!.some((n) => n >= 18 && n <= 22)).toBe(true);
    // Numbers are strictly ascending
    for (let i = 1; i < units.numbers!.length; i++) {
      expect(units.numbers![i]).toBeGreaterThan(units.numbers![i - 1]);
    }
  });

  it('locates quotes with their true original page number even when sampled', () => {
    const pages = Array.from({ length: 40 }, (_, i) =>
      i === 0
        ? 'Photosynthesis takes place inside the chloroplasts of plant cells.'.padEnd(1000, '.')
        : i === 39
        ? 'Ribosomes are macromolecular machines found within all cells that perform biological protein synthesis.'.padEnd(1000, '.')
        : `Page ${i + 1} general notes. `.padEnd(1000, '.')
    );
    const { text, units } = pageUnits(pages, 30_000);
    const { check } = createSourceChecker(text, 30_000, units);

    const first = check({ source: 'Photosynthesis takes place inside the chloroplasts of plant cells.' });
    expect(first.sourceLocation).toBe('Page 1');

    const last = check({
      source: 'Ribosomes are macromolecular machines found within all cells that perform biological protein synthesis.',
    });
    expect(last.sourceLocation).toBe('Page 40');
  });

  it('skips blank pages while preserving real page numbers for non-blank pages', () => {
    const pages = [
      'First page notes.',
      '   \n\t  ', // blank page 2
      'Third page notes.',
      '',            // blank page 4
      'Fifth page notes.',
    ];
    // Set low maxChars to force sampling
    const { units } = samplePages(pages, 40);
    expect(units.numbers).toBeDefined();
    // Non-blank page numbers must be from [1, 3, 5], never [2, 4]
    expect(units.numbers!.every((n) => [1, 3, 5].includes(n))).toBe(true);
  });

  it('samples paragraphs of long unpaged text across beginning, middle, and end', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1}: ` + 'details. '.repeat(100));
    const fullText = paragraphs.join('\n\n');
    expect(fullText.length).toBeGreaterThan(25_000);

    const sampled = sampleText(fullText, 5_000);
    expect(sampled.length).toBeLessThanOrEqual(5_000);
    expect(sampled).toContain('Paragraph 1:');
    expect(sampled).toContain('Paragraph 30:');
  });

  it('leaves short unpaged text unchanged', () => {
    const shortText = 'Intro paragraph.\n\nConclusion paragraph.';
    expect(sampleText(shortText, 5_000)).toBe(shortText);
  });
});

describe('gaps in a sampled document (#38)', () => {
  // A page of exactly 100 characters that starts and ends with the given words.
  const page = (start: string, end: string) => `${start} ${'.'.repeat(98 - start.length - end.length)} ${end}`;
  // Room for three of the five pages and the two gaps between them, so pages 1, 3
  // and 5 are kept. Page 1 stops mid-sentence; the real page 2 finishes it.
  const pages = [
    page('Page 1 begins.', 'The enzyme that copies DNA is'),
    page('DNA polymerase, which reads the template strand.', 'Page 2 ends.'),
    page('RNA polymerase, which makes messenger RNA.', 'Page 3 ends.'),
    page('Page 4 begins.', 'Page 4 ends.'),
    page('Page 5 begins.', 'Page 5 ends.'),
  ];
  const max = 3 * 100 + 2 * GAP_MARKER.length;
  const acrossGap = 'The enzyme that copies DNA is RNA polymerase, which makes messenger RNA.';

  it('marks where pages were left out, so a cut-off sentence does not run on', () => {
    const { text, units } = pageUnits(pages, max);
    expect(units.numbers).toEqual([1, 3, 5]);
    expect(units.gapBefore).toEqual([false, true, true]);
    expect(text).toBe(joinUnits(units));
    expect(text).toContain(`The enzyme that copies DNA is${GAP_MARKER}RNA polymerase`);
    expect(text.length).toBeLessThanOrEqual(max);
  });

  it('never accepts a quote that runs across a gap, whole or in pieces', () => {
    const { text, units } = pageUnits(pages, max);
    const { check, stats } = createSourceChecker(text, max, units);
    expect(check({ source: acrossGap }).source).toBeUndefined();
    expect(stats).toEqual({ whole: 0, pieces: 0, dropped: 1 });
    // A quote on one side of a gap is still found, on its real page.
    expect(check({ source: 'RNA polymerase, which makes messenger RNA.' }).sourceLocation).toBe('Page 3');
  });

  it('does the same for long text without pages', () => {
    // Three paragraphs of 200 characters, with room for the first and the last.
    const paragraphs = [
      `${'.'.repeat(170)} The enzyme that copies DNA is`,
      'DNA polymerase, which reads the template strand.'.padEnd(200, '.'),
      'RNA polymerase, which makes messenger RNA.'.padEnd(200, '.'),
    ];
    const maxText = 2 * 200 + GAP_MARKER.length;
    const sampled = sampleText(paragraphs.join('\n\n'), maxText);
    expect(sampled).toBe(paragraphs[0] + GAP_MARKER + paragraphs[2]);
    const { check } = createSourceChecker(sampled, maxText);
    expect(check({ source: acrossGap }).source).toBeUndefined();
    expect(check({ source: 'RNA polymerase, which makes messenger RNA.' }).source).toBeDefined();
  });
});

describe('long text files and long pages (#38)', () => {
  // 60 paragraphs of two long lines with a blank line between paragraphs, so
  // paragraph k is on lines 3k - 2 and 3k - 1. Windows line endings between them.
  const raw = Array.from(
    { length: 60 },
    (_, i) => `Paragraph ${i + 1} opens here. ${'a'.repeat(280)}\nParagraph ${i + 1} closes here. ${'b'.repeat(280)}`
  ).join('\r\n\r\n');

  it('samples whole paragraphs from across a long text file, keeping the real line numbers', () => {
    const { text, units } = lineUnits(raw, 10_000);
    expect(text.length).toBeLessThanOrEqual(10_000);
    expect(text).toBe(joinUnits(units));
    expect(text.startsWith('Paragraph 1 opens here.')).toBe(true);
    expect(text).toContain('Paragraph 60 closes here.');
    expect(units.numbers![0]).toBe(1);
    expect(units.gapBefore!.some(Boolean)).toBe(true);
    // A paragraph is kept whole: both of its lines, or neither.
    const kept = units.texts.filter((t) => t.startsWith('Paragraph ')).map((t) => t.split(' ')[1]);
    expect(new Set(kept).size * 2).toBe(kept.length);

    const { check } = createSourceChecker(text, 10_000, units);
    expect(check({ source: 'Paragraph 60 closes here.' }).sourceLocation).toBe('Line 179');
  });

  it('cuts a single page longer than the limit, so the AI and the quote check have the same text', () => {
    const { text, units } = pageUnits(['Mitochondria make most of the ATP. '.repeat(100)], 1_000);
    expect(text.length).toBe(1_000);
    expect(units.texts).toEqual([text]);
    expect(units.numbers).toEqual([1]);
  });
});
