import { describe, expect, it } from 'vitest';
import { MAX_SOURCE_CHARS, pastedTextProblem, titleFromText } from '@/lib/sources';

describe('pastedTextProblem (#70)', () => {
  it('accepts a few sentences up to the limit', () => {
    expect(pastedTextProblem('Photosynthesis happens in the chloroplast.')).toBeNull();
    expect(pastedTextProblem('x'.repeat(MAX_SOURCE_CHARS))).toBeNull();
  });

  it('asks for more than a few words', () => {
    expect(pastedTextProblem('  Mitochondria  ')).toBe('Paste at least a sentence or two of your notes.');
  });

  it('says how long the text is when it is too long', () => {
    expect(pastedTextProblem('x'.repeat(31_250))).toBe(
      "That's 31,250 characters. Paste up to 30,000, or upload it as a file."
    );
  });
});

describe('titleFromText (#70)', () => {
  it('uses a short first line, like a heading', () => {
    expect(titleFromText('\n  Chapter 3: Photosynthesis\nPlants make glucose...')).toBe('Chapter 3: Photosynthesis');
  });

  it('uses the first words of a long first line', () => {
    expect(
      titleFromText('The mitochondria produce most of the cell’s ATP through cellular respiration, which is why...')
    ).toBe('The mitochondria produce most of the cell’s ATP');
  });

  it('shortens one very long word and falls back for empty text', () => {
    expect(titleFromText('x'.repeat(100))).toBe(`${'x'.repeat(59)}…`);
    expect(titleFromText('   ')).toBe('Pasted notes');
  });
});
