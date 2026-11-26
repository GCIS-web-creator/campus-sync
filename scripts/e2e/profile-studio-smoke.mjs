import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:8787';
const supabaseHost = 'build-check-placeholder.supabase.co';
const artifactDir = 'artifacts/profile-studio';
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
const mockProfile = {
  user_id: user.id,
  display_name: 'Ted',
  bio: '',
  avatar_emoji: '💎',
  avatar_url: null,
  avatar_path: null,
  banner_theme: 'aurora',
  banner_url: null,
  banner_path: null,
  studio: {},
  name_style: 'gradient',
  name_font: 'rounded',
  frame_style: 'basic',
  avatar_effect: 'none',
  is_public: false,
  show_class: false,
  class_label: null,
  equipped_badges: [],
  contribution_points: 0,
  updated_at: '2026-11-26T00:00:00.000Z',
};
const unlocked = [
  'badge_first_study', 'frame_aurora', 'badge_study_10',
  'effect_sparkle', 'badge_contribution_3', 'frame_prism',
  'deco-sea-ripple',
];
let savedProfile = null;
const cors = {
  'access-control-allow-origin': origin,
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'apikey,authorization,content-type,x-client-info,prefer,accept,accept-profile,content-profile',
  'access-control-expose-headers': 'Content-Range,Preference-Applied',
};

