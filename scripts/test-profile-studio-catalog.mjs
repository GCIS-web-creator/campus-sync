import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Profile Studio contains 23 themes and 46 separate decoration slots', async () => {
  const catalog = await read('components/profile-studio/catalog.ts');
  const registry = await read('components/profile-studio/effectsRegistry.ts');
  const themes = catalog.match(/\{ kind: '[a-z-]+', label:/g) || [];
  const newThemes = catalog.match(/newTheme: true/g) || [];
  assert.equal(themes.length, 23);
  assert.equal(newThemes.length, 12);
  assert.match(catalog, /DECO_ITEMS: DecoItem\[\] = THEMES\.flatMap/);
  assert.match(registry, /lab: C\.labIcon/);
  assert.match(registry, /glass: C\.glassIcon/);
  assert.match(registry, /lab: C\.labBanner/);
  assert.match(registry, /glass: C\.glassBanner/);
});

test('New themes remain approval-pending and locked pending owner approval', async () => {
  const catalog = await read('components/profile-studio/catalog.ts');
  const studio = await read('components/ProfileStudio.tsx');
  assert.match(catalog, /approvalPending: Boolean\(theme\.newTheme\)/);
  assert.match(studio, /!item\.approvalPending/);
  assert.match(studio, /条件案承認待ち|承認待ち/);
});

test('Effects respect reduced motion and all overlays ignore pointer input', async () => {
  const effects = await read('components/profile-studio/NatureEffects.tsx');
  const css = await read('components/profile-studio/themes3.css');
  assert.match(effects, /pointerEvents: 'none'/);
  assert.match(effects, /themes3\.css/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
