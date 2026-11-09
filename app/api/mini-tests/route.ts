import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUBJECTS = ['国語演習', '古典探求', '物理', '生物', '数３', '数C', '公共', '英コミュ', '論表', '情報', '保健', 'その他'] as const;
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
}
function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  return { url, serviceKey, publicKey };
}
function getAdmin() {
  const { url, serviceKey } = getConfig();
  return url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
}
async function getUser(request: Request) {
  const { url, publicKey } = getConfig();
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!url || !publicKey || !token) return null;
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return fail('ログインが必要です。', 401);
  const admin = getAdmin();
  if (!admin) return fail('Supabaseサーバー設定が不足しています。', 503);
  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  if (!validDate(from) || !validDate(to) || from > to || to > from.slice(0, 4) + '-12-31' || (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) > 45 * 86400000) {
    return fail('取得期間を確認してください（最大46日間）。', 400);
  }
  const [school, personal] = await Promise.all([
    admin.from('mini_test_events').select('id,subject,title,test_date,scope,notes,audience,status,source,target_class')
      .eq('audience', 'school').eq('status', 'published').gte('test_date', from).lte('test_date', to).order('test_date'),
    admin.from('mini_test_events').select('id,subject,title,test_date,scope,notes,audience,status,source,target_class')
      .eq('created_by', user.id).eq('audience', 'personal').eq('status', 'published').gte('test_date', from).lte('test_date', to).order('test_date'),
  ]);
  if (school.error || personal.error) return fail('小テスト予定を取得できませんでした。', 500);
  return NextResponse.json({ success: true, events: [...(school.data || []), ...(personal.data || [])] }, { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return fail('ログインが必要です。', 401);
  const admin = getAdmin();
  if (!admin) return fail('Supabaseサーバー設定が不足しています。', 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return fail('入力内容を読み取れません。', 400);
  const subject = String(body.subject || '').trim();
  const title = String(body.title || '').trim();
  const testDate = body.test_date;
  const scope = String(body.scope || '').trim();
  const notes = String(body.notes || '').trim();
  if (!SUBJECTS.includes(subject as typeof SUBJECTS[number])) return fail('教科を選択してください。', 400);
  if (!title || title.length > 160) return fail('テスト名は1〜160文字で入力してください。', 400);
  if (!validDate(testDate)) return fail('実施日を正しく入力してください。', 400);
  if (scope.length > 1200 || notes.length > 1200) return fail('範囲・備考はそれぞれ1200文字以内にしてください。', 400);
  const { data, error } = await admin.from('mini_test_events').insert({
    subject, title, test_date: testDate, scope, notes, audience: 'personal', status: 'published', source: 'web', created_by: user.id,
  }).select('id,subject,title,test_date,scope,notes,audience,status,source,target_class').single();
  if (error) {
    console.error('Mini-test personal event insert failed:', error.message);
    return fail('小テスト予定を保存できませんでした。', 500);
  }
  return NextResponse.json({ success: true, event: data }, { status: 201, headers: { 'Cache-Control': 'no-store, private' } });
}
