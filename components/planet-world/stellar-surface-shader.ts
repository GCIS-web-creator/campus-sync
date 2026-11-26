import * as THREE from 'three';

const VERTEX_SHADER = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vStarDirection;
  varying vec3 vStarViewNormal;
  varying vec3 vStarViewPosition;
  void main() {
    vStarDirection = normalize(position);
    vStarViewNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vStarViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;

const NOISE_GLSL = /* glsl */ `
  float hash31(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash31(i);
    float b = hash31(i + vec3(1.0, 0.0, 0.0));
    float c = hash31(i + vec3(0.0, 1.0, 0.0));
    float d = hash31(i + vec3(1.0, 1.0, 0.0));
    float e = hash31(i + vec3(0.0, 0.0, 1.0));
    float f1 = hash31(i + vec3(1.0, 0.0, 1.0));
    float g = hash31(i + vec3(0.0, 1.0, 1.0));
    float h = hash31(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
      mix(mix(e, f1, f.x), mix(g, h, f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float sum = 0.0;
    float amplitude = 0.52;
    for (int octave = 0; octave < 5; octave++) {
      sum += noise3(p) * amplitude;
      p = p * 2.03 + vec3(17.1, 9.2, 13.4);
      amplitude *= 0.48;
    }
    return sum;
  }
`;

const SURFACE_FRAGMENT_SHADER = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform vec3 uSeed;
  uniform vec3 uHotColor;
  uniform vec3 uBaseColor;
  uniform vec3 uDeepColor;
  varying vec3 vStarDirection;
  varying vec3 vStarViewNormal;
  varying vec3 vStarViewPosition;

  ${NOISE_GLSL}

  void main() {
    #include <logdepthbuf_fragment>

    vec3 direction = normalize(vStarDirection);
    vec3 drift = vec3(uTime * 0.0018, uTime * 0.0007, -uTime * 0.0011);

    // A star is a self-luminous plasma sphere. There is deliberately no
    // directional-light, daylight, or night-side calculation in this shader.
    float broadFlow = fbm(direction * 7.5 + uSeed * 0.31 + drift);
    float convection = fbm(direction * 38.0 + uSeed + drift * 4.0);
    float fineGranules = fbm(direction * 112.0 + uSeed * 2.7 - drift * 8.0);
    float superGranules = fbm(direction * 18.0 + uSeed * 1.7 + drift * 1.8);

    float brightCells = smoothstep(0.27, 0.76, convection);
    float intergranularLanes = 1.0 - smoothstep(0.015, 0.14, abs(convection - 0.48));
    float plasmaFilaments = 1.0 - abs(fineGranules * 2.0 - 1.0);
    float turbulentRidges = smoothstep(0.36, 0.78, superGranules);

    // Small, low-contrast sunspot groups; never a hemisphere-wide shadow.
    float spotField = fbm(direction * 13.0 + uSeed * 3.1);
    float sunspot = 1.0 - smoothstep(0.018, 0.075, abs(spotField - 0.205));
    sunspot *= smoothstep(0.28, 0.62, broadFlow);

    vec3 color = mix(uDeepColor, uBaseColor, smoothstep(0.10, 0.72, broadFlow));
    color = mix(color, uHotColor, clamp(brightCells * 0.48 + turbulentRidges * 0.24, 0.0, 0.78));
    color *= 0.93 + brightCells * 0.28 + plasmaFilaments * 0.10 - intergranularLanes * 0.055;
    color *= 1.0 - sunspot * 0.17;

    // Mild limb darkening adds spherical depth without creating a day/night edge.
    float viewFacing = max(0.0, dot(normalize(vStarViewNormal), normalize(vStarViewPosition)));
    float limb = 0.88 + 0.12 * sqrt(viewFacing);
    float pulse = 0.985 + 0.015 * sin(uTime * 0.22 + broadFlow * 8.0);
    vec3 emission = color * limb * pulse * 1.42;

    gl_FragColor = vec4(emission, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const CORONA_FRAGMENT_SHADER = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform vec3 uSeed;
  uniform vec3 uCoronaColor;
  varying vec3 vStarDirection;
  varying vec3 vStarViewNormal;
  varying vec3 vStarViewPosition;

  ${NOISE_GLSL}

  void main() {
    #include <logdepthbuf_fragment>
    vec3 direction = normalize(vStarDirection);
    vec3 viewDirection = normalize(vStarViewPosition);
    float facing = abs(dot(normalize(vStarViewNormal), viewDirection));
    float rim = pow(max(0.0, 1.0 - facing), 1.75);
    float angle = atan(direction.y, direction.x);
    float turbulence = fbm(direction * 15.0 + uSeed + vec3(0.0, uTime * 0.003, 0.0));
    float streamPhase = angle * 54.0 + turbulence * 8.0 + uTime * 0.12;
    float streamers = pow(max(0.0, 0.5 + 0.5 * sin(streamPhase)), 8.0);
    float fineRays = pow(max(0.0, 0.5 + 0.5 * sin(angle * 103.0 - turbulence * 11.0 - uTime * 0.08)), 14.0);
    float alpha = rim * (0.035 + streamers * 0.23 + fineRays * 0.13 + turbulence * 0.07);
    vec3 color = uCoronaColor * (1.1 + streamers * 1.8 + fineRays * 1.4);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeSeed(seed: number) {
  return new THREE.Vector3(
    (seed * 1.37) % 61,
    (seed * 2.11) % 47,
    (seed * 3.73) % 53,
  );
}

export function createStellarSurfaceMaterial(color: string, seed: number) {
  const tint = new THREE.Color(color);
  const hotColor = tint.clone().lerp(new THREE.Color('#fff4d5'), 0.76);
  const baseColor = tint.clone().lerp(new THREE.Color('#ff9b48'), 0.40);
  const deepColor = tint.clone().lerp(new THREE.Color('#8f281b'), 0.46);

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: makeSeed(seed) },
      uHotColor: { value: hotColor },
      uBaseColor: { value: baseColor },
      uDeepColor: { value: deepColor },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: SURFACE_FRAGMENT_SHADER,
    side: THREE.FrontSide,
    depthWrite: true,
    toneMapped: false,
  });
}

export function createStellarCoronaMaterial(color: string, seed: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: makeSeed(seed + 17) },
      uCoronaColor: { value: new THREE.Color(color) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: CORONA_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    toneMapped: false,
  });
}
