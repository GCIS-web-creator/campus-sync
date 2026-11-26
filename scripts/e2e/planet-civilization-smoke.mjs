import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:8787';
const supabaseHost = 'build-check-placeholder.supabase.co';
let planetGetCalls = 0;
let publicPortalSupabaseRequests = 0;
let savedStudySession = null;
let xpAwardPayload = null;
let travelPurchasePayload = null;
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
    planet_asset_id: 'planet-006',
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
  mpSummary: { balance: 50, earned_total: 50, spent_total: 0 },
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
    source_session: {
      id: '44444444-4444-4444-8444-999999999999',
      subject_name: '物理',
      task_title: 'モック学習を60秒記録',
      focus_seconds: 60,
      break_seconds: 0,
      started_at: '2026-11-21T00:00:00.000Z',
      finish_kind: 'completed',
    },
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
        const body = request.postDataJSON();
        if (body?.action === 'purchase-star-system-travel') {
          travelPurchasePayload = body;
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, spent_mp: 30, balance: 20 }) });
        }
        xpAwardPayload = body;
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
      publicPortalSupabaseRequests += 1;
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

  // The LINE public portal must render without CampusSync or Supabase identity.
  await page.goto(origin + '/liff', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '学校情報ポータル', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText('ログイン不要', { exact: true }).waitFor({ state: 'visible' });
  for (const label of ['試験範囲', '時間割表', 'イベント', '課題・提出物', '気象パネル', '電車発車案内', '高機能電卓']) {
    await page.getByRole('button', { name: new RegExp(label) }).waitFor({ state: 'visible' });
  }
  assert.equal(publicPortalSupabaseRequests, 0, 'Public LIFF portal must not request Supabase identity or user data');
  assert.equal(await page.getByRole('button', { name: 'オフライン同期パネルを開く' }).count(), 0, 'Public LIFF portal must not show the personal offline-sync control');

  await page.addInitScript(() => {
    window.__campusSongPlayCalls = [];
    class MockAudio {
      src;
      currentTime = 0;
      volume = 1;
      muted = false;
      preload = 'auto';
      paused = true;
      constructor(src) { this.src = src; }
      addEventListener() {}
      play() {
        window.__campusSongPlayCalls.push(this.src);
        this.paused = false;
        return Promise.resolve();
      }
      pause() { this.paused = true; }
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: MockAudio });

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
  await page.getByText('根拠となる学習記録', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('物理 ・ モック学習を60秒記録', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('集中 1分 ・ 休憩 0秒 ・ 完了', { exact: true }).waitFor({ state: 'visible' });

  for (const label of ['文明発展スコア', '4つの成長軸', '技術文明', '社会文明', '研究・知識', '自然環境', '最近の成長履歴']) {
    await page.getByText(label, { exact: true }).first().waitFor({ state: 'visible' });
  }
  await page.locator('[aria-label="太陽光源・衛星を含む3D惑星表示"]').waitFor({ state: 'visible' });
  assert.ok(planetGetCalls >= 1, 'Planet API should load on first view');

  // Exercise the new Verdia terrain view and the star-voyage purchase flow.
  await page.getByRole('button', { name: '地上視点', exact: true }).click();
  await page.getByRole('button', { name: '選択した地点に降り立つ', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: '選択した地点に降り立つ', exact: true }).click();
  await page.getByText(/文明 Stage 1/).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '惑星視点へ戻る', exact: true }).click();
  await page.getByRole('button', { name: /星系旅行 · 30MP/ }).click();
  await page.getByRole('heading', { name: '星系周遊航行', exact: true }).waitFor({ state: 'visible' });
  await page.getByText(/地表500km上空/).first().waitFor({ state: 'visible' });
  await page.getByText('約5分42秒', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '30 MPで航行開始', exact: true }).click();
  await page.getByText('VESSEL SYSTEMS · AUTO PILOT', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText(/船体 1 km/).waitFor({ state: 'visible' });
  await page.getByText(/WARP \/ 0.27c/).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '外部追跡カメラ', exact: true }).click();
  await page.getByText('EXTERIOR TRACKING CAMERA', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '船内視点', exact: true }).click();
  await page.getByText('VESSEL SYSTEMS · AUTO PILOT', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '視点リセット', exact: true }).click();
  await page.mouse.move(190, 410);
  await page.mouse.down();
  await page.mouse.move(230, 430, { steps: 3 });
  await page.mouse.up();
  assert.ok(travelPurchasePayload?.action === 'purchase-star-system-travel', 'Voyage start should use the dedicated MP purchase API action');
  assert.match(travelPurchasePayload?.travel_id || '', /^[0-9a-f-]{36}$/i, 'Voyage purchase should send an idempotency UUID');

  // The camera view may be aimed away from the HUD after the pointer drag;
  // the camera toggle was already verified before dragging. Reload the screen
  // to restore Planet Civilization for the remaining independent checks.

  // Reload to restore the initial Planet Civilization screen for the
  // remaining independent checks; the voyage itself is intentionally 342s.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '惑星・文明', exact: true }).waitFor({ state: 'visible', timeout: 30000 });

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
  await page.getByRole('button', { name: '通知音をテスト', exact: true }).click();
  await page.getByText(/「鯖の味噌煮と牛乳」を再生しています/).waitFor({ state: 'visible' });
  const testedSongPaths = await page.evaluate(() => window.__campusSongPlayCalls);
  assert.ok(testedSongPaths.length >= 1, 'Notification test should play the supplied song');
  assert.ok(testedSongPaths.every(path => path === '/audio/x005_saba.mp3'), 'Notification test should use the supplied MP3 asset');
  await page.getByLabel('集中時間（分）').fill('1');
  await page.getByLabel('課題・勉強内容').fill('ブラウザ確認用の学習');
  await page.getByRole('button', { name: '開始' }).click();
  await page.getByRole('button', { name: '中断して記録' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: '休憩に切り替える' }).click();
  await page.getByText('休憩時間', { exact: true }).waitFor({ state: 'visible' });
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: '集中に戻る' }).click();
  await page.getByText('集中時間', { exact: true }).waitFor({ state: 'visible' });
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: '一時停止' }).click();
  await page.getByText('一時停止中', { exact: true }).waitFor({ state: 'visible' });
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: '再開' }).click();
  await page.getByRole('button', { name: '中断して記録' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: '中断して記録' }).click();
  await page.getByLabel('勉強した内容').fill('短い集中セッションを保存する');
  await page.getByLabel('次にやること').fill('次回も続ける');
  await page.getByRole('button', { name: '記録を保存' }).click();
  await page.getByText(/途中の学習記録を保存しました。残り時間と課題を保持しています/).waitFor({ state: 'visible', timeout: 15000 });
  assert.ok(savedStudySession && Number(savedStudySession.focus_seconds) >= 2, 'Interrupted Pomodoro segment should save positive focus time');
  const interruptedTaskValue = await page.getByLabel('課題・勉強内容').inputValue();
  assert.equal(interruptedTaskValue, 'ブラウザ確認用の学習', 'Saved interruption should preserve its task for continuation');
  assert.equal(await page.getByRole('button', { name: '再開', exact: true }).count(), 1, 'Saved interruption should offer resume');
  await page.getByRole('button', { name: '再開', exact: true }).click();
  await page.getByRole('button', { name: '中断して記録', exact: true }).waitFor({ state: 'visible' });
  await page.waitForTimeout(1300);
  assert.equal(await page.getByLabel('課題・勉強内容').inputValue(), 'ブラウザ確認用の学習', 'Resuming should keep the same task');
  await page.getByRole('button', { name: '中断して記録', exact: true }).click();
  assert.ok(Number(savedStudySession.focus_seconds) <= 5, 'Break and paused time must not be added to focus duration');
  assert.ok(Number(savedStudySession.break_seconds) >= 1, 'Break time should be stored separately from focus time');
  assert.equal(xpAwardPayload?.action, 'award-learning-xp', 'Saved session should call the learning XP endpoint');
  assert.equal(xpAwardPayload?.session_id, '44444444-4444-4444-8444-000000000001', 'Learning XP request should reference the saved session ID');

  // Simulate an XP API outage after the study session has already been saved.
  await page.getByLabel('勉強した内容').fill('XP再試行キューの確認');
  await page.getByLabel('次にやること').fill('再読み込み後に未反映XPを再試行');
  failNextXpAward = true;
  await page.getByRole('button', { name: '記録を保存' }).click();
  // Wait for the unique XP-outage message, not the previous segment's still-visible success message.
  await page.getByText(/学習XPは未反映のため、下の「XPを再試行」から反映できます/).waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(xpAwardRequests.length, 2, 'Second interrupted save should create a separate XP request');
  const pendingSessionId = xpAwardRequests.at(-1)?.session_id;
  assert.equal(pendingSessionId, '44444444-4444-4444-8444-000000000002', 'Second saved session should have a unique ID');
  const pendingStorageKey = 'campus-sync-pending-planet-xp:11111111-1111-4111-8111-111111111111';
  const persistedBeforeReload = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), pendingStorageKey);
  assert.deepEqual(persistedBeforeReload, [pendingSessionId], 'Failed XP request should be persisted before reload');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /XPを再試行/ }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /XPを再試行/ }).click();
  await page.getByText(/1件の学習XP付与状態を確認しました/).waitFor({ state: 'visible', timeout: 15000 });
  const retriedRequests = xpAwardRequests.filter(item => item.session_id === pendingSessionId);
  assert.equal(retriedRequests.length, 2, 'Pending XP request should be retried with the same session ID');
  const persistedAfterRetry = await page.evaluate(key => localStorage.getItem(key), pendingStorageKey);
  assert.equal(persistedAfterRetry, null, 'Successfully retried XP session should be removed from local storage');
  // The page reload resets the learning-hub subtab to Overview; reopen Focus
  // before asserting the restored paused timer controls.
  await page.getByRole('button', { name: '集中', exact: true }).click();
  await page.getByRole('button', { name: 'この勉強を終了', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: 'この勉強を終了', exact: true }).click();
  await page.getByRole('button', { name: '開始', exact: true }).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Planetube', exact: true }).click();
  await page.getByRole('heading', { name: 'Planetubeにログイン', exact: true }).waitFor({ state: 'visible', timeout: 15000 });

  assert.deepEqual(pageErrors, [], 'Browser page should not throw uncaught JavaScript errors');

  console.log('PASS: planet screen, Verdia ground landing, star-voyage 30 MP purchase handoff, cockpit flight entry, linked XP evidence, 390px mobile layout, supplied song test path, focus/break/pause accounting, interrupted session saved and resumed, XP handoff, and retry recovery');
} finally {
  await browser.close();
}
