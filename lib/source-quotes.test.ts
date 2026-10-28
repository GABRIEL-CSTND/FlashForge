import { describe, expect, it } from 'vitest';
import { createSourceChecker, lineUnits, pageUnits, sourceKey } from '@/lib/source-quotes';

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
