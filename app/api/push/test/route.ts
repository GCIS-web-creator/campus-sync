import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StoredSubscription = {
  endpoint: string;
  subscription: Parameters<typeof webpush.sendNotification>[0];
};

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get('authorization') || '';
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!accessToken) {
      return NextResponse.json({ success: false, message: 'ログインし直してから試してください。' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
    const requestedEndpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
    if (!requestedEndpoint) {
      return NextResponse.json({ success: false, message: 'この端末の通知登録先が指定されていません。' }, { status: 400 });
    }
    let parsedEndpoint: URL;
    try {
      parsedEndpoint = new URL(requestedEndpoint);
    } catch {
      return NextResponse.json({ success: false, message: '通知登録先の形式が正しくありません。' }, { status: 400 });
    }
    if (parsedEndpoint.protocol !== 'https:') {
      return NextResponse.json({ success: false, message: '通知登録先はHTTPSである必要があります。' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json({ success: false, message: 'SupabaseのURL / Publishable Keyがサーバー環境変数にありません。' }, { status: 500 });
    }
    // AuthorizationヘッダーをユーザーJWTに固定し、RLSを保ったまま本人の購読だけ取得する。
    const supabase = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return NextResponse.json({ success: false, message: 'ログインの有効期限が切れています。再ログインしてください。' }, { status: 401 });
    }

    const { data: rows, error: subscriptionError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, subscription')
      .eq('user_id', userData.user.id)
      .eq('endpoint', requestedEndpoint);

    if (subscriptionError) {
      return NextResponse.json({ success: false, message: `通知登録を読み取れません: ${subscriptionError.message}` }, { status: 500 });
    }
    if (!rows?.length) {
      return NextResponse.json({ success: false, message: 'この端末の通知登録が見つかりません。「この端末の通知を有効化」を先に押してください。' }, { status: 404 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: credentialData, error: credentialError } = await admin.rpc('campussync_get_vapid_credentials');
    const credentials = credentialData as { public_key?: string; private_key?: string; subject?: string } | null;
    if (credentialError || !credentials?.public_key || !credentials.private_key || !credentials.subject) {
      return NextResponse.json({ success: false, message: '通知サーバーの鍵設定を読み取れません。' }, { status: 503 });
    }
    webpush.setVapidDetails(credentials.subject, credentials.public_key, credentials.private_key);
    const results = await Promise.allSettled((rows as StoredSubscription[]).map((row) =>
      webpush.sendNotification(row.subscription, JSON.stringify({
        title: 'CampusSync テスト通知',
        body: '通知設定は正常に動作しています。提出期限リマインダーを受け取れます。',
        url: '/',
        tag: `campussync-test-${Date.now()}`,
      }), { TTL: 60, urgency: 'high' })
    ));
    const sent = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.length - sent;

    if (sent === 0) {
      const firstError = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      const statusCode = (firstError?.reason as { statusCode?: number } | undefined)?.statusCode;
      const reason = firstError?.reason;
      const reasonText = reason instanceof Error ? reason.message : String(reason ?? '不明なエラー');
      return NextResponse.json({
        success: false,
        message: statusCode === 404 || statusCode === 410
          ? 'ブラウザーの通知登録が失効しています。「この端末の通知を有効化」をやり直してください。'
          : `通知を送れませんでした: ${reasonText}`,
      }, { status: 502 });
    }

    return NextResponse.json({ success: true, sent, failed, message: 'テスト通知を送信しました。' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('CampusSync push test failed:', message);
    return NextResponse.json({ success: false, message: `テスト通知でエラーが発生しました: ${message}` }, { status: 500 });
  }
}
