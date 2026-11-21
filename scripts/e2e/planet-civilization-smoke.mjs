import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:8787';
const supabaseHost = 'build-check-placeholder.supabase.co';
let planetGetCalls = 0;
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
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, result: { awarded_xp: 1 } }) });
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
  await page.getByRole('button', { name: '更新' }).click();
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
  assert.deepEqual(pageErrors, [], 'Browser page should not throw uncaught JavaScript errors');

  console.log('PASS: authenticated planet screen, private badge, XP/axis/history content, refresh action, and 390px mobile layout');
} finally {
  await browser.close();
}
