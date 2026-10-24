import { FileKind, getFileKind } from '@/lib/file-types';

export class UnsupportedFileError extends Error {}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return XML_ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Pull the visible text out of one slide's XML: runs are <a:t>, paragraphs are <a:p>.
export function slideXmlToText(xml: string): string {
  const paragraphs = xml.match(/<a:p[ >][\s\S]*?<\/a:p>/g) ?? [];
  return paragraphs
    .map((p) =>
      (p.match(/<a:t(?: [^>]*)?>([\s\S]*?)<\/a:t>/g) ?? [])
        .map((t) => decodeXml(t.replace(/<[^>]+>/g, '')))
        .join('')
    )
    .filter((line) => line.trim().length > 0)
    .join('\n');
}

async function extractPptx(buffer: Buffer): Promise<string> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);

  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/(\d+)\.xml$/)![1], 10) - parseInt(b.match(/(\d+)\.xml$/)![1], 10));

  const slides: string[] = [];
  for (const name of slideNames) {
    const text = slideXmlToText(await zip.files[name].async('string'));
    if (text) slides.push(text);
  }
  return slides.join('\n\n');
}

export async function extractText(
  buffer: Buffer,
  fileName: string,
  mimeType = ''
): Promise<string> {
  const kind: FileKind | null = getFileKind(fileName, mimeType);

  switch (kind) {
    case 'pdf': {
      const { extractText: extractPdfText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractPdfText(pdf, { mergePages: true });
      return text;
    }
    case 'docx': {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
    case 'pptx':
      return extractPptx(buffer);
    case 'txt':
      return buffer.toString('utf-8');
    default:
      throw new UnsupportedFileError(`Unsupported file type: ${fileName}`);
  }
}
