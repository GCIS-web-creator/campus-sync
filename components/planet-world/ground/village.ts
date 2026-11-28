import * as THREE from 'three';
import { addSky, addSun, makeKit, NOISE_GLSL, type GroundContext, type GroundScene } from './kit';

// Stage 1 (and the untouched land of stage 0): a river valley seen from a gentle rise.

const riverX = (z: number) => 5 + Math.sin(z * 0.047 + 0.6) * 9 + Math.sin(z * 0.019) * 7;
const pathX = (z: number) => z > -32 ? 1.5 + Math.sin(z * 0.11) * 4.2 : riverX(z) + 13 + Math.sin(z * 0.07) * 3;
const BRIDGE_Z = -33;

const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function heightAt(x: number, z: number) {
  const rolling = Math.sin(x * 0.045) * Math.cos(z * 0.031) * 2.2 + Math.sin(x * 0.013 + z * 0.017) * 3.4;
  const nearRise = smooth(-18, 18, z) * 5.5;
  const farRise = smooth(-120, -330, z) * 10 + smooth(55, 190, Math.abs(x)) * 14;
  const river = 1 - smooth(2.6, 6.5, Math.abs(x - riverX(z)));
  const flat = 1 - smooth(0, 45, Math.abs(x)) * 0.5;
  return (rolling * (1 - flat * 0.65) + nearRise + farRise) * (1 - river) - river * 1.5;
}

function pathDistance(x: number, z: number) {
  if (z > -32) return Math.abs(x - pathX(z));
  const bridgeRun = z > BRIDGE_Z - 3 ? Math.abs(z - BRIDGE_Z) + Math.max(0, x - (riverX(BRIDGE_Z) + 14)) : 99;
  return Math.min(Math.abs(x - pathX(z)), bridgeRun);
}

