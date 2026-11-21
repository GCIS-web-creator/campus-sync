import { createClient, type User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { validateContributionSubmission } from '@/lib/campus-contribution-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCHOOL_EMAIL = /^[0-9]{6}@tokyo\.soka\.ed\.jp$/i;

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store, max-age=0', Vary: 'Authorization' },
});

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('貢献申請のサーバー設定が不足しています。');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getAuthenticatedStudent(request: NextRequest): Promise<User | null> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Supabaseの公開設定がありません。');
  }
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  const token = match?.[1]?.trim();
  if (!token) return null;

  const response = await fetch(SUPABASE_URL.replace(/\/+$/, '') + '/auth/v1/user', {
    method: 'GET',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: 'Bearer ' + token,
    },
    cache: 'no-store',
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) return null;

  const email = String(user.email || '').trim().toLowerCase();
  if (!SCHOOL_EMAIL.test(email)) return null;
  return user as User;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedStudent(request);
    if (!user) return json({ success: false, message: '学校アカウントでログインしてください。' }, 401);

    const admin = getAdminClient();
    const { data: submissions, error } = await admin.from('campus_contribution_submissions')
      .select('id,activity_title,activity_date,description,status,xp_amount,review_reason,reviewer_label,reviewed_at,created_at,updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const ids = (submissions || []).map((row) => row.id);
    let events: unknown[] = [];
    if (ids.length) {
      const { data, error: eventError } = await admin.from('campus_contribution_review_events')
        .select('id,submission_id,event_type,from_status,to_status,xp_amount,reason,actor_label,created_at')
        .eq('user_id', user.id)
        .in('submission_id', ids)
        .order('created_at', { ascending: true });
      if (eventError) throw eventError;
      events = data || [];
    }

    return json({ success: true, submissions: submissions || [], events });
  } catch (error) {
    console.error('[contributions] GET failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, message: '貢献申請を読み込めませんでした。' }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedStudent(request);
    if (!user) return json({ success: false, message: '学校アカウントでログインしてください。' }, 401);

    const body = await request.json().catch(() => null);
    const validated = validateContributionSubmission(body);
    if (validated.error || !validated.value) {
      return json({ success: false, message: validated.error || '申請内容を確認してください。' }, 400);
    }

    const admin = getAdminClient();
    const { data, error } = await admin.rpc('campus_submit_contribution', {
      p_user_id: user.id,
      p_activity_title: validated.value.activity_title,
      p_activity_date: validated.value.activity_date,
      p_description: validated.value.description,
    });
    if (error) {
      console.error('[contributions] submit failed:', error.message);
      if (error.code === '23505') {
        return json({ success: false, message: '同じ活動名・活動日ですでに申請があります。申請履歴を確認してください。' }, 409);
      }
      return json({ success: false, message: '申請を保存できませんでした。入力内容を確認して再度お試しください。' }, 500);
    }

    return json({ success: true, result: data }, 201);
  } catch (error) {
    console.error('[contributions] POST failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, message: '申請を送信できませんでした。' }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedStudent(request);
    if (!user) return json({ success: false, message: '学校アカウントでログインしてください。' }, 401);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.submission_id !== 'string') {
      return json({ success: false, message: '申請IDが正しくありません。' }, 400);
    }
    if (body.action !== 'withdraw' && body.action !== 'resubmit') {
      return json({ success: false, message: '申請操作が正しくありません。' }, 400);
    }

    const submission = body.action === 'resubmit' ? validateContributionSubmission(body) : null;
    if (submission?.error || (body.action === 'resubmit' && !submission?.value)) {
      return json({ success: false, message: submission?.error || '再提出内容を確認してください。' }, 400);
    }

    const admin = getAdminClient();
    const { data, error } = await admin.rpc('campus_update_contribution_submission', {
      p_user_id: user.id,
      p_submission_id: body.submission_id,
      p_action: body.action,
      p_activity_title: submission?.value?.activity_title || null,
      p_activity_date: submission?.value?.activity_date || null,
      p_description: submission?.value?.description || null,
    });
    if (error) {
      console.error('[contributions] update failed:', error.message);
      return json({ success: false, message: '申請を更新できませんでした。現在の審査状態を確認してください。' }, 409);
    }

    return json({ success: true, result: data });
  } catch (error) {
    console.error('[contributions] PATCH failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, message: '申請を更新できませんでした。' }, 500);
  }
}
