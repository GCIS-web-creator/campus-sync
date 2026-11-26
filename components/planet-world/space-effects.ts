import * as THREE from 'three';

// Shader-based star, corona, atmosphere and deep-sky effects. Everything is
// evaluated per pixel, so it stays sharp at any distance without textures.
type Resources = Array<{ dispose: () => void }>;

const COMMON = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
float fxHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float fxNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(fxHash(i), fxHash(i + vec3(1, 0, 0)), f.x), mix(fxHash(i + vec3(0, 1, 0)), fxHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(fxHash(i + vec3(0, 0, 1)), fxHash(i + vec3(1, 0, 1)), f.x), mix(fxHash(i + vec3(0, 1, 1)), fxHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fxFbm(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amplitude * fxNoise(p);
    p = p * 2.07 + 11.3;
    amplitude *= 0.52;
  }
  return sum;
}
`;

// Shared by effects that need the view ray and the body centre.
const SHELL_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vView;
varying vec3 vCentre;
varying vec3 vObject;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vView = view.xyz;
  vCentre = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vObject = position;
  gl_Position = projectionMatrix * view;
  #include <logdepthbuf_vertex>
}
`;

// Drive this once per frame with elapsed seconds.
export type Animated<T> = T & { update: (seconds: number) => void };

export function makeStarSurfaceMaterial(color: string, seed: number, resources: Resources): Animated<{ material: THREE.ShaderMaterial }> {
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uSeed: { value: seed % 97 } },
    vertexShader: SHELL_VERTEX,
    fragmentShader: COMMON + /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uSeed;
    varying vec3 vView;
    varying vec3 vCentre;
    varying vec3 vObject;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 dir = normalize(vObject);
      float pixel = length(fwidth(dir));
      float mu = clamp(dot(normalize(vView - vCentre), normalize(-vView)), 0.0, 1.0);
      vec3 warp = vec3(fxNoise(dir * 7.0 + uSeed), fxNoise(dir.yzx * 7.0 - uSeed), fxNoise(dir.zxy * 7.0));
      float cells = fxFbm(dir * 11.0 + warp * 1.8 + vec3(0.0, uTime * 0.035, 0.0));
      // Fine granulation fades out once it is smaller than a pixel.
      float grain = (fxNoise(dir * 120.0 + warp * 3.0 + uTime * 0.12) - 0.5) * (1.0 - smoothstep(0.3, 0.8, pixel * 120.0));
      float filaments = pow(1.0 - abs(fxFbm(dir * 5.5 + warp * 2.4 - uTime * 0.018) * 2.0 - 1.0), 5.0);
      float spots = smoothstep(0.66, 0.75, fxFbm(dir * 3.1 + uSeed * 0.7));
      float heat = clamp(cells * 1.35 - 0.22 + grain * 0.5 + filaments * 0.28, 0.0, 1.2);
      vec3 deep = uColor * uColor * vec3(0.72, 0.34, 0.2);
      vec3 surface = mix(deep, uColor * 1.08, smoothstep(0.1, 0.75, heat));
      surface = mix(surface, vec3(1.25, 1.18, 1.02), smoothstep(0.66, 1.1, heat));
      surface *= 1.0 - spots * 0.72;
      // Limb darkening with a thin hot rim.
      surface *= mix(vec3(0.5, 0.34, 0.24), vec3(1.08), pow(mu, 0.48));
      surface += uColor * pow(1.0 - mu, 5.0) * 0.8;
      gl_FragColor = vec4(surface * 0.86, 1.0);
      #include <colorspace_fragment>
    }`,
  });
  resources.push(material);
  return { material, update: seconds => { material.uniforms.uTime.value = seconds; } };
}

// Streamers and prominences drawn around the true silhouette of the star. The
// far side of a bounding sphere is rendered, so the star and nearer bodies
// occlude it correctly even when the camera is close.
export function makeStarCorona(starRadius: number, outerRadius: number, color: string, seed: number, resources: Resources): Animated<{ mesh: THREE.Mesh }> {
  const geometry = new THREE.SphereGeometry(outerRadius, 64, 48);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uSeed: { value: seed % 89 },
      uRadius: { value: starRadius }, uOuter: { value: outerRadius },
    },
    vertexShader: SHELL_VERTEX,
    fragmentShader: COMMON + /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uSeed;
    uniform float uRadius;
    uniform float uOuter;
    varying vec3 vView;
    varying vec3 vCentre;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 ray = normalize(vView);
      vec3 closest = ray * dot(vCentre, ray) - vCentre;
      float impact = length(closest);
      float t = clamp((impact - uRadius) / (uOuter - uRadius), 0.0, 1.0);
      // World-space direction keeps the structures fixed while the camera turns.
      vec3 dir = normalize(transpose(mat3(viewMatrix)) * closest);
      vec3 flow = dir * 2.6 + uSeed + vec3(0.0, 0.0, t * 0.9 - uTime * 0.012);
      float bend = fxNoise(flow * 1.7);
      float broad = pow(fxFbm(flow + bend * 0.7), 3.0);
      float fine = pow(fxFbm(dir * 13.0 + bend * 1.5 + vec3(t * 1.6 - uTime * 0.03)), 4.0);
      float rim = exp(-t * 28.0) * 0.9;
      float inner = exp(-t * 7.5) * (0.28 + broad * 1.7);
      float streamers = exp(-t * 2.9) * (broad * broad * 5.2 + fine * 2.4);
      float loops = pow(1.0 - abs(fxFbm(dir * 7.0 + vec3(t * 14.0, uTime * 0.05, uSeed)) * 2.0 - 1.0), 12.0);
      float prominence = loops * smoothstep(0.2, 0.0, t) * smoothstep(0.42, 0.68, fxNoise(dir * 3.2 + uSeed * 2.0));
      float edge = 1.0 - smoothstep(0.55, 1.0, t);
      vec3 tint = uColor * mix(vec3(1.0), uColor, smoothstep(0.05, 0.7, t));
      vec3 light = mix(tint, vec3(1.0, 0.97, 0.9), exp(-t * 18.0)) * (rim + inner * 0.62 + streamers * 0.5);
      light += uColor * vec3(1.35, 0.6, 0.36) * prominence * 1.9;
      // Dither removes banding in the faint outer glow.
      light += (fxHash(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0;
      gl_FragColor = vec4(light * edge, 1.0);
      #include <colorspace_fragment>
    }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  resources.push(geometry, material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return { mesh, update: seconds => { material.uniforms.uTime.value = seconds; } };
}

// Scattering shell: thicker toward the limb, sunlit on the day side and warm
// along the terminator. The camera must stay outside the shell.
export function makeAtmosphereShell(planetRadius: number, color: string, sunDirection: THREE.Vector3, resources: Resources) {
  const shellRadius = planetRadius * 1.06;
  const geometry = new THREE.SphereGeometry(shellRadius, 192, 128);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uSun: { value: sunDirection.clone().normalize() },
      uRadius: { value: planetRadius }, uShell: { value: shellRadius },
    },
    vertexShader: SHELL_VERTEX,
    fragmentShader: COMMON + /* glsl */ `
    uniform vec3 uColor;
    uniform vec3 uSun;
    uniform float uRadius;
    uniform float uShell;
    varying vec3 vView;
    varying vec3 vCentre;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 ray = normalize(vView);
      float along = dot(vCentre, ray);
      vec3 closest = ray * along - vCentre;
      float impact = length(closest);
      float outer = sqrt(max(uShell * uShell - impact * impact, 0.0));
      float ground = sqrt(max(uRadius * uRadius - impact * impact, 0.0));
      bool onDisc = impact < uRadius;
      float path = (onDisc ? outer - ground : outer * 2.0) / uRadius;
      float height = max(impact - uRadius, 0.0) / (uShell - uRadius);
      float density = (1.0 - exp(-path * 2.6)) * exp(-height * 3.4) * (1.0 - smoothstep(0.75, 1.0, height));
      vec3 point = onDisc ? closest - ray * ground : closest;
      float sunDot = dot(normalize(point), normalize(mat3(viewMatrix) * uSun));
      float day = smoothstep(-0.22, 0.42, sunDot);
      float dusk = exp(-pow(sunDot / 0.16, 2.0));
      vec3 sky = mix(uColor, vec3(1.0), exp(-height * 9.0) * 0.28);
      sky = mix(sky, vec3(1.0, 0.45, 0.2), dusk * 0.7);
      float limb = onDisc ? 0.2 + 0.8 * pow(impact / uRadius, 6.0) : 1.0;
      gl_FragColor = vec4(sky * density * limb * (day * 1.35 + dusk * 0.2 + 0.025), 1.0);
      #include <colorspace_fragment>
    }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  resources.push(geometry, material);
  return new THREE.Mesh(geometry, material);
}

