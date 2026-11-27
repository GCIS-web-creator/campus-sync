import * as THREE from 'three';

/** Uniforms shared by every city shader so day/night and time change together. */
export type CityUniforms = {
  uTime: { value: number };
  /** 0 neon night, 1 green day. */
  uDay: { value: number };
  uHaze: { value: THREE.Color };
  uHazeLow: { value: THREE.Color };
  uSunDirection: { value: THREE.Vector3 };
  uAccentA: { value: THREE.Color };
  uAccentB: { value: THREE.Color };
  uAccentC: { value: THREE.Color };
};

const NOISE = /* glsl */ `
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise21(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += noise21(p) * a; p = p * 2.03 + 11.7; a *= 0.5; } return v; }
`;

// Distance haze, thicker and brighter near the ground where the street glow collects.
const HAZE = /* glsl */ `
uniform vec3 uHaze;
uniform vec3 uHazeLow;
uniform float uDay;
vec3 applyHaze(vec3 color, vec3 world) {
  float distance_ = length(world - cameraPosition);
  float low = exp(-max(world.y, 0.0) / 75.0);
  float amount = 1.0 - exp(-distance_ * mix(0.0006 + low * 0.00085, 0.0003 + low * 0.00016, uDay));
  vec3 haze = mix(uHaze, uHazeLow, low);
  return mix(color, haze, clamp(amount, 0.0, 0.93));
}
`;

