import * as THREE from 'three';

// Per-pixel procedural surface detail. It adds resolution beyond the source
// textures without extra downloads or texture memory. Octaves smaller than a
// pixel are faded out so distant bodies do not shimmer.
const NOISE = /* glsl */ `
varying vec3 vDetailDir;
uniform vec3 uDetailSeed;

vec3 detailHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float detailNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(detailHash(i).x, detailHash(i + vec3(1, 0, 0)).x, f.x),
        mix(detailHash(i + vec3(0, 1, 0)).x, detailHash(i + vec3(1, 1, 0)).x, f.x), f.y),
    mix(mix(detailHash(i + vec3(0, 0, 1)).x, detailHash(i + vec3(1, 0, 1)).x, f.x),
        mix(detailHash(i + vec3(0, 1, 1)).x, detailHash(i + vec3(1, 1, 1)).x, f.x), f.y), f.z);
}
float detailFade(float frequency, float pixel) {
  return 1.0 - smoothstep(0.3, 0.8, frequency * pixel);
}
// Fractal noise in the range -1..1.
float detailFbm(vec3 dir, float frequency, int octaves, float gain, float pixel) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 10; i++) {
    if (i >= octaves) break;
    sum += amplitude * detailFade(frequency, pixel) * (detailNoise(dir * frequency + uDetailSeed) * 2.0 - 1.0);
    frequency *= 2.13;
    amplitude *= gain;
  }
  return sum;
}
`;

// Tilts the shading normal by a height field expressed as a fraction of radius.
const RELIEF = /* glsl */ `
{
  vec3 sigmaX = dFdx(-vViewPosition);
  vec3 sigmaY = dFdy(-vViewPosition);
  float radius = length(sigmaX) / max(length(dFdx(vDetailDir)), 1e-9);
  vec3 r1 = cross(sigmaY, normal);
  vec3 r2 = cross(normal, sigmaX);
  float det = dot(sigmaX, r1);
  vec3 gradient = sign(det) * radius * (dFdx(detailHeight) * r1 + dFdy(detailHeight) * r2);
  normal = normalize(abs(det) * normal - gradient);
}
`;

function patchMaterial(
  material: THREE.MeshStandardMaterial,
  key: string,
  seed: number,
  declarations: string,
  surface: { chunk: string; code: string },
) {
  const previousCompile = material.onBeforeCompile;
  const previousKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey')
    ? material.customProgramCacheKey()
    : '';
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.uDetailSeed = { value: new THREE.Vector3(seed * 1.37 % 61, seed * 2.11 % 47, seed * 3.73 % 53) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetailDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDetailDir = normalize(position);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE + declarations)
      .replace(surface.chunk, surface.code)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + RELIEF);
  };
  material.customProgramCacheKey = () => previousKey + key;
}

export function applyPlanetSurfaceDetail(material: THREE.MeshStandardMaterial, seed: number) {
  patchMaterial(material, 'campus-planet-detail-v1', seed, '\nfloat detailHeight = 0.0;\n', {
    chunk: '#include <map_fragment>',
    code: /* glsl */ `
    #ifdef USE_MAP
    {
      float pixel = length(fwidth(vDetailDir));
      // Break up the blocky coastlines of the source map.
      vec2 warp = vec2(
        detailFbm(vDetailDir, 38.0, 5, 0.55, pixel),
        detailFbm(vDetailDir.zxy, 38.0, 5, 0.55, pixel));
      vec4 texel = texture2D(map, vMapUv + warp * vec2(0.0045, 0.009));
      float water = smoothstep(0.0, 0.06, texel.b - max(texel.r, texel.g * 0.86));
      float terrain = detailFbm(vDetailDir, 24.0, 9, 0.6, pixel);
      float patches = detailFbm(vDetailDir.yzx, 90.0, 6, 0.6, pixel);
      float strength = mix(1.0, 0.2, water);
      texel.rgb *= 1.0 + (terrain * 0.55 + patches * 0.3) * strength;
      texel.rgb = mix(texel.rgb, texel.rgb * vec3(1.12, 1.0, 0.86), clamp(patches * 1.4, 0.0, 1.0) * strength);
      diffuseColor *= texel;
      float ridges = 1.0 - abs(detailFbm(vDetailDir.zyx, 46.0, 8, 0.55, pixel)) * 2.0;
      detailHeight = (ridges * 0.0016 + terrain * 0.0012) * (1.0 - water);
    }
    #endif
    `,
  });
}

export function applyMoonSurfaceDetail(material: THREE.MeshStandardMaterial, seed: number) {
  material.map = null;
  material.bumpMap = null;
  const declarations = /* glsl */ `
float detailHeight = 0.0;
// One layer of craters: xy = height and bright ejecta.
vec2 craterLayer(vec3 dir, float frequency, float pixel) {
  float fade = detailFade(frequency * 1.6, pixel);
  if (fade <= 0.0) return vec2(0.0);
  vec3 p = dir * frequency + uDetailSeed;
  // Irregular rims instead of perfect circles.
  p += (detailNoise(p * 3.1) - 0.5) * 0.16;
  vec3 base = floor(p - 0.5);
  vec2 result = vec2(0.0);
  for (int x = 0; x < 2; x++) for (int y = 0; y < 2; y++) for (int z = 0; z < 2; z++) {
    vec3 cell = base + vec3(x, y, z);
    vec3 random = detailHash(cell + 17.0);
    vec3 centre = cell + 0.25 + 0.5 * detailHash(cell);
    float size = 0.1 + 0.36 * random.x * random.x;
    float d = distance(p, centre) / size;
    if (d > 1.7 || random.y < 0.25) continue;
    float bowl = d < 1.0 ? (d * d - 1.0) * 0.8 : 0.0;
    float rim = 0.32 * exp(-pow((d - 1.0) / 0.2, 2.0));
    result.x += (bowl + rim) * size / frequency;
    result.y += step(0.82, random.z) * (1.0 - smoothstep(0.5, 1.7, d));
  }
  return result * fade;
}
`;
  patchMaterial(material, 'campus-moon-detail-v1', seed, declarations, {
    chunk: '#include <color_fragment>',
    code: /* glsl */ `
    #include <color_fragment>
    {
      float pixel = length(fwidth(vDetailDir));
      vec2 craters = craterLayer(vDetailDir, 2.6, pixel) + craterLayer(vDetailDir.yzx, 6.5, pixel)
        + craterLayer(vDetailDir.zxy, 16.0, pixel) + craterLayer(vDetailDir.zyx, 41.0, pixel)
        + craterLayer(vDetailDir.xzy, 105.0, pixel);
      float seas = smoothstep(0.0, 0.22, detailFbm(vDetailDir, 1.7, 5, 0.55, pixel));
      float dust = detailFbm(vDetailDir.yxz, 9.0, 9, 0.62, pixel);
      float albedo = mix(0.78, 0.36, seas) * (1.0 + dust * 0.42);
      albedo += clamp(craters.y, 0.0, 1.0) * 0.28 + clamp(craters.x * 5.0, -0.14, 0.16);
      diffuseColor.rgb *= albedo * 1.25 * mix(vec3(1.04, 1.0, 0.95), vec3(0.9, 0.95, 1.04), seas);
      // Maria are flooded plains, so their craters are shallower.
      detailHeight = craters.x * mix(0.24, 0.1, seas) + dust * 0.0016;
    }
    `,
  });
}
