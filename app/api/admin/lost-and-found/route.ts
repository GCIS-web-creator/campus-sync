import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LostFoundRow = {
  id: string | number;
  title: string;
  location: string;
  description?: string | null;
  finder?: string | null;
  student_id?: string | null;
  status: 'pending' | 'approved' | 'returned';
  contribution_awarded_at?: string | null;
};

function isAuthorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function configError() {
  return NextResponse.json({
    success: false,
    message: 'CAMPUS_SYNC_ADMIN_PASSWORD、NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEYをVercelの環境変数に設定してください。',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}

function authError(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: '管理用パスワードが正しくありません。' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return null;
}

function formatDate(value?: string | null) {
  if (!value) return '日時不明';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function getTokyoDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}


export async function GET(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return configError();
  const denied = authError(request);
  if (denied) return denied;
  const admin = getAdminClient();
  if (!admin) return configError();

  const { data, error } = await admin.from('lost_and_found').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('落とし物管理一覧の読み込みに失敗:', error.message);
    return NextResponse.json({ success: false, message: 'lost_and_foundテーブルを読み込めません。先にsupabase/lost-found-line-flex-hourly.sqlを実行してください。' }, { status: 500 });
  }

  const rows = (data || []) as Array<LostFoundRow & { created_at?: string }>;
  const studentIds = Array.from(new Set(rows.map(row => String(row.student_id || '')).filter(id => /^\d{6}$/.test(id))));
  const reporterById = new Map<string, string>();
  if (studentIds.length) {
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('student_id,student_name,user_class')
      .in('student_id', studentIds);
    if (profilesError) {
      console.error('落とし物報告者プロフィールの取得に失敗:', profilesError.message);
    } else {
      for (const profile of profiles || []) {
        const name = String(profile.student_name || '').trim();
        const schoolClass = String(profile.user_class || '').trim();
        reporterById.set(String(profile.student_id), [schoolClass, name].filter(Boolean).join(' ') || ('学籍番号 ' + profile.student_id));
      }
    }
  }
  const items = rows.map(row => ({
    ...row,
    reporter: reporterById.get(String(row.student_id || '')) || (row.student_id ? '学籍番号 ' + row.student_id : '事務室で直接回収'),
    date: formatDate(row.created_at),
  }));
  return NextResponse.json({ success: true, items }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return configError();
  const denied = authError(request);
  if (denied) return denied;
  const admin = getAdminClient();
  if (!admin) return configError();

  const body = await request.json().catch(() => null) as { id?: string | number; action?: string } | null;
  if ((typeof body?.id !== 'string' && typeof body?.id !== 'number') || !['approve', 'return'].includes(String(body?.action))) {
    return NextResponse.json({ success: false, message: '対象IDまたは操作が不正です。' }, { status: 400 });
  }

  const { data: existing, error: loadError } = await admin
    .from('lost_and_found')
    .select('*')
    .eq('id', body.id)
    .maybeSingle();
  if (loadError) {
    console.error('落とし物レコードの読込に失敗:', loadError.message);
    return NextResponse.json({ success: false, message: '落とし物データを読み込めませんでした。' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ success: false, message: '対象の落とし物が見つかりません。' }, { status: 404 });

  const row = existing as LostFoundRow;
  let updated = row;
  if (body.action === 'approve') {
    if (row.status === 'pending') {
      const { data, error } = await admin.from('lost_and_found')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', body.id).eq('status', 'pending').select('*').maybeSingle();
      if (error || !data) {
        return NextResponse.json({ success: false, message: error?.message || '状態が更新されました。一覧を再読み込みしてください。' }, { status: 409 });
      }
      updated = data as LostFoundRow;
    } else if (row.status !== 'approved') {
      return NextResponse.json({ success: false, message: '返却済みの落とし物は再公開できません。' }, { status: 409 });
    }

    let contributionAwarded = Boolean(updated.contribution_awarded_at);
    let contributionMessage = '';
    const studentId = String(updated.student_id || '').trim();
    if (!contributionAwarded && /^\d{6}$/.test(studentId)) {
      const { data: current, error: scoreReadError } = await admin
        .from('contribution_scores').select('*').eq('student_id', studentId).maybeSingle();
      if (scoreReadError) {
        console.error('落とし物承認時の貢献度取得に失敗:', scoreReadError.message);
        contributionMessage = '公開しましたが貢献度を読み込めませんでした。';
      } else {
        const todayScoreDate = getTokyoDateKey();
        const todayStart = new Date(`${todayScoreDate}T00:00:00+09:00`).toISOString();
        const todayEnd = new Date(new Date(todayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();
        let scoreBefore = current?.score_date === todayScoreDate ? Number(current.score) || 0 : 0;
        if (current?.score_date !== todayScoreDate) {
          const { data: todaysHistory, error: todaysHistoryError } = await admin
            .from('contribution_history')
            .select('delta')
            .eq('student_id', studentId)
            .gte('created_at', todayStart)
            .lt('created_at', todayEnd);
          if (!todaysHistoryError) {
            scoreBefore = Math.min(100, Math.max(0,
              (todaysHistory ?? []).reduce((sum, item) => sum + (Number(item.delta) || 0), 0)
            ));
          } else {
            console.error('落とし物承認時に本日の貢献度履歴を取得できません:', todaysHistoryError.message);
          }
        }
        const scoreAfter = Math.min(100, Math.max(0, scoreBefore + 12));
        const awardedAt = new Date().toISOString();
        let { error: scoreError } = await admin.from('contribution_scores').upsert({
          student_id: studentId, score: scoreAfter, score_date: todayScoreDate, updated_at: awardedAt,
        }, { onConflict: 'student_id' });
        if (scoreError) {
          const legacySave = await admin.from('contribution_scores').upsert({
            student_id: studentId, score: scoreAfter, updated_at: awardedAt,
          }, { onConflict: 'student_id' });
          scoreError = legacySave.error;
        }
        if (scoreError) {
          console.error('落とし物承認時の貢献度保存に失敗:', scoreError.message);
          contributionMessage = '公開しましたが貢献度を保存できませんでした。';
        } else {
          const { error: markerError } = await admin.from('lost_and_found')
            .update({ contribution_awarded_at: awardedAt }).eq('id', body.id);
          if (markerError) {
            console.error('落とし物貢献度の重複防止マーカー保存に失敗:', markerError.message);
            contributionMessage = '公開・加算は完了しましたが、重複防止記録の保存に失敗しました。';
          } else {
            contributionAwarded = true;
          }
          const { error: historyError } = await admin.from('contribution_history').insert({
            student_id: studentId, delta: scoreAfter - scoreBefore,
            reason: '落とし物報告が事務室で承認されました', score_after: scoreAfter,
          });
          if (historyError) console.error('落とし物承認の貢献度履歴保存に失敗:', historyError.message);
        }
      }
    } else if (!contributionAwarded) {
      contributionMessage = '投稿者の学籍番号が記録されていないため、貢献度は加算していません。';
    }
    return NextResponse.json({
      success: true, item: updated, contributionAwarded,
      message: '実物確認済みとして全体公開しました。' + (contributionMessage || (contributionAwarded ? '投稿者に貢献度を加算しました。' : '')),
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (row.status !== 'approved') {
    return NextResponse.json({ success: false, message: '公開中の落とし物のみ返却完了にできます。' }, { status: 409 });
  }
  const { data, error } = await admin.from('lost_and_found')
    .update({ status: 'returned', returned_at: new Date().toISOString() })
    .eq('id', body.id).eq('status', 'approved').select('*').maybeSingle();
  if (error || !data) {
    return NextResponse.json({ success: false, message: error?.message || '状態が更新されました。再読み込みしてください。' }, { status: 409 });
  }
  return NextResponse.json({
    success: true, item: data,
    message: '返却完了に変更しました。生徒用の公開一覧からも非表示になります。',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
