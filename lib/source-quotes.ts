import { MAX_SOURCE_CHARS } from '@/lib/sources';

// Where a card's answer comes from in the uploaded material. The AI is asked to
// copy the sentence a card is based on; this checks that sentence against the real
// text, so a quote is only ever shown when it is really in the document, and says
// where it sits (a page for a PDF, a line for TXT and pasted text).
//
// Used by lib/gemini.ts. Pure functions, no I/O.

// What the text was split into, so a quote can be traced back to where it came
// from. `separator` is what was put between the units when they were joined into
// the single text the AI reads (see pageUnits and lineUnits).
export interface SourceUnits {
  label: 'Page' | 'Line';
  texts: string[];
  separator: string;
  numbers?: number[];
}

const PAGE_SEPARATOR = '\n\n';
const LINE_SEPARATOR = '\n';

// A PDF's pages: the text for the AI, and the pages to find a quote in.

// If all pages combined fit inside maxChars, keep them all as they are.
// If they exceed maxChars, sample pages evenly across the whole document
// (beginning, middle, and end) so long PDFs don't only get questions from
// the first few pages (#38), recording each page's real 1-based page number.
export function samplePages(
  pages: string[],
  maxChars: number = MAX_SOURCE_CHARS
): { text: string; units: SourceUnits } {
  const totalChars =
    pages.reduce((sum, p) => sum + p.length, 0) + Math.max(0, pages.length - 1) * PAGE_SEPARATOR.length;
  if (totalChars <= maxChars) {
    return { text: pages.join(PAGE_SEPARATOR), units: { label: 'Page', texts: pages, separator: PAGE_SEPARATOR } };
  }

  const nonBlank: { text: string; number: number }[] = [];
  pages.forEach((p, idx) => {
    if (p.trim().length > 0) nonBlank.push({ text: p, number: idx + 1 });
  });

  if (nonBlank.length === 0) {
    return { text: '', units: { label: 'Page', texts: [], separator: PAGE_SEPARATOR } };
  }

  const total = nonBlank.length;

  function getIndices(K: number): number[] {
    if (K <= 1) return [0];
    const set = new Set<number>();
    const res: number[] = [];
    for (let i = 0; i < K; i++) {
      const idx = Math.round((i * (total - 1)) / (K - 1));
      if (!set.has(idx)) {
        set.add(idx);
        res.push(idx);
      }
    }
    return res;
  }

  function charsFor(indices: number[]): number {
    return (
      indices.reduce((sum, idx) => sum + nonBlank[idx].text.length, 0) +
      (indices.length - 1) * PAGE_SEPARATOR.length
    );
  }

  let bestIndices = getIndices(1);
  let low = 1;
  let high = total;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const indices = getIndices(mid);
    if (charsFor(indices) <= maxChars) {
      bestIndices = indices;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (bestIndices.length <= 1 && total > 1) {
    const count = Math.min(total, 5);
    const indices = getIndices(count);
    const perPage = Math.floor((maxChars - (indices.length - 1) * PAGE_SEPARATOR.length) / indices.length);
    const texts = indices.map((idx) => nonBlank[idx].text.slice(0, Math.max(100, perPage)));
    const numbers = indices.map((idx) => nonBlank[idx].number);
    return {
      text: texts.join(PAGE_SEPARATOR),
      units: { label: 'Page', texts, separator: PAGE_SEPARATOR, numbers },
    };
  }

  const texts = bestIndices.map((idx) => nonBlank[idx].text);
  const numbers = bestIndices.map((idx) => nonBlank[idx].number);
  return {
    text: texts.join(PAGE_SEPARATOR),
    units: { label: 'Page', texts, separator: PAGE_SEPARATOR, numbers },
  };
}

// For text without pages (Word, PowerPoint, web pages, plain text): if it exceeds
// maxChars, sample paragraphs evenly across the document (beginning, middle, end)
// so the study guide covers the whole document instead of only the start (#38).
export function sampleText(rawText: string, maxChars: number = MAX_SOURCE_CHARS): string {
  if (rawText.length <= maxChars) return rawText;

  const paragraphs = rawText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length <= 1) {
    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length <= 1) return rawText.slice(0, maxChars);
    return sampleArray(lines, '\n', maxChars);
  }
  return sampleArray(paragraphs, '\n\n', maxChars);
}

