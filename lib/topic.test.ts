import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { articleBody, findTopic, TopicError } from '@/lib/topic';

// Wikipedia is never called here: fetch answers like its API would.
type Page = Record<string, unknown>;
let searchPages: Page[];
let articles: Record<string, Page>;
let calls: URLSearchParams[];

const ARTICLE = `Photosynthesis is how plants make sugar from light. ${'Chlorophyll absorbs light in the chloroplast. '.repeat(10)}`;

beforeEach(() => {
  calls = [];
  searchPages = [];
  articles = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const params = new URL(url).searchParams;
      calls.push(params);
      expect((init.headers as Record<string, string>)['user-agent']).toMatch(/^FlashForge\//);
      const pages = params.get('generator') === 'search' ? searchPages : [articles[params.get('titles') ?? '']].filter(Boolean);
      return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

const message = (promise: Promise<unknown>) =>
  promise.then(
    () => 'found',
    (err) => (err instanceof TopicError ? err.userMessage : `other: ${err}`)
  );

describe('findTopic (#79)', () => {
  it('uses the best search match and its article', async () => {
    searchPages = [{ title: 'Artificial photosynthesis', index: 2 }, { title: 'Photosynthesis', index: 1 }];
    articles.Photosynthesis = { title: 'Photosynthesis', extract: ARTICLE, fullurl: 'https://en.wikipedia.org/wiki/Photosynthesis' };
    expect(await findTopic('photosynthesis')).toEqual({
      title: 'Photosynthesis',
      text: ARTICLE.trim(),
      url: 'https://en.wikipedia.org/wiki/Photosynthesis',
    });
    expect(calls[0].get('gsrsearch')).toBe('photosynthesis');
    expect(calls[1].get('titles')).toBe('Photosynthesis');
  });

  it('skips disambiguation pages for the next match', async () => {
    searchPages = [
      { title: 'Mercury', index: 1, pageprops: { disambiguation: '' } },
      { title: 'Mercury (planet)', index: 2 },
    ];
    articles['Mercury (planet)'] = { title: 'Mercury (planet)', extract: ARTICLE, fullurl: 'https://en.wikipedia.org/wiki/Mercury_(planet)' };
    expect((await findTopic('mercury')).title).toBe('Mercury (planet)');
  });

  it('explains when nothing useful is found, without fetching an article', async () => {
    expect(await message(findTopic('asdkjqwe'))).toBe(
      "We couldn't find “asdkjqwe” on Wikipedia. Check the spelling or try other words, or paste your notes."
    );
    searchPages = [{ title: 'Mercury', index: 1, pageprops: { disambiguation: '' } }];
    expect(await message(findTopic('mercury'))).toBe('“mercury” can mean several things. Add a word or two, like “Mercury planet”.');
    expect(calls.every((c) => c.get('generator') === 'search')).toBe(true);

    searchPages = [{ title: 'Stub', index: 1 }];
    articles.Stub = { title: 'Stub', extract: 'Too short.', fullurl: 'https://en.wikipedia.org/wiki/Stub' };
    expect(await message(findTopic('stub'))).toBe('Wikipedia only has a little on “stub”. Try a broader topic, or paste your notes.');
  });

  it('says when Wikipedia cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));
    expect(await message(findTopic('photosynthesis'))).toBe(
      "We couldn't reach Wikipedia right now. Try again in a minute, or paste your notes."
    );
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    expect(await message(findTopic('photosynthesis'))).toBe(
      "We couldn't reach Wikipedia right now. Try again in a minute, or paste your notes."
    );
  });
});

describe('articleBody', () => {
  it('drops the lists at the end of an article', () => {
    expect(articleBody('Intro text.\n\n\n\nHistory\nOld facts.\n\nSee also\nOther page\n\nReferences\n1. A book')).toBe(
      'Intro text.\n\nHistory\nOld facts.'
    );
  });
});
