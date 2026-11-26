import { readFileSync } from 'node:fs';
import { makeDeepSky, makeStarCorona, makeStarSurfaceMaterial } from '../components/planet-world/space-effects.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getApparentAngularDiameterDegrees,
  getLowOrbitLookAngle,
  getLowOrbitRadius,
  MOON_ORBIT_COCKPIT_FOV_DEGREES,
  MOON_ORBIT_VIEW_BISECTOR_DEGREES,
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
  assert.equal(VOYAGE_SCALE.lowOrbitAltitudeKm, 2_500);
  assert.equal((VOYAGE_SCALE.earthRadius * 2) / VOYAGE_SCALE.spacecraftLength, 12_742);
  assert.ok(Math.abs((VOYAGE_SCALE.moonRadius * 2) / VOYAGE_SCALE.spacecraftLength - 3_474.8) < 0.01);
  assert.ok(Math.abs((getVoyageStarRadius('G') * 2) / VOYAGE_SCALE.spacecraftLength - 1_947_960) < 1);
  assert.ok(getVoyageStarRadius('G') / VOYAGE_SCALE.earthRadius > 150);
  assert.equal(STAR_VISUAL_RADIUS_MULTIPLIER, 1.4);
  assert.ok(getVoyageStarRadius('K') / VOYAGE_SCALE.earthRadius > 70);
});

test('planet and moon camera paths are exactly 2,500 km above the physical surface', () => {
  const planetOrbitRadius = getLowOrbitRadius(VOYAGE_SCALE.earthRadius);
  const moonOrbitRadius = getLowOrbitRadius(VOYAGE_SCALE.moonRadius);
  assert.ok(Math.abs((planetOrbitRadius - VOYAGE_SCALE.earthRadius) * VOYAGE_SCALE.kilometersPerUnit - 2_500) < 1e-9);
  assert.ok(Math.abs((moonOrbitRadius - VOYAGE_SCALE.moonRadius) * VOYAGE_SCALE.kilometersPerUnit - 2_500) < 1e-9);
  assert.equal(VOYAGE_SCALE.lowOrbitAltitude / VOYAGE_SCALE.spacecraftLength, 2_500);
});

