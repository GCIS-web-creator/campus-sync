import type { StarClass } from '@/lib/planet-system-catalog';

// One world unit equals 10,000 km. The ship itself is 1 km long, so its
// length is intentionally tiny compared with a planet, moon or star.
export const VOYAGE_SCALE = {
  kilometersPerUnit: 10_000,
  spacecraftLengthKm: 1,
  spacecraftLength: 1 / 10_000,
  lowOrbitAltitudeKm: 100,
  lowOrbitAltitude: 100 / 10_000,
  earthRadius: 6_371 / 10_000,
  moonRadius: 1_737.4 / 10_000,
  earthMoonDistance: 384_400 / 10_000,
  astronomicalUnit: 149_597_870.7 / 10_000,
  outerSystemDistance: 2.5 * (149_597_870.7 / 10_000),
} as const;

// The main corona material extends to 2.9 stellar radii. The ship flies
// just outside that visible envelope, not hundreds of thousands of km away
// from the star as in the previous camera path.
export const STAR_CORONA_OUTER_RADIUS_SOLAR = 2.9;
export const STAR_ORBIT_RADIUS_SOLAR = 3.18;
export const STAR_DEPARTURE_RADIUS_SOLAR = 3.62;

export function getStarDepartureRadius(starRadius: number) {
  return starRadius * STAR_DEPARTURE_RADIUS_SOLAR;
}

export function getStarDepartureClearanceKm(starRadius: number) {
  return (getStarDepartureRadius(starRadius) - getStarCoronaOuterRadius(starRadius)) * VOYAGE_SCALE.kilometersPerUnit;
}

export function getWarpIntensity(phaseId: string, progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const smooth = (value: number) => value * value * (3 - 2 * value);
  if (phaseId === 'outer-cruise' || phaseId === 'planet-flyby-inbound' || phaseId === 'outer-departure') {
    return 0.96 * smooth(t / 0.28) * (1 - smooth((t - 0.72) / 0.28));
  }
  if (phaseId === 'planet-transfer' || phaseId === 'moon-transfer') {
    return 0.38 * Math.sin(Math.PI * t);
  }
  if (phaseId === 'star-skim') return 0.16 * Math.sin(Math.PI * t);
  return 0.025;
}

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
  return 695_700 / VOYAGE_SCALE.kilometersPerUnit * STAR_RADIUS_SOLAR_MULTIPLIERS[starClass];
}

export function getLowOrbitRadius(bodyRadius: number) {
  return bodyRadius + VOYAGE_SCALE.lowOrbitAltitude;
}

export function getStarCoronaOuterRadius(starRadius: number) {
  return starRadius * STAR_CORONA_OUTER_RADIUS_SOLAR;
}

export function getStarOrbitRadius(starRadius: number) {
  return starRadius * STAR_ORBIT_RADIUS_SOLAR;
}

export function getStarCoronaClearanceKm(starRadius: number) {
  return (getStarOrbitRadius(starRadius) - getStarCoronaOuterRadius(starRadius)) * VOYAGE_SCALE.kilometersPerUnit;
}

export function getApparentAngularDiameterDegrees(radius: number, centerDistance: number) {
  if (radius <= 0 || centerDistance <= radius) return 180;
  return 2 * Math.asin(radius / centerDistance) * 180 / Math.PI;
}

export const STAR_SYSTEM_VOYAGE_PHASES = [
  { id: 'outer-cruise', label: '星系外縁から亜光速巡航', durationMs: 10_000, laps: 0 },
  { id: 'planet-flyby-inbound', label: '惑星を横目に恒星へ向かう', durationMs: 8_000, laps: 0 },
  { id: 'star-orbit', label: '恒星コロナ外縁をゆっくり一周', durationMs: 16_000, laps: 1 },
  { id: 'planet-transfer', label: '惑星へフライバイ', durationMs: 10_000, laps: 0 },
  { id: 'planet-orbit', label: '惑星の地表100km上空を二周', durationMs: 24_000, laps: 2 },
  { id: 'moon-transfer', label: '衛星へフライバイ', durationMs: 10_000, laps: 0 },
  { id: 'moon-orbit', label: '衛星の地表100km上空をゆっくり一周', durationMs: 14_000, laps: 1 },
  { id: 'star-skim', label: '恒星コロナ外縁を再びかすめる', durationMs: 10_000, laps: 0 },
  { id: 'outer-departure', label: '亜光速で星系外へ離脱', durationMs: 12_000, laps: 0 },] as const;

export type StarSystemVoyagePhaseId = (typeof STAR_SYSTEM_VOYAGE_PHASES)[number]['id'];

export const STAR_SYSTEM_VOYAGE_DURATION_MS = STAR_SYSTEM_VOYAGE_PHASES.reduce(
  (total, phase) => total + phase.durationMs,
  0,
);
