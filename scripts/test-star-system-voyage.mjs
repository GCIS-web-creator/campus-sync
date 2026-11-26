import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getApparentAngularDiameterDegrees,
  getLowOrbitRadius,
  getStarCoronaClearanceKm,
  getStarCoronaOuterRadius,
  getStarDepartureClearanceKm,
  getStarDepartureRadius,
  getStarTangentFlybyGeometry,
  getStarOrbitRadius,
  getWarpIntensity,
  getVoyageStarRadius,
  STAR_CORONA_OUTER_RADIUS_SOLAR,
  STAR_GRAVITY_BOUNDARY_RADIUS_SOLAR,
  STAR_ORBIT_RADIUS_SOLAR,
  STAR_DEPARTURE_RADIUS_SOLAR,
  STAR_VISUAL_RADIUS_MULTIPLIER,
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
  assert.equal(VOYAGE_SCALE.lowOrbitAltitudeKm, 500);
  assert.equal((VOYAGE_SCALE.earthRadius * 2) / VOYAGE_SCALE.spacecraftLength, 12_742);
  assert.ok(Math.abs((VOYAGE_SCALE.moonRadius * 2) / VOYAGE_SCALE.spacecraftLength - 3_474.8) < 0.01);
  assert.ok(Math.abs((getVoyageStarRadius('G') * 2) / VOYAGE_SCALE.spacecraftLength - 1_739_250) < 1);
  assert.ok(getVoyageStarRadius('G') / VOYAGE_SCALE.earthRadius > 130);
  assert.equal(STAR_VISUAL_RADIUS_MULTIPLIER, 1.25);
  assert.ok(getVoyageStarRadius('K') / VOYAGE_SCALE.earthRadius > 70);
});

test('planet and moon camera paths are exactly 500 km above the physical surface', () => {
  const planetOrbitRadius = getLowOrbitRadius(VOYAGE_SCALE.earthRadius);
  const moonOrbitRadius = getLowOrbitRadius(VOYAGE_SCALE.moonRadius);
  assert.ok(Math.abs((planetOrbitRadius - VOYAGE_SCALE.earthRadius) * VOYAGE_SCALE.kilometersPerUnit - 500) < 1e-9);
  assert.ok(Math.abs((moonOrbitRadius - VOYAGE_SCALE.moonRadius) * VOYAGE_SCALE.kilometersPerUnit - 500) < 1e-9);
  assert.equal(VOYAGE_SCALE.lowOrbitAltitude / VOYAGE_SCALE.spacecraftLength, 500);
});

test('stellar path circles just outside the rendered corona', () => {
  const starRadius = getVoyageStarRadius('G');
  const coronaRadius = getStarCoronaOuterRadius(starRadius);
  const orbitRadius = getStarOrbitRadius(starRadius);
  assert.equal(STAR_CORONA_OUTER_RADIUS_SOLAR, 2.9);
  assert.equal(STAR_ORBIT_RADIUS_SOLAR, 22.8);
  assert.equal(STAR_GRAVITY_BOUNDARY_RADIUS_SOLAR, 20);
  assert.equal(STAR_DEPARTURE_RADIUS_SOLAR, 20.8);
  assert.ok(orbitRadius > getStarDepartureRadius(starRadius));
  assert.ok(orbitRadius > coronaRadius);
  assert.ok(getStarCoronaClearanceKm(starRadius) > 0);
  assert.ok(getApparentAngularDiameterDegrees(starRadius, orbitRadius) > 4.5);
  assert.ok(getApparentAngularDiameterDegrees(starRadius, orbitRadius) < 5.8);
});

test('star departure route begins outside the corona and never cuts across the star', () => {
  const starRadius = getVoyageStarRadius('G');
  assert.ok(getStarDepartureRadius(starRadius) > getStarCoronaOuterRadius(starRadius));
  assert.ok(getStarOrbitRadius(starRadius) > getStarDepartureRadius(starRadius));
  assert.ok(getStarDepartureClearanceKm(starRadius) > 0);
});

test('final stellar pass is a straight tangent outside the gravity boundary', () => {
  const starRadius = getVoyageStarRadius('G');
  const startX = -VOYAGE_SCALE.astronomicalUnit;
  const startZ = VOYAGE_SCALE.earthMoonDistance;
  const path = getStarTangentFlybyGeometry(startX, startZ, starRadius);
  const tangentDistance = Math.hypot(path.tangentX, path.tangentZ);
  const tangentDot = path.tangentX * path.directionX + path.tangentZ * path.directionZ;
  assert.ok(Math.abs(tangentDistance - path.safeRadius) < 1e-6);
  assert.ok(path.safeRadius > starRadius * STAR_GRAVITY_BOUNDARY_RADIUS_SOLAR);
  assert.ok(Math.abs(tangentDot) < 1e-6, 'route direction must be tangent to the stellar boundary');
});

test('warp animation ramps up and fades smoothly around acceleration phases', () => {
  assert.ok(getWarpIntensity('outer-cruise', 0.5) > 0.9);
  assert.ok(getWarpIntensity('planet-flyby-inbound', 0.5) > 0.9);
  assert.ok(getWarpIntensity('outer-departure', 0.5) > 0.9);
  assert.equal(getWarpIntensity('planet-orbit', 0.5), 0.025);
  assert.ok(getWarpIntensity('moon-transfer', 0.5) > getWarpIntensity('moon-transfer', 0));
});

test('the parent planet remains visible from a low lunar orbit at physical scale', () => {
  const distance = VOYAGE_SCALE.earthMoonDistance - VOYAGE_SCALE.moonRadius - VOYAGE_SCALE.lowOrbitAltitude;
  const apparentDiameter = getApparentAngularDiameterDegrees(VOYAGE_SCALE.earthRadius, distance);
  assert.ok(apparentDiameter > 1.8 && apparentDiameter < 2.1);
});

test('journey is long enough to read as a multi-stage automated flight', () => {
  assert.equal(STAR_SYSTEM_VOYAGE_DURATION_MS, 342_000);
  assert.equal(STAR_SYSTEM_VOYAGE_PHASES.find(phase => phase.id === 'planet-orbit')?.durationMs, 72_000);
  assert.equal(STAR_SYSTEM_VOYAGE_PHASES.find(phase => phase.id === 'moon-orbit')?.durationMs, 42_000);
  assert.equal(STAR_SYSTEM_VOYAGE_PHASES.find(phase => phase.id === 'star-orbit')?.durationMs, 48_000);
});
