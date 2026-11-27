import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GROUND_LOCATIONS, PLANET_GROUND_THEMES, getPlanetGroundTheme, groundHeightAt, groundSiteHeight, valueNoise } from '../lib/planet-ground.ts';

test('every catalog planet except Verdia has its own ground theme', () => {
  const expected = Array.from({ length: 50 }, (_, i) => i + 1).filter((n) => n !== 6).map((n) => 'planet-' + String(n).padStart(3, '0'));
  assert.deepEqual(PLANET_GROUND_THEMES.map((theme) => theme.id), expected);
  assert.equal(getPlanetGroundTheme('planet-034').id, 'planet-034');
});

test('landing zones are level, finite and above sea level on every planet', () => {
  for (const theme of PLANET_GROUND_THEMES) {
    for (const site of GROUND_LOCATIONS) {
      if (theme.kind === 'gas') {
        assert.ok(groundSiteHeight(theme, site) > groundHeightAt(theme, site.x, site.z), theme.id + ' ' + site.id);
        continue;
      }
      const centre = groundHeightAt(theme, site.x, site.z);
      assert.ok(centre > 1, theme.id + ' ' + site.id);
      assert.ok(Math.abs(groundHeightAt(theme, site.x + 20, site.z) - centre) < 1e-9);
    }
    assert.ok(Number.isFinite(groundHeightAt(theme, 3_900, -4_100)));
  }
});

test('texture noise repeats seamlessly', () => {
  assert.ok(Math.abs(valueNoise(0.3, 2.7, 5, 6) - valueNoise(6.3, 8.7, 5, 6)) < 1e-12);
});

test('ground views use 512px materials and Verdia keeps its own scene', () => {
  const materials = readFileSync(new URL('../components/planet-world/ground-materials.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../components/Planet3DPanel.tsx', import.meta.url), 'utf8');
  assert.match(materials, /GROUND_TEXTURE_SIZE = 512/);
  assert.match(panel, /numericId !== 6 && <PlanetGroundView/);
  assert.match(panel, /numericId === 6 && <VerdiaGroundView/);
});