const browser = await chromium.launch({ headless: true });
try {
  await mkdir(artifactDir, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    locale: 'ja-JP',
    reducedMotion: 'no-preference',
  });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.hostname === 'profile-image.test') {
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><defs><linearGradient id="g"><stop stop-color="#22d3ee"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><rect width="160" height="160" rx="80" fill="url(#g)"/><circle cx="80" cy="60" r="28" fill="#fff"/><path d="M25 150q5-52 55-52t55 52" fill="#fff"/></svg>',
      });
    }

    if (url.origin === origin) {
      if (url.pathname === '/api/teacher/access') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }) });
      }
      if (url.pathname.startsWith('/api/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
      }
      return route.continue();
    }

    if (url.hostname === supabaseHost) {
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
      if (url.pathname === '/auth/v1/user') {
        return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(user) });
      }
      if (url.pathname === '/rest/v1/profiles') {
        return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({
          student_id: '123456', student_name: 'テスト利用者', user_class: '1-1',
          setup_completed_at: '2026-01-01T00:00:00.000Z',
        }) });
      }
      if (url.pathname === '/rest/v1/student_profile_customizations') {
        if (['POST', 'PATCH', 'PUT'].includes(request.method())) {
          savedProfile = request.postDataJSON();
          return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(savedProfile) });
        }
        return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json', 'content-range': '0-0/1' }, body: JSON.stringify(mockProfile) });
      }
      if (url.pathname === '/rest/v1/student_study_sessions') {
        const rows = Array.from({ length: 10 }, (_, index) => ({ id: 'study-' + index, focus_seconds: 1800, ended_at: '2026-11-25T10:00:00.000Z' }));
        return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(rows) });
      }
      if (url.pathname === '/rest/v1/contribution_history') {
        const rows = [1,2,3].map(delta => ({ delta }));
        return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(rows) });
      }
      if (url.pathname === '/rest/v1/student_profile_unlocks') {
        const rows = unlocked.map(cosmetic_id => ({ cosmetic_id }));
        return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(rows) });
      }
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify([]) });
    }

    return route.abort();
  });

  await page.addInitScript(() => {
    const now = Math.floor(Date.now() / 1000);
    const session = {
      access_token: 'profile-studio-browser-smoke-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: 'profile-studio-browser-smoke-refresh',
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

  async function openProfile() {
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('メニュー内を検索').fill('プロフィール');
    await page.getByRole('button', { name: 'プロフィール・バッジ', exact: true }).click();
    await page.getByRole('heading', { name: 'プロフィールカスタマイズ', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
    await page.getByText('リアルタイムプレビュー', { exact: true }).waitFor({ state: 'visible' });
    await page.getByText('Ted', { exact: true }).waitFor({ state: 'visible' });
  }

  await openProfile();
  assert.equal(await page.getByRole('button', { name: '自己紹介を書く' }).count(), 1, 'Only the profile owner should see the empty-bio action');
  const initialCardText = await page.locator('.ps-card').innerText();
  assert.equal(initialCardText.includes('💎'), false, 'The default diamond avatar is rendered as SVG rather than emoji');
  assert.equal(/123456|tokyo\.soka\.ed\.jp/.test(initialCardText), false, 'School email and student ID must not appear on the card');
  assert.equal(await page.getByLabel('プロフィール枠').locator('option[value="aurora"]').isDisabled(), false, 'Unlocked aurora frame should be selectable');
  assert.equal(await page.getByLabel('プロフィール枠').locator('option[value="prism"]').isDisabled(), false, 'Unlocked prism frame should be selectable');
  assert.equal(await page.getByLabel('アイコン演出').locator('option[value="sparkle"]').isDisabled(), false, 'Unlocked sparkle effect should be selectable');
  await page.getByLabel('プロフィール枠').selectOption('aurora');
  await page.getByLabel('アイコン演出').selectOption('sparkle');

  // Locked content can be previewed, but must not enter the save payload.
  await page.getByRole('button', { name: /理科室のアイコン装飾/ }).click();
  await page.getByRole('button', { name: 'プロフィールを保存' }).click();
  await page.getByText('プロフィールを保存しました。', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(savedProfile.frame_style, 'aurora');
  assert.equal(savedProfile.avatar_effect, 'sparkle');
  assert.equal(savedProfile.studio.equipped.avatar_deco, null, 'Unapproved new theme must remain preview-only');
  assert.equal(savedProfile.is_public, false, 'Private-by-default setting must remain unchanged');
  assert.equal(savedProfile.show_class, false, 'Class visibility must remain off');

  // Existing unlocked decoration remains equipable and is persisted under its legacy ID.
  await page.getByRole('button', { name: /潮騒の波紋/ }).click();
  await page.getByRole('button', { name: 'プロフィールを保存' }).click();
  await page.getByText('プロフィールを保存しました。', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(savedProfile.studio.equipped.avatar_deco, 'deco-sea-ripple');

  // The new font is saved to existing JSONB settings; the constrained legacy column remains valid.
  await page.getByRole('button', { name: /M PLUS Rounded 1c/ }).click();
  await page.getByRole('button', { name: 'プロフィールを保存' }).click();
  await page.getByText('プロフィールを保存しました。', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(savedProfile.name_font, 'rounded');
  assert.equal(savedProfile.studio.name_font_override, 'm-plus-rounded');

  // Capture the real card at the requested mobile widths in light mode.
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.ps-card').screenshot({ path: artifactDir + '/profile-light-' + width + '.png' });
    const previewBox = await page.locator('#profile-preview').boundingBox();
    const editorBox = await page.locator('#profile-basic').boundingBox();
    assert.ok(previewBox && editorBox && previewBox.y < editorBox.y, 'On mobile, the preview should appear before the editor');
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.screenshot({ path: artifactDir + '/profile-editor-mobile-320.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: artifactDir + '/profile-editor-desktop-light.png', fullPage: true });

  // Image-present and configured bio state.
  mockProfile.avatar_url = 'https://profile-image.test/avatar.svg';
  mockProfile.bio = '学習とものづくりを楽しんでいます。';
  await page.setViewportSize({ width: 375, height: 900 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByLabel('メニュー内を検索').fill('プロフィール');
  await page.getByRole('button', { name: 'プロフィール・バッジ', exact: true }).click();
  await page.getByRole('heading', { name: 'プロフィールカスタマイズ', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('.ps-card img[src^="https://profile-image.test/"]').waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('button', { name: '自己紹介を書く' }).count(), 0, 'A configured bio should hide the owner prompt');
  await page.locator('.ps-card').screenshot({ path: artifactDir + '/profile-image-bio-375.png' });

  // Dark mode and reduced motion.
  await page.evaluate(() => {
    localStorage.setItem('campus-sync-dark-mode', 'true');
    localStorage.setItem('campus-sync-display-mode-v2', 'dark');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByLabel('メニュー内を検索').fill('プロフィール');
  await page.getByRole('button', { name: 'プロフィール・バッジ', exact: true }).click();
  await page.getByRole('heading', { name: 'プロフィールカスタマイズ', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.ps-card').screenshot({ path: artifactDir + '/profile-dark-' + width + '.png' });
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: artifactDir + '/profile-editor-mobile-dark-375.png', fullPage: true });
  const saveButtonPosition = await page.getByRole('button', { name: 'プロフィールを保存' }).last().evaluate(el => getComputedStyle(el).position);
  assert.equal(saveButtonPosition, 'fixed', 'Mobile save action should stay fixed above the safe area');
  const motionState = await page.locator('.ps-banner-stars i').first().evaluate(el => getComputedStyle(el).animationName);
  assert.equal(motionState, 'none', 'Reduced-motion preference should disable the star animation');

  const expectedRanks = [
    [0,'ブロンズ'],[100,'シルバー'],[250,'ゴールド'],[500,'サファイア'],[1000,'ダイヤモンド'],
    [1500,'アメジスト'],[2000,'アクアマリン'],[2500,'シトリン'],[3000,'エメラルド'],[3500,'ペリドット'],
    [4000,'ローズクォーツ'],[4500,'ルビー'],[5000,'トパーズ'],[6000,'オニキス'],[8000,'レインボー'],
  ];
  for (const [points, rankName] of expectedRanks) {
    mockProfile.contribution_points = points;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByLabel('メニュー内を検索').fill('プロフィール');
  await page.getByRole('button', { name: 'プロフィール・バッジ', exact: true }).click();
    await page.getByRole('heading', { name: 'プロフィールカスタマイズ', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('.ps-card').getByText(rankName, { exact: true }).waitFor({ state: 'visible' });
  }

  assert.deepEqual(pageErrors, [], 'Profile Studio should not produce browser errors');
  console.log('Profile Studio smoke passed; screenshots written to ' + artifactDir);
} finally {
  await browser.close();
}
