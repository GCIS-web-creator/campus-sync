import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FREE_FLIGHT_DELTA_V_BUDGET_KM_S,
  FREE_FLIGHT_MAX_CRUISE_SPEED_KM_S,
  FREE_FLIGHT_SPEED_OF_LIGHT_KM_S,
  stepCruiseSpeedKmS,
  stepFreeFlightCruise,
  FREE_FLIGHT_ENGINE_ACCELERATION_KM_S2,
  FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2,
  FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM,
  FREE_FLIGHT_START_ALTITUDE_KM,
  calculateGravityAccelerationKmS2,
  createInitialFreeFlightMotionState,
  getCircularOrbitSpeedKmS,
  stepFreeFlightMotion,
} from '../lib/planet-free-flight-physics.ts';
import { getDirectionPointer } from '../lib/planet-free-flight-pointer.ts';

const length = (value) => Math.hypot(value.x, value.y, value.z);

test('free-flight start position and speed form a circular reference orbit at 2,500 km altitude', () => {
  const state = createInitialFreeFlightMotionState();
  const expectedRadius = FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM + FREE_FLIGHT_START_ALTITUDE_KM;
  assert.equal(length(state.positionKm), expectedRadius);
  assert.ok(Math.abs(length(state.velocityKmS) - getCircularOrbitSpeedKmS(FREE_FLIGHT_START_ALTITUDE_KM)) < 1e-10);
  assert.ok(Math.abs(length(state.velocityKmS) ** 2 / expectedRadius - FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2 / expectedRadius ** 2) < 1e-12);
  assert.equal(state.deltaVRemainingKmS, FREE_FLIGHT_DELTA_V_BUDGET_KM_S);
});

test('gravity acceleration follows the inverse-square law and points toward the planet', () => {
  const radius = FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM + 2_500;
  const acceleration = calculateGravityAccelerationKmS2(
    { x: 0, y: 0, z: radius },
    [{ positionKm: { x: 0, y: 0, z: 0 }, gravitationalParameterKm3S2: FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2 }],
  );
  assert.ok(acceleration.z < 0);
  assert.ok(Math.abs(length(acceleration) - FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2 / radius ** 2) < 1e-12);
});

test('unpowered motion conserves orbital energy within a small integration error', () => {
  let state = createInitialFreeFlightMotionState();
  const initialEnergy = length(state.velocityKmS) ** 2 / 2
    - FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2 / length(state.positionKm);
  const gravity = [{ positionKm: { x: 0, y: 0, z: 0 }, gravitationalParameterKm3S2: FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2 }];
  for (let index = 0; index < 600; index += 1) {
    state = stepFreeFlightMotion(state, {
      dtSeconds: 0.1,
      thrustDirection: { x: 0, y: 0, z: 0 },
      throttle: 0,
    }, gravity).state;
  }
  const finalEnergy = length(state.velocityKmS) ** 2 / 2
    - FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2 / length(state.positionKm);
  assert.ok(Math.abs(finalEnergy - initialEnergy) < 0.002);
  assert.equal(state.deltaVRemainingKmS, FREE_FLIGHT_DELTA_V_BUDGET_KM_S);
});

test('engine thrust changes velocity without an arbitrary top-speed clamp and consumes delta-v', () => {
  const start = createInitialFreeFlightMotionState();
  let state = { ...start, velocityKmS: { x: 7.6, y: 0, z: 0 } };
  for (let index = 0; index < 1_000; index += 1) {
    state = stepFreeFlightMotion(state, {
      dtSeconds: 0.1,
      thrustDirection: { x: 1, y: 0, z: 0 },
      throttle: 1,
    }, []).state;
  }
  assert.ok(state.velocityKmS.x > 7.6 + 0.29);
  assert.ok(state.velocityKmS.x < 7.6 + FREE_FLIGHT_ENGINE_ACCELERATION_KM_S2 * 100 + 1e-8);
  assert.ok(state.deltaVRemainingKmS < FREE_FLIGHT_DELTA_V_BUDGET_KM_S);
});

test('braking thrust is directed opposite the current velocity', () => {
  const state = {
    positionKm: { x: 100, y: 0, z: 0 },
    velocityKmS: { x: 8, y: -2, z: 0 },
    deltaVRemainingKmS: 18,
  };
  const result = stepFreeFlightMotion(state, {
    dtSeconds: 1,
    thrustDirection: { x: 0, y: 0, z: 0 },
    throttle: 0,
    brake: true,
  }, []);
  assert.ok(result.thrustAccelerationKmS2.x < 0);
  assert.ok(result.thrustAccelerationKmS2.y > 0);
  assert.ok(length(result.state.velocityKmS) < length(state.velocityKmS));
});

