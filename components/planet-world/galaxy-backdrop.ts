import * as THREE from 'three';

export type GalaxyBackdropOptions = {
  radius: number;
  starCount: number;
};

const NEBULA_VERTEX_SHADER = /* glsl */ `
  varying vec3 vGalaxyDirection;
  void main() {
    vGalaxyDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GALAXY_NOISE = /* glsl */ `
  float galaxyHash(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float galaxyNoise(vec3 p) {
    vec3 cell = floor(p);
    vec3 local = fract(p);
    local = local * local * (3.0 - 2.0 * local);
    float a = galaxyHash(cell);
    float b = galaxyHash(cell + vec3(1.0, 0.0, 0.0));
    float c = galaxyHash(cell + vec3(0.0, 1.0, 0.0));
    float d = galaxyHash(cell + vec3(1.0, 1.0, 0.0));
    float e = galaxyHash(cell + vec3(0.0, 0.0, 1.0));
    float f = galaxyHash(cell + vec3(1.0, 0.0, 1.0));
    float g = galaxyHash(cell + vec3(0.0, 1.0, 1.0));
    float h = galaxyHash(cell + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(a, b, local.x), mix(c, d, local.x), local.y),
      mix(mix(e, f, local.x), mix(g, h, local.x), local.y),
      local.z
    );
  }

  float galaxyFbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.54;
    for (int octave = 0; octave < 4; octave++) {
      value += galaxyNoise(p) * amplitude;
      p = p * 2.07 + vec3(13.1, 7.7, 19.3);
      amplitude *= 0.49;
    }
    return value;
  }
`;

const NEBULA_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSeed;
  varying vec3 vGalaxyDirection;
  ${GALAXY_NOISE}

  void main() {
    vec3 direction = normalize(vGalaxyDirection);
    vec3 drift = vec3(uTime * 0.0014, -uTime * 0.0008, uTime * 0.0011);
    vec3 galacticNormal = normalize(vec3(0.24, 0.79, -0.56));
    float latitude = dot(direction, galacticNormal);
    float disk = exp(-pow(abs(latitude) * 3.4, 2.0));
    float cloud = galaxyFbm(direction * 18.0 + uSeed + drift);
    float detail = galaxyFbm(direction * 53.0 + uSeed * 2.1 - drift * 2.0);
    float dust = galaxyFbm(direction * 117.0 + uSeed * 4.2 + drift * 4.0);
    float cloudMask = smoothstep(0.34, 0.76, cloud * 0.62 + detail * 0.38);
    float wisps = smoothstep(0.43, 0.73, detail) * smoothstep(0.33, 0.67, cloud);
    float dustLanes = smoothstep(0.43, 0.67, dust);
    float colourDrift = smoothstep(-0.52, 0.56, direction.x + detail * 0.32);

    vec3 blueNebula = vec3(0.045, 0.105, 0.30);
    vec3 violetNebula = vec3(0.22, 0.075, 0.30);
    vec3 roseNebula = vec3(0.26, 0.075, 0.17);
    vec3 nebulaColour = mix(blueNebula, violetNebula, colourDrift);
    nebulaColour = mix(nebulaColour, roseNebula, smoothstep(0.55, 0.92, detail) * 0.42);

    vec3 coreDirection = normalize(vec3(-0.39, 0.30, 0.87));
    float galacticCore = exp(-dot(direction - coreDirection, direction - coreDirection) * 19.0);
    vec3 colour = vec3(0.0018, 0.0032, 0.010);
    colour += disk * cloudMask * nebulaColour * 0.82;
    colour += disk * wisps * vec3(0.060, 0.090, 0.22) * 0.34;
    colour += disk * galacticCore * vec3(0.075, 0.060, 0.13) * (0.42 + cloudMask * 0.58);
    colour *= 1.0 - disk * dustLanes * 0.16;

    gl_FragColor = vec4(colour, 1.0);
  }
`;

