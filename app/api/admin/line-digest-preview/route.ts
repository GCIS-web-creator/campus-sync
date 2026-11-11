import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  try { return Boolean(origin && new URL(origin).origin === new URL(request.url).origin); }
  catch { return false; }
}
function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
}

export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) return fail('Adminログインが必要です。', 401);
  const admin = getAdmin();
  if (!admin) return fail('Supabase設定がありません。', 503);

  const now = new Date();
  const [assignmentsResult, changesResult, recentChangesResult] = await Promise.all([
    admin.from('assignments')
      .select('id,title,details,subject,subject_option,target_class,due_at,priority,is_active,updated_at')
      .eq('is_active', true)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(100),
    admin.from('campussync_schedule_change_events')
      .select('id,entity_type,entity_id,action,title,subject,priority,summary,previous_value,next_value,reason,created_at,digest_sent_at')
      .is('digest_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(50),
    admin.from('campussync_schedule_change_events')
      .select('id,entity_type,entity_id,action,title,subject,priority,summary,previous_value,next_value,reason,created_at,digest_sent_at')
      .not('digest_sent_at', 'is', null)
      .gte('digest_sent_at', new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('digest_sent_at', { ascending: false })
      .limit(30),
  ]);
  if (assignmentsResult.error) return fail('課題一覧を取得できませんでした。', 500);
  if (changesResult.error) return fail('LINE配信待ちの変更を取得できませんでした。', 500);
  if (recentChangesResult.error) return fail('最近配信した変更を取得できませんでした。', 500);

  const assignments = assignmentsResult.data || [];
  const currentAssignments = assignments.filter(row => !row.due_at || new Date(row.due_at).getTime() >= now.getTime());
  const overdueAssignments = assignments.filter(row => Boolean(row.due_at) && new Date(row.due_at as string).getTime() < now.getTime());
  return NextResponse.json({
    success: true,
    generatedAt: now.toISOString(),
    currentAssignments,
    overdueAssignments,
    pendingChanges: changesResult.data || [],
    recentlySentChanges: recentChangesResult.data || [],
    note: 'このプレビューは確認用です。ここからLINEへの即時送信は行いません。変更は次回の定期まとめに含まれます。',
  }, { headers: { 'Cache-Control': 'no-store, private' } });
}
