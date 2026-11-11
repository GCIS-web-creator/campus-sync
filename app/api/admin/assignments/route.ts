import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AssignmentPayload = {
  id?: string;
  title?: string;
  details?: string;
  source?: string;
  type?: string;
  due?: string | null;
  due_at?: string | null;
  is_active?: boolean;
  subject?: string;
  target_class?: 'all' | 'science';
  subject_option?: string;
  priority?: 'normal' | 'important' | 'urgent';
  action?: 'completion' | 'archive' | 'restore';
  student_id?: string;
  completed?: boolean;
};

function isAuthorized(request: Request): boolean {
  if (verifyAdminSessionRequest(request)) return true;
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function unauthorizedOrMisconfigured(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)) {
    return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: 'Adminログインが必要です。' }, { status: 401 });
  }
  return null;
}

function validatePayload(payload: AssignmentPayload): string | null {
  if (!payload.title?.trim()) return '課題名を入力してください。';
  if (payload.title.trim().length > 200) return '課題名は200文字以内にしてください。';
  if ((payload.details || '').length > 5000) return '詳細は5000文字以内にしてください。';
  if (payload.due_at && Number.isNaN(new Date(payload.due_at).getTime())) return '提出期限の日付と時刻が不正です。';
  if (payload.type && !['paper', 'classroom', 'other'].includes(payload.type)) return '課題の種類が不正です。';
  const subject = payload.subject || 'その他';
  if (!['国語演習','古典探求','物理','化学','生物','数３','数C','公共','英コミュ','論表','情報','保健','その他'].includes(subject)) return '教科が不正です。';
  if (payload.target_class && !['all','science'].includes(payload.target_class)) return '課題の対象クラスが不正です。';
  if (payload.priority && !['normal', 'important', 'urgent'].includes(payload.priority)) return '重要度の指定が不正です。';
  const option = payload.subject_option || '';
  const validOptions: Record<string, string[]> = { '物理': ['物理選択者'], '生物': ['生物選択者'], '数３': ['アドバンスト','スタンダード'], '英コミュ': ['Intensive','Standard'] };
  if (option && (!validOptions[subject] || !validOptions[subject].includes(option))) return '選択科目・コースの指定が不正です。';
  if (option && payload.target_class !== 'science') return '選択科目別の課題は理系クラスを対象にしてください。';
  if (payload.target_class === 'science' && validOptions[subject] && !option) return '対象の選択科目・コースを指定してください。';
  return null;
}

export async function GET(request: Request) {
  const authError = unauthorizedOrMisconfigured(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  const { data, error } = await supabase
    .from('assignments')
    .select('id, title, details, source, type, due, due_at, is_active, subject, target_class, subject_option, priority, created_at, updated_at, classroom_course_id, classroom_coursework_id')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ message: `課題の取得に失敗しました: ${error.message}` }, { status: 500 });

  const [completionResult, profileResult] = await Promise.all([
    supabase.from('assignment_completions').select('assignment_id, student_id, completed, updated_at'),
    supabase.from('profiles').select('student_id, student_name, user_class').order('student_id', { ascending: true }),
  ]);
  if (completionResult.error) return NextResponse.json({ message: '課題の提出状況を取得できませんでした。' }, { status: 500 });
  if (profileResult.error) return NextResponse.json({ message: '生徒一覧を取得できませんでした。' }, { status: 500 });

  const profiles = profileResult.data || [];
  const completionByKey = new Map((completionResult.data || []).map(row => [
    String(row.assignment_id) + ':' + String(row.student_id),
    { completed: Boolean(row.completed), updated_at: row.updated_at },
  ]));
  const assignments = (data || []).map(row => {
    const completionDetails = profiles.map(profile => {
      const saved = completionByKey.get(String(row.id) + ':' + String(profile.student_id));
      return {
        student_id: profile.student_id,
        student_name: profile.student_name,
        user_class: profile.user_class,
        completed: saved?.completed || false,
        updated_at: saved?.updated_at || null,
      };
    });
    return {
      ...row,
      priority: row.priority || 'normal',
      completion_total: completionDetails.length,
      completion_completed: completionDetails.filter(item => item.completed).length,
      completion_details: completionDetails,
    };
  });
  return NextResponse.json({ assignments });
}

