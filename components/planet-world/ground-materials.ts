import * as THREE from 'three';
import { fractalNoise, valueNoise, type PlanetGroundTheme } from '@/lib/planet-ground';

type Resources = Array<{ dispose: () => void }>;

export const GROUND_TEXTURE_SIZE = 512;

type TileSet = { color: THREE.DataTexture; normal: THREE.DataTexture; rough: THREE.DataTexture };

function toTexture(data: Uint8Array<ArrayBuffer>, colorSpace: THREE.ColorSpace, anisotropy: number, resources: Resources) {
  const texture = new THREE.DataTexture(data, GROUND_TEXTURE_SIZE, GROUND_TEXTURE_SIZE);
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  resources.push(texture);
  return texture;
}

// One seamless tile: colour (alpha = glow mask), normal and roughness derived from a shared height map.
function makeTile(ground: PlanetGroundTheme, layer: 0 | 1 | 2, anisotropy: number, resources: Resources): TileSet {
  const size = GROUND_TEXTURE_SIZE;
  const seed = Number(ground.id.slice(-3)) * 977 + layer * 53;
  const base = new THREE.Color(ground.colors[layer]).convertLinearToSRGB();
  const cliff = layer === 2;
  const soft = ground.kind === 'gas';
  const height = new Float32Array(size * size);
  const tone = new Float32Array(size * size);
  const crack = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size, v = y / size, index = y * size + x;
      const body = fractalNoise(u * 6, v * 6, seed, 6, 6);
      const grain = valueNoise(u * 128, v * 128, seed + 7, 128);
      let h = body + (soft ? 0 : (grain - 0.5) * 0.16);
      if (cliff && !soft) h = h * 0.6 + fractalNoise(u * 3, v * 24 + body * 3, seed + 17, 3, 0) * 0.4;
      if (ground.kind === 'desert' && !cliff) h = h * 0.72 + Math.abs(Math.sin((v * 22 + body * 4) * Math.PI)) * 0.28;
      // Thin ridges of a second noise become cracks, veins and crystal seams.
      const seam = Math.abs(fractalNoise(u * 8, v * 8, seed + 29, 4, 8) - 0.5);
      const line = soft ? 0 : Math.max(0, 1 - seam / (ground.kind === 'crystal' ? 0.022 : 0.016));
      if (!soft) h -= line * (ground.kind === 'desert' ? 0.04 : 0.12);
      height[index] = h;
      tone[index] = fractalNoise(u * 4, v * 4, seed + 41, 4, 4);
      crack[index] = line;
    }
  }
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const smoothSurface = ground.kind === 'ice' ? 0.42 : ground.kind === 'crystal' ? 0.48 : soft ? 1 : 0.9;
  const strength = soft ? 5 : ground.kind === 'ice' || ground.kind === 'crystal' ? 6 : 14;
  const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255)));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x, offset = index * 4;
      const h = height[index];
      const shade = soft
        ? 0.86 + (tone[index] - 0.5) * 0.5 + (h - 0.5) * 0.3
        : 0.9 + (tone[index] - 0.5) * 0.6 + (h - 0.5) * 0.55 - crack[index] * 0.25;
      color[offset] = byte(base.r * shade);
      color[offset + 1] = byte(base.g * shade);
      color[offset + 2] = byte(base.b * shade);
      color[offset + 3] = ground.glow ? byte(Math.pow(crack[index], 2)) : 0;
      const dx = (height[y * size + (x + 1) % size] - height[y * size + (x + size - 1) % size]) * strength;
      const dy = (height[(y + 1) % size * size + x] - height[(y + size - 1) % size * size + x]) * strength;
      const length = Math.hypot(dx, dy, 1);
      normal[offset] = byte(-dx / length * 0.5 + 0.5);
      normal[offset + 1] = byte(-dy / length * 0.5 + 0.5);
      normal[offset + 2] = byte(1 / length * 0.5 + 0.5);
      normal[offset + 3] = 255;
      const r = byte(smoothSurface + (tone[index] - 0.5) * 0.35);
      rough.set([r, r, r, 255], offset);
    }
  }
  return {
    color: toTexture(color, THREE.SRGBColorSpace, anisotropy, resources),
    normal: toTexture(normal, THREE.NoColorSpace, anisotropy, resources),
    rough: toTexture(rough, THREE.NoColorSpace, anisotropy, resources),
  };
}

