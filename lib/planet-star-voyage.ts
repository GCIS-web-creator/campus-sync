import type { StarClass } from '@/lib/planet-system-catalog';

// One world unit equals 10,000 km. The ship itself is 1 km long.
export const VOYAGE_SCALE = {
  kilometersPerUnit: 10_000,
  spacecraftLengthKm: 1,
  spacecraftLength: 1 / 10_000,
  lowOrbitAltitudeKm: 2_500,
  lowOrbitAltitude: 2_500 / 10_000,
  earthRadius: 6_371 / 10_000,
  moonRadius: 1_737.4 / 10_000,
  earthMoonDistance: 384_400 / 10_000,
  astronomicalUnit: 149_597_870.7 / 10_000,
  outerSystemDistance: 2.5 * (149_597_870.7 / 10_000),
} as const;

// The star is deliberately enlarged slightly for cinematic readability.
// A G-class star is enlarged to more than 150 Earth diameters across in the scene.
export const STAR_VISUAL_RADIUS_MULTIPLIER = 1.4;
export const STAR_CORONA_OUTER_RADIUS_SOLAR = 2.9;

// Ten times the former stellar orbital altitude:
// (3.18 - 1) solar radii × 10 + the star's own radius.
export const STAR_ORBIT_RADIUS_SOLAR = 22.8;

// A game-space exclusion boundary is used for the final tangent flyby.
// The flight corridor remains outside this boundary and never crosses the star.
export const STAR_GRAVITY_BOUNDARY_RADIUS_SOLAR = 20;
export const STAR_FLYBY_CLEARANCE_SOLAR = 0.8;
export const STAR_DEPARTURE_RADIUS_SOLAR = STAR_GRAVITY_BOUNDARY_RADIUS_SOLAR + STAR_FLYBY_CLEARANCE_SOLAR;

export const STAR_RADIUS_SOLAR_MULTIPLIERS: Record<StarClass, number> = {
  M: 0.45,
  K: 0.72,
  G: 1,
  F: 1.35,
  A: 1.75,
  B: 5,
  DA: 0.009,
};

export function getVoyageStarRadius(starClass: StarClass) {
  return 695_700 / VOYAGE_SCALE.kilometersPerUnit
    * STAR_RADIUS_SOLAR_MULTIPLIERS[starClass]
    * STAR_VISUAL_RADIUS_MULTIPLIER;
}

export function getLowOrbitRadius(bodyRadius: number) {
  return bodyRadius + VOYAGE_SCALE.lowOrbitAltitude;
}

// Aim just inside the geometric horizon, measured from the local nadir.
// This keeps the destination body in the cockpit frame while preserving a
// visible strip of sky and the day/night boundary.
export function getLowOrbitLookAngle(bodyRadius: number, orbitRadius: number) {
  if (!Number.isFinite(bodyRadius) || !Number.isFinite(orbitRadius) || bodyRadius <= 0 || orbitRadius <= bodyRadius) {
    throw new RangeError('Low-orbit framing requires a positive body radius and a higher orbit radius.');
  }
  return Math.asin(bodyRadius / orbitRadius) * 0.72;
}

// The lunar cockpit uses a panoramic composition that keeps both the Moon's
// limb and its parent planet in the same window.
export const MOON_ORBIT_COCKPIT_FOV_DEGREES = 100;

export function getStarCoronaOuterRadius(starRadius: number) {
  return starRadius * STAR_CORONA_OUTER_RADIUS_SOLAR;
}

export function getStarOrbitRadius(starRadius: number) {
  return starRadius * STAR_ORBIT_RADIUS_SOLAR;
}

export function getStarCoronaClearanceKm(starRadius: number) {
  return (getStarOrbitRadius(starRadius) - getStarCoronaOuterRadius(starRadius)) * VOYAGE_SCALE.kilometersPerUnit;
}

export function getStarDepartureRadius(starRadius: number) {
  return starRadius * STAR_DEPARTURE_RADIUS_SOLAR;
}