export async function POST(request: Request) {
  const authError = unauthorizedOrMisconfigured(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  let payload: AssignmentPayload;
  try { payload = await request.json(); } catch { return NextResponse.json({ message: '送信データを読み取れません。' }, { status: 400 }); }
  const validationError = validatePayload(payload);
  if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

  const record = {
    title: payload.title!.trim(),
    details: (payload.details || '').trim(),
    source: payload.source || 'Admin／先生',
    type: payload.type || 'paper',
    subject: payload.subject || 'その他',
    target_class: payload.target_class || 'all',
    subject_option: payload.subject_option || '',
    priority: payload.priority || 'normal',
    due: payload.due_at ? '期限あり' : '期限未設定',
    due_at: payload.due_at || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('assignments').insert(record).select('*').single();
  if (error) return NextResponse.json({ message: `課題の保存に失敗しました: ${error.message}` }, { status: 500 });

  //課題は個別のLINE Flex Messageでは通知せず、定期配信の日次まとめに掲載する。
  return NextResponse.json({
    assignment: data,
    lineNotification: {
      status: 'disabled',
      message: '課題登録時の個別LINE通知は行いません。次回の定期まとめに掲載されます。',
    },
  }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authError = unauthorizedOrMisconfigured(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  let payload: AssignmentPayload;
  try { payload = await request.json(); } catch { return NextResponse.json({ message: '送信データを読み取れません。' }, { status: 400 }); }
  if (!payload.id) return NextResponse.json({ message: '編集対象の課題IDがありません。' }, { status: 400 });

  if (payload.action === 'completion') {
    if (!/^\\d{6}$/.test(payload.student_id || '') || typeof payload.completed !== 'boolean') {
      return NextResponse.json({ message: '提出状況の更新内容が正しくありません。' }, { status: 400 });
    }
    const { error } = await supabase.from('assignment_completions').upsert({
      student_id: payload.student_id,
      assignment_id: payload.id,
      completed: payload.completed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id,assignment_id' });
    if (error) return NextResponse.json({ message: '提出状況を更新できませんでした。' }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (payload.action === 'archive' || payload.action === 'restore') {
    const isActive = payload.action === 'restore';
    const { data, error } = await supabase.from('assignments')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', payload.id)
      .select('*')
      .maybeSingle();
    if (error) return NextResponse.json({ message: '課題の公開状態を変更できませんでした。' }, { status: 500 });
    if (!data) return NextResponse.json({ message: '対象の課題が見つかりません。' }, { status: 404 });
    return NextResponse.json({ assignment: data });
  }

  const validationError = validatePayload(payload);
  if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

  const record = {
    title: payload.title!.trim(),
    details: (payload.details || '').trim(),
    source: payload.source || 'Admin／先生',
    type: payload.type || 'paper',
    subject: payload.subject || 'その他',
    target_class: payload.target_class || 'all',
    subject_option: payload.subject_option || '',
    due: payload.due_at ? '期限あり' : '期限未設定',
    due_at: payload.due_at || null,
    is_active: payload.is_active ?? true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('assignments').update(record).eq('id', payload.id).select('*').maybeSingle();
  if (error) return NextResponse.json({ message: `課題の更新に失敗しました: ${error.message}` }, { status: 500 });
  if (!data) return NextResponse.json({ message: '対象の課題が見つかりません。' }, { status: 404 });
  return NextResponse.json({ assignment: data });
}

export async function DELETE(request: Request) {
  const authError = unauthorizedOrMisconfigured(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  let payload: { id?: string };
  try { payload = await request.json(); } catch { return NextResponse.json({ message: '送信データを読み取れません。' }, { status: 400 }); }
  if (!payload.id) return NextResponse.json({ message: '削除対象の課題IDがありません。' }, { status: 400 });
  const { error } = await supabase.from('assignments').delete().eq('id', payload.id);
  if (error) return NextResponse.json({ message: `課題の削除に失敗しました: ${error.message}` }, { status: 500 });
  return NextResponse.json({ success: true });
}
