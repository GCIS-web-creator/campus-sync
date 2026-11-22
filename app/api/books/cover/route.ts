import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = new Set([
  'thumbnail-s.images.books.or.jp',
  'ndlsearch.ndl.go.jp',
  'covers.openlibrary.org',
  'hondana-image.s3.amazonaws.com',
  'baseec-img-mng.akamaized.net',
  'item-shopping.c.yimg.jp',
  'www.kirihara.co.jp',
  'cover.openbd.jp',
  'image.maruzenjunkudo.co.jp',
]);

function isAllowedHost(hostname: string) {
  return ALLOWED_HOSTS.has(hostname)
    || hostname === 'books.google.com'
    || hostname === 'books.googleusercontent.com'
    || hostname.endsWith('.googleusercontent.com');
}

export async function GET(request: Request) {
  const rawUrl = new URL(request.url).searchParams.get('url') || '';
  if (!rawUrl || rawUrl.length > 2048) {
    return new NextResponse(null, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  let imageUrl: URL;
  try {
    imageUrl = new URL(rawUrl);
  } catch {
    return new NextResponse(null, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  if (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password || !isAllowedHost(imageUrl.hostname)) {
    return new NextResponse(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const response = await fetch(imageUrl.toString(), {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; CampusSyncBookCover/1.0)',
        Referer: imageUrl.origin + '/',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      cache: 'force-cache',
    });
    if (!response.ok || !isAllowedHost(new URL(response.url).hostname)) {
      return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (!allowedTypes.has(contentType) || declaredSize > 5 * 1024 * 1024) {
      return new NextResponse(null, { status: 415, headers: { 'Cache-Control': 'no-store' } });
    }

    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) {
      return new NextResponse(null, { status: 413, headers: { 'Cache-Control': 'no-store' } });
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
