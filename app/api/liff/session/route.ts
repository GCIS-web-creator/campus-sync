import { NextResponse } from 'next/server';
import {
  createLineLiffSessionCookieValue,
  isLineLiffSessionConfigured,
  LINE_LIFF_SESSION_COOKIE,
  verifyLineLiffIdToken,
} from '@/lib/line-liff-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return response({ success: false, message: '不正なリクエストです。' }, 403);
    }
    if (!isLineLiffSessionConfigured()) {
      return response({ success: false, message: 'LIFFのサーバー設定がまだ完了していません。' }, 503);
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 16000) return response({ success: false, message: 'リクエストが大きすぎます。' }, 413);

    const body = await request.json().catch(() => null) as { idToken?: unknown } | null;
    const idToken = typeof body?.idToken === 'string' ? body.idToken.trim() : '';
    if (!idToken) return response({ success: false, message: 'LINE認証情報を受け取れませんでした。' }, 400);

    const identity = await verifyLineLiffIdToken(idToken);
    if (!identity) return response({ success: false, message: 'LINE認証を確認できませんでした。LIFFを開き直してください。' }, 401);

    const session = createLineLiffSessionCookieValue(identity.lineUserId, identity.tokenExpiresAt);
    if (!session) return response({ success: false, message: 'LIFFセッションを作成できませんでした。' }, 503);

    const result = response({ success: true });
    result.cookies.set({
      name: LINE_LIFF_SESSION_COOKIE,
      value: session.value,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/liff',
      maxAge: session.maxAge,
    });
    return result;
  } catch (error) {
    console.error('LINE LIFF session creation failed:', error instanceof Error ? error.message : 'unknown');
    return response({ success: false, message: 'LINE認証の処理に失敗しました。' }, 500);
  }
}

export async function DELETE() {
  const result = response({ success: true });
  result.cookies.set({
    name: LINE_LIFF_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/liff',
    maxAge: 0,
  });
  return result;
}
