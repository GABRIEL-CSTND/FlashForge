import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { fetchWebPage, htmlToText, isPublicAddress, parseUserUrl, WebPageError } from '@/lib/web-page';

describe('isPublicAddress (#74)', () => {
  it.each([
    '8.8.8.8',
    '142.250.72.14',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ])('lets %s through', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1', // the same, written another way
    '::ffff:192.168.0.1',
    '2001:db8::1',
    'not an ip',
  ])('refuses %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe('parseUserUrl (#74)', () => {
  it('takes http and https links on the usual ports', () => {
    expect(parseUserUrl(' https://example.com/notes ').toString()).toBe('https://example.com/notes');
    expect(parseUserUrl('http://example.com:80/').toString()).toBe('http://example.com/');
  });

  it.each([
    ['example.com/notes', 'Paste a full link, starting with https://'],
    ['ftp://example.com/notes', 'Only http and https links work.'],
    ['file:///etc/passwd', 'Only http and https links work.'],
    ['https://admin:secret@example.com/', "Links with a user name or password can't be used."],
    ['http://example.com:8080/', 'Only links on the usual web ports work.'],
    ['http://example.com:22/', 'Only links on the usual web ports work.'],
  ])('refuses %s', (input, message) => {
    expect(() => parseUserUrl(input)).toThrow(expect.objectContaining({ userMessage: message }));
  });
});

describe('htmlToText (#74)', () => {
  const article = `${'Mitochondria make most of the cell&rsquo;s ATP. '.repeat(12)}`;

  it('keeps the article text and the title, without menus, scripts or comments', () => {
    const page = `<!doctype html><html><head><title>Cell biology &amp; you</title><style>p{color:red}</style>
      <script>var secret = "</div>not text";</script></head><body>
      <header><nav><a href="/">Home</a> <a href="/about">About</a></nav></header>
      <!-- <p>commented out</p> -->
      <article><h1>The powerhouse</h1><p>${article}</p><p>Chloroplasts&nbsp;make glucose &#8594; sugar.</p></article>
      <aside>Related posts</aside><footer>© 2026 Example</footer></body></html>`;
    const { title, text } = htmlToText(page);
    expect(title).toBe('Cell biology & you');
    expect(text.split('\n')).toEqual(['The powerhouse', article.replace(/&rsquo;/g, '’').trim(), 'Chloroplasts make glucose → sugar.']);
  });

  it('uses the whole body when there is no article with enough text', () => {
    const { text } = htmlToText('<body><nav>Menu</nav><article>Short</article><div>Ribosomes build proteins.</div></body>');
    expect(text).toBe('Short\nRibosomes build proteins.');
  });

  it('stays quick on hostile pages', () => {
    const started = Date.now();
    htmlToText(`<body>${'<script'.repeat(100_000)}${'<div'.repeat(100_000)}</body>`);
    htmlToText(`<body>${'<div<a'.repeat(100_000)}`);
    htmlToText('<title'.repeat(100_000));
    htmlToText('<!--'.repeat(200_000));
    htmlToText(`<body>${'&#x'.repeat(200_000)}</body>`);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe('fetchWebPage (#74)', () => {
  let server: Server;
  let port: number;
  const routes: Record<string, (res: import('node:http').ServerResponse) => void> = {
    '/notes': (res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><head><title>Notes</title></head><body><p>The stroma holds the Calvin cycle.</p></body></html>');
    },
    '/zipped': (res) => {
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      res.end(gzipSync('<body><p>Zipped page about RuBisCO.</p></body>'));
    },
    '/plain': (res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('  Plain notes about chlorophyll.  ');
    },
    '/moved': (res) => {
      res.writeHead(301, { location: '/notes' });
      res.end();
    },
    '/to-ipv6-loopback': (res) => {
      res.writeHead(302, { location: `http://[::1]:${port}/notes` });
      res.end();
    },
    '/loop': (res) => {
      res.writeHead(302, { location: '/loop' });
      res.end();
    },
    '/pdf': (res) => {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end('%PDF-1.4');
    },
    '/huge': (res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('x'.repeat(3 * 1024 * 1024));
    },
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      const route = routes[req.url ?? ''];
      if (route) route(res);
      else {
        res.writeHead(404);
        res.end('missing');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  // Only 127.0.0.1 (this test server) counts as allowed here, on its port.
  const fetchLocal = (path: string) =>
    fetchWebPage(`http://127.0.0.1:${port}${path}`, { isAllowed: (ip) => ip === '127.0.0.1', allowedPorts: [port] });
  const refusal = (promise: Promise<unknown>) =>
    promise.then(
      () => 'fetched',
      (err) => (err instanceof WebPageError ? err.userMessage : `other error: ${err}`)
    );

  it('refuses this machine, by name and by address, with the real address rules', async () => {
    expect(await refusal(fetchWebPage(`http://127.0.0.1:${port}/notes`, { allowedPorts: [port] }))).toBe(
      "This link points to a private address, so it can't be used."
    );
    expect(await refusal(fetchWebPage(`http://localhost:${port}/notes`, { allowedPorts: [port] }))).toBe(
      "This link points to a private address, so it can't be used."
    );
  });

  it('reads a page, following redirects and unzipping it', async () => {
    expect(await fetchLocal('/notes')).toEqual({
      title: 'Notes',
      text: 'The stroma holds the Calvin cycle.',
      url: `http://127.0.0.1:${port}/notes`,
    });
    expect((await fetchLocal('/moved')).url).toBe(`http://127.0.0.1:${port}/notes`);
    expect((await fetchLocal('/zipped')).text).toBe('Zipped page about RuBisCO.');
    expect(await fetchLocal('/plain')).toMatchObject({ title: '', text: 'Plain notes about chlorophyll.' });
  });

  it('checks every redirect again', async () => {
    expect(await refusal(fetchLocal('/to-ipv6-loopback'))).toBe("This link points to a private address, so it can't be used.");
    expect(await refusal(fetchLocal('/loop'))).toBe("We couldn't open this link. Check it, or paste the text instead.");
  });

  it('explains pages it cannot use', async () => {
    expect(await refusal(fetchLocal('/missing'))).toBe(
      'The page answered with an error (404). Check the link, or paste the text instead.'
    );
    expect(await refusal(fetchLocal('/pdf'))).toBe(
      "This link isn't a web page we can read. If it's a file, download it and upload it instead."
    );
    expect(await refusal(fetchLocal('/huge'))).toBe(
      'This page is too big to read. Copy the part you need and paste it as text.'
    );
  });
});
