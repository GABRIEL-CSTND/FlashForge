import { describe, expect, it } from 'vitest';
import {
  detectSource,
  FILE_ACCEPT,
  fileKind,
  fileProblem,
  linkFromInput,
  linkProblem,
  MAX_SOURCE_CHARS,
  pastedTextProblem,
  pickedFileProblem,
  quoteSourceLabel,
  titleFromText,
  topicProblem,
} from '@/lib/sources';

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

describe('file types (#71)', () => {
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  it('knows each file by its extension or its type', () => {
    expect(FILE_ACCEPT).toBe('.pdf,.docx,.pptx,.txt,.jpg,.jpeg,.png,.webp');
    expect(fileKind('Lecture 3.PPTX', '')).toBe('pptx');
    expect(fileKind('handout', DOCX)).toBe('docx');
    expect(fileKind('notes.txt', 'text/plain')).toBe('txt');
    expect(fileKind('photo.png', 'image/png')).toBe('png');
    expect(fileKind('IMG_2034.JPEG', '')).toBe('jpeg');
    expect(fileKind('scan.heic', 'image/heic')).toBeNull();
  });

  it('explains what to do with files it cannot take', () => {
    expect(fileProblem('lecture.ppt', 'application/vnd.ms-powerpoint', 1000)).toBe(
      "Older PowerPoint (.ppt) files can't be read. Save it as .pptx or PDF first."
    );
    expect(fileProblem('essay.doc', 'application/msword', 1000)).toBe(
      "Older Word (.doc) files can't be read. Save it as .docx or PDF first."
    );
    expect(fileProblem('song.mp3', 'audio/mpeg', 1000)).toBe(
      'Upload a PDF, Word, PowerPoint or TXT file, or a photo (JPG, PNG or WebP).'
    );
    expect(fileProblem('big.pdf', 'application/pdf', 5.5 * 1024 * 1024)).toBe(
      'This file is 5.5 MB. Files can be up to 4 MB; try a smaller file or paste the text instead.'
    );
    expect(fileProblem('ok.pdf', 'application/pdf', 4 * 1024 * 1024)).toBeNull();
  });
});

describe('linkProblem (#74)', () => {
  it('wants a full http or https link', () => {
    expect(linkProblem(' https://example.org/notes ')).toBeNull();
    expect(linkProblem('http://example.org')).toBeNull();
    expect(linkProblem('example.org/notes')).toBe('Paste a full link, starting with https://');
    expect(linkProblem('javascript:alert(1)')).toBe('Paste a full link, starting with https://');
  });
});

describe('topicProblem (#79)', () => {
  it('wants a few words, up to 100 characters', () => {
    expect(topicProblem(' Photosynthesis ')).toBeNull();
    expect(topicProblem('AI')).toBeNull();
    expect(topicProblem(' x ')).toBe('Type a topic, like “Photosynthesis”.');
    expect(topicProblem('x'.repeat(101))).toBe('Keep the topic under 100 characters.');
  });
});

describe('quoteSourceLabel (#80)', () => {
  it("names where a quote is from, by the guide's source", () => {
    expect(quoteSourceLabel('Chapter 2.pdf')).toBe('From the document');
    expect(quoteSourceLabel('https://en.wikipedia.org/wiki/Photosynthesis')).toBe('From Wikipedia');
    expect(quoteSourceLabel('https://example.org/notes')).toBe('From the web page');
    expect(quoteSourceLabel(null)).toBe('From the notes');
  });
});

describe('pickedFileProblem (#44)', () => {
  const MB = 1024 * 1024;

  it('lets a PDF be big, because the browser sends only its text', () => {
    for (const size of [2 * MB, 4 * MB, 5.5 * MB, 12 * MB, 100 * MB]) {
      expect(pickedFileProblem('lecture.pdf', 'application/pdf', size)).toBeNull();
    }
    // Recognised by its name when the browser gives no type.
    expect(pickedFileProblem('LECTURE.PDF', '', 30 * MB)).toBeNull();
  });

  it('turns away only an enormous PDF, with a message that says how to go on', () => {
    const message = pickedFileProblem('book.pdf', 'application/pdf', 150 * MB);
    expect(message).toContain('150 MB');
    expect(message).toContain('up to 100 MB');
    expect(message).toMatch(/splitting it|paste/);
  });

  it('keeps the 4 MB limit for every other kind of file', () => {
    expect(pickedFileProblem('essay.docx', '', 5 * MB)).toBe(fileProblem('essay.docx', '', 5 * MB));
    expect(pickedFileProblem('deck.pptx', '', 12 * MB)).toBe(fileProblem('deck.pptx', '', 12 * MB));
    expect(pickedFileProblem('deck.pptx', '', 12 * MB)).toContain('Files can be up to 4 MB');
    expect(pickedFileProblem('notes.txt', 'text/plain', 5 * MB)).toContain('4 MB');
  });

  it('still refuses what is not a supported file, and accepts what is', () => {
    expect(pickedFileProblem('song.mp3', 'audio/mpeg', 1000)).toBe(fileProblem('song.mp3', 'audio/mpeg', 1000));
    expect(pickedFileProblem('essay.doc', 'application/msword', 1000)).toBe(fileProblem('essay.doc', 'application/msword', 1000));
    expect(pickedFileProblem('small.pdf', 'application/pdf', 1000)).toBeNull();
  });

  it('does not change what the server accepts: a PDF sent to it is still limited to 4 MB', () => {
    expect(fileProblem('big.pdf', 'application/pdf', 5.5 * MB)).toContain('4 MB');
  });
});

describe('detectSource (desk redesign, phase 3)', () => {
  it('reads a web address as a link, with or without https://', () => {
    expect(detectSource('https://example.org/notes')).toBe('link');
    expect(detectSource('  http://example.org  ')).toBe('link');
    expect(detectSource('www.britannica.com/science/photosynthesis')).toBe('link');
    expect(detectSource('example.org/notes')).toBe('link');
    expect(detectSource('en.wikipedia.org')).toBe('link');
  });

  it('reads a short name as a topic', () => {
    expect(detectSource('Photosynthesis')).toBe('topic');
    expect(detectSource('the OSI model')).toBe('topic');
    expect(detectSource('World War II causes')).toBe('topic');
    // Names with a dot that aren't web addresses.
    expect(detectSource('Node.js')).toBe('topic');
    expect(detectSource('ASP.NET')).toBe('topic');
  });

  it('reads sentences, long lines and more than one line as notes', () => {
    expect(detectSource('The stroma is the fluid inside the chloroplast.')).toBe('text');
    expect(detectSource('What is photosynthesis?')).toBe('text');
    expect(detectSource('Mitochondria make ATP for the cell during respiration')).toBe('text');
    expect(detectSource('Stroma\nThylakoid')).toBe('text');
    expect(detectSource('x'.repeat(61))).toBe('text');
  });

  it('finds nothing on an empty sheet', () => {
    expect(detectSource('')).toBeNull();
    expect(detectSource('   \n ')).toBeNull();
  });
});

describe('linkFromInput', () => {
  it('adds https:// to an address typed without it, and leaves a full link alone', () => {
    expect(linkFromInput(' example.org/notes ')).toBe('https://example.org/notes');
    expect(linkFromInput('www.example.org')).toBe('https://www.example.org');
    expect(linkFromInput('http://example.org')).toBe('http://example.org');
    expect(linkFromInput('HTTPS://Example.org')).toBe('HTTPS://Example.org');
  });
});