export function makeFacadeMaterial(uniforms: CityUniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 instanceSize;
      attribute vec3 instanceInfo; // seed, style, tier
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vLocal;
      varying vec3 vSize;
      varying vec3 vInfo;
      varying vec3 vObject;
      void main() {
        vObject = position;
        vSize = instanceSize;
        vInfo = instanceInfo;
        vLocal = position * instanceSize;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormalW = normalize(mat3(instanceMatrix) * (normal / (instanceSize * instanceSize)) );
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDirection;
      uniform vec3 uAccentA;
      uniform vec3 uAccentB;
      uniform vec3 uAccentC;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vLocal;
      varying vec3 vSize;
      varying vec3 vInfo;
      varying vec3 vObject;
      ${NOISE}
      ${HAZE}
      void main() {
        vec3 faceNormal = cross(dFdx(vWorld), dFdy(vWorld));
        vec3 n = faceNormal / max(length(faceNormal), 1e-8);
        // Quantised so interpolation error cannot scramble the per-building hashes.
        float seed = floor(vInfo.x * 512.0 + 0.5) / 512.0;
        float style = floor(vInfo.y + 0.5);
        bool roof = abs(n.y) > 0.7;
        bool sideX = abs(n.x) > abs(n.z);
        float u = sideX ? vLocal.z : vLocal.x;
        float faceWidth = sideX ? vSize.z : vSize.x;
        float v = vLocal.y;
        vec3 view = normalize(cameraPosition - vWorld);

        vec3 accent = seed < 0.4 ? uAccentA : seed < 0.72 ? uAccentB : uAccentC;

        // Window cells in metres, faded to their average when smaller than a pixel.
        vec2 cellSize = style == 1.0 ? vec2(7.5, 3.6) : style == 2.0 ? vec2(2.1, 5.2) : style == 3.0 ? vec2(3.1, 4.1) : vec2(2.6, 3.3);
        vec2 grid = vec2(u, v) / cellSize + vec2(seed * 17.0, 0.0);
        vec2 cell = floor(grid), f = fract(grid);
        vec2 fw = max(fwidth(grid), vec2(1e-4));
        float detail = 1.0 - smoothstep(0.3, 0.95, max(fw.x, fw.y));
        vec2 inset = style == 1.0 ? vec2(0.015, 0.2) : style == 2.0 ? vec2(0.22, 0.14) : style == 3.0 ? vec2(0.05, 0.08) : vec2(0.16, 0.22);
        vec2 edge = smoothstep(inset - fw * 0.5, inset + fw * 0.5, f) * smoothstep(inset - fw * 0.5, inset + fw * 0.5, 1.0 - f);
        float pane = mix((1.0 - 2.0 * inset.x) * (1.0 - 2.0 * inset.y), edge.x * edge.y, detail);

        float pick = hash21(cell + seed * 91.0);
        float floorPick = hash21(vec2(cell.y, seed * 53.0));
        float litChance = style == 1.0 ? 0.6 : style == 3.0 ? 0.42 : 0.52;
        float lit = step(1.0 - litChance, pick * 0.55 + floorPick * 0.45);
        float litAverage = mix(litChance * 0.75, lit, detail);
        float hue = hash21(cell * 1.7 + seed * 13.0);
        vec3 warm = vec3(1.0, 0.68, 0.36), cool = vec3(0.55, 0.82, 1.0);
        vec3 windowColor = hue < 0.36 ? warm : hue < 0.78 ? cool : accent;
        windowColor = mix(mix(warm, cool, 0.6), windowColor, detail);
        // Blinds, furniture and a ceiling lamp give lit rooms some depth.
        float interior = mix(0.8, 0.45 + 0.55 * smoothstep(0.05, 0.9, f.y) + 0.35 * noise21(vec2(u, v) * 1.7), detail);

        // ---- Night ----
        vec3 shell = mix(vec3(0.011, 0.014, 0.032), vec3(0.035, 0.026, 0.055), hash21(vec2(seed, 3.0)));
        float rim = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 3.0);
        vec3 skyReflect = mix(vec3(0.035, 0.02, 0.08), vec3(0.02, 0.07, 0.17), clamp(reflect(-view, n).y * 1.5 + 0.3, 0.0, 1.0));
        vec3 night = shell * (0.7 + 0.5 * abs(n.x)) + skyReflect * (style == 3.0 ? 0.9 : 0.35) * (0.4 + rim);
        float near = smoothstep(25.0, 190.0, length(vWorld - cameraPosition));
        // Window frames and blinds inside each lit pane.
        float frames = 1.0 - 0.5 * detail * max(1.0 - smoothstep(0.02, 0.02 + fw.x, abs(f.x - 0.5)), 1.0 - smoothstep(0.02, 0.02 + fw.y, abs(f.y - 0.64)));
        night += windowColor * frames * pane * litAverage * interior * (0.3 + 0.75 * hash21(cell + 7.0)) * mix(0.6, 1.0, near) * (vInfo.z > 1.5 ? 0.75 : 1.0);
        // Floor slabs and mullions keep the nearby walls crisp.
        float slab = 1.0 - smoothstep(0.1, 0.1 + fwidth(v), abs(fract(v / 6.6) - 0.5) * 6.6);
        night *= 1.0 - slab * 0.7 * (1.0 - near);
        // Coloured light rising from the street.
        night += mix(uAccentA, uAccentB, step(0.0, vWorld.x)) * exp(-max(vWorld.y, 0.0) / 17.0) * 0.065 * (1.0 - pane * 0.5);
        // Cladding panels of slightly different tones, with dark joints.
        vec2 panel = vec2(u / 2.25, v / 1.65);
        vec2 joint = smoothstep(vec2(0.0), fwidth(panel) * 1.5 + 0.02, fract(panel));
        float cladding = (0.65 + 0.7 * hash21(floor(panel) + seed * 29.0)) * mix(0.55, 1.0, joint.x * joint.y);
        night *= mix(cladding, 1.0, max(pane * litAverage, smoothstep(30.0, 110.0, length(vWorld - cameraPosition))));
        // Shop fronts along the lowest floor.
        float shop = (1.0 - step(4.2, vWorld.y)) * step(0.35, vWorld.y);
        float bay = floor(u / 4.5 + seed * 9.0);
        vec3 shopColor = hash21(vec2(bay, seed)) < 0.5 ? mix(warm, accent, 0.35) : accent;
        float shopFrame = step(0.08, fract(u / 4.5 + seed * 9.0)) * step(0.5, hash21(vec2(bay, seed + 4.0)) + 0.25);
        vec2 goods = vec2(u * 3.2, vWorld.y * 2.6);
        float shelf = step(0.18, fract(goods.y)) * step(0.12, fract(goods.x + hash21(vec2(floor(goods.y), seed))));
        float stock = shelf * step(0.35, hash21(floor(goods) + seed)) * step(vWorld.y, 2.7);
        float glow_ = 0.16 + 0.5 * smoothstep(0.4, 3.4, vWorld.y);
        vec3 inside = shopColor * glow_ * (1.0 - stock * 0.8);
        inside *= 0.35 + 0.65 * step(0.06, fract(u / 1.5)); // door and window frames
        float fascia = step(3.4, vWorld.y);
        float lettering = step(0.55, hash21(floor(vec2(u * 6.0, vWorld.y * 9.0)))) * step(3.6, vWorld.y) * step(vWorld.y, 4.0);
        inside = mix(inside, shopColor * (0.08 + lettering * 1.2), fascia);
        night = mix(night, inside, shop * shopFrame * step(vInfo.z, 0.5));
        // Neon corner lines, crown bands and light strips.
        // Vertical edges are where the two horizontal object coordinates meet.
        float fromEdge = abs(abs(vObject.x) - abs(vObject.z)) * min(vSize.x, vSize.z);
        float corner = 1.0 - smoothstep(0.14, 0.14 + fwidth(fromEdge) * 1.2, fromEdge);
        float neonTall = step(vInfo.z > 1.5 ? 0.0 : 0.66, hash21(vec2(seed, 11.0)));
        night += accent * corner * neonTall * (vInfo.z > 2.5 ? 3.2 : vInfo.z > 1.5 ? 2.2 : vInfo.z > 0.5 ? 1.5 : 0.75);
        float crown = smoothstep(vSize.y - 2.2, vSize.y - 1.6, v) * (1.0 - smoothstep(vSize.y - 0.7, vSize.y - 0.4, v));
        night += accent * crown * step(0.45, hash21(vec2(seed, 23.0))) * mix(0.8, 1.9, near);
        float band = 1.0 - smoothstep(0.16, 0.16 + fwidth(v), abs(mod(v + seed * 40.0, 31.0) - 2.0));
        night += accent * band * step(0.74, hash21(vec2(seed, 31.0))) * 1.3;
        if (vInfo.z > 2.5) {
          // The central spire carries a slow pulse of light up its faces.
          float spine = 1.0 - smoothstep(0.3, 0.9, abs(abs(u) - faceWidth * 0.18));
          night += uAccentB * spine * (0.55 + 0.45 * sin(v * 0.035 - uTime * 1.6)) * 1.4;
        }
        if (roof) night = shell * 1.2 + accent * 0.02 + accent * step(0.9, noise21(vWorld.xz * 0.45)) * 0.6;

        // ---- Day: white architecture, sky-blue glass and vertical gardens ----
        float diffuse = max(dot(n, uSunDirection), 0.0);
        vec3 white = mix(vec3(0.58, 0.64, 0.68), vec3(0.8, 0.77, 0.68), hash21(vec2(seed, 5.0)));
        vec3 glass = mix(vec3(0.025, 0.13, 0.27), vec3(0.28, 0.6, 0.88), clamp(reflect(-view, n).y + 0.45, 0.0, 1.0));
        glass += vec3(0.9, 0.95, 1.0) * pow(max(dot(reflect(-view, n), uSunDirection), 0.0), 40.0);
        float glazing = style == 3.0 ? pane : pane * 0.92;
        vec3 day = mix(white * (0.42 + diffuse * 0.75), glass, glazing);
        float gardenFace = step(0.55, hash21(vec2(seed, sideX ? 41.0 : 43.0)));
        float strip = 1.0 - smoothstep(0.2, 0.42, abs(u / faceWidth + (hash21(vec2(seed, 47.0)) - 0.5) * 0.5));
        float leaves = fbm(vec2(u, v) * 0.55);
        float garden = gardenFace * smoothstep(0.34, 0.5, strip * 0.55 + fbm(vec2(u * 0.12, v * 0.05) + seed * 9.0) * 0.5 * strip + leaves * 0.12 - 0.08);
        vec3 green = mix(vec3(0.025, 0.09, 0.015), vec3(0.24, 0.45, 0.07), smoothstep(0.3, 0.75, fbm(vec2(u, v) * 1.6))) * (0.5 + diffuse * 0.8);
        day = mix(day, green, garden);
        float terrace = 1.0 - smoothstep(0.25, 0.25 + fwidth(v), abs(mod(v, 13.2) - 0.4));
        day = mix(day, white * (0.6 + diffuse * 0.6), terrace * 0.8);
        if (roof) day = mix(white, vec3(0.12, 0.3, 0.06), step(0.5, noise21(vWorld.xz * 0.3))) * (0.4 + diffuse * 0.7);

        vec3 color = mix(night, day, uDay);
        gl_FragColor = vec4(applyHaze(color, vWorld), 1.0);
      }`,
  });
}

export function makeSkyMaterial(uniforms: CityUniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vDirection; void main(){ vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDay;
      uniform vec3 uHaze;
      uniform vec3 uHazeLow;
      uniform vec3 uSunDirection;
      uniform vec3 uAccentA;
      uniform vec3 uAccentB;
      varying vec3 vDirection;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDirection);
        float up = max(d.y, 0.0);
        vec2 plane = d.xz / (up + 0.22);
        float cloud = fbm(plane * 1.7 + vec2(uTime * 0.006, 0.0));
        float wisps = fbm(plane * 4.1 - vec2(uTime * 0.011, 3.0));
        float cover = smoothstep(0.46, 0.82, cloud * 0.75 + wisps * 0.35);

        vec3 night = mix(uHazeLow * 1.25, vec3(0.012, 0.02, 0.085), smoothstep(0.0, 0.55, up));
        night = mix(night, vec3(0.002, 0.003, 0.018), smoothstep(0.45, 1.0, up));
        vec3 lit = mix(uAccentA, uAccentB, fbm(plane * 0.7)) * 0.1 * (1.0 - up) + vec3(0.025, 0.035, 0.11);
        night = mix(night, lit, cover * 0.75);
        vec2 starCell = floor(d.xz / (abs(d.y) + 0.35) * 520.0);
        night += vec3(step(0.9975, hash21(starCell))) * hash21(starCell + 5.0) * (1.0 - cover) * smoothstep(0.2, 0.6, up);

        vec3 day = mix(vec3(0.62, 0.82, 0.95), vec3(0.05, 0.27, 0.72), pow(max(up, 1e-5), 0.62));
        day = mix(day, vec3(1.0), cover * 0.82 * smoothstep(0.0, 0.14, up));
        float sun = max(dot(d, uSunDirection), 0.0);
        day += vec3(1.0, 0.86, 0.6) * (pow(sun, 60.0) * 0.5 + smoothstep(0.9993, 0.9997, sun) * 3.0);

        vec3 color = mix(night, day, uDay);
        color = mix(mix(uHazeLow, uHaze, 0.5), color, smoothstep(-0.02, 0.16, d.y));
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
}

/** Shader for three's Reflector: wet asphalt at night, pale paved garden by day. */
export function makeStreetShader(uniforms: CityUniforms) {
  return {
    name: 'CampusCityStreet',
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      ...uniforms,
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = textureMatrix * vec4(position, 1.0);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform vec3 uAccentA;
      uniform vec3 uAccentB;
      varying vec4 vUv;
      varying vec3 vWorld;
      ${NOISE}
      ${HAZE}
      void main() {
        vec2 p = vWorld.xz;
        float road = 1.0 - smoothstep(7.4, 7.6, abs(p.x));
        float grain = noise21(p * 9.0) * 0.5 + noise21(p * 31.0) * 0.5;
        float puddle = smoothstep(0.42, 0.68, fbm(p * 0.16));
        vec2 tile = abs(fract(p / vec2(1.2, 1.2)) - 0.5);
        float joint = smoothstep(0.47, 0.495, max(tile.x, tile.y)) * (1.0 - road);

        // Reflection, stretched along the view direction and broken by ripples.
        vec2 ripple = vec2(noise21(p * 2.3 + uTime * 0.35), noise21(p * 2.1 - uTime * 0.31)) - 0.5;
        float spread = mix(0.03, 0.004, puddle);
        vec3 mirror = vec3(0.0);
        for (int i = -3; i <= 3; i++) {
          vec4 uv = vUv;
          uv.xy += (ripple * vec2(0.012, 0.03) * (1.1 - puddle) + vec2(0.0, float(i) * spread * 0.55)) * uv.w;
          mirror += texture2DProj(tDiffuse, uv).rgb * (1.0 - abs(float(i)) * 0.22);
        }
        mirror /= 4.36;
        vec3 view = normalize(cameraPosition - vWorld);
        float fresnel = 0.22 + 0.78 * pow(1.0 - clamp(view.y, 0.0, 1.0), 3.0);

        vec3 asphalt = vec3(0.008, 0.009, 0.017) * (0.6 + grain * 0.8) + vec3(0.012, 0.012, 0.022) * (1.0 - road);
        float dash = (1.0 - smoothstep(0.09, 0.13, abs(p.x))) * step(0.45, fract(p.y / 7.0));
        float kerb = 1.0 - smoothstep(0.07, 0.12, abs(abs(p.x) - 7.55));
        vec3 night = asphalt * (1.0 - joint * 0.6) + mirror * fresnel * mix(0.45, 1.05, puddle);
        night += vec3(0.5, 0.6, 0.75) * dash * 0.22 + mix(uAccentA, uAccentB, step(0.0, p.x)) * kerb * 1.5;

        float lawn = smoothstep(9.4, 9.8, abs(p.x)) + (1.0 - smoothstep(0.8, 1.1, abs(p.x)));
        vec3 paving = mix(vec3(0.5, 0.52, 0.5), vec3(0.72, 0.73, 0.68), noise21(floor(p / 1.2))) * (0.88 + grain * 0.2);
        vec3 grass = mix(vec3(0.03, 0.11, 0.015), vec3(0.2, 0.38, 0.06), fbm(p * 2.4)) * (0.7 + grain * 0.7);
        vec3 day = mix(paving * (1.0 - joint * 0.3), grass, clamp(lawn, 0.0, 1.0)) + mirror * 0.1 * puddle * road;
        day = mix(day, vec3(0.9), kerb * 0.8);

        gl_FragColor = vec4(applyHaze(mix(night, day, uDay), vWorld), 1.0);
      }`,
  };
}

