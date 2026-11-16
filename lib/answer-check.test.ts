import { describe, expect, it } from 'vitest';
import { checkTypedAnswer, typedAnswerKey } from '@/lib/answer-check';

describe('checkTypedAnswer (#66)', () => {
  it.each([
    ['Mitochondria', 'Mitochondria'],
    ['mitochondria', 'Mitochondria'],
    ['  The mitochondria. ', 'Mitochondria'],
    ['Mitochondria', 'The mitochondria'],
    ['an enzyme', 'Enzyme'],
    ['Peñafrancia', 'Penafrancia'],
    ['rizal', 'Rizál'],
    ['x-ray', 'X ray'],
    ['XRay', 'X-ray'],
    ['TCP/IP', 'TCP IP'],
    ["Newton's first law", 'Newtons First Law'],
    ['1898', '1898'],
    ['C++', 'c++'],
  ])('accepts %j for %j as correct', (typed, answer) => {
    expect(checkTypedAnswer(typed, answer)).toBe('correct');
  });

  it.each([
    ['Mitochondira', 'Mitochondria'], // two letters swapped
    ['Mitochondra', 'Mitochondria'], // one missing
    ['Mitochondriaa', 'Mitochondria'], // one extra
    ['Mitachondria', 'Mitochondria'], // one wrong
    ['Chlorophyl', 'Chlorophyll'],
    ['treaty of pari', 'Treaty of Paris'],
  ])('accepts %j for %j as close (one typo)', (typed, answer) => {
    expect(checkTypedAnswer(typed, answer)).toBe('close');
  });

  it.each([
    ['1899', '1898'], // numbers must be exact
    ['World War 1', 'World War 2'],
    ['ADP', 'ATP'], // short answers must be exact
    ['Golgi', 'Golgo apparatus'],
    ['Meiosis', 'Mitosis'], // two letters off
    ['Mitchondira', 'Mitochondria'], // two typos
    ['C', 'C++'],
    ['C#', 'C++'],
    ['', 'Stroma'],
    ['   ', 'Stroma'],
    ['the', 'Stroma'],
  ])('rejects %j for %j', (typed, answer) => {
    expect(checkTypedAnswer(typed, answer)).toBe('wrong');
  });

  it('rejects a missing answer', () => {
    expect(checkTypedAnswer(null, 'Stroma')).toBe('wrong');
    expect(checkTypedAnswer(undefined, 'Stroma')).toBe('wrong');
  });
});

describe('typedAnswerKey', () => {
  it('groups answers that differ only in capitals, spaces and punctuation', () => {
    expect(typedAnswerKey('Golgi body')).toBe(typedAnswerKey('  golgi  BODY.'));
    expect(typedAnswerKey('The Golgi body')).toBe(typedAnswerKey('golgi body'));
    expect(typedAnswerKey('Golgi body')).not.toBe(typedAnswerKey('Golgi bodies'));
  });
});
