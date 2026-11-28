// Which planets are warm enough for trees (about 10 to 40 °C), and the sky each of them has.
//
// The planet catalog stores no temperature. The classes below are judged from each
// planet's catalog description, and only 'temperate' planets get the stage views.

export type GroundClimate = 'temperate' | 'partial' | 'unknown' | 'unsuitable';

/** Hues in degrees. null keeps each scene's own reference colours. */
export type PlanetSky = { zenithHue: number; horizonHue: number; saturation: number; lift: number } | null;

const TEMPERATE_SKIES: Record<string, PlanetSky> = {
  'planet-001': null, // アスタリア: Earth-like blue
  'planet-002': { zenithHue: 184, horizonHue: 164, saturation: 1, lift: 0.08 }, // オケアナ: turquoise sea
  'planet-006': { zenithHue: 150, horizonHue: 105, saturation: 0.8, lift: 0.04 }, // ヴェルディア: forest green
  'planet-041': { zenithHue: 30, horizonHue: 46, saturation: 0.78, lift: 0.3 }, // エクアトリア: sand gold
  'planet-049': { zenithHue: 238, horizonHue: 14, saturation: 0.95, lift: 0.02 }, // アクアベル: deep ocean blue over desert coral
  'planet-050': { zenithHue: 200, horizonHue: 52, saturation: 1, lift: 0.1 }, // テラノヴァ: teal with a cream horizon
};

/** Planets where only part of the surface is mild, or where vegetation differs. */
const PARTIAL = new Set(['planet-011', 'planet-027', 'planet-033', 'planet-042', 'planet-044']);
/** Rocky worlds whose description gives no climate. */
const UNKNOWN = new Set(['planet-016', 'planet-023', 'planet-028', 'planet-037', 'planet-040', 'planet-046']);

export function getGroundClimate(planetAssetId: string): GroundClimate {
  if (Object.hasOwn(TEMPERATE_SKIES, planetAssetId)) return 'temperate';
  if (PARTIAL.has(planetAssetId)) return 'partial';
  if (UNKNOWN.has(planetAssetId)) return 'unknown';
  return 'unsuitable';
}

export function getPlanetSky(planetAssetId: string): PlanetSky {
  return TEMPERATE_SKIES[planetAssetId] ?? null;
}
