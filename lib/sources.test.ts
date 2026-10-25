import { describe, expect, it } from 'vitest';
import {
  FILE_ACCEPT,
  fileKind,
  fileProblem,
  linkProblem,
  MAX_SOURCE_CHARS,
  pastedTextProblem,
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
