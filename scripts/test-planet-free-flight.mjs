import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FREE_FLIGHT_DELTA_V_BUDGET_KM_S,
  FREE_FLIGHT_ENGINE_ACCELERATION_KM_S2,
  FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2,
  FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM,
  FREE_FLIGHT_START_ALTITUDE_KM,
  calculateGravityAccelerationKmS2,
  createInitialFreeFlightMotionState,
  getCircularOrbitSpeedKmS,
  stepFreeFlightMotion,
} from '../lib/planet-free-flight-physics.ts';

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
  assert.match(simulator, /CRAFT_VISUAL_LENGTH = 0\.00025/);
  assert.match(simulator, /logarithmicDepthBuffer: true/);
  assert.match(simulator, /PerspectiveCamera\(72, width \/ height, 0\.000000001, 340_000\)/);
  assert.match(simulator, /Math\.max\(0\.00000028, Math\.min\(0\.0000025/);
  assert.match(simulator, /inspectionRef = useRef\(\{ yaw: 0\.4, pitch: 0\.18, distance: 0\.00000065 \}\)/);
  assert.match(simulator, /'arrowup'/);
  assert.match(simulator, /keyName: 'w'/);
  assert.match(simulator, /keyName: 'q'/);
  assert.match(simulator, /keyName=" "/);
  assert.match(simulator, /NON-COMBAT EXPLORATION SIMULATOR/);
});
