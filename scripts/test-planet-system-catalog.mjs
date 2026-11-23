import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANET_SYSTEM_CATALOG, STAR_PROFILES, getPlanetSystemSpec } from '../lib/planet-system-catalog.ts';

test('planetary system catalog contains IDs 001 through 050', () => {
  assert.equal(Object.keys(PLANET_SYSTEM_CATALOG).length, 50);
  for (let index = 1; index <= 50; index += 1) {
    const id = 'planet-' + String(index).padStart(3, '0');
    assert.ok(PLANET_SYSTEM_CATALOG[id], 'missing ' + id);
  }
});

test('every planet has one to three permanent satellites', () => {
  for (const spec of Object.values(PLANET_SYSTEM_CATALOG)) assert.ok(spec.moonCount >= 1 && spec.moonCount <= 3, spec.id + ' moon count out of range');
});

test('rogue and binary systems are explicitly configured', () => {
  assert.equal(getPlanetSystemSpec('planet-043').rogue, true);
  assert.deepEqual(getPlanetSystemSpec('planet-044').starClasses, ['B', 'K']);
});

test('all star classes have a visual and physical profile', () => {
  for (const starClass of ['M', 'K', 'G', 'F', 'A', 'B', 'DA']) {
    assert.ok(STAR_PROFILES[starClass]);
    assert.ok(STAR_PROFILES[starClass].color.startsWith('#'));
    assert.ok(STAR_PROFILES[starClass].intensity > 0);
  }
});

test('unknown IDs safely use the first-planet fallback', () => {
  assert.equal(getPlanetSystemSpec('planet-999').id, 'planet-001');
});
