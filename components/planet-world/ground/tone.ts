import * as THREE from 'three';
import type { PlanetSky } from '@/lib/planet-ground-climate';

/** height: 0 at the horizon, 1 at the zenith. */
export type SkyTone = (color: THREE.ColorRepresentation, height: number) => THREE.Color;

export function makeSkyTone(sky: PlanetSky): SkyTone {
  return (color, height) => {
    const result = new THREE.Color(color);
    if (!sky) return result;
    const hsl = { h: 0, s: 0, l: 0 };
    result.getHSL(hsl, THREE.SRGBColorSpace);
    const saturation = Math.min(1, Math.max(hsl.s, 0.35) * sky.saturation);
    const lightness = Math.min(Math.max(hsl.l, 0.9), hsl.l * (1 + sky.lift));
    const horizon = new THREE.Color().setHSL(sky.horizonHue / 360, saturation, lightness, THREE.SRGBColorSpace);
    const zenith = new THREE.Color().setHSL(sky.zenithHue / 360, saturation, lightness, THREE.SRGBColorSpace);
    // Blending the colours, not the hues, avoids stray bands between distant hues.
    return horizon.lerp(zenith, THREE.MathUtils.smoothstep(height, 0, 0.7));
  };
}
