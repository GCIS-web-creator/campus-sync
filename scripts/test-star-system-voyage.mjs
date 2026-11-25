import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getVoyageStarRadius,
  STAR_SYSTEM_VOYAGE_DURATION_MS,
  STAR_SYSTEM_VOYAGE_PHASES,
  VOYAGE_SCALE,
} from '../lib/planet-star-voyage.ts';

test('voyage follows the requested celestial route in order', () => {
  assert.deepEqual(STAR_SYSTEM_VOYAGE_PHASES.map(phase => phase.id), [
    'outer-cruise',
    'planet-flyby-inbound',
    'star-orbit',
    'planet-transfer',
    'planet-orbit',
    'moon-transfer',
    'moon-orbit',
    'star-skim',
    'outer-departure',
  ]);
  assert.equal(STAR_SYSTEM_VOYAGE_PHASES.find(phase => phase.id === 'star-orbit')?.laps, 1);
  assert.equal(STAR_SYSTEM_VOYAGE_PHASES.find(phase => phase.id === 'planet-orbit')?.laps, 2);
  assert.equal(STAR_SYSTEM_VOYAGE_PHASES.find(phase => phase.id === 'moon-orbit')?.laps, 1);
});

test('voyage uses Earth–Moon–Sun approximate physical scale ratios', () => {
  assert.ok(VOYAGE_SCALE.earthMoonDistance / VOYAGE_SCALE.earthRadius > 60);
  assert.ok(VOYAGE_SCALE.astronomicalUnit / VOYAGE_SCALE.earthRadius > 23_000);
  assert.ok(VOYAGE_SCALE.outerSystemDistance > VOYAGE_SCALE.astronomicalUnit * 2);
  assert.ok(getVoyageStarRadius('G') / VOYAGE_SCALE.earthRadius > 100);
  assert.ok(getVoyageStarRadius('K') / VOYAGE_SCALE.earthRadius > 70);
});

test('journey is long enough to read as a multi-stage automated flight', () => {
  assert.ok(STAR_SYSTEM_VOYAGE_DURATION_MS >= 55_000);
  assert.ok(STAR_SYSTEM_VOYAGE_DURATION_MS <= 70_000);
});
