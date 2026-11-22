import { NextResponse } from 'next/server';
import { normalizeIsbn13 } from '@/lib/pomodoro-timeline';

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
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
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
};

type BookResult = {
  isbn13: string;
  title: string;
  authors: string[];
  publisher: string | null;
  published_date: string | null;
  description: string | null;
  thumbnail_url: string | null;
  info_url: string | null;
  page_count: number | null;
  source: 'openbd' | 'google-books' | 'openlibrary' | 'kirihara';
};

const KNOWN_PUBLISHER_BOOKS: Record<string, Omit<BookResult, 'isbn13'>> = {
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

function parseOpenBdDate(value: string | undefined): string | null {
  const raw = (value || '').trim();
  if (/^\d{8}$/.test(raw)) return raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8);
  if (/^\d{6}$/.test(raw)) return raw.slice(0, 4) + '-' + raw.slice(4, 6);
  if (/^\d{4}$/.test(raw)) return raw;
  return null;
}

function openBdAuthors(value: string | undefined): string[] {
  return (value || '')
    .split(/[／/、]/)
    .map(author => author.replace(/\s*(?:著|編|監修|訳)\s*$/u, '').trim())
    .filter(Boolean);
}

function mapOpenBdRecord(record: OpenBdRecord | null): Omit<BookResult, 'isbn13'> | null {
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
    published_date: parseOpenBdDate(summary.pubdate),
    description,
    thumbnail_url: secureUrl(summary.cover) || secureUrl(resourceCover),
    info_url: secureUrl(record?.hanmoto?.storelink),
    page_count: Number.isFinite(parsedPageCount) && parsedPageCount > 0 ? parsedPageCount : null,
    source: 'openbd',
  };
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const response = await fetch(url, {
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(7000),
      headers: { Accept: 'application/json', ...headers },
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const rawIsbn = new URL(request.url).searchParams.get('isbn') || '';
  const isbn13 = normalizeIsbn13(rawIsbn);
  if (!isbn13) {
    return json({ success: false, message: '有効なISBN-10またはISBN-13を指定してください。' }, 400);
  }

  try {
    const [openBdPayload, googlePayload, openLibraryPayload] = await Promise.all([
      getJson<OpenBdRecord[]>(
        'https://api.openbd.jp/v1/get?isbn=' + encodeURIComponent(isbn13),
      ),
      getJson<{ items?: GoogleVolume[] }>(
        'https://www.googleapis.com/books/v1/volumes?q=isbn%3A' + encodeURIComponent(isbn13) + '&maxResults=1',
      ),
      getJson<{ docs?: OpenLibraryDoc[] }>(
        'https://openlibrary.org/search.json?isbn=' + encodeURIComponent(isbn13)
          + '&fields=title,author_name,publisher,first_publish_year,cover_i,number_of_pages_median,key&limit=1',
        { 'User-Agent': 'CampusSync Student Library' },
      ),
    ]);

    const openBdBook = mapOpenBdRecord(openBdPayload?.[0] || null);
    const googleInfo = googlePayload?.items?.[0]?.volumeInfo;
    const googleBook: Omit<BookResult, 'isbn13'> | null = googleInfo?.title ? {
      title: [googleInfo.title, googleInfo.subtitle].filter(Boolean).join('：'),
      authors: googleInfo.authors || [],
      publisher: googleInfo.publisher || null,
      published_date: googleInfo.publishedDate || null,
      description: googleInfo.description || null,
      thumbnail_url: secureUrl(googleInfo.imageLinks?.thumbnail || googleInfo.imageLinks?.smallThumbnail),
      info_url: secureUrl(googleInfo.infoLink) || null,
      page_count: googleInfo.pageCount || null,
      source: 'google-books',
    } : null;

    const openLibraryDoc = openLibraryPayload?.docs?.[0];
    const openLibraryBook: Omit<BookResult, 'isbn13'> | null = openLibraryDoc?.title ? {
      title: openLibraryDoc.title,
      authors: openLibraryDoc.author_name || [],
      publisher: openLibraryDoc.publisher?.[0] || null,
      published_date: openLibraryDoc.first_publish_year ? String(openLibraryDoc.first_publish_year) : null,
      description: null,
      thumbnail_url: openLibraryDoc.cover_i ? 'https://covers.openlibrary.org/b/id/' + openLibraryDoc.cover_i + '-L.jpg' : null,
      info_url: openLibraryDoc.key ? 'https://openlibrary.org' + openLibraryDoc.key : null,
      page_count: openLibraryDoc.number_of_pages_median || null,
      source: 'openlibrary',
    } : null;

    const publisherFallback = KNOWN_PUBLISHER_BOOKS[isbn13] || null;
    const primary = openBdBook || googleBook || openLibraryBook || publisherFallback;
    if (!primary) {
      return json({
        success: false,
        message: 'このISBNの書誌情報が見つかりませんでした。バーコードの978 / 979から始まる番号か確認してください。タイトルを手入力して登録することもできます。',
      }, 404);
    }

    const book: BookResult = {
      isbn13,
      ...primary,
      thumbnail_url: secureUrl(publisherFallback?.thumbnail_url)
        || secureUrl(openBdBook?.thumbnail_url)
        || secureUrl(googleBook?.thumbnail_url)
        || secureUrl(openLibraryBook?.thumbnail_url)
        || null,
      info_url: primary.info_url || publisherFallback?.info_url || null,
    };

    return json({ success: true, book });
  } catch (error) {
    console.error('ISBN lookup failed:', error instanceof Error ? error.message : 'unknown error');
    return json({ success: false, message: '書誌情報を取得できませんでした。通信状態を確認して再試行してください。' }, 502);
  }
}
