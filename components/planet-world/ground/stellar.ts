import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { makeKit, NOISE_GLSL, type GroundContext, type GroundScene } from './kit';

// Stage 5: a planet-scale civilization under an enormous neighbouring world.

export function buildStellar(context: GroundContext): GroundScene {
  const kit = makeKit(context, 509);
  const { between, random, put, keep, flush, instances } = kit;
  const { scene } = context;
  const time = { value: 0 };
  const haze = new THREE.Color('#9a5cc4').lerp(context.atmosphere, 0.12);

  // ---- Sunset sky with pink cloud banks and stars ----
  const skyMaterial = keep(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: time },
    vertexShader: 'varying vec3 vDirection; void main(){ vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec3 vDirection;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDirection);
        float up = max(d.y, 0.0);
        float centre = pow(max(-d.z, 0.0), 6.0);
        vec3 color = mix(vec3(0.95, 0.52, 0.8), vec3(0.42, 0.18, 0.62), smoothstep(0.01, 0.16, up));
        color = mix(color, vec3(0.07, 0.055, 0.27), smoothstep(0.1, 0.36, up));
        color = mix(color, vec3(0.008, 0.01, 0.07), smoothstep(0.32, 0.8, up));
        color += vec3(0.9, 0.75, 0.95) * centre * exp(-up * 11.0);
        vec2 p = vec2(atan(d.x, -d.z) * 2.6 + uTime * 0.003, d.y * 8.0);
        float banks = fbm(p * vec2(1.0, 1.25) + fbm(p * 2.2) * 1.4);
        float side = smoothstep(0.12, 0.75, abs(d.x));
        float cloud = smoothstep(0.5, 0.72, banks + side * 0.08) * smoothstep(0.03, 0.12, up) * (1.0 - smoothstep(0.34, 0.55, up));
        float rim = smoothstep(0.5, 0.82, fbm(p * 3.4 + 4.0));
        vec3 cloudColor = mix(vec3(0.3, 0.12, 0.45), mix(vec3(1.0, 0.27, 0.55), vec3(1.0, 0.62, 0.75), rim), clamp(rim * 0.8 + side * 0.4, 0.0, 1.0));
        color = mix(color, cloudColor, cloud * (0.35 + side * 0.65));
        vec2 cell = floor(d.xz / (abs(d.y) + 0.35) * 520.0);
        color += vec3(step(0.9966, hash21(cell))) * hash21(cell + 5.0) * smoothstep(0.18, 0.45, d.y);
        gl_FragColor = vec4(color, 1.0);
      }`,
  }));
  scene.add(new THREE.Mesh(keep(new THREE.SphereGeometry(5_000, 64, 40)), skyMaterial));

  // ---- The great planet and its companions ----
  const worldMaterial = (seed: number, detail: number, glow: number) => keep(new THREE.ShaderMaterial({
    uniforms: { uTime: time, uSeed: { value: seed }, uDetail: { value: detail }, uGlow: { value: glow } },
    transparent: true,
    depthWrite: false,
    vertexShader: 'varying vec3 vNormalW; varying vec3 vLocal; varying vec3 vWorld; void main(){ vLocal = normalize(position); vNormalW = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      uniform float uTime, uSeed, uDetail, uGlow;
      varying vec3 vNormalW; varying vec3 vLocal; varying vec3 vWorld;
      ${NOISE_GLSL}
      float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float noise3(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      float fbm3(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += noise3(p) * a; p = p * 2.07 + 3.1; a *= 0.52; } return v; }
      void main() {
        vec3 n = normalize(vNormalW), view = normalize(cameraPosition - vWorld);
        vec3 q = vLocal * uDetail + uSeed;
        float land = fbm3(q + fbm3(q * 1.7) * 1.6);
        vec3 surface = mix(vec3(0.035, 0.06, 0.24), vec3(0.2, 0.16, 0.46), smoothstep(0.42, 0.62, land));
        surface = mix(surface, vec3(0.35, 0.52, 0.78), smoothstep(0.6, 0.76, fbm3(q * 2.6)));
        vec3 warp = vec3(fbm3(q * 1.4 + 2.0), fbm3(q * 1.4 + 7.0), fbm3(q * 1.4 + 13.0));
        float vein = 1.0 - abs(fbm3(q * 1.15 + warp * 1.2) - 0.5) * 2.0;
        float fine = 1.0 - abs(fbm3(q * 3.2 + warp * 2.0) - 0.5) * 2.0;
        float region = smoothstep(0.34, 0.62, fbm3(q * 0.8 + 4.0));
        float cracks = smoothstep(0.955, 0.998, vein) + smoothstep(0.975, 1.0, fine) * region * 0.6;
        vec3 crackColor = mix(vec3(1.0, 0.28, 0.75), vec3(0.35, 0.75, 1.0), smoothstep(0.4, 0.6, warp.x));
        surface += crackColor * (cracks * 2.1 + smoothstep(0.86, 1.0, vein) * 0.22) * uGlow;
        surface += vec3(0.75, 0.9, 1.0) * step(0.8, noise3(q * 38.0)) * smoothstep(0.6, 0.72, land) * 0.25 * uGlow;
        float light = clamp(dot(n, normalize(vec3(-0.6, 0.55, 0.45))) * 0.85 + 0.35, 0.1, 1.15);
        vec3 color = surface * light;
        float rim = pow(1.0 - max(dot(n, view), 0.0), 2.6);
        color += mix(vec3(0.55, 0.45, 1.0), vec3(0.35, 0.82, 1.0), smoothstep(-0.2, 0.7, n.y)) * rim * 1.15;
        // The lower limb dissolves into the evening haze.
        float fade = smoothstep(0.0, 420.0, vWorld.y);
        color = mix(vec3(0.7, 0.4, 0.82), color, 0.25 + fade * 0.75);
        gl_FragColor = vec4(color, 0.4 + fade * 0.6);
      }`,
  }));
  const worldGeometry = keep(new THREE.SphereGeometry(1, 128, 96));
  const addWorld = (position: [number, number, number], radius: number, seed: number, detail: number, glow: number) => {
    const mesh = new THREE.Mesh(worldGeometry, worldMaterial(seed, detail, glow));
    mesh.position.set(...position);
    mesh.scale.setScalar(radius);
    mesh.renderOrder = -5;
    scene.add(mesh);
    return mesh;
  };
  const great = addWorld([60, 900, -2_700], 960, (context.planetNumber % 13) * 1.37, 2.3, 1);
  addWorld([-760, 1_420, -2_700], 92, 4.2, 3.4, 0.25);
  addWorld([1_300, 960, -2_500], 125, 8.9, 3, 0);
  addWorld([-1_500, 520, -2_700], 34, 2.2, 3, 0);
  const halo = keep(new THREE.SpriteMaterial({ map: kit.glowMap(), color: '#5a6cff', transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending }));
  const haloSprite = new THREE.Sprite(halo);
  haloSprite.position.set(60, 940, -3_600);
  haloSprite.scale.setScalar(3_400);
  haloSprite.renderOrder = -6;
  scene.add(haloSprite);

  // ---- Architecture shader: dark alloy, window bands, pink and orange light ----
  const towerMaterial = keep(new THREE.ShaderMaterial({
    uniforms: { uTime: time, uHaze: { value: haze } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying float vSeed;
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        vec4 world = m * vec4(position, 1.0);
        vWorld = world.xyz;
        vSeed = fract(sin(dot(vec2(m[3].x, m[3].z), vec2(12.9898, 78.233))) * 43758.5453);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uHaze; varying vec3 vWorld; varying float vSeed;
      ${NOISE_GLSL}
      void main() {
        vec3 face = cross(dFdx(vWorld), dFdy(vWorld));
        vec3 n = face / max(length(face), 1e-8);
        vec3 view = normalize(cameraPosition - vWorld);
        float seed = floor(vSeed * 256.0 + 0.5) / 256.0;
        float u = abs(n.x) > abs(n.z) ? vWorld.z : vWorld.x;
        bool low = abs(vWorld.x) < 46.0 && vWorld.y < 24.0;
        vec2 cellSize = low ? vec2(1.5, 2.6) : vec2(3.2, 4.2);
        vec2 grid = vec2(u, vWorld.y) / cellSize;
        vec2 f = fract(grid), fw = max(fwidth(grid), vec2(1e-4));
        float detail = 1.0 - smoothstep(0.3, 0.9, max(fw.x, fw.y));
        float pane = mix(0.3, step(0.18, f.x) * step(f.x, 0.82) * step(0.28, f.y) * step(f.y, 0.72), detail);
        float pick = hash21(floor(grid) + seed * 71.0);
        float cluster = noise21(floor(grid / vec2(5.0, 3.0)) + seed * 13.0);
        float lit = step(low ? 0.62 : 0.7, pick * 0.45 + cluster * 0.55);
        lit = mix(0.14, lit, detail);
        vec3 lamp = low ? vec3(1.0, 0.43, 0.12) : mix(vec3(1.0, 0.58, 0.28), vec3(0.75, 0.55, 1.0), step(0.62, hash21(vec2(seed, 2.0))));
        float facing = n.x * 0.35 + n.z * 0.25 + 0.65;
        vec3 color = vec3(0.012, 0.01, 0.032) * facing;
        float rim = pow(1.0 - clamp(abs(dot(n, view)), 0.0, 1.0), 2.5);
        color += mix(vec3(0.07, 0.03, 0.17), vec3(0.45, 0.16, 0.55), smoothstep(-0.2, 0.9, reflect(-view, n).y)) * (0.12 + rim * 0.75);
        float plate = step(0.5, hash21(floor(vec2(u / 5.5, vWorld.y / 7.5)) + seed));
        color *= 0.75 + plate * 0.45;
        float seam = 1.0 - smoothstep(0.1, 0.1 + fwidth(vWorld.y), abs(fract(vWorld.y / 15.0) - 0.5) * 15.0);
        color += vec3(0.08, 0.05, 0.14) * seam;
        color += lamp * pane * lit * (low ? 1.9 : 1.1);
        float strip = 1.0 - smoothstep(0.22, 0.22 + fwidth(u), abs(mod(u + seed * 30.0, 19.0) - 2.0));
        color += vec3(1.0, 0.18, 0.75) * strip * step(0.8, seed) * step(0.35, noise21(vec2(seed * 40.0, vWorld.y / 22.0))) * 1.7;
        if (abs(n.y) > 0.7) color = vec3(0.03, 0.025, 0.07) + vec3(0.3, 0.1, 0.4) * 0.12;
        float distance_ = length(vWorld - cameraPosition);
        float amount = 1.0 - exp(-distance_ * (0.0003 + exp(-max(vWorld.y, 0.0) / 60.0) * 0.00065));
        color = mix(color, uHaze, clamp(amount, 0.0, 0.92) * smoothstep(25.0, 200.0, distance_));
        gl_FragColor = vec4(color, 1.0);
      }`,
  }));

  type Part = { p: [number, number, number]; s: [number, number, number]; r?: [number, number, number] };
  const boxes: Part[] = [], rounds: Part[] = [], spikes: Part[] = [], discs: Part[] = [];
  const pink = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3fc4').multiplyScalar(2.6) }));
  const cyan = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#67c8ff').multiplyScalar(2) }));
  const orange = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a2a').multiplyScalar(2.4) }));
  const unit = keep(new THREE.BoxGeometry(1, 1, 1));
  const ring = keep(new THREE.TorusGeometry(1, 0.035, 6, 40).rotateX(Math.PI / 2));

  // A spire made of stacked segments, side buttresses, collars and antennae.
  const spire = (x: number, z: number, width: number, height: number) => {
    let y = 0, w = width;
    const sections = 3 + Math.floor(random() * 3);
    for (let section = 0; section < sections; section += 1) {
      const h = height * (section === 0 ? 0.36 : 0.64 / (sections - 1)) * between(0.85, 1.12);
      (random() < 0.35 ? rounds : boxes).push({ p: [x, y + h / 2, z], s: [w, h, w * between(0.7, 1)], r: [0, between(-0.25, 0.25), 0] });
      for (const side of [-1, 1]) {
        if (random() < 0.75) {
          const bh = h * between(0.45, 1.15), bw = w * between(0.18, 0.34);
          boxes.push({ p: [x + side * (w / 2 + bw * 0.55), y + bh / 2 + between(0, h * 0.2), z + between(-w, w) * 0.15], s: [bw, bh, bw * 1.3] });
          spikes.push({ p: [x + side * (w / 2 + bw * 0.55), y + bh + h * 0.16, z], s: [bw * 0.35, h * 0.3, bw * 0.35] });
          boxes.push({ p: [x + side * (w / 2 + bw * 0.2), y + bh * 0.6, z], s: [bw * 1.3, bw * 0.5, bw] });
        }
      }
      for (let fin = 0; fin < 4; fin += 1) {
        const fy = y + h * between(0.1, 0.95);
        discs.push({ p: [x, fy, z], s: [w * between(0.55, 0.78), between(0.8, 2.6), w * between(0.55, 0.78)] });
      }
      if (random() < 0.28) put(ring, random() < 0.7 ? pink : cyan, [x, y + h * 0.92, z], [w * 0.76, w * 0.5, w * 0.76]);
      if (random() < 0.3 && x * x + z * z < 900 * 900) put(unit, pink, [x + w * between(-0.3, 0.3), y + h * 0.5, z + w * 0.52], [w * 0.07, h * between(0.2, 0.55), 0.4]);
      y += h;
      w *= between(0.58, 0.8);
    }
    for (let index = 0; index < 3; index += 1) {
      const ah = height * between(0.07, 0.2);
      spikes.push({ p: [x + between(-w, w) * 0.4, y + ah / 2, z + between(-w, w) * 0.3], s: [w * 0.14, ah, w * 0.14] });
    }
  };
  // The two great towers framing the view, then ranks receding to the horizon.
  spire(-96, -255, 30, 330);
  spire(-134, -330, 26, 230);
  spire(104, -262, 29, 322);
  spire(158, -300, 27, 185);
  spire(-150, -145, 30, 150);
  spire(150, -112, 26, 265);
  spire(-205, -205, 24, 205);
  spire(-76, -450, 16, 185);
  spire(88, -480, 18, 170);
  for (let index = 0; index < 190; index += 1) {
    const side = random() < 0.5 ? -1 : 1;
    const z = -between(120, 1_250);
    const x = side * between(48 + Math.max(0, -z - 500) * -0.04, 560);
    if (Math.abs(x) < 62 && z > -900) continue;
    spire(x, z, between(9, 24), between(35, 105) + Math.pow(random(), 3) * 140);
  }
  for (let index = 0; index < 260; index += 1) {
    const x = between(-420, 420), z = -between(700, 1_500);
    spire(x, z, between(6, 15), between(18, 45) + (Math.abs(x) < 60 ? 0 : between(0, 70)));
  }
  // The landing platform with a hovering deck on the right.
  rounds.push({ p: [58, 17, -118], s: [10, 34, 10] }, { p: [55, 37, -118], s: [52, 3.2, 30] }, { p: [55, 41, -118], s: [36, 5, 20] });
  put(ring, orange, [55, 35.2, -118], [24, 4, 14]);

  // Long low industrial galleries along both sides of the causeway.
  for (const side of [-1, 1]) {
    for (let z = 34; z > -640; z -= between(7, 13)) {
      const length = between(7, 14), height = between(3.2, 7.5);
      const x = side * between(18, 21);
      boxes.push({ p: [x + side * 4, height / 2 - 0.6, z], s: [9, height, length] });
      boxes.push({ p: [x + side * between(1, 6), height + 0.3, z + between(-2, 2)], s: [between(3, 6), between(0.8, 2.6), length * between(0.4, 0.8)] });
      if (random() < 0.6) boxes.push({ p: [side * between(31, 44), between(4, 12), z], s: [between(7, 14), between(8, 24), between(6, 12)] });
      put(unit, orange, [x - side * 0.56, between(0.8, 1.8), z], [0.12, 0.16, length * between(0.35, 0.9)]);
      if (random() < 0.35) put(unit, pink, [x - side * 0.56, height - 1, z], [0.12, 0.1, length * 0.7]);
      if (random() < 0.25) spikes.push({ p: [x + side * 5, height + 5, z], s: [0.5, between(5, 12), 0.5] });
    }
    // Conduits running into the distance.
    for (const [dx, y, r] of [[12.4, 1.6, 0.55], [13.8, 2.9, 0.4], [11.2, 0.55, 0.3], [16.5, 7.8, 0.35]]) {
      boxes.push({ p: [side * dx, y, -300], s: [r * 1.6, r * 1.6, 700] });
    }
    for (let z = 30; z > -640; z -= 6.5) {
      boxes.push({ p: [side * 12.4, 1.2, z], s: [2.2, 3, 0.7] });
      put(unit, orange, [side * 11.25, 2.1, z], [0.1, 0.2, 0.5]);
    }
    put(unit, pink, [side * 8.7, 0.12, -300], [0.1, 0.08, 700]);
    put(unit, cyan, [side * 10.4, 0.8, -300], [0.07, 0.07, 700]);
  }
  for (let z = 20; z > -640; z -= between(9, 17)) {
    boxes.push({ p: [0, 0.09, z], s: [17.2, 0.16, 0.5] });
    if (random() < 0.35) boxes.push({ p: [between(-5, 5), 0.11, z - 4], s: [between(3, 6), 0.14, 0.9] });
  }
  for (const x of [-8.4, -4.2, 0, 4.2, 8.4]) boxes.push({ p: [x, 0.07, -300], s: [0.22, 0.12, 700] });

  const taperGeometry = keep(new THREE.CylinderGeometry(0.36, Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4));
  instances(taperGeometry, towerMaterial, boxes.filter((part) => part.s[1] > part.s[0] * 2.4 && part.s[2] < 60));
  instances(unit, towerMaterial, boxes.filter((part) => !(part.s[1] > part.s[0] * 2.4 && part.s[2] < 60)));
  instances(keep(new THREE.CylinderGeometry(0.44, 0.5, 1, 18)), towerMaterial, rounds);
  instances(keep(new THREE.CylinderGeometry(0.02, 0.5, 1, 6)), towerMaterial, spikes);
  instances(keep(new THREE.CylinderGeometry(1, 0.82, 1, 8)), towerMaterial, discs);

  // ---- Mountains behind the city ----
  const mountainMaterial = (color: string) => keep(new THREE.MeshBasicMaterial({ color, vertexColors: true }));
  for (const [z, height, color] of [[-1_750, 230, '#9a74c8'], [-2_050, 340, '#c096d8']] as const) {
    const ridge = new THREE.PlaneGeometry(6_400, 1, 320, 1);
    const p = ridge.getAttribute('position');
    const shade = new Float32Array(p.count * 3);
    for (let index = 0; index < p.count; index += 1) {
      const x = p.getX(index), top = p.getY(index) > 0;
      const peak = Math.abs(Math.sin(x * 0.0041 + z)) * 0.55 + Math.abs(Math.sin(x * 0.0133)) * 0.3 + Math.abs(Math.sin(x * 0.037 + 2)) * 0.12;
      const open = Math.min(1, 0.22 + Math.abs(x) / 900);
      p.setY(index, top ? peak * height * open + 20 : -20);
      const s = top ? 0.72 : 1.35;
      shade.set([s, s, s], index * 3);
    }
    ridge.setAttribute('color', new THREE.BufferAttribute(shade, 3));
    const mesh = new THREE.Mesh(keep(ridge), mountainMaterial(color));
    mesh.position.z = z;
    scene.add(mesh);
  }
  flush(false);

  // ---- Mirror causeway of glass panels ----
  const mirrorGeometry = keep(new THREE.PlaneGeometry(4_000, 4_000));
  const mirror = new Reflector(mirrorGeometry, {
    textureWidth: Math.round(Math.min(1_024, context.pixels.width * 0.7)),
    textureHeight: Math.round(Math.min(1_024, context.pixels.height * 0.7)),
    clipBias: 0.003,
    shader: {
      name: 'CampusStellarFloor',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uHaze: { value: haze } },
      vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld; void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec3 uHaze; varying vec4 vUv; varying vec3 vWorld;
        ${NOISE_GLSL}
        void main() {
          vec2 p = vWorld.xz;
          float deck = 1.0 - smoothstep(8.5, 8.8, abs(p.x));
          vec2 panel = vec2(p.x / 4.2, p.y / 9.0);
          vec2 f = abs(fract(panel) - 0.5);
          vec2 fw = fwidth(panel) * 1.4;
          float joint = max(smoothstep(0.485 - fw.x, 0.495, f.x), smoothstep(0.49 - fw.y, 0.497, f.y));
          vec4 uv = vUv;
          uv.xy += (vec2(noise21(floor(panel) * 7.1), noise21(floor(panel) * 3.3)) - 0.5) * 0.008 * uv.w;
          vec3 mirror = texture2DProj(tDiffuse, uv).rgb;
          vec3 view = normalize(cameraPosition - vWorld);
          float fresnel = 0.3 + 0.7 * pow(1.0 - clamp(view.y, 0.0, 1.0), 3.0);
          vec3 glass = vec3(0.012, 0.008, 0.04) + mirror * fresnel * vec3(0.92, 0.86, 1.05);
          glass = mix(glass, vec3(0.015, 0.012, 0.035), joint * 0.85);
          vec3 rough = vec3(0.012, 0.009, 0.028) * (0.6 + noise21(p * 0.7)) + mirror * 0.12;
          vec3 color = mix(rough, glass, deck);
          float distance_ = length(vWorld - cameraPosition);
          color = mix(color, uHaze, clamp(1.0 - exp(-distance_ * 0.0011), 0.0, 0.9) * smoothstep(40.0, 260.0, distance_));
          gl_FragColor = vec4(color, 1.0);
        }`,
    },
  });
  mirror.rotation.x = -Math.PI / 2;
  scene.add(mirror);
  keep(mirror);

  // ---- Beams from orbit, drifting craft and beacons ----
  const beamMaterial = keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: time },
    vertexShader: 'varying vec2 vUv; varying float vSeed; void main(){ vUv = uv; vSeed = instanceMatrix[3].x; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uTime; varying vec2 vUv; varying float vSeed; void main(){ float pulse = 0.65 + 0.35 * sin(vUv.y * 9.0 + uTime * 2.2 + vSeed); float fade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y)); vec3 tone = mix(vec3(0.45, 0.75, 1.0), vec3(1.0, 0.5, 0.9), step(0.5, fract(vSeed * 0.013))); gl_FragColor = vec4(tone, fade * pulse * 0.8); }',
  }));
  instances(keep(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true)), beamMaterial, Array.from({ length: 30 }, () => {
    const x = (random() < 0.5 ? -1 : 1) * between(150, 760), length = between(160, 520);
    return { p: [x, between(260, 620), -between(700, 1_400)] as [number, number, number], s: [between(0.5, 1.4), length, between(0.5, 1.4)] as [number, number, number] };
  }));
  const glow = kit.glowMap();
  for (let index = 0; index < 60; index += 1) {
    const material = keep(new THREE.SpriteMaterial({ map: glow, color: index % 3 ? '#ff4fd0' : '#7fd0ff', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    const sprite = new THREE.Sprite(material);
    sprite.position.set((random() < 0.5 ? -1 : 1) * between(40, 320), between(20, 190), -between(100, 700));
    sprite.scale.setScalar(between(2, 6));
    scene.add(sprite);
  }
  const craftGeometry = keep(new THREE.ConeGeometry(0.7, 5, 5).rotateZ(-Math.PI / 2));
  const craft = Array.from({ length: 36 }, (_, index) => {
    const mesh = new THREE.Mesh(craftGeometry, index % 2 ? pink : cyan);
    mesh.userData = { y: between(35, 210), z: -between(150, 700), speed: between(12, 34) * (index % 2 ? 1 : -1), phase: random() * 900 };
    if (index % 2 === 0) mesh.rotation.z = Math.PI;
    scene.add(mesh);
    return mesh;
  });

  return {
    camera: { position: [0, 8.5, 28], pitch: 11, portraitPitch: 18, fov: 66, far: 9_000 },
    exposure: 1.05,
    bloom: { strength: 0.68, radius: 0.62, threshold: 0.8 },
    update: (seconds) => {
      time.value = seconds;
      great.rotation.y = seconds * 0.004;
      craft.forEach((mesh) => {
        const { y, z, speed, phase } = mesh.userData as { y: number; z: number; speed: number; phase: number };
        mesh.position.set(((((phase + seconds * speed) % 900) + 900) % 900) - 450, y, z);
      });
    },
  };
}
