import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getApparentAngularDiameterDegrees,
  getLowOrbitRadius,
  getStarCoronaClearanceKm,
  getStarCoronaOuterRadius,
  getStarOrbitRadius,
  getVoyageStarRadius,
  STAR_CORONA_OUTER_RADIUS_SOLAR,
  STAR_ORBIT_RADIUS_SOLAR,
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

test('voyage retains Earth–Moon–Sun and 1 km ship scale ratios', () => {
  assert.ok(VOYAGE_SCALE.earthMoonDistance / VOYAGE_SCALE.earthRadius > 60);
  assert.ok(VOYAGE_SCALE.astronomicalUnit / VOYAGE_SCALE.earthRadius > 23_000);
  assert.ok(VOYAGE_SCALE.outerSystemDistance > VOYAGE_SCALE.astronomicalUnit * 2);
  assert.equal(VOYAGE_SCALE.spacecraftLengthKm, 1);
  assert.equal(VOYAGE_SCALE.lowOrbitAltitudeKm, 10);
  assert.equal((VOYAGE_SCALE.earthRadius * 2) / VOYAGE_SCALE.spacecraftLength, 12_742);
  assert.ok(Math.abs((VOYAGE_SCALE.moonRadius * 2) / VOYAGE_SCALE.spacecraftLength - 3_474.8) < 0.01);
  assert.ok(Math.abs((getVoyageStarRadius('G') * 2) / VOYAGE_SCALE.spacecraftLength - 1_391_400) < 1);
  assert.ok(getVoyageStarRadius('G') / VOYAGE_SCALE.earthRadius > 100);
  assert.ok(getVoyageStarRadius('K') / VOYAGE_SCALE.earthRadius > 70);
});

test('planet and moon camera paths are exactly 10 km above the physical surface', () => {
  const planetOrbitRadius = getLowOrbitRadius(VOYAGE_SCALE.earthRadius);
  const moonOrbitRadius = getLowOrbitRadius(VOYAGE_SCALE.moonRadius);
  assert.ok(Math.abs((planetOrbitRadius - VOYAGE_SCALE.earthRadius) * VOYAGE_SCALE.kilometersPerUnit - 10) < 1e-9);
  assert.ok(Math.abs((moonOrbitRadius - VOYAGE_SCALE.moonRadius) * VOYAGE_SCALE.kilometersPerUnit - 10) < 1e-9);
  assert.equal(VOYAGE_SCALE.lowOrbitAltitude / VOYAGE_SCALE.spacecraftLength, 10);
});

test('stellar path circles just outside the rendered corona', () => {
  const starRadius = getVoyageStarRadius('G');
  const coronaRadius = getStarCoronaOuterRadius(starRadius);
  const orbitRadius = getStarOrbitRadius(starRadius);
  assert.equal(STAR_CORONA_OUTER_RADIUS_SOLAR, 2.9);
  assert.equal(STAR_ORBIT_RADIUS_SOLAR, 3.18);
  assert.ok(orbitRadius > coronaRadius);
  assert.ok(getStarCoronaClearanceKm(starRadius) > 0);
  assert.ok(getApparentAngularDiameterDegrees(starRadius, orbitRadius) > 30);
  assert.ok(getApparentAngularDiameterDegrees(starRadius, orbitRadius) < 40);
});

test('the parent planet remains visible from a low lunar orbit at physical scale', () => {
  const distance = VOYAGE_SCALE.earthMoonDistance - VOYAGE_SCALE.moonRadius - VOYAGE_SCALE.lowOrbitAltitude;
  const apparentDiameter = getApparentAngularDiameterDegrees(VOYAGE_SCALE.earthRadius, distance);
  assert.ok(apparentDiameter > 1.8 && apparentDiameter < 2.1);
});

test('journey is long enough to read as a multi-stage automated flight', () => {
  assert.ok(STAR_SYSTEM_VOYAGE_DURATION_MS >= 55_000);
  assert.ok(STAR_SYSTEM_VOYAGE_DURATION_MS <= 70_000);
});
