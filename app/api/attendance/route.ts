import { NextResponse } from 'next/server';
import { getStudyStudentContext } from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, private' };
const fail = (message: string, status = 400) => NextResponse.json({ success: false, message }, { status, headers: noStore });
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
function dateInRange(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00+09:00');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  today.setHours(0,0,0,0);
  const target = new Date(date);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  return diff >= -7 && diff <= 30;
}
export async function GET(request: Request) {
  try {
    const context = await getStudyStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。', 401);
    const { data, error } = await context.admin.from('attendance_reports')
      .select('id,report_type,report_date,expected_time,note,status,created_at,updated_at')
      .eq('student_id', context.studentId).order('report_date', { ascending: false }).limit(60);
    if (error) throw error;
    return NextResponse.json({ success: true, reports: data || [] }, { headers: noStore });
  } catch (error) {
    console.error('Attendance student list failed:', error);
    return fail('出欠連絡の履歴を取得できませんでした。', 500);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('不正な送信です。', 403);
  try {
    const context = await getStudyStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。', 401);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return fail('入力内容を読み取れません。');
    const reportType = body.report_type;
    if (!['absence','late','early_leave'].includes(String(reportType))) return fail('連絡区分を選択してください。');
    if (!dateInRange(body.report_date)) return fail('日付は今日の前後7日〜30日の範囲で指定してください。');
    const expectedTime = typeof body.expected_time === 'string' ? body.expected_time : '';
    if (reportType !== 'absence' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(expectedTime)) return fail('予定時刻を入力してください。');
    if (reportType === 'absence' && expectedTime) return fail('欠席連絡に時刻は指定できません。');
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 300) return fail('連絡事項は300文字以内にしてください。');
    const { data: existing, error: existingError } = await context.admin.from('attendance_reports')
      .select('id').eq('student_id', context.studentId).eq('report_date', body.report_date).neq('status','canceled').maybeSingle();
    if (existingError) throw existingError;
    if (existing) return fail('この日付の連絡はすでに登録されています。履歴を確認してください。', 409);
    const { data, error } = await context.admin.from('attendance_reports').insert({
      student_id: context.studentId,
      student_name: context.studentName || context.studentId,
      user_class: context.userClass,
      report_type: reportType,
      report_date: body.report_date,
      expected_time: expectedTime || null,
      note,
    }).select('id,report_type,report_date,expected_time,note,status,created_at,updated_at').single();
    if (error) throw error;
    return NextResponse.json({ success: true, report: data }, { status: 201, headers: noStore });
  } catch (error) {
    console.error('Attendance report create failed:', error);
    return fail('出欠連絡を登録できませんでした。', 500);
  }
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return fail('不正な操作です。', 403);
  try {
    const context = await getStudyStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。', 401);
    const body = await request.json().catch(() => null) as { id?: unknown; action?: unknown } | null;
    if (typeof body?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id) || body.action !== 'cancel') return fail('操作内容が正しくありません。');
    const { data, error } = await context.admin.from('attendance_reports')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('id', body.id).eq('student_id', context.studentId).in('status',['received','reviewing'])
      .select('id').maybeSingle();
    if (error) throw error;
    if (!data) return fail('受付後の連絡は取り消せません。学校窓口へ連絡してください。', 409);
    return NextResponse.json({ success: true }, { headers: noStore });
  } catch (error) {
    console.error('Attendance report cancel failed:', error);
    return fail('連絡を取り消せませんでした。', 500);
  }
}
