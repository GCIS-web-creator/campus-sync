import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getLineBotEnvironmentStatus } from '@/lib/line-bot-rotation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function validate(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !getAdmin()) {
    return NextResponse.json({
      success: false,
      message: 'CAMPUS_SYNC_ADMIN_PASSWORDまたはSupabaseのサーバー設定が不足しています。',
    }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ success: false, message: 'Admin用パスワードが正しくありません。' }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = validate(request);
  if (denied) return denied;
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ success: false, message: 'Supabaseの設定が不足しています。' }, { status: 503 });

  const [rotationResult, eventResult, historyResult] = await Promise.all([
    admin.from('line_bot_rotation')
      .select('active_bot_slot,next_switch_at,last_switched_at,rotation_hold_until,updated_at')
      .eq('id', 1)
      .maybeSingle(),
    admin.from('line_bot_rotation_events')
      .select('id,previous_bot_slot,new_bot_slot,effective_date,created_at')
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('line_bot_rotation_events')
      .select('id,previous_bot_slot,new_bot_slot,effective_date,created_at,acknowledged_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (rotationResult.error || !rotationResult.data) {
    console.error('LINE BOTローテーション設定を取得できません:', rotationResult.error?.message);
    return NextResponse.json({
      success: false,
      message: 'LINE BOTローテーション用SQLがまだ実行されていません。supabase/line-bot-rotation.sql を実行してください。',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (historyResult.error) {
    console.error('LINE BOT切替履歴を取得できません:', historyResult.error.message);
    return NextResponse.json({ success: false, message: 'LINE BOT切替履歴を取得できません。SQL設定を確認してください。' }, { status: 500 });
  }
  if (eventResult.error) {
    console.error('LINE BOT切替通知を取得できません:', eventResult.error.message);
    return NextResponse.json({ success: false, message: 'LINE BOT切替通知を取得できません。SQL設定を確認してください。' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    rotation: rotationResult.data,
    pendingEvent: eventResult.data || null,
    history: historyResult.data || [],
    environment: getLineBotEnvironmentStatus(),
    notice: 'Channel Secretとアクセストークンの値はセキュリティのため返却しません。',
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const denied = validate(request);
  if (denied) return denied;
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ success: false, message: 'Supabaseの設定が不足しています。' }, { status: 503 });

  const payload = await request.json().catch(() => null) as { action?: unknown; eventId?: unknown } | null;
  if (payload?.action !== 'acknowledge') {
    return NextResponse.json({ success: false, message: '操作内容が正しくありません。' }, { status: 400 });
  }
  const eventId = Number(payload.eventId);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ success: false, message: '切替通知IDが正しくありません。' }, { status: 400 });
  }

  const { data, error } = await admin.from('line_bot_rotation_events')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', eventId)
    .is('acknowledged_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('LINE BOT切替通知の確認保存に失敗:', error.message);
    return NextResponse.json({ success: false, message: '確認状態を保存できませんでした。' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ success: false, message: 'この通知はすでに確認済みか、存在しません。' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    message: 'LINE BOT切替作業を確認済みにしました。',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
