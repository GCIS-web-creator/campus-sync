import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CITY_STREET_HALF_WIDTH, CITY_VIEWPOINT, buildCityLayout } from '../lib/planet-city.ts';

test('every planet gets a very dense city that keeps the street clear', () => {
  for (let planet = 1; planet <= 50; planet += 1) {
    const { buildings } = buildCityLayout(planet, 1);
    assert.ok(buildings.length > 2_000, 'planet ' + planet + ' has ' + buildings.length);
    for (const b of buildings) {
      assert.ok(b.height > 0 && b.width > 0 && b.depth > 0);
      if (b.z > -480) assert.ok(Math.abs(b.x) - b.width / 2 >= CITY_STREET_HALF_WIDTH - 1e-9, 'planet ' + planet + ' blocks the street');
    }
    assert.ok(Math.abs(CITY_VIEWPOINT.x) < CITY_STREET_HALF_WIDTH);
  }
});

test('city layouts are repeatable, differ per planet and rise toward a landmark', () => {
  assert.deepEqual(buildCityLayout(7, 2), buildCityLayout(7, 2));
  assert.notDeepEqual(buildCityLayout(7, 2).buildings[0], buildCityLayout(8, 2).buildings[0]);
  const { buildings, landmarkHeight } = buildCityLayout(1, 3);
  assert.equal(Math.max(...buildings.map((b) => b.y + b.height)) <= landmarkHeight + 1, true);
});

test('the ground view is a single street-level viewpoint with no landing zones', () => {
  const panel = readFileSync(new URL('../components/Planet3DPanel.tsx', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../components/planet-world/CityGroundView.tsx', import.meta.url), 'utf8');
  assert.match(panel, /viewMode==='ground' && <CityGroundView/);
  assert.doesNotMatch(panel + view, /Glassfield|選択した地点に降り立つ/);
  assert.equal(CITY_VIEWPOINT.y, 1.65);
});