function sampleArray(items: string[], separator: string, maxChars: number): string {
  const total = items.length;
  function getIndices(K: number): number[] {
    if (K <= 1) return [0];
    const set = new Set<number>();
    const res: number[] = [];
    for (let i = 0; i < K; i++) {
      const idx = Math.round((i * (total - 1)) / (K - 1));
      if (!set.has(idx)) {
        set.add(idx);
        res.push(idx);
      }
    }
    return res;
  }

  function charsFor(indices: number[]): number {
    return indices.reduce((sum, idx) => sum + items[idx].length, 0) + (indices.length - 1) * separator.length;
  }

  let bestIndices = getIndices(1);
  let low = 1;
  let high = total;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const indices = getIndices(mid);
    if (charsFor(indices) <= maxChars) {
      bestIndices = indices;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (bestIndices.length <= 1 && total > 1) {
    const count = Math.min(total, 5);
    const indices = getIndices(count);
    const perItem = Math.floor((maxChars - (indices.length - 1) * separator.length) / indices.length);
    return indices.map((idx) => items[idx].slice(0, Math.max(100, perItem))).join(separator);
  }

  return bestIndices.map((idx) => items[idx]).join(separator);
}

export function pageUnits(pages: string[], maxChars: number = MAX_SOURCE_CHARS): { text: string; units: SourceUnits } {
  return samplePages(pages, maxChars);
}

// Plain text's lines. Line endings are made the same first, so line numbers and
// the joined text agree.
export function lineUnits(rawText: string): { text: string; units: SourceUnits } {
  const text = rawText.replace(/\r\n?/g, '\n');
  return { text, units: { label: 'Line', texts: text.split('\n'), separator: LINE_SEPARATOR } };
}

// Used to compare a quote with the document. Case, punctuation, dashes, quote
// marks, line breaks and ligatures are ignored: PDF text comes out with odd line
// breaks, and a model may tidy up punctuation when it copies a sentence.
export const sourceKey = (s: string) =>
  s
    .normalize('NFKC') // ligatures like "ﬁ" become "fi"
    .toLowerCase()
    .replace(/[\s!-\/:-@[-`{-~\u2010-\u2015\u2018-\u201F\u2026]+/g, ' ')
    .trim();

// A quote shorter than this (after sourceKey) says too little to show, and an
// empty one would "match" everywhere.
const MIN_QUOTE_CHARS = 8;
// When a quote is rebuilt from pieces, at least one piece must be this long...
const MIN_ANCHOR_CHARS = 20;
// ...the pieces must cover this much of the quote...
const MIN_COVERAGE = 0.8;
// ...and there can't be more pieces than this.
const MAX_PIECES = 4;

// A normalized copy of the text the AI read, plus a lookup for which unit a
// quote starts in. Each unit is normalized on its own and joined with one space,
// which is what sourceKey turns the separators into anyway, so `key` matches
// sourceKey of the joined text. A quote that runs across a page break is
// reported at the page it starts on.
function buildLocator(
  sourceText: string,
  maxChars: number,
  units?: SourceUnits
): { key: string; locate: (quote: string) => string | undefined } {
  if (!units) {
    return { key: sourceKey(sourceText.slice(0, maxChars)), locate: () => undefined };
  }

  let consumed = 0;
  let key = '';
  const starts: { offset: number; number: number }[] = [];
  units.texts.forEach((text, i) => {
    if (consumed >= maxChars) return;
    const unitKey = sourceKey(text.slice(0, maxChars - consumed));
    consumed += text.length + units.separator.length;
    if (!unitKey) return;
    if (key) key += ' ';
    starts.push({ offset: key.length, number: units.numbers && units.numbers[i] !== undefined ? units.numbers[i] : i + 1 });
    key += unitKey;
  });

  return {
    key,
    locate(quote: string) {
      const at = key.indexOf(sourceKey(quote));
      if (at < 0 || starts.length === 0) return undefined;
      let found = starts[0];
      for (const s of starts) {
        if (s.offset <= at) found = s;
        else break;
      }
      return `${units.label} ${found.number}`;
    },
  };
}

// Dropping a word the document doesn't have can take one half of a bracket pair
// with it ("(greatly" goes, its ")" stays). Remove the orphaned half.
function tidyBrackets(text: string): string {
  const opens = (text.match(/\(/g) ?? []).length;
  const closes = (text.match(/\)/g) ?? []).length;
  if (closes > opens) return text.replace(/\)+$/, '');
  if (opens > closes) return text.replace(/^\(+/, '');
  return text;
}

// When a quote isn't in the document as one piece, the AI has usually rebuilt a
// table row from cells that the PDF text keeps in separate places (a table read
// column by column lists every meaning first, then every prefix, then every
// example). Show the real pieces instead: words that appear nowhere in the
// document are dropped, and what's left is split into runs that each really are in
// the document, shown with "…" between them. It needs most of the quote and one
// solid run, so a few common words can't stand in for a whole quote.
function verifiedPieces(quote: string, docKey: string): { text: string; anchor: string } | undefined {
  // Whole-word matching, so "de" can't match from the middle of "dehydrate".
  const padded = ` ${docKey} `;
  const inDoc = (key: string) => padded.includes(` ${key} `);

  const words = quote
    .split(/\s+/)
    .map((raw) => ({ raw, key: sourceKey(raw) }))
    .filter((w) => w.key); // drops words that are only punctuation
  const totalLength = words.reduce((n, w) => n + w.key.length, 0);

  const known = words.filter((w) => inDoc(w.key));
  const keptLength = known.reduce((n, w) => n + w.key.length, 0);

  const pieces: { text: string; length: number }[] = [];
  for (let i = 0; i < known.length; ) {
    let run = known[i].key;
    let end = i;
    while (end + 1 < known.length && inDoc(`${run} ${known[end + 1].key}`)) {
      end++;
      run = `${run} ${known[end].key}`;
    }
    pieces.push({
      text: tidyBrackets(
        known
          .slice(i, end + 1)
          .map((w) => w.raw)
          .join(' ')
      ),
      length: run.length,
    });
    i = end + 1;
  }

  if (pieces.length === 0 || pieces.length > MAX_PIECES || keptLength < totalLength * MIN_COVERAGE) return undefined;
  const anchor = pieces.reduce((a, b) => (b.length > a.length ? b : a));
  if (anchor.length < MIN_ANCHOR_CHARS) return undefined;
  return { text: pieces.map((p) => p.text).join(' … '), anchor: anchor.text };
}

// How many quotes were kept whole, kept in pieces, or dropped. For the server log
// only: the document's own text is never logged.
export interface SourceStats {
  whole: number;
  pieces: number;
  dropped: number;
}

// Checks each card's quote against the text the AI read (the first `maxChars` of
// it). A quote found whole is kept with its location. A quote that isn't there as
// one piece is cut down to the pieces that are. Anything else is removed; the card
// itself always stays.
export function createSourceChecker(sourceText: string, maxChars: number, units?: SourceUnits) {
  const locator = buildLocator(sourceText, maxChars, units);
  const paddedDoc = ` ${locator.key} `;
  const stats: SourceStats = { whole: 0, pieces: 0, dropped: 0 };

  function check<T extends object>(item: T): T & { source?: string; sourceLocation?: string } {
    const raw = item as { source?: unknown };
    if (typeof raw.source !== 'string' || !raw.source) return item;

    const source = raw.source;
    const wanted = sourceKey(source);
    if (wanted.length >= MIN_QUOTE_CHARS) {
      if (paddedDoc.includes(` ${wanted} `)) {
        stats.whole += 1;
        return { ...item, sourceLocation: locator.locate(source) };
      }
      const rebuilt = verifiedPieces(source, locator.key);
      if (rebuilt) {
        stats.pieces += 1;
        return { ...item, source: rebuilt.text, sourceLocation: locator.locate(rebuilt.anchor) };
      }
    }

    stats.dropped += 1;
    return { ...item, source: undefined, sourceLocation: undefined };
  }

  return { check, stats };
}