const STAR_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  varying vec3 vStarColour;
  varying float vStarTwinkle;
  varying float vPointSize;

  void main() {
    float twinkle = 0.76 + 0.24 * sin(uTime * (0.7 + aPhase * 0.11) + aPhase * 6.2831853);
    vStarTwinkle = twinkle;
    vStarColour = aColor;
    vPointSize = aSize;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (0.88 + twinkle * 0.16);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const STAR_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vStarColour;
  varying float vStarTwinkle;
  varying float vPointSize;

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float radius = length(point);
    float core = 1.0 - smoothstep(0.035, 0.24, radius);
    float halo = exp(-radius * radius * 25.0) * 0.36;
    float spikeX = exp(-abs(point.x) * 72.0) * exp(-abs(point.y) * 10.0);
    float spikeY = exp(-abs(point.y) * 72.0) * exp(-abs(point.x) * 10.0);
    float sparkle = (spikeX + spikeY) * 0.12 * smoothstep(1.1, 2.7, vPointSize);
    float alpha = clamp(core + halo + sparkle, 0.0, 1.0);
    if (alpha < 0.012) discard;
    vec3 colour = vStarColour * (0.74 + vStarTwinkle * 0.46);
    gl_FragColor = vec4(colour, alpha);
  }
`;

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeSeed(seed: number) {
  return new THREE.Vector3(
    ((seed * 1.37) % 61) + 0.17,
    ((seed * 2.11) % 47) + 0.31,
    ((seed * 3.73) % 53) + 0.53,
  );
}

/**
 * Shared procedural deep-space backdrop: a distant nebula shell, a tilted
 * galactic star belt, and a sparse halo of twinkling multicolour stars.
 */
export function createGalaxyBackdrop(seed: number, options: GalaxyBackdropOptions) {
  const random = seeded(seed + 0x51f15e);
  const group = new THREE.Group();
  group.name = 'Layered procedural galaxy backdrop';

  const nebulaGeometry = new THREE.SphereGeometry(options.radius, 72, 48);
  const nebulaMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: makeSeed(seed) } },
    vertexShader: NEBULA_VERTEX_SHADER,
    fragmentShader: NEBULA_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial);
  nebula.name = 'Procedural nebula and galactic dust';
  nebula.renderOrder = -100;
  nebula.frustumCulled = false;
  group.add(nebula);

  const positions: number[] = [];
  const colours: number[] = [];
  const sizes: number[] = [];
  const phases: number[] = [];
  const palette = ['#c3d8ff', '#e5dcff', '#fff7e8', '#ffd9b4', '#96dfff', '#ffc1d8', '#a9b9ff'].map(value => new THREE.Color(value));
  const galacticNormal = new THREE.Vector3(0.24, 0.79, -0.56).normalize();
  const galacticAxisU = new THREE.Vector3().crossVectors(galacticNormal, new THREE.Vector3(0, 1, 0)).normalize();
  const galacticAxisV = new THREE.Vector3().crossVectors(galacticNormal, galacticAxisU).normalize();

  for (let index = 0; index < options.starCount; index += 1) {
    let direction: THREE.Vector3;
    if (random() < 0.74) {
      const angle = random() * Math.PI * 2;
      const latitude = (random() * 2 - 1) * Math.pow(random(), 2.2) * 0.36;
      const radial = Math.sqrt(1 - latitude * latitude);
      direction = galacticAxisU.clone().multiplyScalar(Math.cos(angle) * radial)
        .addScaledVector(galacticAxisV, Math.sin(angle) * radial)
        .addScaledVector(galacticNormal, latitude)
        .normalize();
    } else {
      const y = random() * 2 - 1;
      const angle = random() * Math.PI * 2;
      const radial = Math.sqrt(1 - y * y);
      direction = new THREE.Vector3(Math.cos(angle) * radial, y, Math.sin(angle) * radial);
    }

    const distance = options.radius * (0.81 + random() * 0.15);
    positions.push(direction.x * distance, direction.y * distance, direction.z * distance);
    const colour = palette[Math.floor(random() * palette.length)];
    colours.push(colour.r, colour.g, colour.b);
    const brightStar = random() < 0.055;
    sizes.push(brightStar ? 1.8 + random() * 1.55 : 0.58 + random() * 0.88);
    phases.push(random() * Math.PI * 2);
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  starGeometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colours, 3));
  starGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  starGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  const starMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.name = 'Twinkling multicolour galactic starfield';
  stars.renderOrder = -90;
  stars.frustumCulled = false;
  group.add(stars);

  return {
    group,
    stars,
    nebula,
    update(timeSeconds: number) {
      nebulaMaterial.uniforms.uTime.value = timeSeconds;
      starMaterial.uniforms.uTime.value = timeSeconds;
      group.rotation.y = timeSeconds * 0.000025;
    },
    dispose() {
      nebulaGeometry.dispose();
      nebulaMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
    },
  };
}
