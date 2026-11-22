import { NextResponse } from 'next/server';
import { normalizeBookIsbn, toIsbn10 } from '@/lib/book-isbn';
import { buildBookCoverCandidates, parseNdlOpenSearch } from '@/lib/book-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type OpenBdRecord = {
  summary?: {
    isbn?: string;
    title?: string;
    author?: string;
    publisher?: string;
    pubdate?: string;
    cover?: string;
  };
  onix?: {
    DescriptiveDetail?: {
      Extent?: Array<{ ExtentType?: string; ExtentValue?: string }>;
    };
    CollateralDetail?: {
      TextContent?: Array<{ TextType?: string; Text?: string }>;
      SupportingResource?: Array<{
        ResourceLink?: string;
        ResourceVersion?: Array<{ ResourceLink?: string }>;
      }>;
    };
  };
  hanmoto?: {
    kaisetsu105w?: string;
    maegakinado?: string;
    storelink?: string;
  };
};

type GoogleVolume = {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    infoLink?: string;
    industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
      small?: string;
      medium?: string;
      large?: string;
      extraLarge?: string;
    };
  };
};

type OpenLibraryDoc = {
  title?: string;
  author_name?: string[];
  publisher?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
  key?: string;
  isbn?: string[];
};

type OpenLibraryEdition = {
  title?: string;
  publishers?: string[];
  publish_date?: string;
  covers?: number[];
  number_of_pages?: number;
  works?: Array<{ key?: string }>;
  isbn_10?: string[];
  isbn_13?: string[];
};

type BookResult = {
  isbn13: string;
  title: string;
  authors: string[];
  publisher: string | null;
  published_date: string | null;
  description: string | null;
  thumbnail_url: string | null;
  cover_urls: string[];
  info_url: string | null;
  page_count: number | null;
  source: 'openbd' | 'google-books' | 'openlibrary' | 'kirihara' | 'ndl';
};

const KNOWN_PUBLISHER_BOOKS: Record<string, Omit<BookResult, 'isbn13' | 'cover_urls'>> = {
  '9784342353093': {
    title: '読んで見て聞いて覚える 重要古文単語315 四訂版',
    authors: ['武田博幸', '鞆森祥悟'],
    publisher: '桐原書店',
    published_date: '2022-10-10',
    description: '見出し語315語と関連語・慣用句315語を収録。イラストや図による解説に加え、例文音読動画や入試問題のQRコードに対応した古文単語集です。',
    thumbnail_url: 'https://www.kirihara.co.jp/files/topics/9525_ext_07_0.jpg?v=1664268061',
    info_url: 'https://www.kirihara.co.jp/product/detail/353093/',
    page_count: 320,
    source: 'kirihara',
  },
};

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
});

function secureUrl(value: string | null | undefined): string | null {
  const url = (value || '').trim();
  if (url.startsWith('http://')) return url.replace(/^http:\/\//i, 'https://');
  return url.startsWith('https://') ? url : null;
}

function parseDate(value: string | undefined): string | null {
  const raw = (value || '').trim();
  if (/^\d{8}$/.test(raw)) return raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8);
  if (/^\d{6}$/.test(raw)) return raw.slice(0, 4) + '-' + raw.slice(4, 6);
  return raw || null;
}

function openBdAuthors(value: string | undefined): string[] {
  return (value || '')
    .split(/[／/、]/)
    .map(author => author.replace(/\s*(?:著|編|監修|訳)\s*$/u, '').trim())
    .filter(Boolean);
}

function mapOpenBdRecord(record: OpenBdRecord | null): Omit<BookResult, 'isbn13' | 'cover_urls'> | null {
  const summary = record?.summary;
  if (!summary?.title) return null;
  const resources = record?.onix?.CollateralDetail?.SupportingResource || [];
  const resourceCover = resources
    .flatMap(resource => [resource.ResourceLink, ...(resource.ResourceVersion || []).map(version => version.ResourceLink)])
    .find((value): value is string => !!value && value.startsWith('http'));
  const description = record?.hanmoto?.kaisetsu105w
    || record?.onix?.CollateralDetail?.TextContent?.find(item => item.TextType === '02' && item.Text)?.Text
    || null;
  const pageExtent = record?.onix?.DescriptiveDetail?.Extent?.find(item => item.ExtentType === '11')?.ExtentValue;
  const parsedPageCount = pageExtent ? Number(pageExtent) : NaN;

  return {
    title: summary.title,
    authors: openBdAuthors(summary.author),
    publisher: summary.publisher || null,
    published_date: parseDate(summary.pubdate),
    description,
    thumbnail_url: secureUrl(summary.cover) || secureUrl(resourceCover),
    info_url: secureUrl(record?.hanmoto?.storelink),
    page_count: Number.isFinite(parsedPageCount) && parsedPageCount > 0 ? parsedPageCount : null,
    source: 'openbd',
  };
}

