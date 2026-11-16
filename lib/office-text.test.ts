import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { docxText, OfficeFileError, pptxText } from '@/lib/office-text';

const zip = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)])));

// Word splits text into runs, adds proofing marks and bookmarks between them.
const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter 3: Photo</w:t></w:r><w:r><w:t>synthesis</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Plants make glucose in the </w:t></w:r><w:proofErr w:type="spellStart"/><w:r><w:t>chloroplast</w:t></w:r><w:bookmarkStart w:id="0"/><w:r><w:t>.</w:t></w:r></w:p>
<w:p/>
<w:p><w:r><w:t>Light</w:t></w:r><w:r><w:tab/><w:t>energy</w:t><w:br/><w:t>&amp; water &lt;H&#8322;O&gt; &#x2192; sugar</w:t></w:r></w:p>
</w:body></w:document>`;

const slide = (...lines: string[]) =>
  `<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${lines
    .map((l) => `<p:sp><p:txBody><a:p><a:r><a:t>${l}</a:t></a:r></a:p></p:txBody></p:sp>`)
    .join('')}</p:spTree></p:cSld></p:sld>`;

describe('docxText (#71)', () => {
  it('reads each paragraph as a line, joining split runs and decoding entities', () => {
    expect(docxText(zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': DOCUMENT }))).toBe(
      'Chapter 3: Photosynthesis\nPlants make glucose in the chloroplast.\nLight energy & water <H₂O> → sugar'
    );
  });

  it('refuses a file that is not a Word document', () => {
    expect(() => docxText(zip({ 'ppt/slides/slide1.xml': slide('Hi') }))).toThrow(OfficeFileError);
    expect(() => docxText(strToU8('just some text, not a zip'))).toThrow(OfficeFileError);
  });

  it('refuses a part that would unzip to too much data', () => {
    const big = `<w:p><w:r><w:t>${'a'.repeat(11 * 1024 * 1024)}</w:t></w:r></w:p>`;
    expect(() => docxText(zip({ 'word/document.xml': big }))).toThrow('the file unzips to too much data');
  });
});

describe('pptxText (#71)', () => {
  it('reads the slides in order, then the speaker notes without slide numbers', () => {
    const file = zip({
      'ppt/slides/slide10.xml': slide('Slide ten'),
      'ppt/slides/slide2.xml': slide('The Calvin cycle', 'Takes place in the stroma'),
      'ppt/slides/slide1.xml': slide('Photosynthesis'),
      'ppt/notesSlides/notesSlide1.xml': slide('Remind students about chlorophyll.', '1'),
      'ppt/slideLayouts/slideLayout1.xml': slide('Click to edit Master title style'),
    });
    expect(pptxText(file)).toBe(
      'Photosynthesis\n\nThe Calvin cycle\nTakes place in the stroma\n\nSlide ten\n\nRemind students about chlorophyll.'
    );
  });

  it('refuses a file with no slides', () => {
    expect(() => pptxText(zip({ 'word/document.xml': DOCUMENT }))).toThrow('no slides');
  });
});
