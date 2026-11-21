import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:8787';
const supabaseHost = 'build-check-placeholder.supabase.co';
let planetGetCalls = 0;
let savedStudySession = null;
let xpAwardPayload = null;
let studySessionSequence = 0;
let failNextXpAward = false;
const xpAwardRequests = [];
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: '123456@tokyo.soka.ed.jp',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const planetPayload = {
  success: true,
  planet: {
    id: '22222222-2222-4222-8222-222222222222',
    planet_name: 'わたしの惑星',
    civilization_stage: 1,
    is_public: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  growth: {
    learning_xp: 150,
    contribution_xp: 0,
    knowledge_xp: 0,
    nature_growth: 2,
    technical_level: 1,
    social_level: 0,
    research_level: 0,
    nature_level: 0,
    civilization_score: 160,
    recalculated_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  recentLedger: [{
    id: '33333333-3333-4333-8333-333333333333',
    xp_type: 'learning',
    amount: 150,
    entry_kind: 'award',
    adjustment_direction: null,
    rule_version: 1,
    source_type: 'pomodoro',
    source_date: '2026-11-21',
    reason: 'ブラウザ確認用のダミー記録',
    created_at: '2026-11-21T00:00:00.000Z',
  }],
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1365, height: 900 },
    locale: 'ja-JP',
    reducedMotion: 'reduce',
  });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin === origin) {
      if (url.pathname === '/api/teacher/access') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }) });
      }
      if (url.pathname === '/api/planet-civilization') {
        if (request.method() === 'GET') {
          planetGetCalls += 1;
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(planetPayload) });
        }
        xpAwardPayload = request.postDataJSON();
        xpAwardRequests.push({ ...xpAwardPayload });
        if (failNextXpAward) {
          failNextXpAward = false;
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: '一時的なテスト障害' }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, result: { awarded_xp: 1, credited_seconds: 60 } }) });
      }
      if (url.pathname.startsWith('/api/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
      }
      return route.continue();
    }

    if (url.hostname === supabaseHost) {
      const corsHeaders = {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
        'access-control-allow-headers': 'apikey,authorization,content-type,x-client-info,prefer,accept,accept-profile,content-profile',
      };
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      }
      if (url.pathname === '/rest/v1/student_study_sessions' && request.method() === 'POST') {
        savedStudySession = request.postDataJSON();
        studySessionSequence += 1;
        const sessionId = '44444444-4444-4444-8444-' + String(studySessionSequence).padStart(12, '0');
        return route.fulfill({
          status: 200,
          headers: { ...corsHeaders, 'content-type': 'application/json' },
          body: JSON.stringify({ id: sessionId }),
        });
      }
      if (url.pathname === '/rest/v1/profiles') {
        return route.fulfill({
          status: 200,
          headers: { ...corsHeaders, 'content-type': 'application/json' },
          body: JSON.stringify({
            student_id: '123456',
            student_name: 'テスト生徒',
            user_class: '1-1',
            setup_completed_at: '2026-01-01T00:00:00.000Z',
            chat_display_name: 'テスト生徒',
          }),
        });
      }
      if (url.pathname === '/auth/v1/user') {
        return route.fulfill({
          status: 200,
          headers: { ...corsHeaders, 'content-type': 'application/json' },
          body: JSON.stringify(user),
        });
      }
      return route.fulfill({
        status: 200,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
        body: JSON.stringify([]),
      });
    }

    return route.abort();
  });

  await page.addInitScript(() => {
    const now = Math.floor(Date.now() / 1000);
    const session = {
      access_token: 'browser-smoke-placeholder-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: 'browser-smoke-placeholder-refresh',
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        aud: 'authenticated',
        role: 'authenticated',
        email: '123456@tokyo.soka.ed.jp',
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-01-01T00:00:00.000Z',
      },
    };
    localStorage.setItem('sb-build-check-placeholder-auth-token', JSON.stringify(session));
    localStorage.setItem('campus-sync-dark-mode', 'false');
    localStorage.setItem('campus-sync-display-mode-v2', 'light');
  });

  await page.goto(origin + '/#planet', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '惑星・文明', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
  await page.getByText('わたしの惑星', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('非公開', { exact: true }).waitFor({ state: 'visible' });

  for (const label of ['文明発展スコア', '4つの成長軸', '技術文明', '社会文明', '研究・知識', '自然環境', '最近の成長履歴']) {
    await page.getByText(label, { exact: true }).first().waitFor({ state: 'visible' });
  }
  await page.locator('svg[role="img"][aria-label*="集落時代"]').waitFor({ state: 'visible' });
  assert.ok(planetGetCalls >= 1, 'Planet API should load on first view');

  const firstLoadCount = planetGetCalls;
  const planetHeader = page.locator('header').filter({ has: page.getByRole('heading', { name: '惑星・文明', exact: true }) }).first();
  const refreshButton = planetHeader.locator('button').filter({ hasText: /更新|Refresh/ }).first();
  const refreshCount = await refreshButton.count();
  if (refreshCount !== 1) {
    const visibleButtons = await page.locator('button').allTextContents();
    const visibleHeaders = await page.locator('header').allTextContents();
    throw new Error('Planet refresh button not found. buttons=' + JSON.stringify(visibleButtons) + ' headers=' + JSON.stringify(visibleHeaders));
  }
  assert.equal(await refreshButton.isEnabled(), true, 'Planet refresh button should be enabled after initial load');
  await refreshButton.click();
  for (let attempt = 0; attempt < 30 && planetGetCalls <= firstLoadCount; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(planetGetCalls > firstLoadCount, 'Update button should reload planet data');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobileWidth = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(
    Math.max(mobileWidth.document, mobileWidth.body) <= mobileWidth.viewport + 2,
    'Planet screen should not introduce horizontal overflow on a 390px viewport: ' + JSON.stringify(mobileWidth),
  );
  await page.goto(origin + '/#study', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '学習・テスト対策', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
  await page.getByRole('button', { name: '集中', exact: true }).click();
  await page.getByLabel('集中時間（分）').fill('1');
  await page.getByLabel('課題・勉強内容').fill('ブラウザ確認用の学習');
  await page.getByRole('button', { name: '開始' }).click();
  await page.getByRole('button', { name: '途中終了' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '休憩に切り替える' }).click();
  await page.getByText('休憩時間', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '集中に戻る' }).click();
  await page.getByText('集中時間', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '一時停止' }).click();
  await page.getByText('一時停止中', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '再開' }).click();
  await page.getByRole('button', { name: '途中終了' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: '途中終了' }).click();
  await page.getByLabel('勉強した内容').fill('短い集中セッションを保存する');
  await page.getByLabel('次にやること').fill('次回も続ける');
  await page.getByRole('button', { name: '記録を保存' }).click();
  await page.getByText('学習記録を保存しました。学習XP +1 を獲得しました。', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  assert.ok(savedStudySession && Number(savedStudySession.focus_seconds) >= 1, 'Pomodoro should save a positive focus duration');
  assert.equal(xpAwardPayload?.action, 'award-learning-xp', 'Saved session should call the learning XP endpoint');
  assert.equal(xpAwardPayload?.session_id, '44444444-4444-4444-8444-000000000001', 'Learning XP request should reference the saved session ID');

  // Simulate an XP API outage after the study session has already been saved.
  await page.getByRole('button', { name: '開始' }).click();
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: '途中終了' }).click();
  await page.getByLabel('勉強した内容').fill('XP再試行キューの確認');
  await page.getByLabel('次にやること').fill('再読み込み後に未反映XPを再試行');
  failNextXpAward = true;
  await page.getByRole('button', { name: '記録を保存' }).click();
  await page.getByText(/学習記録を保存しました。/).waitFor({ state: 'visible', timeout: 15000 });
  const pendingSessionId = xpAwardRequests.at(-1)?.session_id;
  assert.equal(pendingSessionId, '44444444-4444-4444-8444-000000000002', 'Second saved session should have a unique ID');
  const pendingStorageKey = 'campus-sync-pending-planet-xp:11111111-1111-4111-8111-111111111111';
  const persistedBeforeReload = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), pendingStorageKey);
  assert.deepEqual(persistedBeforeReload, [pendingSessionId], 'Failed XP request should be persisted before reload');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /XPを再試行/ }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /XPを再試行/ }).click();
  await page.getByText(/1件の学習XPを確認しました/).waitFor({ state: 'visible', timeout: 15000 });
  const retriedRequests = xpAwardRequests.filter(item => item.session_id === pendingSessionId);
  assert.equal(retriedRequests.length, 2, 'Pending XP request should be retried with the same session ID');
  const persistedAfterRetry = await page.evaluate(key => localStorage.getItem(key), pendingStorageKey);
  assert.equal(persistedAfterRetry, null, 'Successfully retried XP session should be removed from local storage');

  await page.getByRole('button', { name: 'Planetube', exact: true }).click();
  await page.getByRole('heading', { name: 'Planetubeにログイン', exact: true }).waitFor({ state: 'visible', timeout: 15000 });

  assert.deepEqual(pageErrors, [], 'Browser page should not throw uncaught JavaScript errors');

  console.log('PASS: planet screen, private badge, XP/axis/history content, refresh, 390px mobile layout, Pomodoro start/break/focus/pause/resume/save, XP API handoff, durable pending-XP recovery after reload, and Planetube login screen');
} finally {
  await browser.close();
}