test('orbit views keep the body horizon and parent planet inside the cockpit frame', () => {
  const planetOrbitRadius = getLowOrbitRadius(VOYAGE_SCALE.earthRadius);
  const moonOrbitRadius = getLowOrbitRadius(VOYAGE_SCALE.moonRadius);
  const planetHorizonAngle = Math.asin(VOYAGE_SCALE.earthRadius / planetOrbitRadius);
  const moonHorizonAngle = Math.asin(VOYAGE_SCALE.moonRadius / moonOrbitRadius);
  const planetLookAngle = getLowOrbitLookAngle(VOYAGE_SCALE.earthRadius, planetOrbitRadius);
  const moonLookAngle = getLowOrbitLookAngle(VOYAGE_SCALE.moonRadius, moonOrbitRadius);

  assert.ok(planetLookAngle > 0 && planetLookAngle < planetHorizonAngle);
  assert.ok(moonLookAngle > 0 && moonLookAngle < moonHorizonAngle);
  assert.ok(Math.abs(planetLookAngle / planetHorizonAngle - 0.72) < 1e-12);
  assert.ok(Math.abs(moonLookAngle / moonHorizonAngle - 0.72) < 1e-12);

  const moonAngularRadius = Math.asin(VOYAGE_SCALE.moonRadius / moonOrbitRadius) * 180 / Math.PI;
  const viewToNadirAngle = Math.acos(
    Math.cos(MOON_ORBIT_VIEW_BISECTOR_DEGREES * Math.PI / 180) * Math.cos(moonLookAngle),
  ) * 180 / Math.PI;
  const parentDirectionOffset = MOON_ORBIT_VIEW_BISECTOR_DEGREES;
  const moonVisibleLimbOffset = Math.max(0, viewToNadirAngle - moonAngularRadius);
  const parentPlanetDistance = VOYAGE_SCALE.earthMoonDistance - VOYAGE_SCALE.moonRadius - VOYAGE_SCALE.lowOrbitAltitude;
  const parentPlanetDiameter = getApparentAngularDiameterDegrees(VOYAGE_SCALE.earthRadius, parentPlanetDistance);
  const halfFov = MOON_ORBIT_COCKPIT_FOV_DEGREES / 2;

  assert.equal(MOON_ORBIT_VIEW_BISECTOR_DEGREES, 45);
  assert.equal(MOON_ORBIT_COCKPIT_FOV_DEGREES, 100);
  assert.ok(parentDirectionOffset + parentPlanetDiameter / 2 < halfFov, 'parent planet remains visible above the lunar horizon');
  assert.ok(moonVisibleLimbOffset < halfFov, 'the lunar limb remains visible below the parent planet');
  assert.ok(parentPlanetDiameter > 1.8 && parentPlanetDiameter < 2.1);
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

  // The inbound segment, tangent point and long outbound leg all share one
  // straight vector and remain outside the stellar exclusion circle.
  const inboundLength = Math.hypot(path.tangentX - startX, path.tangentZ - startZ);
  const outboundLength = VOYAGE_SCALE.outerSystemDistance * 2.4;
  for (let step = 0; step <= 100; step += 1) {
    const t = step / 100;
    const inboundX = startX + path.directionX * inboundLength * t;
    const inboundZ = startZ + path.directionZ * inboundLength * t;
    const outboundX = path.tangentX + path.directionX * outboundLength * t;
    const outboundZ = path.tangentZ + path.directionZ * outboundLength * t;
    assert.ok(Math.hypot(inboundX, inboundZ) >= path.safeRadius - 1e-6);
    assert.ok(Math.hypot(outboundX, outboundZ) >= path.safeRadius - 1e-6);
  }
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

test('journey keeps the requested one-third speed and five-minute-forty-two-second duration', () => {
  assert.equal(STAR_SYSTEM_VOYAGE_DURATION_MS, 342_000);
  assert.equal(STAR_SYSTEM_VOYAGE_PHASES.find(phase => phase.id === 'planet-orbit')?.durationMs, 72_000);
  assert.equal(STAR_SYSTEM_VOYAGE_PHASES.find(phase => phase.id === 'moon-orbit')?.durationMs, 42_000);
  assert.equal(STAR_SYSTEM_VOYAGE_PHASES.find(phase => phase.id === 'star-orbit')?.durationMs, 48_000);
});

test('star surface and corona are animated self-luminous shaders', () => {
  const resources = [];
  const surface = makeStarSurfaceMaterial('#ffb45a', 17, resources);
  const corona = makeStarCorona(10, 29, '#ff8a4c', 17, resources);
  assert.equal(surface.material.lights, false);
  assert.match(surface.material.fragmentShader, /logdepthbuf_fragment/);
  assert.doesNotMatch(surface.material.fragmentShader, /uSun|daylight|terminator/i);
  assert.equal(corona.mesh.material.transparent, true);
  assert.equal(corona.mesh.material.depthWrite, false);
  assert.equal(corona.mesh.geometry.parameters.radius, 29);
  surface.update(14.5);
  corona.update(14.5);
  assert.equal(surface.material.uniforms.uTime.value, 14.5);
  assert.equal(corona.mesh.material.uniforms.uTime.value, 14.5);
  resources.forEach(resource => resource.dispose());
});

test('deep sky is drawn behind every body and converts colours for display', () => {
  const resources = [];
  const sky = makeDeepSky(31, resources);
  assert.ok(sky.renderOrder < 0);
  assert.equal(sky.frustumCulled, false);
  assert.equal(sky.material.transparent, false);
  assert.equal(sky.material.depthTest, false);
  assert.equal(sky.material.depthWrite, false);
  assert.match(sky.material.fragmentShader, /#include <colorspace_fragment>/);
  resources.forEach(resource => resource.dispose());
});

test('planet orbit, voyage and free flight share the same space shaders', () => {
  for (const file of ['Planet3DPanel.tsx', 'planet-world/StarSystemVoyage.tsx', 'planet-world/FreeFlightSimulator.tsx']) {
    const source = readFileSync(new URL('../components/' + file, import.meta.url), 'utf8');
    for (const name of ['makeDeepSky', 'makeStarSurfaceMaterial', 'makeStarCorona']) {
      assert.ok(source.includes(name + '('), file + ' should use ' + name);
    }
  }
});
