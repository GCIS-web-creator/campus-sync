export type Vector3Km = { x: number; y: number; z: number };

export type GravitySource = {
  positionKm: Vector3Km;
  gravitationalParameterKm3S2: number;
};

export type FreeFlightMotionState = {
  positionKm: Vector3Km;
  velocityKmS: Vector3Km;
  deltaVRemainingKmS: number;
};

export type FreeFlightMotionInput = {
  dtSeconds: number;
  thrustDirection: Vector3Km;
  throttle: number;
  brake?: boolean;
};

export type FreeFlightMotionResult = {
  state: FreeFlightMotionState;
  gravityAccelerationKmS2: Vector3Km;
  thrustAccelerationKmS2: Vector3Km;
};

export const FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM = 6_371;
export const FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2 = 398_600.4418;
export const FREE_FLIGHT_REFERENCE_MOON_RADIUS_KM = 1_737.4;
export const FREE_FLIGHT_REFERENCE_MOON_MU_KM3_S2 = 4_902.8;
export const FREE_FLIGHT_REFERENCE_MOON_DISTANCE_KM = 384_400;
export const FREE_FLIGHT_START_ALTITUDE_KM = 2_500;
export const FREE_FLIGHT_ENGINE_ACCELERATION_KM_S2 = 0.003; // 3 m/s²: fictional craft rating, not a real aircraft specification.
export const FREE_FLIGHT_DELTA_V_BUDGET_KM_S = 18;

export const FREE_FLIGHT_SPEED_OF_LIGHT_KM_S = 299_792.458;
// Fictional sub-light drive: acceleration grows with speed so one held key covers
// everything from orbital speed to 0.9c in under twenty seconds.
export const FREE_FLIGHT_MAX_CRUISE_SPEED_KM_S = FREE_FLIGHT_SPEED_OF_LIGHT_KM_S * 0.9;
export const FREE_FLIGHT_CRUISE_BASE_ACCELERATION_KM_S2 = 4;
export const FREE_FLIGHT_CRUISE_RESPONSE_PER_S = 0.6;

export type SphereObstacle = { positionKm: Vector3Km; radiusKm: number };

export type FreeFlightCruiseInput = {
  dtSeconds: number;
  forward: Vector3Km;
  /** 1 accelerates, -1 decelerates, values below -1 brake harder, 0 holds speed. */
  command: number;
};

const magnitude = (value: Vector3Km) => Math.hypot(value.x, value.y, value.z);
const add = (a: Vector3Km, b: Vector3Km): Vector3Km => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (value: Vector3Km, amount: number): Vector3Km => ({ x: value.x * amount, y: value.y * amount, z: value.z * amount });

export function getCircularOrbitSpeedKmS(
  altitudeKm: number,
  planetRadiusKm = FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM,
  gravitationalParameterKm3S2 = FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2,
) {
  const orbitalRadiusKm = planetRadiusKm + altitudeKm;
  if (!Number.isFinite(orbitalRadiusKm) || orbitalRadiusKm <= planetRadiusKm || !Number.isFinite(gravitationalParameterKm3S2) || gravitationalParameterKm3S2 <= 0) {
    throw new RangeError('Circular orbit speed requires a positive altitude and gravitational parameter.');
  }
  return Math.sqrt(gravitationalParameterKm3S2 / orbitalRadiusKm);
}

export function createInitialFreeFlightMotionState(): FreeFlightMotionState {
  const orbitalRadiusKm = FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM + FREE_FLIGHT_START_ALTITUDE_KM;
  return {
    positionKm: { x: 0, y: 0, z: orbitalRadiusKm },
    velocityKmS: { x: getCircularOrbitSpeedKmS(FREE_FLIGHT_START_ALTITUDE_KM), y: 0, z: 0 },
    deltaVRemainingKmS: FREE_FLIGHT_DELTA_V_BUDGET_KM_S,
  };
}

export function calculateGravityAccelerationKmS2(
  positionKm: Vector3Km,
  gravitySources: GravitySource[],
): Vector3Km {
  let acceleration: Vector3Km = { x: 0, y: 0, z: 0 };
  for (const source of gravitySources) {
    const offset = {
      x: positionKm.x - source.positionKm.x,
      y: positionKm.y - source.positionKm.y,
      z: positionKm.z - source.positionKm.z,
    };
    const distanceKm = Math.max(magnitude(offset), 1);
    const factor = -source.gravitationalParameterKm3S2 / (distanceKm * distanceKm * distanceKm);
    acceleration = add(acceleration, scale(offset, factor));
  }
  return acceleration;
}

