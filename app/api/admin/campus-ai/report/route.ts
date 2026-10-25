import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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

export async function POST(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD) {
    return NextResponse.json(
      { message: 'CAMPUS_SYNC_ADMIN_PASSWORD が設定されていません。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!authorized(request)) {
    return NextResponse.json(
      { message: '管理用パスワードを確認してください。' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { message: 'Supabaseのサーバー環境変数が不足しています。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [assignmentRes, lineRes, bookRes, lostRes, careerRes, noticeRes] =
    await Promise.all([
      supabase.from('assignments')
        .select('id, title, due_at, is_active')
        .eq('is_active', true)
        .order('due_at', { ascending: true })
        .limit(500),

      supabase.from('line_broadcast_history')
        .select('title, status, sent_at')
        .order('sent_at', { ascending: false })
        .limit(5),

      supabase.from('library_books')
        .select('id, status')
        .limit(2000),

      supabase.from('lost_and_found')
        .select('id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(1000),

      supabase.from('study_room_status')
        .select('room_name, occupied_seats, total_seats, updated_at')
        .eq('room_key', 'career_center')
        .maybeSingle(),

      supabase.from('cafeteria_announcements')
        .select('message, show_banner, show_popup, updated_at')
        .eq('id', 1)
        .maybeSingle(),
    ]);

  const warnings: string[] = [];
  if (assignmentRes.error) warnings.push('課題データを取得できませんでした。');
  if (lineRes.error) warnings.push('LINE配信履歴を取得できませんでした。');
  if (bookRes.error) warnings.push('蔵書データを取得できませんでした。');
  if (lostRes.error) warnings.push('落とし物データを取得できませんでした。');
  if (careerRes.error) warnings.push('キャリアセンター情報を取得できませんでした。');
  if (noticeRes.error) warnings.push('学食のお知らせ設定を取得できませんでした。');

  const assignments = assignmentRes.data ?? [];
  const now = Date.now();
  const weekLater = now + 7 * 24 * 60 * 60 * 1000;
  const datedAssignments = assignments.filter(row =>
    row.due_at && Number.isFinite(Date.parse(row.due_at))
  );

  const overdue = datedAssignments.filter(row => Date.parse(row.due_at!) < now);
  const upcoming = datedAssignments.filter(row => {
    const due = Date.parse(row.due_at!);
    return due >= now && due <= weekLater;
  });
  const noDeadline = assignments.filter(row => !row.due_at);

  const books = bookRes.data ?? [];
  const bookStatuses: Record<string, number> = {};
  for (const book of books) {
    const status = String(book.status || '状態未設定');
    bookStatuses[status] = (bookStatuses[status] || 0) + 1;
  }

  const lost = lostRes.data ?? [];
  const lostStatuses: Record<string, number> = {};
  for (const item of lost) {
    const status = String(item.status || '状態未設定');
    lostStatuses[status] = (lostStatuses[status] || 0) + 1;
  }

  const career = careerRes.data;
  const lineHistory = lineRes.data ?? [];
  const notice = noticeRes.data;

  const sections = [
    '【課題管理】',
    `有効な課題：${assignmentRes.error ? '取得失敗' : assignments.length + '件'}`,
    `期限切れ：${assignmentRes.error ? '取得失敗' : overdue.length + '件'}`,
    `今後7日以内が期限：${assignmentRes.error ? '取得失敗' : upcoming.length + '件'}`,
    `期限未設定：${assignmentRes.error ? '取得失敗' : noDeadline.length + '件'}`,
    ...(!assignmentRes.error && overdue.length
      ? ['期限切れ課題：' + overdue.slice(0, 10).map(row =>
          `${row.title}（${new Date(row.due_at!).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}）`
        ).join('、')]
      : []),

    '',
    '【LINE配信履歴】',
    ...(lineRes.error
      ? ['履歴を取得できませんでした。']
      : lineHistory.length
        ? lineHistory.map(row =>
            `${row.title}／状態：${row.status || '不明'}／日時：${row.sent_at ? new Date(row.sent_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '不明'}`
          )
        : ['配信履歴はありません。']),

    '',
    '【蔵書】',
    bookRes.error
      ? '取得失敗'
      : `登録：${books.length}件。状態別：${Object.entries(bookStatuses).map(([key, count]) => `${key} ${count}件`).join('、') || 'データなし'}`,

    '',
    '【落とし物】',
    lostRes.error
      ? '取得失敗'
      : `登録：${lost.length}件。状態別：${Object.entries(lostStatuses).map(([key, count]) => `${key} ${count}件`).join('、') || 'データなし'}`,

    '',
    '【キャリアセンター自習室】',
    careerRes.error
      ? '取得失敗'
      : career
        ? `${career.room_name || '自習室'}：${career.occupied_seats ?? '不明'}席使用中／${career.total_seats ?? '不明'}席。最終更新：${career.updated_at ? new Date(career.updated_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '不明'}`
        : 'まだ情報が登録されていません。',

    '',
    '【学食のお知らせ】',
    noticeRes.error
      ? '取得失敗'
      : notice
        ? `バナー掲載：${notice.show_banner ? 'ON' : 'OFF'}／ポップアップ：${notice.show_popup ? 'ON' : 'OFF'}／本文：${notice.message || '未設定'}`
        : '設定が登録されていません。',
  ];

  return NextResponse.json({
    success: true,
    generatedAt: new Date().toISOString(),
    answer: sections.join('\n'),
    warnings,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
