import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const preferenceKeys = [
  'receive_general_notifications',
  'receive_train_timetable',
  'receive_class_timetable',
  'receive_school_schedule',
  'receive_cafeteria_sold_out',
  'receive_assignment_updates',
  'receive_quick_notices',
] as const;

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
    return NextResponse.json({ success: false, message: 'CAMPUS_SYNC_ADMIN_PASSWORDまたはSupabaseのサーバー設定が不足しています。' }, { status: 503 });
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

  const [groupsResult, logsResult] = await Promise.all([
    admin.from('line_group_chats')
      .select('chat_id,chat_type,active,receive_general_notifications,receive_train_timetable,receive_class_timetable,receive_school_schedule,receive_cafeteria_sold_out,receive_assignment_updates,receive_quick_notices,last_seen_at')
      .order('last_seen_at', { ascending: false }),
    admin.from('line_group_delivery_logs')
      .select('delivery_batch_id,kind,chat_id,chat_type,status,http_status,error_message,sent_at')
      .order('sent_at', { ascending: false })
      .limit(500),
  ]);

  if (groupsResult.error) {
    return NextResponse.json({ success: false, message: 'グループ一覧を取得できません。line-group-broadcast.sqlを実行してください。' }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    groups: groupsResult.data || [],
    logs: logsResult.error ? [] : (logsResult.data || []),
    notice: logsResult.error ? 'グループ設定は取得できました。配信記録を有効にするには追加SQLを実行してください。' : '',
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const denied = validate(request);
  if (denied) return denied;
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ success: false, message: 'Supabaseの設定が不足しています。' }, { status: 503 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const chatId = typeof body?.chatId === 'string' ? body.chatId : '';
  if (!chatId || chatId.length > 200) {
    return NextResponse.json({ success: false, message: 'グループIDが正しくありません。' }, { status: 400 });
  }
  const updates: Record<string, boolean> = {};
  if (typeof body?.active === 'boolean') updates.active = body.active;
  for (const key of preferenceKeys) {
    if (typeof body?.[key] === 'boolean') updates[key] = body[key] as boolean;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, message: '変更する設定がありません。' }, { status: 400 });
  }

  const { data, error } = await admin.from('line_group_chats')
    .update(updates)
    .eq('chat_id', chatId)
    .select('chat_id')
    .maybeSingle();
  if (error) {
    console.error('LINEグループ設定の保存に失敗:', error.message);
    return NextResponse.json({ success: false, message: '設定を保存できませんでした。' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ success: false, message: '対象グループが見つかりません。' }, { status: 404 });
  return NextResponse.json({ success: true, message: 'グループ設定を保存しました。' }, { headers: { 'Cache-Control': 'no-store' } });
}
