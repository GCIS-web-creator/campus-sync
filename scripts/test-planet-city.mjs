import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CITY_STREET_HALF_WIDTH, CITY_VIEWPOINT, buildCityLayout } from '../lib/planet-city.ts';
import { GROUND_STAGES, getGroundStage } from '../lib/planet-ground-stage.ts';

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

test('each civilization stage has its own ground view and the cyber city is stage 4', () => {
  assert.deepEqual(GROUND_STAGES.map((item) => item.kind), ['wilderness', 'village', 'town', 'industry', 'cyber', 'stellar']);
  assert.deepEqual(GROUND_STAGES.map((item) => item.name), ['原始惑星', '集落時代', '都市形成期', '産業・研究時代', '高度文明', '惑星文明']);
  assert.equal(getGroundStage(-3).stage, 0);
  assert.equal(getGroundStage(99).kind, 'stellar');
  assert.equal(getGroundStage(Number.NaN).kind, 'wilderness');
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const panel = read('../components/Planet3DPanel.tsx');
  const dispatch = read('../components/planet-world/StageGroundView.tsx');
  const scenes = read('../components/planet-world/ground/SceneGroundView.tsx');
  assert.match(panel, /viewMode==='ground' && <StageGroundView/);
  assert.match(dispatch, /info\.kind === 'cyber'\) return <CityGroundView/);
  for (const kind of ['wilderness', 'village', 'town', 'industry', 'stellar']) assert.match(scenes, new RegExp('\\b' + kind + ':'));
  assert.equal(CITY_VIEWPOINT.y, 1.65);
});
