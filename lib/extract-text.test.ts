import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { extractText, slideXmlToText, UnsupportedFileError } from '@/lib/extract-text';
import { ACCEPT_ATTR, SUPPORTED_LABEL, getFileKind } from '@/lib/file-types';

const slide = (...paragraphs: string[]) =>
  `<p:sld xmlns:a="x" xmlns:p="y"><p:cSld><p:spTree>${paragraphs
    .map((p) => `<a:p><a:r><a:t>${p}</a:t></a:r></a:p>`)
    .join('')}</p:spTree></p:cSld></p:sld>`;

async function makePptx(slides: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, xml] of Object.entries(slides)) zip.file(`ppt/slides/${name}`, xml);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

async function makeDocx(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  );
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

describe('getFileKind', () => {
  it('recognises every supported extension, case-insensitively', () => {
    expect(getFileKind('notes.PDF')).toBe('pdf');
    expect(getFileKind('notes.txt')).toBe('txt');
    expect(getFileKind('essay.docx')).toBe('docx');
    expect(getFileKind('deck.PPTX')).toBe('pptx');
  });

  it('falls back to the MIME type when the name has no known extension', () => {
    expect(getFileKind('upload', 'application/pdf')).toBe('pdf');
  });

  it('rejects unsupported files', () => {
    expect(getFileKind('virus.exe')).toBeNull();
    expect(getFileKind('old.doc')).toBeNull();
    expect(getFileKind('old.ppt')).toBeNull();
    expect(getFileKind('noextension')).toBeNull();
  });

  it('exposes the picker accept list and a readable label', () => {
    expect(ACCEPT_ATTR).toBe('.pdf,.txt,.docx,.pptx');
    expect(SUPPORTED_LABEL).toContain('PowerPoint');
    expect(SUPPORTED_LABEL).toContain('Word');
  });
});

describe('slideXmlToText', () => {
  it('joins runs within a paragraph and puts paragraphs on separate lines', () => {
    const xml =
      '<a:p><a:r><a:t>Hello </a:t></a:r><a:r><a:t>world</a:t></a:r></a:p><a:p><a:r><a:t>Second</a:t></a:r></a:p>';
    expect(slideXmlToText(xml)).toBe('Hello world\nSecond');
  });

  it('decodes XML entities and skips empty paragraphs', () => {
    const xml = '<a:p><a:r><a:t>R&amp;D &lt;2026&gt; &#65;</a:t></a:r></a:p><a:p></a:p>';
    expect(slideXmlToText(xml)).toBe('R&D <2026> A');
  });
});

describe('extractText', () => {
  it('reads plain text', async () => {
    expect(await extractText(Buffer.from('plain notes'), 'a.txt')).toBe('plain notes');
  });

  it('reads PowerPoint slides in numeric order (slide10 after slide2)', async () => {
    const buf = await makePptx({
      'slide10.xml': slide('Ten'),
      'slide2.xml': slide('Two'),
      'slide1.xml': slide('One', 'First point'),
    });
    expect(await extractText(buf, 'deck.pptx')).toBe('One\nFirst point\n\nTwo\n\nTen');
  });

  it('reads Word documents', async () => {
    const buf = await makeDocx('Mitochondria make energy');
    expect(await extractText(buf, 'essay.docx')).toContain('Mitochondria make energy');
  });

  it('throws on an unsupported type', async () => {
    await expect(extractText(Buffer.from('x'), 'file.exe')).rejects.toBeInstanceOf(
      UnsupportedFileError
    );
  });

  it('throws on a corrupt PowerPoint instead of returning junk', async () => {
    await expect(extractText(Buffer.from('not a zip'), 'bad.pptx')).rejects.toThrow();
  });
});
