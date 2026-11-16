import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http, { type IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import zlib from 'node:zlib';

// SERVER-ONLY. Fetches a web page a user linked to (#74) and keeps its main
// text. The server fetches whatever link is typed in, so it must never be
// steered to private or internal addresses (server-side request forgery):
//   - only http and https, on the usual ports, with no user:password@;
//   - every address the name resolves to must be public, checked as the
//     connection is made, so the name can't switch to a private address after
//     a check; IP addresses typed in the link are checked the same way;
//   - redirects (up to 3) go through the same checks;
//   - at most 2 MB of page (after unzipping) and 10 seconds.

export class WebPageError extends Error {
  userMessage: string;

  constructor(message: string, userMessage: string) {
    super(message);
    this.name = 'WebPageError';
    this.userMessage = userMessage;
  }
}

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const USUAL_PORTS: Record<string, number> = { 'http:': 80, 'https:': 443 };

const CANT_OPEN = "We couldn't open this link. Check it, or paste the text instead.";
const PRIVATE_LINK = "This link points to a private address, so it can't be used.";

// Addresses that aren't the public internet: "this" network, private ranges,
// carrier-grade NAT, loopback, link-local (including cloud metadata at
// 169.254.169.254), documentation and benchmarking ranges, multicast and
// reserved. IPv4 addresses written as IPv6 (::ffff:10.0.0.1) are checked
// against the IPv4 rules by BlockList.
const NOT_PUBLIC = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NOT_PUBLIC.addSubnet(net, prefix, 'ipv4');
}
// Documentation, Teredo and 6to4 (the last two can wrap IPv4 addresses).
NOT_PUBLIC.addSubnet('2001:db8::', 32, 'ipv6');
NOT_PUBLIC.addSubnet('2001::', 32, 'ipv6');
NOT_PUBLIC.addSubnet('2002::', 16, 'ipv6');
// Public IPv6 is global unicast; IPv4-mapped addresses are judged as IPv4.
const GLOBAL_IPV6 = new BlockList();
GLOBAL_IPV6.addSubnet('2000::', 3, 'ipv6');
const IPV4_MAPPED = new BlockList();
IPV4_MAPPED.addSubnet('::ffff:0:0', 96, 'ipv6');

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !NOT_PUBLIC.check(ip, 'ipv4');
  if (family !== 6) return false;
  if (IPV4_MAPPED.check(ip, 'ipv6')) return !NOT_PUBLIC.check(ip, 'ipv6');
  return GLOBAL_IPV6.check(ip, 'ipv6') && !NOT_PUBLIC.check(ip, 'ipv6');
}

type AddressCheck = (ip: string) => boolean;

export interface FetchOptions {
  // Tests only: which addresses and ports may be fetched.
  isAllowed?: AddressCheck;
  allowedPorts?: number[];
}

// The link as a URL, if it may be fetched at all (before any address check).
export function parseUserUrl(input: string, allowedPorts: number[] = [80, 443]): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new WebPageError('not a URL', 'Paste a full link, starting with https://');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebPageError(`protocol ${url.protocol}`, 'Only http and https links work.');
  }
  if (url.username || url.password) {
    throw new WebPageError('credentials in URL', "Links with a user name or password can't be used.");
  }
  const port = url.port ? Number(url.port) : USUAL_PORTS[url.protocol];
  if (!allowedPorts.includes(port)) {
    throw new WebPageError(`port ${port}`, 'Only links on the usual web ports work.');
  }
  return url;
}

// Resolves the name and refuses it unless every address it has is allowed.
// Used by the connection itself, so the checked address is the one used.
function checkedLookup(isAllowed: AddressCheck): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { all: true, family: options.family }, (err, addresses: LookupAddress[]) => {
      if (err) return callback(err, '', 0);
      if (addresses.length === 0 || addresses.some((a) => !isAllowed(a.address))) {
        return callback(Object.assign(new Error(`${hostname} has a private address`), { code: 'EPRIVATE' }), '', 0);
      }
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

function get(url: URL, isAllowed: AddressCheck): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method: 'GET',
        lookup: checkedLookup(isAllowed),
        headers: {
          'user-agent': 'FlashForge/1.0 (makes a study guide from a page a student linked)',
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
          'accept-encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
        }
        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const stream: Readable =
          encoding === 'gzip' || encoding === 'x-gzip'
            ? res.pipe(zlib.createGunzip())
            : encoding === 'deflate'
              ? res.pipe(zlib.createInflate())
              : encoding === 'br'
                ? res.pipe(zlib.createBrotliDecompress())
                : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy(
              new WebPageError('page over 2 MB', 'This page is too big to read. Copy the part you need and paste it as text.')
            );
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on('error', reject);
      }
    );
    const timer = setTimeout(
      () => req.destroy(new WebPageError('timed out', 'The page took too long to answer. Try again, or paste the text.')),
      TIMEOUT_MS
    );
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end();
  });
}

export interface WebPage {
  title: string;
  text: string;
  // Where the page was in the end, after redirects.
  url: string;
}

