const ROOT = '/planet-world/planet-catalog-v50/planets';

const CLOUD_PLANET_IDS = new Set([21, 23, 24, 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
const EMISSIVE_PLANET_IDS = new Set([21, 26, 38, 42, 43]);
const RING_PLANET_IDS = new Set([34]);

function numericId(planetAssetId: string): number {
  const match = /^planet-(\d{3})$/.exec(planetAssetId);
  return match ? Number(match[1]) : 0;
}

export function getPlanetSurfaceTextureUrl(planetAssetId: string): string {
  const id = numericId(planetAssetId);
  if (id >= 21 && id <= 50) return `${ROOT}/${planetAssetId}/surface.webp`;
  if (id >= 11 && id <= 20) return `/planet-assets/planets/${planetAssetId}/surface.webp`;
  return `/planet-assets/planets/${planetAssetId}/surface.jpg`;
}

export function hasPlanetCatalogV50Texture(planetAssetId: string, role: 'clouds' | 'emissive' | 'ring'): boolean {
  const id = numericId(planetAssetId);
  if (id < 21 || id > 50) return false;
  if (role === 'clouds') return CLOUD_PLANET_IDS.has(id);
  if (role === 'emissive') return EMISSIVE_PLANET_IDS.has(id);
  return RING_PLANET_IDS.has(id);
}

export function getPlanetCatalogV50TextureUrl(planetAssetId: string, role: 'clouds' | 'emissive' | 'ring'): string {
  return `${ROOT}/${planetAssetId}/${role}.webp`;
}