/** Animated holographic advertising screen without text. */
export function makeHologramMaterial(uniforms: CityUniforms, color: THREE.Color, seed: number) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uColor: { value: color }, uSeed: { value: seed } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      uniform vec3 uColor;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 p = vUv - 0.5;
        float rings = smoothstep(0.82, 1.0, sin(length(p * vec2(1.0, 1.5)) * 34.0 - uTime * 2.2 + uSeed * 9.0));
        float bars = step(0.55, hash21(vec2(floor(vUv.x * 18.0), floor(uTime * 2.0 + uSeed * 7.0)))) * step(vUv.y, 0.1 + 0.35 * noise21(vec2(floor(vUv.x * 18.0), uTime)));
        float scan = 0.78 + 0.22 * sin(vUv.y * 260.0 - uTime * 9.0);
        float border = step(0.47, max(abs(p.x), abs(p.y)));
        float wash = 0.18 + 0.28 * fbm(vUv * 3.0 + vec2(uTime * 0.18, uSeed * 5.0));
        float strength = (wash + rings * 0.55 + bars * 0.7 + border * 1.1) * scan;
        gl_FragColor = vec4(uColor * strength * 1.15, 1.0);
      }`,
  });
}

export function makeBeamMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; varying float vFacing; void main(){ vUv = uv; vec4 view = modelViewMatrix * vec4(position, 1.0); vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-view.xyz))); gl_Position = projectionMatrix * view; }',
    fragmentShader: 'uniform vec3 uColor; varying vec2 vUv; varying float vFacing; void main(){ float fade = pow(max(1.0 - vUv.y, 0.0), 1.6); gl_FragColor = vec4(uColor, fade * pow(clamp(vFacing, 0.0, 1.0), 2.0) * 0.2); }',
  });
}