export function getStarDepartureClearanceKm(starRadius: number) {
  return (getStarDepartureRadius(starRadius) - getStarCoronaOuterRadius(starRadius)) * VOYAGE_SCALE.kilometersPerUnit;
}

export type StarTangentFlybyGeometry = {
  tangentX: number;
  tangentZ: number;
  directionX: number;
  directionZ: number;
  safeRadius: number;
};

export function getStarTangentFlybyGeometry(
  startX: number,
  startZ: number,
  starRadius: number,
): StarTangentFlybyGeometry {
  const distanceSquared = startX * startX + startZ * startZ;
  const safeRadius = getStarDepartureRadius(starRadius);
  if (distanceSquared <= safeRadius * safeRadius) {
    throw new RangeError('Star tangent flyby must begin outside the stellar gravity boundary.');
  }

  const radialScale = safeRadius * safeRadius / distanceSquared;
  const tangentScale = safeRadius * Math.sqrt(distanceSquared - safeRadius * safeRadius) / distanceSquared;
  const candidates = [-1, 1].map(sign => ({
    x: radialScale * startX + sign * tangentScale * -startZ,
    z: radialScale * startZ + sign * tangentScale * startX,
  }));
  // Pick the upper-side tangent so the star stays below the flight path.
  const tangent = candidates.reduce((best, candidate) => candidate.z > best.z ? candidate : best);
  const dx = tangent.x - startX;
  const dz = tangent.z - startZ;
  const length = Math.hypot(dx, dz);
  return {
    tangentX: tangent.x,
    tangentZ: tangent.z,
    directionX: dx / length,
    directionZ: dz / length,
    safeRadius,
  };
}

export function getWarpIntensity(phaseId: string, progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const smooth = (value: number) => {
    const x = Math.max(0, Math.min(1, value));
    return x * x * (3 - 2 * x);
  };
  if (phaseId === 'outer-cruise' || phaseId === 'planet-flyby-inbound' || phaseId === 'outer-departure') {
    return 0.96 * smooth(t / 0.28) * (1 - smooth((t - 0.72) / 0.28));
  }
  if (phaseId === 'planet-transfer' || phaseId === 'moon-transfer') {
    return 0.38 * Math.sin(Math.PI * t);
  }
  if (phaseId === 'star-skim') return 0.16 * Math.sin(Math.PI * t);
  return 0.025;
}

export function getApparentAngularDiameterDegrees(radius: number, centerDistance: number) {
  if (radius <= 0 || centerDistance <= radius) return 180;
  return 2 * Math.asin(radius / centerDistance) * 180 / Math.PI;
}

export const STAR_SYSTEM_VOYAGE_PHASES = [
  { id: 'outer-cruise', label: '星系外縁から亜光速巡航', durationMs: 30_000, laps: 0 },
  { id: 'planet-flyby-inbound', label: '惑星を横目に恒星へ向かう', durationMs: 24_000, laps: 0 },
  { id: 'star-orbit', label: '恒星コロナ外縁をゆっくり一周', durationMs: 48_000, laps: 1 },
  { id: 'planet-transfer', label: '惑星へフライバイ', durationMs: 30_000, laps: 0 },
  { id: 'planet-orbit', label: '惑星の地表2,500km上空を二周', durationMs: 72_000, laps: 2 },
  { id: 'moon-transfer', label: '衛星へフライバイ', durationMs: 30_000, laps: 0 },
  { id: 'moon-orbit', label: '衛星の地表2,500km上空をゆっくり一周', durationMs: 42_000, laps: 1 },
  { id: 'star-skim', label: '恒星の重力境界外を直進フライバイ', durationMs: 30_000, laps: 0 },
  { id: 'outer-departure', label: '恒星の重力圏に入らず星系外へ離脱', durationMs: 36_000, laps: 0 },
] as const;

export type StarSystemVoyagePhaseId = (typeof STAR_SYSTEM_VOYAGE_PHASES)[number]['id'];

export const STAR_SYSTEM_VOYAGE_DURATION_MS = STAR_SYSTEM_VOYAGE_PHASES.reduce(
  (total, phase) => total + phase.durationMs,
  0,
);