/**
 * Terrain material that blends the lowland, highland and cliff tiles per vertex
 * (`blend` attribute) and projects them in world space, with a second large
 * scale lookup so the tiling does not show.
 */
export function makeTerrainMaterial(ground: PlanetGroundTheme, anisotropy: number, resources: Resources) {
  const tiles = ([0, 1, 2] as const).map((layer) => makeTile(ground, layer, anisotropy, resources));
  const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: ground.kind === 'crystal' ? 0.25 : 0 });
  material.onBeforeCompile = (shader) => {
    tiles.forEach((tile, index) => {
      shader.uniforms['uColor' + index] = { value: tile.color };
      shader.uniforms['uNormal' + index] = { value: tile.normal };
      shader.uniforms['uRough' + index] = { value: tile.rough };
    });
    shader.uniforms.uGlow = { value: new THREE.Color(ground.glow ?? '#000000') };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 blend;\nvarying vec3 vBlend;\nvarying vec3 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = blend;\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const declarations = [0, 1, 2].map((i) => `uniform sampler2D uColor${i};\nuniform sampler2D uNormal${i};\nuniform sampler2D uRough${i};`).join('\n');
    const mix = (name: string, uv: string) => `(texture2D(${name}0, ${uv}) * vBlend.x + texture2D(${name}1, ${uv}) * vBlend.y + texture2D(${name}2, ${uv}) * vBlend.z)`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${declarations}\nuniform vec3 uGlow;\nvarying vec3 vBlend;\nvarying vec3 vGround;`)
      .replace('#include <map_fragment>', [
        'vec2 groundUv = vGround.xz / 9.0;',
        'vec2 wideUv = mat2(0.8, -0.6, 0.6, 0.8) * vGround.xz / 97.0;',
        `vec4 groundColor = ${mix('uColor', 'groundUv')};`,
        `vec3 wideColor = ${mix('uColor', 'wideUv')}.rgb;`,
        'float wideShade = dot(wideColor, vec3(0.333)) / max(0.02, dot(' + mix('uColor', 'vec2(0.37, 0.61)') + '.rgb, vec3(0.333)));',
        // The large lookup also repeats, so drop it before the repetition shows.
        // Far away, use each tile's average colour (smallest mip) plus soft broad patches.
        'float farness = smoothstep(90.0, 420.0, length(vViewPosition));',
        `vec4 average = texture2D(uColor0, groundUv, 16.0) * vBlend.x + texture2D(uColor1, groundUv, 16.0) * vBlend.y + texture2D(uColor2, groundUv, 16.0) * vBlend.z;`,
        'groundColor = mix(groundColor, average, farness);',
        'float patchShade = sin(vGround.x * 0.013 + sin(vGround.z * 0.009) * 2.0) * sin(vGround.z * 0.017 + sin(vGround.x * 0.006) * 2.0);',
        'groundColor.rgb *= 1.0 + patchShade * 0.14 * farness;',
        'float wideAmount = 0.55 * (1.0 - farness);',
        'diffuseColor.rgb *= groundColor.rgb * clamp(mix(1.0, wideShade, wideAmount), 0.65, 1.4);',
      ].join('\n'))
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * ${mix('uRough', 'groundUv')}.g;`)
      .replace('#include <normal_fragment_maps>', [
        `vec3 detail = ${mix('uNormal', 'groundUv')}.xyz * 2.0 - 1.0;`,
        `vec3 wideDetail = ${mix('uNormal', 'wideUv')}.xyz * 2.0 - 1.0;`,
        // Fine relief fades with distance so far hills do not shimmer.
        'float nearness = 1.0 - smoothstep(120.0, 700.0, length(vViewPosition));',
        'vec2 slope = detail.xy * nearness + wideDetail.xy * 0.7 * nearness;',
        'vec3 tangentX = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);',
        'vec3 tangentZ = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);',
        'normal = normalize(normal + tangentX * slope.x + tangentZ * slope.y);',
      ].join('\n'))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlow * groundColor.a * 1.6;');
  };
  material.customProgramCacheKey = () => 'campussync-planet-ground-v1';
  resources.push(material);
  return { material, tiles };
}
