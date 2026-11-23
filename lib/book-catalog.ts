export type NdlBookMetadata = {
  title: string;
  authors: string[];
  publisher: string | null;
  published_date: string | null;
  info_url: string | null;
};

function decodeXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function xmlValues(xml: string, localName: string): string[] {
  const expression = new RegExp(
    '<(?:[a-zA-Z0-9_.-]+:)?' + localName + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_.-]+:)?' + localName + '\\s*>',
    'gi',
  );
  return [...xml.matchAll(expression)].map(match => decodeXmlText(match[1] || '')).filter(Boolean);
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Parse NDL Search RSS and accept only the record matching the scanned ISBN. */
export function parseNdlOpenSearch(
  xml: string,
  isbn13: string,
  isbn10: string | null,
): NdlBookMetadata | null {
  if (!xml || !isbn13) return null;
  const itemMatches = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  for (const match of itemMatches) {
    const item = match[1] || '';
    const identifiers = xmlValues(item, 'identifier').map(digitsOnly);
    const exactMatch = identifiers.some(value =>
      value === isbn13 || (!!isbn10 && value === isbn10) ||
      value.includes(isbn13) || (!!isbn10 && value.includes(isbn10)),
    );
    if (!exactMatch) continue;

    const title = xmlValues(item, 'title')[0];
    if (!title) continue;
    const authors = [...new Set(xmlValues(item, 'creator'))];
    const publisher = xmlValues(item, 'publisher')[0] || null;
    const publishedDate = xmlValues(item, 'date')[0] || null;
    const link = xmlValues(item, 'link')[0] || null;
    return {
      title,
      authors,
      publisher,
      published_date: publishedDate,
      info_url: link && /^https?:\/\//i.test(link) ? link : null,
    };
  }
  return null;
}

/** Ordered, unique HTTPS cover sources used as primary and fallback images. */
export function buildBookCoverCandidates(
  isbn13: string,
  sources: Array<string | null | undefined> = [],
): string[] {
  const encodedIsbn = encodeURIComponent(isbn13);
  const generated = [
    'https://thumbnail-s.images.books.or.jp/' + encodedIsbn + '.jpg',
    'https://ndlsearch.ndl.go.jp/thumbnail/' + encodedIsbn + '.jpg',
    'https://covers.openlibrary.org/b/isbn/' + encodedIsbn + '-L.jpg?default=false',
  ];
  return [...new Set([...sources, ...generated].filter((value): value is string =>
    typeof value === 'string' && /^https:\/\//i.test(value.trim()),
  ).map(value => value.trim()))];
}


/** Accept only absolute HTTPS cover URLs; store the URL text, never the image bytes. */
export function normalizeBookCoverUrl(value: string | null | undefined): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw.length > 2048) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Proxy known catalogue hosts; load user-pasted unknown image hosts directly in the browser. */
export function toBookCoverProxyUrl(value: string | null | undefined): string {
  const normalized = normalizeBookCoverUrl(value);
  if (!normalized) return '';
  const hostname = new URL(normalized).hostname.toLowerCase();
  const proxyHosts = new Set([
    'thumbnail-s.images.books.or.jp',
    'ndlsearch.ndl.go.jp',
    'covers.openlibrary.org',
    'hondana-image.s3.amazonaws.com',
    'baseec-img-mng.akamaized.net',
    'item-shopping.c.yimg.jp',
    'www.kirihara.co.jp',
    'cover.openbd.jp',
    'image.maruzenjunkudo.co.jp',
    'books.google.com',
  ]);
  const shouldProxy = proxyHosts.has(hostname)
    || hostname === 'books.googleusercontent.com'
    || hostname.endsWith('.googleusercontent.com');
  return shouldProxy ? '/api/books/cover?url=' + encodeURIComponent(normalized) : normalized;
}
