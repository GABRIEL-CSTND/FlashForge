// SERVER-ONLY. Study guides from a typed topic (#79). The topic is looked up
// on English Wikipedia: a search, then the best match that isn't a
// disambiguation page ("Mercury may refer to..."). The article's text then
// goes to the AI like pasted notes, so a topic still costs one AI request.

const API = 'https://en.wikipedia.org/w/api.php';
// Wikimedia asks API users to say who they are.
const USER_AGENT = 'FlashForge/1.0 (school project; https://github.com/GABRIEL-CSTND/FlashForge)';
const TIMEOUT_MS = 10_000;
// Sections at the end of an article that are lists of links, not content.
const END_SECTIONS = new Set([
  'See also',
  'Notes',
  'References',
  'Further reading',
  'External links',
  'Bibliography',
  'Sources',
  'Citations',
  'Footnotes',
]);
// Less article text than this isn't enough for a study guide.
const MIN_ARTICLE_CHARS = 300;

const UNREACHABLE = "We couldn't reach Wikipedia right now. Try again in a minute, or paste your notes.";

export class TopicError extends Error {
  userMessage: string;

  constructor(message: string, userMessage: string) {
    super(message);
    this.name = 'TopicError';
    this.userMessage = userMessage;
  }
}

export interface TopicArticle {
  title: string;
  text: string;
  url: string;
}

interface SearchPage {
  title: string;
  index: number;
  pageprops?: Record<string, string>;
}

interface ArticlePage {
  title: string;
  extract?: string;
  fullurl?: string;
}

async function ask<T>(params: Record<string, string>): Promise<{ query?: { pages?: T[] } }> {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2' })}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, 'api-user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new TopicError(`Wikipedia unreachable: ${err instanceof Error ? err.message : String(err)}`, UNREACHABLE);
  }
  if (!res.ok) throw new TopicError(`Wikipedia answered ${res.status}`, UNREACHABLE);
  return res.json();
}

// The article without the lists at its end, and without long runs of blank lines.
export function articleBody(extract: string): string {
  const lines = extract.split('\n');
  const end = lines.findIndex((line) => END_SECTIONS.has(line.trim()));
  return (end < 0 ? lines : lines.slice(0, end))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function findTopic(topic: string): Promise<TopicArticle> {
  // The top three search results, in search order, marked if they're
  // disambiguation pages.
  const search = await ask<SearchPage>({
    action: 'query',
    generator: 'search',
    gsrsearch: topic,
    gsrlimit: '3',
    gsrprop: '',
    prop: 'pageprops',
    ppprop: 'disambiguation',
  });
  const pages = [...(search.query?.pages ?? [])].sort((a, b) => a.index - b.index);
  if (pages.length === 0) {
    throw new TopicError('no results', `We couldn't find “${topic}” on Wikipedia. Check the spelling or try other words, or paste your notes.`);
  }
  const page = pages.find((p) => !(p.pageprops && 'disambiguation' in p.pageprops));
  if (!page) {
    throw new TopicError('only disambiguation pages', `“${topic}” can mean several things. Add a word or two, like “Mercury planet”.`);
  }

  const found = await ask<ArticlePage>({
    action: 'query',
    prop: 'extracts|info',
    explaintext: '1',
    exsectionformat: 'plain',
    inprop: 'url',
    redirects: '1',
    titles: page.title,
  });
  const article = found.query?.pages?.[0];
  const text = articleBody(article?.extract ?? '');
  if (!article?.fullurl || text.length < MIN_ARTICLE_CHARS) {
    throw new TopicError('article too short', `Wikipedia only has a little on “${topic}”. Try a broader topic, or paste your notes.`);
  }
  return { title: article.title, text, url: article.fullurl };
}
