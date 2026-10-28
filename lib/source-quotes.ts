import { MAX_SOURCE_CHARS } from '@/lib/sources';

// Where a card's answer comes from in the uploaded material. The AI is asked to
// copy the sentence a card is based on; this checks that sentence against the real
// text, so a quote is only ever shown when it is really in the document, and says
// where it sits (a page for a PDF, a line for TXT and pasted text).
//
// Used by lib/gemini.ts. Pure functions, no I/O.

// What the text was split into, so a quote can be traced back to where it came
// from. `separator` is what was put between the units when they were joined into
// the single text the AI reads (see joinUnits, pageUnits and lineUnits).
export interface SourceUnits {
  label: 'Page' | 'Line';
  texts: string[];
  separator: string;
  // For a long document that was sampled (#38): each unit's real number (otherwise
  // unit i is number i + 1), and whether part of the document was left out just
  // before it.
  numbers?: number[];
  gapBefore?: boolean[];
}

const PAGE_SEPARATOR = '\n\n';
const LINE_SEPARATOR = '\n';

// Goes where part of a sampled document was left out (#38), between two parts that
// weren't next to each other. Without it, a sentence cut off before the gap reads
// as going on after it: "The enzyme that copies DNA is" + a later page's "RNA
// polymerase, ...".
export const GAP_MARKER = '\n\n[… part of the document left out …]\n\n';
// A gap in the quote check's copy of the text. sourceKey turns "|" into a space, so
// no quote has one, and no quote can match across a gap.
const GAP_KEY = ' | ';

const separatorBefore = (units: SourceUnits, i: number) => (units.gapBefore?.[i] ? GAP_MARKER : units.separator);

// The text the AI reads for these units.
export function joinUnits(units: SourceUnits): string {
  return units.texts.map((text, i) => (i === 0 ? text : separatorBefore(units, i) + text)).join('');
}

// Picks items spread evenly over the whole document, always with the first and the
// last, as many as fit in maxChars: items next to each other are joined with
// `separator` characters, others with a gap marker of `gap` characters. If fewer
// than two fit, it takes up to 5 and keeps an equal share of each. `limit` is the
// most characters to keep from each picked item, so one item longer than maxChars
// is cut too.
function pickEvenly(
  lengths: number[],
  maxChars: number,
  separator: number,
  gap: number
): { picked: number[]; limit: number } {
  const total = lengths.length;
  const spread = (k: number): number[] => {
    if (k <= 1) return [0];
    const picked = new Set<number>();
    for (let i = 0; i < k; i++) picked.add(Math.round((i * (total - 1)) / (k - 1)));
    return [...picked];
  };
  const size = (picked: number[]) =>
    picked.reduce((n, idx, j) => n + lengths[idx] + (j === 0 ? 0 : idx === picked[j - 1] + 1 ? separator : gap), 0);

  let best = spread(1);
  let low = 1;
  let high = total;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const picked = spread(mid);
    if (size(picked) <= maxChars) {
      best = picked;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (best.length <= 1 && total > 1) {
    const picked = spread(Math.min(total, 5));
    return { picked, limit: Math.max(100, Math.floor((maxChars - (picked.length - 1) * gap) / picked.length)) };
  }
  return { picked: best, limit: maxChars };
}

// Samples a long document's pages or lines (#38) a chunk at a time: whole pages, or
// whole paragraphs of plain text. The units keep their real numbers and say where
// something was left out, so what the AI reads (joinUnits) and what the quote check
// searches stay the same.
function sampleUnits(
  all: SourceUnits,
  chunks: { start: number; end: number }[],
  maxChars: number
): { text: string; units: SourceUnits } {
  const texts: string[] = [];
  const numbers: number[] = [];
  const gapBefore: boolean[] = [];
  if (chunks.length > 0) {
    const lengths = chunks.map((c) => all.texts.slice(c.start, c.end).join(all.separator).length);
    const { picked, limit } = pickEvenly(lengths, maxChars, all.separator.length, GAP_MARKER.length);
    picked.forEach((c, j) => {
      // Up to `limit` characters of the chunk, separators included.
      let room = limit;
      for (let u = chunks[c].start; u < chunks[c].end; u++) {
        const first = u === chunks[c].start;
        if (!first) room -= all.separator.length;
        if (room <= 0) break;
        const text = all.texts[u].slice(0, room);
        texts.push(text);
        numbers.push(u + 1);
        gapBefore.push(first && j > 0 && c !== picked[j - 1] + 1);
        room -= text.length;
      }
    });
  }
  const units: SourceUnits = { label: all.label, texts, separator: all.separator, numbers, gapBefore };
  return { text: joinUnits(units), units };
}

// A PDF's pages: the text for the AI, and the pages to find a quote in.
//
// If they don't all fit in maxChars, whole pages are sampled evenly across the
// whole document (beginning, middle, and end) so long PDFs don't only get questions
// from the first few pages (#38), leaving out blank pages and recording each page's
// real 1-based page number.
export function samplePages(
  pages: string[],
  maxChars: number = MAX_SOURCE_CHARS
): { text: string; units: SourceUnits } {
  const all: SourceUnits = { label: 'Page', texts: pages, separator: PAGE_SEPARATOR };
  const text = joinUnits(all);
  if (text.length <= maxChars) return { text, units: all };
  return sampleUnits(all, pages.flatMap((page, i) => (page.trim() ? [{ start: i, end: i + 1 }] : [])), maxChars);
}

// For text without pages or lines to point at (Word, PowerPoint, web pages,
// topics): if it exceeds maxChars, sample paragraphs evenly across the document
// (beginning, middle, end) so the study guide covers the whole document instead of
// only the start (#38). Parts that weren't next to each other get GAP_MARKER
// between them.
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
  const { picked, limit } = pickEvenly(
    items.map((item) => item.length),
    maxChars,
    separator.length,
    GAP_MARKER.length
  );
  return picked
    .map((idx, j) => (j === 0 ? '' : idx === picked[j - 1] + 1 ? separator : GAP_MARKER) + items[idx].slice(0, limit))
    .join('');
}