export async function fetchWebPage(input: string, { isAllowed = isPublicAddress, allowedPorts }: FetchOptions = {}): Promise<WebPage> {
  let url = parseUserUrl(input, allowedPorts);
  for (let redirects = 0; ; redirects++) {
    // Node connects to an IP address in the link without a lookup, so check it here.
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && !isAllowed(host)) throw new WebPageError(`private address ${host}`, PRIVATE_LINK);

    let res: RawResponse;
    try {
      res = await get(url, isAllowed);
    } catch (err) {
      if (err instanceof WebPageError) throw err;
      if ((err as { code?: string }).code === 'EPRIVATE') throw new WebPageError(String(err), PRIVATE_LINK);
      throw new WebPageError(`could not fetch: ${err instanceof Error ? err.message : String(err)}`, CANT_OPEN);
    }

    const location = res.headers.location;
    if (res.status >= 300 && res.status < 400 && location) {
      if (redirects >= MAX_REDIRECTS) throw new WebPageError('too many redirects', CANT_OPEN);
      url = parseUserUrl(new URL(location, url).toString(), allowedPorts);
      continue;
    }
    if (res.status !== 200) {
      throw new WebPageError(
        `status ${res.status}`,
        `The page answered with an error (${res.status}). Check the link, or paste the text instead.`
      );
    }

    const type = String(res.headers['content-type'] ?? '').toLowerCase();
    if (!/^(text\/html|application\/xhtml\+xml|text\/plain)/.test(type)) {
      throw new WebPageError(
        `content type ${type}`,
        "This link isn't a web page we can read. If it's a file, download it and upload it instead."
      );
    }
    let decoded: string;
    try {
      decoded = new TextDecoder(type.match(/charset=([\w-]+)/)?.[1] ?? 'utf-8').decode(res.body);
    } catch {
      decoded = new TextDecoder().decode(res.body);
    }
    const page = type.startsWith('text/plain') ? { title: '', text: decoded.trim() } : htmlToText(decoded);
    return { ...page, url: url.toString() };
  }
}

// ---- HTML to text, with indexOf and simple patterns only, so a hostile page
// can't make it slow. ----

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®', deg: '°', middot: '·', bull: '•', times: '×',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (whole, entity: string) => {
    if (entity[0] !== '#') return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

// Where the next <tag starts (as a whole tag name) at or after `from`; -1 if nowhere.
function tagStart(lower: string, tag: string, from: number): number {
  for (let i = lower.indexOf(`<${tag}`, from); i >= 0; i = lower.indexOf(`<${tag}`, i + 1)) {
    const next = lower[i + tag.length + 1];
    if (next === undefined || next === '>' || next === '/' || /\s/.test(next)) return i;
  }
  return -1;
}

// Removes <tag>...</tag> blocks (and everything after an unclosed one).
function cutBlocks(html: string, tag: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let pos = 0;
  for (let start = tagStart(lower, tag, 0); start >= 0; start = tagStart(lower, tag, pos)) {
    out += html.slice(pos, start);
    const end = lower.indexOf(`</${tag}`, start);
    if (end < 0) return out;
    const close = lower.indexOf('>', end);
    if (close < 0) return out;
    pos = close + 1;
  }
  return out + html.slice(pos);
}

function cutComments(html: string): string {
  let out = '';
  let pos = 0;
  for (let start = html.indexOf('<!--'); start >= 0; start = html.indexOf('<!--', pos)) {
    out += html.slice(pos, start);
    const end = html.indexOf('-->', start + 4);
    if (end < 0) return out;
    pos = end + 3;
  }
  return out + html.slice(pos);
}

// What's inside the first <tag ...> and the last </tag>, or null.
function inside(html: string, tag: string): string | null {
  const lower = html.toLowerCase();
  const start = tagStart(lower, tag, 0);
  if (start < 0) return null;
  const open = lower.indexOf('>', start);
  const end = lower.lastIndexOf(`</${tag}`);
  return open >= 0 && end > open ? html.slice(open + 1, end) : null;
}

// Tags that start a new line of text.
const BLOCK_TAGS = new Set([
  'br', 'p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table', 'section', 'article', 'main',
  'blockquote', 'pre', 'dt', 'dd', 'dl', 'figcaption',
]);

// Drops the tags, one pass with indexOf. (A pattern like /<[^>]*>/ takes
// minutes on a page with many "<" and no ">".) An unclosed tag ends the text.
function toText(fragment: string): string {
  let out = '';
  let pos = 0;
  while (pos < fragment.length) {
    const lt = fragment.indexOf('<', pos);
    if (lt < 0) {
      out += fragment.slice(pos);
      break;
    }
    out += fragment.slice(pos, lt);
    const gt = fragment.indexOf('>', lt + 1);
    if (gt < 0) break;
    const name = /^<\/?([a-z0-9]+)/i.exec(fragment.slice(lt, Math.min(gt, lt + 20)))?.[1]?.toLowerCase();
    out += name !== undefined && BLOCK_TAGS.has(name) ? '\n' : ' ';
    pos = gt + 1;
  }
  return decodeEntities(out)
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function pageTitle(html: string): string {
  const lower = html.toLowerCase();
  const start = tagStart(lower, 'title', 0);
  const open = start < 0 ? -1 : lower.indexOf('>', start);
  const close = open < 0 ? -1 : lower.indexOf('</title', open);
  return close < 0 ? '' : toText(html.slice(open + 1, close));
}

// Skipped as not part of the page's main text.
const NOT_CONTENT = ['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'nav', 'header', 'footer', 'aside', 'form', 'button', 'select'];

// The page's title and main text: its <article> or <main> when that has a
// fair amount of text, otherwise its whole <body>.
export function htmlToText(html: string): { title: string; text: string } {
  const title = pageTitle(html);
  let cleaned = cutComments(html);
  for (const tag of NOT_CONTENT) cleaned = cutBlocks(cleaned, tag);
  for (const tag of ['article', 'main']) {
    const part = inside(cleaned, tag);
    const text = part === null ? '' : toText(part);
    if (text.length >= 500) return { title, text };
  }
  return { title, text: toText(inside(cleaned, 'body') ?? cleaned) };
}