// Stars, a galactic band and faint nebulae, drawn at infinity behind everything.
export function makeDeepSky(seed: number, resources: Resources) {
  const geometry = new THREE.SphereGeometry(1, 48, 32);
  const material = new THREE.ShaderMaterial({
    uniforms: { uSeed: { value: seed % 83 } },
    vertexShader: /* glsl */ `
    varying vec3 vDirection;
    void main() {
      vDirection = position;
      // Rotation only: the sky never gets closer as the ship travels.
      vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
      gl_Position = clip.xyww;
    }`,
    fragmentShader: /* glsl */ `
    uniform float uSeed;
    varying vec3 vDirection;
    float skyHash(vec3 p) {
      p = fract(p * vec3(0.1031, 0.1030, 0.0973));
      p += dot(p, p.yxz + 33.33);
      return fract((p.x + p.y) * p.z);
    }
    float skyNoise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(skyHash(i), skyHash(i + vec3(1, 0, 0)), f.x), mix(skyHash(i + vec3(0, 1, 0)), skyHash(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(skyHash(i + vec3(0, 0, 1)), skyHash(i + vec3(1, 0, 1)), f.x), mix(skyHash(i + vec3(0, 1, 1)), skyHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    float skyFbm(vec3 p) {
      float sum = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 6; i++) { sum += amplitude * skyNoise(p); p = p * 2.1 + 7.7; amplitude *= 0.53; }
      return sum;
    }
    vec3 starLayer(vec3 dir, float frequency, float keep, float pixel) {
      vec3 p = dir * frequency + uSeed;
      vec3 cell = floor(p);
      float chance = skyHash(cell);
      if (chance < keep) return vec3(0.0);
      vec3 centre = cell + 0.3 + 0.4 * vec3(skyHash(cell + 1.7), skyHash(cell + 4.1), skyHash(cell + 8.3));
      float d = length(p - centre) / max(frequency * pixel, 1e-5);
      float power = pow(skyHash(cell + 2.9), 3.0);
      vec3 tone = mix(vec3(0.66, 0.78, 1.0), vec3(1.0, 0.82, 0.62), skyHash(cell + 6.1));
      return tone * exp(-d * d * (1.5 - power)) * (0.25 + power * 1.5);
    }
    void main() {
      vec3 dir = normalize(vDirection);
      float pixel = length(fwidth(dir));
      float latitude = dot(dir, normalize(vec3(0.28, 0.92, -0.26)));
      float band = exp(-latitude * latitude * 17.0);
      float clouds = skyFbm(dir * 5.0 + uSeed);
      float dust = smoothstep(0.42, 0.68, skyFbm(dir * 9.0 - uSeed)) * exp(-latitude * latitude * 80.0);
      vec3 color = vec3(0.022, 0.025, 0.04) * band * clouds * clouds * 2.2 * (1.0 - dust * 0.82);
      color += vec3(0.018, 0.005, 0.016) * pow(skyFbm(dir * 2.3 + 3.0), 5.0) * 2.4;
      color += vec3(0.0025, 0.012, 0.019) * pow(skyFbm(dir.zxy * 3.1 + uSeed), 5.0) * 2.4;
      color += starLayer(dir, 48.0, 0.988, pixel) + starLayer(dir, 130.0, 0.986, pixel) * 0.55;
      color += starLayer(dir, 290.0, 0.988 - band * 0.045, pixel) * (0.16 + band * 0.18) * (1.0 - dust * 0.7);
      color += vec3(0.0006, 0.0015, 0.0045);
      color += (skyHash(vec3(gl_FragCoord.xy, 3.0)) - 0.5) / 255.0;
      gl_FragColor = vec4(max(color, 0.0), 1.0);
      #include <colorspace_fragment>
    }`,
    // Opaque pass with the lowest order, so planets and ships draw over it.
    side: THREE.BackSide, depthTest: false, depthWrite: false,
  });
  resources.push(geometry, material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
