import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminPassword, verifyAdminSessionRequest } from '@/lib/admin-auth';
import { validateContributionReview } from '@/lib/campus-contribution-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store, max-age=0', Vary: 'Cookie, x-admin-password' },
});

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('貢献審査のサーバー設定が不足しています。');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function authorize(request: NextRequest): NextResponse | null {
  if (!verifyAdminSessionRequest(request) && !verifyAdminPassword(request.headers.get('x-admin-password'))) {
    return json({ success: false, message: 'Adminログインが必要です。' }, 401);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ success: false, message: 'Supabaseのサーバー設定が不足しています。' }, 503);
  }
  return null;
}

export async function GET(request: NextRequest) {
  const authError = authorize(request);
  if (authError) return authError;

  try {
    const admin = getAdminClient();
    const { data: submissions, error } = await admin.from('campus_contribution_submissions')
      .select('id,user_id,activity_title,activity_date,description,status,xp_amount,review_reason,reviewer_label,reviewed_at,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    const rows = submissions || [];
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    const submissionIds = rows.map((row) => row.id);

    const [profilesResult, eventsResult] = await Promise.all([
      userIds.length
        ? admin.from('profiles').select('auth_user_id,student_id,student_name,user_class').in('auth_user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
      submissionIds.length
        ? admin.from('campus_contribution_review_events')
            .select('id,submission_id,event_type,from_status,to_status,xp_amount,reason,actor_label,created_at')
            .in('submission_id', submissionIds)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error || eventsResult.error) throw profilesResult.error || eventsResult.error;
    const profilesByUser = new Map((profilesResult.data || []).map((profile) => [profile.auth_user_id, profile]));
    const eventsBySubmission = new Map<string, unknown[]>();
    for (const event of eventsResult.data || []) {
      const list = eventsBySubmission.get(event.submission_id) || [];
      list.push(event);
      eventsBySubmission.set(event.submission_id, list);
    }

    return json({
      success: true,
      submissions: rows.map((row) => ({
        ...row,
        profile: profilesByUser.get(row.user_id) || null,
        events: eventsBySubmission.get(row.id) || [],
      })),
    });
  } catch (error) {
    console.error('[admin/contributions] GET failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, message: '貢献申請の一覧を取得できませんでした。' }, 500);
  }
}

export async function POST(request: NextRequest) {
  const authError = authorize(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => null);
    const validated = validateContributionReview(body);
    if (validated.error || !validated.value) {
      return json({ success: false, message: validated.error || '審査内容を確認してください。' }, 400);
    }

    const admin = getAdminClient();
    const { data, error } = await admin.rpc('campus_review_contribution_submission', {
      p_submission_id: validated.value.submission_id,
      p_decision: validated.value.decision,
      p_xp_amount: validated.value.xp_amount,
      p_review_reason: validated.value.review_reason,
      p_reviewer_label: 'CampusSync Admin',
    });
    if (error) {
      console.error('[admin/contributions] review failed:', error.message);
      return json({ success: false, message: '審査を確定できませんでした。申請がすでに処理されていないか確認してください。' }, 409);
    }

    return json({ success: true, result: data });
  } catch (error) {
    console.error('[admin/contributions] POST failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, message: '審査処理に失敗しました。' }, 500);
  }
}
