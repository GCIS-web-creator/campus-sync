import { NextResponse } from 'next/server';
import { clearClassroomStateCookie, getClassroomOAuthConfig, getCookieValue, verifyClassroomOAuthState, CLASSROOM_STATE_COOKIE } from '@/lib/classroom-oauth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type GoogleTokenResponse = { access_token?: string; error?: string };
type GoogleListResponse<T> = { [key: string]: T[] | string | undefined; nextPageToken?: string };
function resultRedirect(request: Request, result: string, counts?: { courses?: number; assignments?: number; checked?: number }) {
  const target = new URL('/admin', request.url); target.searchParams.set('classroom_test', result);
  if (typeof counts?.courses === 'number') target.searchParams.set('courses', String(counts.courses));
  if (typeof counts?.assignments === 'number') target.searchParams.set('assignments', String(counts.assignments));
  if (typeof counts?.checked === 'number') target.searchParams.set('checked', String(counts.checked));
  return NextResponse.redirect(target, { headers: { 'Set-Cookie': clearClassroomStateCookie(), 'Cache-Control': 'no-store' } });
}
async function classifyGoogleApiError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: { message?: string; errors?: Array<{ reason?: string }> } } | null;
  const message = String(body?.error?.message || '').toLowerCase(); const reason = String(body?.error?.errors?.[0]?.reason || '').toLowerCase();
  if (reason.includes('accessnotconfigured') || message.includes('classroom api has not been used') || message.includes('is disabled')) return 'api_disabled';
  if (response.status === 401 || response.status === 403) return 'classroom_access_denied';
  return 'api_error';
}
export async function GET(request: Request) {
  const requestUrl = new URL(request.url); const config = getClassroomOAuthConfig(requestUrl.origin);
  if (!config.configured) return resultRedirect(request, 'not_configured');
  const state = requestUrl.searchParams.get('state') || '';
  const cookieNonce = getCookieValue(request.headers.get('cookie'), CLASSROOM_STATE_COOKIE) || '';
  if (!state || !cookieNonce || !verifyClassroomOAuthState(state, cookieNonce, config.clientSecret)) return resultRedirect(request, 'invalid_state');
  if (requestUrl.searchParams.get('error')) return resultRedirect(request, 'oauth_denied');
  const code = requestUrl.searchParams.get('code'); if (!code) return resultRedirect(request, 'token_exchange');
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: 'authorization_code' }), cache: 'no-store' });
    const token = await tokenResponse.json().catch(() => null) as GoogleTokenResponse | null;
    if (!tokenResponse.ok || !token?.access_token) return resultRedirect(request, 'token_exchange');
    const coursesUrl = new URL('https://classroom.googleapis.com/v1/courses');
    coursesUrl.searchParams.set('courseStates', 'ACTIVE'); coursesUrl.searchParams.set('pageSize', '100');
    coursesUrl.searchParams.set('fields', 'courses(id,name,section,courseState),nextPageToken');
    const coursesResponse = await fetch(coursesUrl, { headers: { Authorization: 'Bearer ' + token.access_token }, cache: 'no-store' });
    if (!coursesResponse.ok) return resultRedirect(request, await classifyGoogleApiError(coursesResponse));
    const coursesData = await coursesResponse.json() as GoogleListResponse<{ id: string; name?: string; section?: string }>;
    const courses = Array.isArray(coursesData.courses) ? coursesData.courses : [];
    if (!courses.length) return resultRedirect(request, 'no_courses', { courses: 0, assignments: 0, checked: 0 });
    let assignmentCount = 0; let checkedCourses = 0; let courseworkDenied = false;
    // Read-only smoke test: at most 20 active classes and 20 assignments per class.
    for (const course of courses.slice(0, 20)) {
      if (!course.id) continue;
      const workUrl = new URL('https://classroom.googleapis.com/v1/courses/' + encodeURIComponent(course.id) + '/courseWork');
      workUrl.searchParams.set('pageSize', '20'); workUrl.searchParams.set('orderBy', 'updateTime desc');
      workUrl.searchParams.set('fields', 'courseWork(id,title,dueDate,dueTime,alternateLink,workType),nextPageToken');
      const workResponse = await fetch(workUrl, { headers: { Authorization: 'Bearer ' + token.access_token }, cache: 'no-store' });
      if (!workResponse.ok) { courseworkDenied = true; continue; }
      checkedCourses += 1;
      const workData = await workResponse.json() as GoogleListResponse<{ id: string }>;
      if (Array.isArray(workData.courseWork)) assignmentCount += workData.courseWork.length;
    }
    return resultRedirect(request, courseworkDenied ? 'partial' : 'success', { courses: courses.length, assignments: assignmentCount, checked: checkedCourses });
  } catch { return resultRedirect(request, 'api_error'); }
}