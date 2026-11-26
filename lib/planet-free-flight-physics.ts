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