async function getJson<T>(url: string, timeout = 5000, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const response = await fetch(url, {
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(timeout),
      headers: { Accept: 'application/json', ...headers },
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function getText(url: string, timeout = 5000): Promise<string | null> {
  try {
    const response = await fetch(url, {
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(timeout),
      headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8' },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function mapGoogleVolume(volume: GoogleVolume | undefined, isbn13: string): Omit<BookResult, 'isbn13' | 'cover_urls'> | null {
  const info = volume?.volumeInfo;
  if (!info?.title) return null;
  const identifiers = info.industryIdentifiers || [];
  if (identifiers.length) {
    const matched = identifiers.some(item => normalizeBookIsbn(item.identifier || '') === isbn13);
    if (!matched) return null;
  }
  const images = info.imageLinks;
  const firstImage = images?.extraLarge || images?.large || images?.medium || images?.small
    || images?.thumbnail || images?.smallThumbnail || null;
  return {
    title: [info.title, info.subtitle].filter(Boolean).join('：'),
    authors: info.authors || [],
    publisher: info.publisher || null,
    published_date: info.publishedDate || null,
    description: info.description || null,
    thumbnail_url: secureUrl(firstImage),
    info_url: info.infoLink || null,
    page_count: info.pageCount || null,
    source: 'google-books',
  };
}

function mapOpenLibraryDoc(doc: OpenLibraryDoc | undefined): Omit<BookResult, 'isbn13' | 'cover_urls'> | null {
  if (!doc?.title) return null;
  return {
    title: doc.title,
    authors: doc.author_name || [],
    publisher: doc.publisher?.[0] || null,
    published_date: doc.first_publish_year ? String(doc.first_publish_year) : null,
    description: null,
    thumbnail_url: doc.cover_i ? 'https://covers.openlibrary.org/b/id/' + doc.cover_i + '-L.jpg?default=false' : null,
    info_url: doc.key ? 'https://openlibrary.org' + doc.key : null,
    page_count: doc.number_of_pages_median || null,
    source: 'openlibrary',
  };
}

function mapOpenLibraryEdition(edition: OpenLibraryEdition | null): Omit<BookResult, 'isbn13' | 'cover_urls'> | null {
  if (!edition?.title) return null;
  const coverId = edition.covers?.find(id => id > 0);
  return {
    title: edition.title,
    authors: [],
    publisher: edition.publishers?.[0] || null,
    published_date: edition.publish_date || null,
    description: null,
    thumbnail_url: coverId ? 'https://covers.openlibrary.org/b/id/' + coverId + '-L.jpg?default=false' : null,
    info_url: edition.works?.[0]?.key ? 'https://openlibrary.org' + edition.works[0].key : null,
    page_count: edition.number_of_pages || null,
    source: 'openlibrary',
  };
}

export async function GET(request: Request) {
  const rawIsbn = new URL(request.url).searchParams.get('isbn') || '';
  const isbn13 = normalizeBookIsbn(rawIsbn);
  if (!isbn13) {
    return json({ success: false, message: '有効なISBN-10またはISBN-13を指定してください。' }, 400);
  }
  const isbn10 = toIsbn10(isbn13);
  const isbnTerms = [isbn13, isbn10].filter((value): value is string => !!value);
  const googleQueries = isbnTerms.map(value =>
    getJson<{ items?: GoogleVolume[] }>(
      'https://www.googleapis.com/books/v1/volumes?q=isbn%3A' + encodeURIComponent(value) + '&maxResults=5',
      4500,
    ),
  );
  const openLibraryQueries = isbnTerms.map(value =>
    getJson<{ docs?: OpenLibraryDoc[] }>(
      'https://openlibrary.org/search.json?isbn=' + encodeURIComponent(value)
        + '&fields=title,author_name,publisher,first_publish_year,cover_i,number_of_pages_median,key,isbn&limit=5',
      4500,
      { 'User-Agent': 'CampusSync Student Library' },
    ),
  );
  const openLibraryEditions = isbnTerms.map(value =>
    getJson<OpenLibraryEdition>(
      'https://openlibrary.org/isbn/' + encodeURIComponent(value) + '.json',
      4500,
      { 'User-Agent': 'CampusSync Student Library' },
    ),
  );
  const openBdUrl = 'https://api.openbd.jp/v1/get?isbn=' + encodeURIComponent(isbnTerms.join(','));
  const ndlUrl = 'https://ndlsearch.ndl.go.jp/api/opensearch?isbn=' + encodeURIComponent(isbn13) + '&cnt=5';

  try {
    const [
      openBdPayload,
      googlePayloads,
      openLibraryPayloads,
      openLibraryEditionPayloads,
      ndlXml,
    ] = await Promise.all([
      getJson<OpenBdRecord[]>(openBdUrl, 5000),
      Promise.all(googleQueries),
      Promise.all(openLibraryQueries),
      Promise.all(openLibraryEditions),
      getText(ndlUrl, 6000),
    ]);

    const openBdRecord = (openBdPayload || []).find(record =>
      record?.summary?.title &&
      (!record.summary.isbn || normalizeBookIsbn(record.summary.isbn) === isbn13),
    ) || (openBdPayload || []).find(record => !!record?.summary?.title) || null;
    const openBdBook = mapOpenBdRecord(openBdRecord);

    const googleBooks = googlePayloads
      .flatMap(payload => payload?.items || [])
      .map(item => mapGoogleVolume(item, isbn13))
      .filter((item): item is NonNullable<typeof item> => !!item);
    const googleBook = googleBooks.find(item => !!item.thumbnail_url) || googleBooks[0] || null;

    const openLibraryDocs = openLibraryPayloads.flatMap(payload => payload?.docs || []);
    const openLibraryDoc = openLibraryDocs.find(doc =>
      (doc.isbn || []).some(value => normalizeBookIsbn(value) === isbn13),
    ) || openLibraryDocs[0];
    const openLibraryEdition = openLibraryEditionPayloads
      .map(mapOpenLibraryEdition)
      .find((item): item is NonNullable<typeof item> => !!item);
    const openLibraryBook = mapOpenLibraryDoc(openLibraryDoc)
      || openLibraryBookFromEdition(openLibraryEdition);

    const ndlMetadata = ndlXml ? parseNdlOpenSearch(ndlXml, isbn13, isbn10) : null;
    const ndlBook: Omit<BookResult, 'isbn13' | 'cover_urls'> | null = ndlMetadata ? {
      title: ndlMetadata.title,
      authors: ndlMetadata.authors,
      publisher: ndlMetadata.publisher,
      published_date: ndlMetadata.published_date,
      description: null,
      thumbnail_url: null,
      info_url: ndlMetadata.info_url,
      page_count: null,
      source: 'ndl',
    } : null;

    const publisherFallback = KNOWN_PUBLISHER_BOOKS[isbn13] || null;
    const primary = openBdBook || googleBook || ndlBook || openLibraryBook || publisherFallback;
    if (!primary) {
      return json({
        success: false,
        message: '書誌情報が見つかりませんでした。ISBNをもう一度確認してください。表紙だけ見つかる場合は、タイトルを手入力して登録することもできます。',
      }, 404);
    }

    const coverUrls = buildBookCoverCandidates(isbn13, [
      publisherFallback?.thumbnail_url,
      openBdBook?.thumbnail_url,
      googleBook?.thumbnail_url,
      openLibraryBook?.thumbnail_url,
    ]);
    const book: BookResult = {
      isbn13,
      ...primary,
      thumbnail_url: coverUrls[0] || null,
      cover_urls: coverUrls,
      info_url: primary.info_url || publisherFallback?.info_url || null,
    };
    return json({ success: true, book });
  } catch (error) {
    console.error('ISBN lookup failed:', error instanceof Error ? error.message : 'unknown error');
    return json({ success: false, message: '書誌情報を取得できませんでした。通信状態を確認して再試行してください。' }, 502);
  }
}

function openLibraryBookFromEdition(
  edition: Omit<BookResult, 'isbn13' | 'cover_urls'> | null,
): Omit<BookResult, 'isbn13' | 'cover_urls'> | null {
  return edition;
}
