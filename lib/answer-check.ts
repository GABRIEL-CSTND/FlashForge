// Checking typed answers (#66), shared by the study screen (instant feedback)
// and the server (the saved score), so both always agree.

export type TypedVerdict = 'correct' | 'close' | 'wrong';

const LEADING_ARTICLE = /^(the|a|an)\s+/;
// Spaces and punctuation that don't change which term was meant. Symbols such
// as + and # are kept, so "C++" and "C" stay different.
const IGNORED = /[\s.,;:!?'"‘’“”()[\]{}\-‐‑‒–—_/\\]/g;

function key(text: string, dropArticle: boolean): string {
  let s = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (dropArticle) s = s.replace(LEADING_ARTICLE, '');
  return s.replace(IGNORED, '');
}

// Optimal string alignment distance: letters changed, added, removed or two
// neighbours swapped. Stops counting past `max`.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2][j - 2] + 1);
      row.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    rows.push(row);
  }
  return rows[a.length][b.length];
}

// "correct": the same term once capitals, accents, spaces, punctuation and a
// leading "the", "a" or "an" are ignored. "close": one typo (a wrong, missing,
// extra or swapped letter), allowed only for answers of 5 or more characters
// with no digits, so "1899" isn't accepted for "1898" or "ADP" for "ATP".
export function checkTypedAnswer(typed: string | null | undefined, answer: string): TypedVerdict {
  if (typeof typed !== 'string' || !key(typed, true)) return 'wrong';
  if (key(typed, false) === key(answer, false) || key(typed, true) === key(answer, true)) return 'correct';
  const expected = key(answer, true);
  if (expected.length >= 5 && !/\d/.test(expected) && editDistance(key(typed, true), expected, 1) <= 1) return 'close';
  return 'wrong';
}

// For grouping wrong typed answers on the teacher's most-missed page (#59):
// "Golgi body" and "golgi  body." count as the same answer.
export function typedAnswerKey(typed: string): string {
  return key(typed, true);
}