export function buildVillage(context: GroundContext, settled: boolean): GroundScene {
  const kit = makeKit(context, settled ? 101 : 7);
  const { between, random, put, keep, flush, instances, texture, strut } = kit;
  const { scene } = context;
  const sunDirection = new THREE.Vector3(-0.55, 0.62, 0.38).normalize();
  const horizon = new THREE.Color('#bfdcec').lerp(context.atmosphere, 0.18);
  const haze = context.tone(horizon, 0);
  scene.fog = new THREE.Fog(haze.clone(), 120, 620);

  const sky = addSky(context, {
    zenith: '#1d5fae', middle: '#5b9fd8', horizon: '#' + horizon.getHexString(),
    cloudLight: '#fffaf0', cloudShade: '#a9bfd6', cover: 0.68, puff: 1,
    sunDirection, sunColor: '#fff0c8', sunStrength: 0.5, stars: 0,
  }, 1_500);

  scene.add(new THREE.HemisphereLight(context.tone('#cfe6ff', 0.5), '#62703a', 1.25));
  addSun(context, '#fff0d0', 2.5, sunDirection, [0, 0, -45], 95);

  // ---- Houses and fields are placed first so the ground can avoid them. ----
  const homes: Array<{ x: number; z: number; turn: number; size: number }> = settled ? [
    { x: -13, z: -13, turn: 0.5, size: 1.25 }, { x: -8.5, z: -20, turn: 0.32, size: 0.82 },
    { x: -15, z: -49, turn: 0.55, size: 1 }, { x: 30, z: -40, turn: -0.62, size: 1.15 },
    { x: 29, z: -66, turn: -0.4, size: 1.05 }, { x: 39, z: -74, turn: -0.9, size: 0.8 },
    { x: -21, z: -83, turn: 0.7, size: 0.95 }, { x: -46, z: -130, turn: 0.2, size: 1 },
    { x: -33, z: -138, turn: -0.3, size: 0.85 }, { x: 8, z: -152, turn: 0.5, size: 0.9 },
    { x: 22, z: -166, turn: -0.2, size: 0.8 }, { x: -64, z: -102, turn: 1.1, size: 0.9 },
  ] : [];
  const inField = (x: number, z: number) => settled && z < -30 && z > -125 && x < riverX(z) - 14 && x > -75
    && !homes.some((home) => Math.hypot(home.x - x, home.z - z) < 11);
  const nearHome = (x: number, z: number, margin: number) => homes.some((home) => Math.hypot(home.x - x, home.z - z) < margin * home.size);

  // ---- Terrain with painted vertex colours ----
  const ground = new THREE.PlaneGeometry(520, 520, 400, 400);
  ground.rotateX(-Math.PI / 2);
  ground.translate(0, 0, -200);
  const positions = ground.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const grassA = new THREE.Color('#5f8f2c'), grassB = new THREE.Color('#8fb43a'), grassC = new THREE.Color('#3f7430');
  const dirt = new THREE.Color('#b89566'), bank = new THREE.Color('#6f6a45'), furrowA = new THREE.Color('#a5a047'), furrowB = new THREE.Color('#d1bd68');
  const mix = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index), z = positions.getZ(index);
    positions.setY(index, heightAt(x, z));
    const patch = Math.sin(x * 0.09 + Math.sin(z * 0.05) * 3) * Math.sin(z * 0.073 - x * 0.031);
    mix.copy(grassA).lerp(patch > 0 ? grassB : grassC, Math.abs(patch) * 0.85);
    if (inField(x, z)) {
      const stripe = Math.sin((x * 0.8 + z * 0.45 + Math.sin(z * 0.06) * 5) * 1.35);
      mix.copy(furrowA).lerp(furrowB, smooth(-0.4, 0.5, stripe));
      if (Math.floor((z + 200) / 31) % 2 === 0) mix.lerp(grassB, 0.45);
    }
    if (nearHome(x, z, 6.5)) mix.lerp(dirt, 0.55);
    const toRiver = Math.abs(x - riverX(z));
    mix.lerp(bank, 1 - smooth(3.2, 5.2, toRiver));
    const toPath = pathDistance(x, z);
    if (settled) mix.lerp(dirt, 1 - smooth(1.2, 2.3, toPath + Math.sin(x * 2.1) * Math.cos(z * 1.7) * 0.25));
    colors.set([mix.r, mix.g, mix.b], index * 3);
  }
  ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  ground.computeVertexNormals();
  const soil = texture(256, (g, size) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, size, size);
    for (let index = 0; index < 5_000; index += 1) {
      const shade = Math.floor(between(165, 255));
      g.fillStyle = 'rgb(' + shade + ',' + shade + ',' + shade + ')';
      g.fillRect(between(0, size), between(0, size), between(1, 3), between(1, 5));
    }
  }, [130, 130]);
  const land = new THREE.Mesh(keep(ground), keep(new THREE.MeshLambertMaterial({ vertexColors: true, map: soil, emissive: '#0c1404' })));
  land.receiveShadow = true;
  scene.add(land);

  // ---- River ----
  const riverPoints: number[] = [], riverUv: number[] = [], riverIndex: number[] = [];
  for (let step = 0; step <= 420; step += 1) {
    const z = 40 - step;
    for (const side of [-1, 1]) {
      riverPoints.push(riverX(z) + side * 5.2, -0.55, z);
      riverUv.push(side, z);
    }
    if (step) {
      const a = (step - 1) * 2;
      riverIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const water = new THREE.BufferGeometry();
  water.setAttribute('position', new THREE.Float32BufferAttribute(riverPoints, 3));
  water.setAttribute('uv', new THREE.Float32BufferAttribute(riverUv, 2));
  water.setIndex(riverIndex);
  const waterMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uFog: { value: haze.clone() }, uSun: { value: sunDirection }, uDeep: { value: new THREE.Color().setRGB(0.012, 0.11, 0.13).lerp(context.tone(new THREE.Color().setRGB(0.012, 0.11, 0.13), 0.8), 0.45) }, uShine: { value: new THREE.Color().setRGB(0.2, 0.5, 0.66).lerp(context.tone(new THREE.Color().setRGB(0.2, 0.5, 0.66), 0.6), 0.6) } },
    vertexShader: 'varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uFog; uniform vec3 uSun; uniform vec3 uDeep; uniform vec3 uShine;
      varying vec2 vUv; varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        vec2 flow = vec2(vWorld.x * 0.9, vWorld.z * 0.32 - uTime * 0.55);
        float ripple = fbm(flow) - fbm(flow * 1.9 + vec2(uTime * 0.1, 3.0));
        vec3 view = normalize(cameraPosition - vWorld);
        vec3 normal = normalize(vec3(ripple * 0.9, 1.0, ripple * 0.5));
        float fresnel = pow(1.0 - max(dot(view, normal), 0.0), 3.0);
        vec3 color = mix(uDeep, uShine, clamp(fresnel * 0.9 + 0.12 + ripple * 1.3, 0.0, 1.0));
        color += vec3(1.0, 0.95, 0.8) * pow(max(dot(reflect(-uSun, normal), view), 0.0), 60.0) * 0.8;
        float foam = smoothstep(0.66, 0.95, abs(vUv.x) * 0.86 + noise21(vWorld.xz * 2.2 + uTime * 0.4) * 0.22);
        color = mix(color, vec3(0.55, 0.72, 0.7), foam * 0.36);
        color = mix(color, uFog, smoothstep(120.0, 620.0, length(cameraPosition - vWorld)));
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(keep(water), keep(waterMaterial)));

  // ---- Materials ----
  const planks = texture(256, (g, size) => {
    for (let x = 0; x < size; x += 32) {
      const tone = between(0.75, 1.05);
      g.fillStyle = 'rgb(' + Math.floor(150 * tone) + ',' + Math.floor(104 * tone) + ',' + Math.floor(66 * tone) + ')';
      g.fillRect(x, 0, 32, size);
      g.fillStyle = 'rgba(40,22,10,0.75)'; g.fillRect(x, 0, 3, size);
      for (let line = 0; line < 22; line += 1) {
        g.strokeStyle = 'rgba(55,30,14,' + between(0.12, 0.4) + ')'; g.lineWidth = 1;
        const gx = x + between(5, 30); g.beginPath(); g.moveTo(gx, between(0, size)); g.lineTo(gx + between(-2, 2), between(0, size)); g.stroke();
      }
    }
  });
  const straw = texture(512, (g, size) => {
    g.fillStyle = '#b58d47'; g.fillRect(0, 0, size, size);
    for (let index = 0; index < 9_000; index += 1) {
      const x = between(0, size), y = between(0, size), light = between(0.65, 1.3);
      g.strokeStyle = 'rgb(' + Math.floor(Math.min(255, 185 * light)) + ',' + Math.floor(Math.min(255, 142 * light)) + ',' + Math.floor(72 * light) + ')';
      g.lineWidth = between(0.8, 2.2); g.beginPath(); g.moveTo(x, y); g.lineTo(x + between(-4, 4), y + between(12, 34)); g.stroke();
    }
    for (let y = 84; y < size; y += 96) { g.fillStyle = 'rgba(70,45,15,0.3)'; g.fillRect(0, y, size, 7); }
  });
  const wood = keep(new THREE.MeshLambertMaterial({ map: planks }));
  const beam = keep(new THREE.MeshLambertMaterial({ color: '#53341f' }));
  const thatch = keep(new THREE.MeshLambertMaterial({ map: straw, color: '#f2d59a', side: THREE.DoubleSide }));
  const stone = keep(new THREE.MeshLambertMaterial({ color: '#9a958a' }));
  const windowGlow = keep(new THREE.MeshLambertMaterial({ color: '#2a2018', emissive: '#7a4a18' }));
  const hay = keep(new THREE.MeshLambertMaterial({ map: straw, color: '#ffe7a6' }));

  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const post = keep(new THREE.CylinderGeometry(1, 1.12, 1, 8));
  const rock = keep(new THREE.DodecahedronGeometry(1, 0));
  const cone = keep(new THREE.ConeGeometry(1, 1, 14));
  const barrel = keep(new THREE.CylinderGeometry(0.85, 0.72, 1, 12));
  const gableShape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  const gable = keep(new THREE.ExtrudeGeometry(gableShape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5));
  // A roof slope that bows slightly, like thick thatch. Spans x 0→1 from ridge to eave.
  const slope = keep(new THREE.BoxGeometry(1, 1, 1, 10, 1, 1));
  const slopePosition = slope.getAttribute('position');
  for (let index = 0; index < slopePosition.count; index += 1) {
    const x = slopePosition.getX(index) + 0.5;
    slopePosition.setXYZ(index, x, slopePosition.getY(index) + Math.sin(x * Math.PI) * 0.55 - (x > 0.94 ? 0.25 : 0), slopePosition.getZ(index));
  }
  slope.computeVertexNormals();

  const house = (x: number, z: number, turn: number, size: number) => {
    const base = new THREE.Matrix4().compose(
      new THREE.Vector3(x, heightAt(x, z) - 0.15, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn),
      new THREE.Vector3(size, size, size),
    );
    const width = 6.4, depth = 7.6, wall = 3.1, rise = 3.5;
    put(box, stone, [0, 0.25, 0], [width + 0.35, 0.8, depth + 0.35], [0, 0, 0], base);
    put(box, wood, [0, wall / 2 + 0.4, 0], [width, wall, depth], [0, 0, 0], base);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(box, beam, [sx * width / 2, wall / 2 + 0.4, sz * depth / 2], [0.32, wall + 0.1, 0.32], [0, 0, 0], base);
    for (const sz of [-1, 1]) {
      put(gable, wood, [0, wall + 0.4, sz * (depth / 2 - 0.1)], [width, rise, 0.2], [0, 0, 0], base);
      put(box, beam, [0, wall + 0.45, sz * (depth / 2 + 0.04)], [width + 0.2, 0.24, 0.16], [0, 0, 0], base);
    }
    const run = width / 2 + 1.05, drop = rise * run / (width / 2);
    const length = Math.hypot(run, drop), angle = Math.atan2(drop, run);
    for (const side of [1, -1]) {
      put(slope, thatch, [0, wall + rise + 0.62, 0], [length, 0.62, depth + 1.3], [0, side > 0 ? 0 : Math.PI, -angle], base);
    }
    put(post, hay, [0, wall + rise + 0.86, 0], [0.36, depth + 1.45, 0.36], [Math.PI / 2, 0, 0], base);
    for (const sz of [-1, 1]) for (const side of [-1, 1]) {
      strut(box, beam,
        new THREE.Vector3(0, wall + rise + 0.45, sz * (depth / 2 + 0.55)).applyMatrix4(base),
        new THREE.Vector3(side * run * 0.97, wall + rise - drop * 0.97 + 0.45, sz * (depth / 2 + 0.55)).applyMatrix4(base), 0.16 * size);
    }
    // Door, shutters and gable window on the front.
    const front = depth / 2 + 0.07;
    put(box, beam, [0.9, 1.5, front], [1.5, 2.3, 0.12], [0, 0, 0], base);
    put(box, wood, [0.9, 1.45, front + 0.05], [1.2, 2.05, 0.1], [0, 0, 0], base);
    for (const [wx, wy] of [[-1.6, 2.05], [0, wall + 1.75]]) {
      put(box, beam, [wx, wy, front + 0.02], [1.35, 1.15, 0.14], [0, 0, 0], base);
      put(box, windowGlow, [wx, wy, front + 0.09], [1.05, 0.85, 0.08], [0, 0, 0], base);
      put(box, beam, [wx, wy, front + 0.14], [0.09, 0.9, 0.06], [0, 0, 0], base);
      put(box, beam, [wx, wy, front + 0.14], [1.1, 0.09, 0.06], [0, 0, 0], base);
    }
    for (const side of [-1, 1]) for (const wz of [-2.1, 1.7]) {
      put(box, beam, [side * (width / 2 + 0.04), 2.1, wz], [0.14, 1.15, 1.3], [0, 0, 0], base);
      put(box, windowGlow, [side * (width / 2 + 0.1), 2.1, wz], [0.08, 0.85, 1], [0, 0, 0], base);
    }
    for (let stoneIndex = 0; stoneIndex < 22; stoneIndex += 1) {
      put(rock, stone, [width * 0.24 + (stoneIndex % 2) * 0.28, wall + 1.2 + Math.floor(stoneIndex / 2) * 0.32, -depth * 0.22], [0.34, 0.24, 0.42], [random(), random(), random()], base);
    }
    for (let index = 0; index < 5; index += 1) {
      const bx = between(-width / 2 - 1.2, -width / 2 - 0.5), bz = between(-1, depth / 2);
      put(barrel, wood, [bx, 0.55, bz], [0.45, 0.95, 0.45], [0, random() * 3, 0], base);
    }
  };
  homes.forEach((home) => house(home.x, home.z, home.turn, home.size));

  if (settled) {
    // Porch of the nearest house.
    const near = new THREE.Matrix4().compose(new THREE.Vector3(-13, heightAt(-13, -13), -13), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5), new THREE.Vector3(1.25, 1.25, 1.25));
    put(slope, thatch, [0.4, 3.25, 4.4], [2.3, 0.28, 3.8], [0, -Math.PI / 2, -0.38], near);
    for (const px of [-1.2, 2]) put(post, beam, [px, 1.2, 5.9], [0.13, 2.5, 0.13], [0, 0, 0], near);

    // Bridge across the river.
    const centre = riverX(BRIDGE_Z);
    const deck = (t: number) => 0.55 + Math.sin(t * Math.PI) * 1.05;
    for (let step = 0; step < 26; step += 1) {
      const t = (step + 0.5) / 26;
      put(box, wood, [centre - 7 + t * 14, deck(t), BRIDGE_Z], [0.5, 0.18, 3.1], [0, 0, Math.cos(t * Math.PI) * 0.22]);
    }
    for (const side of [-1.55, 1.55]) {
      for (let step = 0; step <= 8; step += 1) {
        const t = step / 8, x = centre - 7 + t * 14;
        put(post, beam, [x, deck(t) + 0.5, BRIDGE_Z + side], [0.12, 1.15, 0.12]);
        if (step < 8) strut(post, beam, new THREE.Vector3(x, deck(t) + 1.02, BRIDGE_Z + side), new THREE.Vector3(x + 1.75, deck((step + 1) / 8) + 1.02, BRIDGE_Z + side), 0.09);
      }
    }

    // Split-rail fences beside the path and around the fields.
    const fence = (points: Array<[number, number]>) => {
      for (let index = 0; index < points.length; index += 1) {
        const [x, z] = points[index];
        const y = heightAt(x, z);
        put(post, wood, [x, y + 0.6, z], [0.13, 1.35, 0.13]);
        const next = points[index + 1];
        // A missing stretch (made room for a house) stays open.
        if (!next || Math.abs(next[1] - z) > 2.5) continue;
        const ny = heightAt(next[0], next[1]);
        for (const rail of [0.55, 0.98]) strut(post, wood, new THREE.Vector3(x, y + rail, z), new THREE.Vector3(next[0], ny + rail, next[1]), 0.07);
      }
    };
    const line = (from: number, to: number, x: (z: number) => number) => {
      const points: Array<[number, number]> = [];
      for (let z = from; z > to; z -= 2.1) points.push([x(z), z]);
      return points;
    };
    fence(line(9, -17, (z) => pathX(z) + 3.2));
    fence(line(-3, -26, (z) => pathX(z) - 3.4).filter(([x, z]) => !nearHome(x, z, 7) && Math.abs(x - riverX(z)) > 5.5));
    fence(line(-44, -92, (z) => pathX(z) + 3.2));
    fence(line(-36, -112, (z) => riverX(z) - 11).filter(([x, z]) => !nearHome(x, z, 8)));

    // Haystacks, wood piles and baskets.
    for (const [x, z, s] of [[-17, -5, 1.5], [-26, -52, 1.2], [-22, -56, 1], [-34, -70, 1.1], [24, -34, 0.9], [-2, -98, 1]]) {
      const y = heightAt(x, z);
      put(cone, hay, [x, y + s * 0.85, z], [s * 1.25, s * 1.9, s * 1.25]);
      put(barrel, hay, [x, y + 0.25, z], [s * 1.35, 0.55, s * 1.35], [Math.PI, 0, 0]);
    }
    for (let index = 0; index < 18; index += 1) {
      put(post, wood, [-5.8 + (index % 6) * 0.42, heightAt(-5, -10.5) + 0.25 + Math.floor(index / 6) * 0.36, -10.5], [0.2, 1.4, 0.2], [Math.PI / 2, 0, 0]);
    }
  }

  // Stones along the water.
  for (let z = 10; z > -150; z -= 1.3) {
    for (const side of [-1, 1]) {
      if (random() > 0.6) continue;
      const x = riverX(z) + side * between(3.7, 4.8);
      put(rock, stone, [x, heightAt(x, z) + 0.05, z], [between(0.15, 0.55), between(0.1, 0.35), between(0.15, 0.55)], [random(), random() * 3, random()]);
    }
  }
  flush(true);

  // ---- Vegetation ----
  const clear = (x: number, z: number, margin: number) =>
    Math.abs(x - riverX(z)) > 5 + margin && (!settled || pathDistance(x, z) > 1.8 + margin) && !nearHome(x, z, 6 + margin);

  const blade = keep(new THREE.BufferGeometry());
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.12, 1, 0.08], 3));
  blade.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  const bladeMaterial = kit.leafMaterial('#ffffff', 0.05);
  const blades: Array<{ p: [number, number, number]; s: [number, number, number]; r: [number, number, number]; c: THREE.Color }> = [];
  const tones = ['#6c9c2e', '#89b53a', '#4f8429', '#a9c24a'].map((c) => new THREE.Color(c));
  for (let index = 0; index < (context.compact ? 30_000 : 52_000); index += 1) {
    const z = 18 - Math.pow(random(), 1.7) * 85;
    const x = between(-34, 34) * (1 + Math.max(0, -z) / 80);
    if (!clear(x, z, -0.5) || inField(x, z)) continue;
    blades.push({ p: [x, heightAt(x, z) - 0.03, z], s: [between(0.06, 0.13), between(0.18, 0.62), 1], r: [between(-0.3, 0.3), random() * 6.3, between(-0.3, 0.3)], c: tones[index % 4] });
  }
  instances(blade, bladeMaterial, blades);

  // Crops standing in rows on the fields.
  if (settled) {
    const crops: typeof blades = [];
    for (let z = -32; z > -112; z -= 0.75) {
      for (let x = -62; x < riverX(z) - 14; x += 0.55) {
        if (!inField(x, z) || Math.sin((x * 0.8 + z * 0.45 + Math.sin(z * 0.06) * 5) * 1.35) < 0.15) continue;
        crops.push({ p: [x + between(-0.2, 0.2), heightAt(x, z), z + between(-0.2, 0.2)], s: [0.24, between(0.35, 0.65), 1], r: [0, random() * 6.3, 0], c: tones[random() > 0.5 ? 3 : 1] });
      }
    }
    if (crops.length) instances(blade, bladeMaterial, crops);
  }

  const petal = keep(new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2));
  const flowers: typeof blades = [];
  const bloomColors = ['#ffd43a', '#e8402c', '#f4f4ff', '#9a62d8', '#ff8fb0', '#4a78e0'].map((c) => new THREE.Color(c));
  for (let cluster = 0; cluster < 260; cluster += 1) {
    const cz = 13 - Math.pow(random(), 1.5) * 55, cx = between(-26, 28);
    const color = bloomColors[cluster % bloomColors.length];
    for (let index = 0; index < 22; index += 1) {
      const x = cx + between(-1.3, 1.3), z = cz + between(-1.3, 1.3);
      if (!clear(x, z, -0.2) || inField(x, z)) continue;
      const size = between(0.06, 0.15);
      flowers.push({ p: [x, heightAt(x, z) + between(0.22, 0.55), z], s: [size, size, size], r: [between(0.1, 0.7), random() * 6.3, between(-0.3, 0.3)], c: color });
    }
  }
  if (flowers.length) instances(petal, keep(new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#222222', side: THREE.DoubleSide })), flowers);

  const leaves = context.compact ? kit.leafCluster(90, 0.29) : kit.leafCluster(150, 0.23);
  const leafTones = ['#3f7a30', '#548f34', '#2d6132'].map((c) => kit.leafMaterial(c, 0.1));
  const crowns: Array<Array<{ p: [number, number, number]; s: [number, number, number]; r: [number, number, number] }>> = [[], [], []];
  const crown = (x: number, y: number, z: number, size: number, tone: number) => {
    crowns[tone].push({ p: [x, y, z], s: [size, size * between(0.7, 0.95), size], r: [0, random() * 6.3, 0] });
  };
  const trunks: Array<{ p: [number, number, number]; s: [number, number, number] }> = [];
  const tree = (x: number, z: number, height: number, tall: boolean) => {
    const y = heightAt(x, z), tone = Math.floor(random() * 3);
    trunks.push({ p: [x, y + height * 0.38, z], s: [height * 0.055, height * 0.8, height * 0.055] });
    for (let index = 0; index < (tall ? 7 : 5); index += 1) {
      const level = index / (tall ? 7 : 5);
      const spread = tall ? height * 0.14 * (1 - level * 0.6) : height * 0.24;
      crown(x + between(-spread, spread), y + height * (tall ? 0.42 + level * 0.62 : between(0.62, 0.95)), z + between(-spread, spread), height * (tall ? 0.24 - level * 0.12 : 0.26), tone);
    }
  };
  // Forest belt in front of the mountains, and scattered groves in the valley.
  for (let index = 0; index < 620; index += 1) {
    const x = between(-210, 210), z = between(-300, -165) - Math.abs(x) * 0.1;
    if (Math.abs(x - riverX(z)) > 9 && !nearHome(x, z, 12)) tree(x, z, between(9, 19), random() < 0.72);
  }
  for (let index = 0; index < (settled ? 150 : 330); index += 1) {
    const x = between(-100, 100), z = between(-160, -14);
    if (Math.abs(x) < 19 && z > -75) continue;
    if (clear(x, z, 2.5) && !inField(x, z)) tree(x, z, between(3.5, 9), random() < (settled ? 0.35 : 0.5));
  }
  // The great old trees on the right.
  for (const [x, z, h] of [[42, -52, 24], [52, -66, 28], [37, -90, 19]]) {
    tree(x, z, h, false);
    for (let index = 0; index < 16; index += 1) crown(x + between(-6, 6), heightAt(x, z) + h * between(0.7, 1.15), z + between(-5, 5), between(2.6, 4.6), index % 3);
  }
  for (let index = 0; index < 420; index += 1) {
    const x = between(-30, 32), z = between(-70, 14);
    if (clear(x, z, 0.4) && !inField(x, z) && (Math.abs(x - pathX(z)) > 5 || random() < 0.15)) crown(x, heightAt(x, z) + 0.25, z, between(0.25, 0.8), index % 3);
  }
  for (const [x, z, s] of [[-12, 6, 2.1], [-9, 8.5, 1.5], [-15, 3, 1.7], [17, -2, 1.5]]) {
    for (let index = 0; index < 7; index += 1) crown(x + between(-1.4, 1.4), heightAt(x, z) + s * 0.4 + between(-0.3, 0.9), z + between(-1, 1), s * between(0.5, 0.85), 2);
  }
  crowns.forEach((list, index) => instances(leaves, leafTones[index], list, true));
  instances(post, beam, trunks, true);

  // ---- Mountains ----
  const mountain = (x: number, z: number, radius: number, height: number, color: string, snow: boolean) => {
    const geometry = new THREE.ConeGeometry(radius, height, 48, 24, true);
    const position = geometry.getAttribute('position');
    const tint = new Float32Array(position.count * 3);
    const rockColor = new THREE.Color(color).lerp(context.tone(color, 0.3), 0.3), peak = new THREE.Color('#cdd8e4'), forest = new THREE.Color('#3f6a55');
    for (let index = 0; index < position.count; index += 1) {
      const px = position.getX(index), py = position.getY(index), pz = position.getZ(index);
      const level = py / height + 0.5;
      const angle = Math.atan2(pz, px);
      const ridge = 1 + (Math.sin(angle * 5 + level * 4) * 0.13 + Math.sin(angle * 13 - level * 9) * 0.07) * (1 - level * 0.7);
      position.setXYZ(index, px * ridge, py + Math.sin(angle * 7) * height * 0.025 * level, pz * ridge);
      const c = rockColor.clone().lerp(forest, 1 - smooth(0.12, 0.45, level + Math.sin(angle * 9) * 0.05));
      if (snow) c.lerp(peak, smooth(0.78, 0.9, level + Math.sin(angle * 11) * 0.07) * 0.75);
      tint.set([c.r, c.g, c.b], index * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    geometry.computeVertexNormals();
    const material = keep(new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, emissive: new THREE.Color('#16283c').lerp(context.tone('#16283c', 0.4), 0.4) }));
    const mesh = new THREE.Mesh(keep(geometry), material);
    mesh.position.set(x, height / 2 - 8, z);
    scene.add(mesh);
  };
  mountain(-175, -560, 210, 175, '#5d7c92', true);
  mountain(-30, -690, 190, 105, '#7c9bb5', false);
  mountain(135, -640, 230, 140, '#6d8ea8', true);
  mountain(330, -560, 220, 120, '#5f819a', false);
  mountain(-390, -520, 230, 115, '#5f8196', false);

  return {
    camera: { position: [pathX(15) + 1, heightAt(pathX(15), 15) + 6.4, 17], pitch: -7, portraitPitch: -6, fov: 58, far: 2_400 },
    exposure: 1,
    bloom: { strength: 0.12, radius: 0.4, threshold: 0.96 },
    update: (time) => { sky.update(time); waterMaterial.uniforms.uTime.value = time; },
  };
}
