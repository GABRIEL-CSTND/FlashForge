import { unzipSync } from 'fflate';

// SERVER-ONLY. The text of Word (.docx) and PowerPoint (.pptx) files (#71).
// Both are zip files of XML. Word keeps its text in <w:t> runs inside <w:p>
// paragraphs (word/document.xml); PowerPoint uses <a:t> inside <a:p>, one XML
// file per slide (ppt/slides/slideN.xml) and per speaker-notes page.

// A small upload can still unzip to gigabytes (a "zip bomb"), so only the
// parts with text are unzipped, and only up to these sizes.
const MAX_PART_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

export class OfficeFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfficeFileError';
  }
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] !== '#') return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

// One line per paragraph (<w:p> or <a:p>). Tabs and line breaks inside a
// paragraph become spaces; empty paragraphs are left out.
function paragraphs(xml: string, ns: 'w' | 'a'): string[] {
  const runs = new RegExp(`<${ns}:t(?:\\s[^>]*)?>([^<]*)</${ns}:t>|<${ns}:(?:tab|br)\\b[^>]*/>`, 'g');
  return xml
    .split(`</${ns}:p>`)
    .map((chunk) => {
      let line = '';
      for (const m of chunk.matchAll(runs)) line += m[1] !== undefined ? decodeXml(m[1]) : ' ';
      return line.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

function unzipParts(bytes: Uint8Array, wanted: (name: string) => boolean): Record<string, string> {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (!wanted(file.name)) return false;
        total += file.originalSize;
        if (file.originalSize > MAX_PART_BYTES || total > MAX_TOTAL_BYTES) {
          throw new OfficeFileError('the file unzips to too much data');
        }
        return true;
      },
    });
  } catch (err) {
    if (err instanceof OfficeFileError) throw err;
    throw new OfficeFileError(`not a valid Office file: ${err instanceof Error ? err.message : String(err)}`);
  }
  const decoder = new TextDecoder();
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, decoder.decode(data)]));
}

// slide2.xml before slide10.xml.
const byNumber = (a: string, b: string) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]);

export function docxText(bytes: Uint8Array): string {
  const parts = unzipParts(bytes, (name) => name === 'word/document.xml');
  const xml = parts['word/document.xml'];
  if (xml === undefined) throw new OfficeFileError('no word/document.xml');
  return paragraphs(xml, 'w').join('\n');
}

// The slides in order, then the speaker notes. Slide-number placeholders in
// the notes ("3") are left out.
export function pptxText(bytes: Uint8Array): string {
  const parts = unzipParts(bytes, (name) => /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(name));
  const names = Object.keys(parts);
  const slides = names.filter((n) => n.startsWith('ppt/slides/')).sort(byNumber);
  if (slides.length === 0) throw new OfficeFileError('no slides');
  const notes = names.filter((n) => n.startsWith('ppt/notesSlides/')).sort(byNumber);
  const slideText = slides.map((n) => paragraphs(parts[n], 'a').join('\n')).filter(Boolean);
  const notesText = notes
    .map((n) => paragraphs(parts[n], 'a').filter((line) => !/^\d+$/.test(line)).join('\n'))
    .filter(Boolean);
  return [...slideText, ...notesText].join('\n\n');
}