export function stepFreeFlightMotion(
  state: FreeFlightMotionState,
  input: FreeFlightMotionInput,
  gravitySources: GravitySource[],
): FreeFlightMotionResult {
  const dtSeconds = Math.max(0, Math.min(1, input.dtSeconds));
  const gravityAccelerationKmS2 = calculateGravityAccelerationKmS2(state.positionKm, gravitySources);
  const velocityMagnitude = magnitude(state.velocityKmS);
  const brake = Boolean(input.brake) && velocityMagnitude > 1e-8;
  const requestedDirection = brake
    ? scale(state.velocityKmS, -1 / Math.max(velocityMagnitude, 1e-8))
    : input.thrustDirection;
  const directionMagnitude = magnitude(requestedDirection);
  const throttle = brake ? 1 : Math.max(0, Math.min(1, input.throttle));
  const thrusting = directionMagnitude > 1e-8 && throttle > 0 && state.deltaVRemainingKmS > 0;
  const requestedAcceleration = thrusting ? FREE_FLIGHT_ENGINE_ACCELERATION_KM_S2 * throttle : 0;
  const requestedDeltaV = requestedAcceleration * dtSeconds;
  const appliedFraction = requestedDeltaV > 0
    ? Math.min(1, state.deltaVRemainingKmS / requestedDeltaV)
    : 0;
  const thrustAccelerationKmS2 = thrusting
    ? scale(requestedDirection, (requestedAcceleration * appliedFraction) / directionMagnitude)
    : { x: 0, y: 0, z: 0 };
  const deltaVRemainingKmS = Math.max(0, state.deltaVRemainingKmS - requestedDeltaV * appliedFraction);
  const totalAcceleration = add(gravityAccelerationKmS2, thrustAccelerationKmS2);
  const velocityKmS = add(state.velocityKmS, scale(totalAcceleration, dtSeconds));
  const positionKm = add(state.positionKm, scale(velocityKmS, dtSeconds));

  return {
    state: {
      positionKm,
      velocityKmS,
      deltaVRemainingKmS,
    },
    gravityAccelerationKmS2,
    thrustAccelerationKmS2,
  };
}

export function stepCruiseSpeedKmS(speedKmS: number, command: number, dtSeconds: number) {
  const speed = Math.max(0, speedKmS);
  const dt = Math.max(0, Math.min(1, dtSeconds));
  const rate = FREE_FLIGHT_CRUISE_BASE_ACCELERATION_KM_S2 + FREE_FLIGHT_CRUISE_RESPONSE_PER_S * speed;
  return Math.max(0, Math.min(FREE_FLIGHT_MAX_CRUISE_SPEED_KM_S, speed + command * rate * dt));
}

/**
 * First point where the straight path from start to end enters an obstacle.
 * Needed because at sub-light speed one frame can cross a whole planet.
 */
export function findSphereImpactKm(startKm: Vector3Km, endKm: Vector3Km, obstacles: SphereObstacle[]) {
  const path = add(endKm, scale(startKm, -1));
  const a = path.x ** 2 + path.y ** 2 + path.z ** 2;
  if (a <= 0) return null;
  let first: { fraction: number; obstacle: SphereObstacle } | null = null;
  for (const obstacle of obstacles) {
    const offset = add(startKm, scale(obstacle.positionKm, -1));
    const b = offset.x * path.x + offset.y * path.y + offset.z * path.z;
    if (b >= 0) continue; // moving away
    const c = magnitude(offset) ** 2 - obstacle.radiusKm ** 2;
    const discriminant = b * b - a * c;
    if (discriminant < 0) continue;
    const fraction = Math.max(0, (-b - Math.sqrt(discriminant)) / a);
    if (fraction <= 1 && (!first || fraction < first.fraction)) first = { fraction, obstacle };
  }
  if (!first) return null;
  const point = add(startKm, scale(path, first.fraction));
  const outward = add(point, scale(first.obstacle.positionKm, -1));
  const surface = scale(outward, first.obstacle.radiusKm / Math.max(magnitude(outward), 1e-8));
  return { positionKm: add(first.obstacle.positionKm, surface), obstacle: first.obstacle };
}

/** Flight-assisted sub-light travel: velocity always follows the nose. */
export function stepFreeFlightCruise(
  state: FreeFlightMotionState,
  input: FreeFlightCruiseInput,
  obstacles: SphereObstacle[] = [],
) {
  const dtSeconds = Math.max(0, Math.min(1, input.dtSeconds));
  const length = magnitude(input.forward);
  const forward = length > 1e-8 ? scale(input.forward, 1 / length) : { x: 0, y: 0, z: 0 };
  const speedBefore = magnitude(state.velocityKmS);
  const speed = stepCruiseSpeedKmS(speedBefore, input.command, dtSeconds);
  const end = add(state.positionKm, scale(forward, speed * dtSeconds));
  const impact = findSphereImpactKm(state.positionKm, end, obstacles);
  return {
    state: {
      positionKm: impact ? impact.positionKm : end,
      velocityKmS: impact ? { x: 0, y: 0, z: 0 } : scale(forward, speed),
      deltaVRemainingKmS: state.deltaVRemainingKmS,
    } satisfies FreeFlightMotionState,
    accelerationKmS2: dtSeconds > 0 ? (speed - speedBefore) / dtSeconds : 0,
    impacted: Boolean(impact),
  };
}