export function pageUnits(pages: string[], maxChars: number = MAX_SOURCE_CHARS): { text: string; units: SourceUnits } {
  return samplePages(pages, maxChars);
}

// The chunks a long text file is sampled by (#38): paragraphs, each with the blank
// lines after it, or single lines when no blank lines split it into paragraphs. They
// cover every line, so chunks next to each other join up just as in the file.
function lineChunks(lines: string[]): { start: number; end: number }[] {
  const blank = (i: number) => !lines[i].trim();
  const paragraphs = chunksFrom(lines.length, (i) => !blank(i) && (i === 0 || blank(i - 1)));
  return paragraphs.length > 1 ? paragraphs : chunksFrom(lines.length, (i) => !blank(i));
}

// Chunks that start where `starts` is true and run up to the next start. The first
// also takes any blank lines before it.
function chunksFrom(count: number, starts: (i: number) => boolean): { start: number; end: number }[] {
  const at = Array.from({ length: count }, (_, i) => i).filter(starts);
  if (at.length > 0) at[0] = 0;
  return at.map((start, k) => ({ start, end: at[k + 1] ?? count }));
}

// Plain text's lines. Line endings are made the same first, so line numbers and
// the joined text agree. Text too long for maxChars is sampled like a long PDF
// (#38), by paragraph, keeping each line's real number.
export function lineUnits(rawText: string, maxChars: number = MAX_SOURCE_CHARS): { text: string; units: SourceUnits } {
  const text = rawText.replace(/\r\n?/g, '\n');
  const all: SourceUnits = { label: 'Line', texts: text.split('\n'), separator: LINE_SEPARATOR };
  if (text.length <= maxChars) return { text, units: all };
  return sampleUnits(all, lineChunks(all.texts), maxChars);
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
// sourceKey of the joined text, except that a gap in a sampled document (#38)
// becomes GAP_KEY, so no quote can match across it. A quote that runs across a
// page break is reported at the page it starts on.
function buildLocator(
  sourceText: string,
  maxChars: number,
  units?: SourceUnits
): { key: string; locate: (quote: string) => string | undefined } {
  if (!units) {
    // Sampled text without units (sampleText) has GAP_MARKER at its gaps.
    const key = sourceText.slice(0, maxChars).split(GAP_MARKER).map(sourceKey).filter(Boolean).join(GAP_KEY);
    return { key, locate: () => undefined };
  }

  let consumed = 0;
  let key = '';
  let gap = false;
  const starts: { offset: number; number: number }[] = [];
  units.texts.forEach((text, i) => {
    if (i > 0) consumed += separatorBefore(units, i).length;
    if (units.gapBefore?.[i]) gap = true;
    if (consumed >= maxChars) return;
    const unitKey = sourceKey(text.slice(0, maxChars - consumed));
    consumed += text.length;
    if (!unitKey) return;
    if (key) key += gap ? GAP_KEY : ' ';
    gap = false;
    starts.push({ offset: key.length, number: units.numbers?.[i] ?? i + 1 });
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
// solid run, so a few common words can't stand in for a whole quote. In a sampled
// document (#38) all the pieces must come from one part, never from both sides of
// a gap.
function verifiedPieces(quote: string, docKey: string): { text: string; anchor: string } | undefined {
  for (const part of docKey.split(GAP_KEY)) {
    const found = piecesIn(quote, part);
    if (found) return found;
  }
  return undefined;
}

function piecesIn(quote: string, docKey: string): { text: string; anchor: string } | undefined {
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