test('free-flight mode is separate from the existing MP cinematic voyage', () => {
  const panel = readFileSync(new URL('../components/Planet3DPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /viewMode==='free-flight'/);
  assert.match(panel, /<FreeFlightSimulator/);
  assert.match(panel, /<StarSystemVoyage/);
  assert.match(panel, /星系旅行 · 30MP/);
});

test('the piloted explorer remains a small spacecraft at the simulation scale', () => {
  const simulator = readFileSync(new URL('../components/planet-world/FreeFlightSimulator.tsx', import.meta.url), 'utf8');
  assert.match(simulator, /CRAFT_LENGTH_METERS = 100/);
  assert.match(simulator, /makeExplorationVessel\(renderer, resources\)/);
  assert.match(simulator, /logarithmicDepthBuffer: true/);
  assert.match(simulator, /PerspectiveCamera\(72, width \/ height, 0\.000000001, 340_000\)/);
  assert.match(simulator, /const metersToSceneUnits = \(meters: number\) => meters \/ \(KM_PER_SCENE_UNIT \* 1_000\)/);
  assert.match(simulator, /Math\.max\(metersToSceneUnits\(110\), Math\.min\(metersToSceneUnits\(2_500\)/);
  assert.match(simulator, /multiplyScalar\(metersToSceneUnits\(75\)\)\.addScaledVector\(chaseForward, metersToSceneUnits\(-170\)\)/);
  assert.match(simulator, /inspectionRef = useRef\(\{ yaw: 0\.6, pitch: 0\.35, distance: metersToSceneUnits\(210\) \}\)/);
  assert.match(simulator, /'arrowup'/);
  assert.match(simulator, /keyName: 'w'/);
  assert.match(simulator, /keyName: 'q'/);
  assert.match(simulator, /keyName=" "/);
  assert.match(simulator, /NON-COMBAT EXPLORATION SIMULATOR/);
});

test('arrow keys point the nose the pressed way and O / L drive the sub-light engine', () => {
  const simulator = readFileSync(new URL('../components/planet-world/FreeFlightSimulator.tsx', import.meta.url), 'utf8');
  assert.match(simulator, /pitchInput = \(keys\.has\('arrowup'\) \? 1 : 0\) - \(keys\.has\('arrowdown'\)/);
  assert.match(simulator, /yawInput = \(keys\.has\('arrowleft'\) \? 1 : 0\) - \(keys\.has\('arrowright'\)/);
  assert.match(simulator, /keyName="o"/);
  assert.match(simulator, /keyName="l"/);
});

test('the sub-light drive reaches 0.9c within twenty seconds and returns to a stop', () => {
  let speed = getCircularOrbitSpeedKmS(FREE_FLIGHT_START_ALTITUDE_KM);
  for (let frame = 0; frame < 20 * 60; frame += 1) speed = stepCruiseSpeedKmS(speed, 1, 1 / 60);
  assert.equal(speed, FREE_FLIGHT_MAX_CRUISE_SPEED_KM_S);
  assert.ok(speed < FREE_FLIGHT_SPEED_OF_LIGHT_KM_S);
  assert.equal(stepCruiseSpeedKmS(speed, 0, 1), speed);
  for (let frame = 0; frame < 20 * 60; frame += 1) speed = stepCruiseSpeedKmS(speed, -1, 1 / 60);
  assert.equal(speed, 0);
});

test('cruise velocity follows the nose without spending thruster delta-v', () => {
  const start = createInitialFreeFlightMotionState();
  const result = stepFreeFlightCruise(start, { dtSeconds: 0.05, forward: { x: 0, y: 2, z: 0 }, command: 1 });
  assert.equal(result.state.velocityKmS.x, 0);
  assert.ok(result.state.velocityKmS.y > length(start.velocityKmS));
  assert.equal(result.state.deltaVRemainingKmS, FREE_FLIGHT_DELTA_V_BUDGET_KM_S);
});

test('sub-light travel stops at a planet instead of tunnelling through it', () => {
  const planet = { positionKm: { x: 0, y: 0, z: 0 }, radiusKm: FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM };
  const state = {
    positionKm: { x: -10_000, y: 0, z: 0 },
    velocityKmS: { x: FREE_FLIGHT_MAX_CRUISE_SPEED_KM_S, y: 0, z: 0 },
    deltaVRemainingKmS: 18,
  };
  const toward = stepFreeFlightCruise(state, { dtSeconds: 0.1, forward: { x: 1, y: 0, z: 0 }, command: 0 }, [planet]);
  assert.equal(toward.impacted, true);
  assert.ok(Math.abs(toward.state.positionKm.x + FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM) < 1e-6);
  assert.equal(length(toward.state.velocityKmS), 0);
  const away = stepFreeFlightCruise(toward.state, { dtSeconds: 0.1, forward: { x: -1, y: 0, z: 0 }, command: 1 }, [planet]);
  assert.equal(away.impacted, false);
  assert.ok(away.state.positionKm.x < toward.state.positionKm.x);
});

test('the planet pointer marks a visible planet and otherwise points the way to turn', () => {
  const ahead = getDirectionPointer({ x: 0, y: 0, z: -10 }, 72, 1.5);
  assert.equal(ahead.onScreen, true);
  assert.deepEqual([ahead.x, ahead.y], [0, 0]);
  const right = getDirectionPointer({ x: 10, y: 0, z: -1 }, 72, 1.5);
  assert.equal(right.onScreen, false);
  assert.ok(Math.abs(right.angle) < 1e-12);
  const below = getDirectionPointer({ x: 0, y: -10, z: -1 }, 72, 1.5);
  assert.ok(Math.abs(below.angle - Math.PI / 2) < 1e-12);
  const behindLeft = getDirectionPointer({ x: -2, y: 0, z: 10 }, 72, 1.5);
  assert.equal(behindLeft.behind, true);
  assert.equal(behindLeft.onScreen, false);
  assert.ok(Math.abs(Math.abs(behindLeft.angle) - Math.PI) < 1e-12);
  assert.ok(Math.abs(getDirectionPointer({ x: 0, y: 0, z: 10 }, 72, 1.5).angle - Math.PI / 2) < 1e-12);
});
