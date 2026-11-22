import { NextResponse } from 'next/server';
import { normalizeIsbn13 } from '@/lib/pomodoro-timeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type OpenLibraryDoc = {
  title?: string;
  author_name?: string[];
  publisher?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
  key?: string;
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

export async function GET(request: Request) {
  const rawIsbn = new URL(request.url).searchParams.get('isbn') || '';
  const isbn13 = normalizeIsbn13(rawIsbn);
  if (!isbn13) {
    return NextResponse.json({ success: false, message: '有効なISBN-10またはISBN-13を指定してください。' }, { status: 400 });
  }

  try {
    // Try Google Books first for Japanese editions, then fall back to Open Library.
    try {
      const googleResponse = await fetch(
        'https://www.googleapis.com/books/v1/volumes?q=isbn%3A' + encodeURIComponent(isbn13) + '&maxResults=1',
        { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } },
      );
      if (googleResponse.ok) {
        const google = await googleResponse.json() as { items?: GoogleVolume[] };
        const info = google.items?.[0]?.volumeInfo;
        if (info?.title) {
          return NextResponse.json({
            success: true,
            book: {
              isbn13, title: [info.title, info.subtitle].filter(Boolean).join('：'),
              authors: info.authors || [], publisher: info.publisher || null,
              published_date: info.publishedDate || null, description: info.description || null,
              thumbnail_url: (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '').replace(/^http:/, 'https:') || null,
              info_url: info.infoLink || null, page_count: info.pageCount || null, source: 'google-books',
            },
          }, { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } });
        }
      }
    } catch {
      // Continue to Open Library when Google Books is unavailable.
    }

    const openLibraryUrl = 'https://openlibrary.org/search.json?isbn=' + encodeURIComponent(isbn13)
      + '&fields=title,author_name,publisher,first_publish_year,cover_i,number_of_pages_median,key&limit=1';
    const openLibraryResponse = await fetch(openLibraryUrl, {
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json', 'User-Agent': 'CampusSync Student Library (contact: 580098@tokyo.soka.ed.jp)' },
    });
    if (!openLibraryResponse.ok) {
      return NextResponse.json({ success: false, message: '書誌情報提供元に接続できませんでした。タイトルを手入力して登録できます。' }, { status: 502 });
    }

    const result = await openLibraryResponse.json() as { docs?: OpenLibraryDoc[] };
    const doc = result.docs?.[0];
    if (!doc?.title) {
      return NextResponse.json({ success: false, message: 'このISBNの書誌情報が見つかりませんでした。タイトルを手入力して登録できます。' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      book: {
        isbn13, title: doc.title, authors: doc.author_name || [],
        publisher: doc.publisher?.[0] || null,
        published_date: doc.first_publish_year ? String(doc.first_publish_year) : null,
        description: null,
        thumbnail_url: doc.cover_i ? 'https://covers.openlibrary.org/b/id/' + doc.cover_i + '-L.jpg' : null,
        info_url: doc.key ? 'https://openlibrary.org' + doc.key : null,
        page_count: doc.number_of_pages_median || null, source: 'openlibrary',
      },
    }, { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } });
  } catch (error) {
    console.error('ISBN lookup failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, message: '書誌情報を取得できませんでした。タイトルを手入力して登録できます。' }, { status: 502 });
  }
}
