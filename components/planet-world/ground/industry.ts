import * as THREE from 'three';
import { addEnvironment, addSky, makeKit, type GroundContext, type GroundScene } from './kit';

// Stage 3: a refinery and research complex lit up against a deep blue night.

export function buildIndustry(context: GroundContext): GroundScene {
  const kit = makeKit(context, 307);
  const { between, random, put, keep, flush, instances, texture, strut } = kit;
  const { scene } = context;
  scene.fog = new THREE.Fog('#0a1844', 150, 560);
  const sky = addSky(context, {
    zenith: '#04103c', middle: '#0b2a7c', horizon: '#2a55ac',
    cloudLight: '#1d3568', cloudShade: '#0a1840', cover: 0.18, puff: 0,
    sunDirection: new THREE.Vector3(0, -0.4, -1), sunColor: '#000000', sunStrength: 0, stars: 0.12,
  }, 900);
  addEnvironment(context, '#16306e', '#3a1c10', [
    { color: '#ffd9a8', position: [30, 4, 20], size: 2.4 }, { color: '#ffe9d0', position: [-26, 10, 24], size: 3 },
    { color: '#a8c4ff', position: [-10, 30, -30], size: 3 }, { color: '#ff9a50', position: [20, -6, -34], size: 5 },
  ]);
  scene.add(new THREE.HemisphereLight('#42589c', '#4a2410', 0.55));
  const moon = new THREE.DirectionalLight('#9fb8ff', 0.55);
  moon.position.set(-0.4, 0.8, 0.5);
  const sodium = new THREE.DirectionalLight('#ffb069', 0.75);
  sodium.position.set(0.35, -0.12, 1);
  scene.add(moon, sodium);
  for (const [x, y, z, color, power] of [[-28, 9, -18, '#ffd2a0', 520], [-4, 6, -30, '#fff0dc', 420], [20, 12, -34, '#ffe6c4', 520], [38, 8, -26, '#ffb36a', 380], [-46, 22, -48, '#ffc890', 600]] as const) {
    const light = new THREE.PointLight(color, power * 0.8, 64, 1.75);
    light.position.set(x, y, z);
    scene.add(light);
  }

  const platingMap = texture(256, (g, size) => {
    g.fillStyle = '#cfd2d4'; g.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 42) {
      const tone = Math.floor(between(180, 235));
      g.fillStyle = 'rgb(' + tone + ',' + tone + ',' + (tone + 4) + ')'; g.fillRect(0, y, size, 40);
      g.fillStyle = 'rgba(40,40,45,0.55)'; g.fillRect(0, y, size, 2);
      for (let x = (y / 42 % 2) * 32; x < size; x += 64) g.fillRect(x, y, 2, 42);
    }
    for (let index = 0; index < 90; index += 1) {
      g.fillStyle = 'rgba(' + Math.floor(between(90, 150)) + ',' + Math.floor(between(50, 85)) + ',30,' + between(0.05, 0.22) + ')';
      g.fillRect(between(0, size), between(0, size), between(1, 6), between(12, 70));
    }
  }, [3, 4]);
  const standard = (color: string, metalness: number, roughness: number, map?: THREE.Texture) =>
    keep(new THREE.MeshStandardMaterial({ color, metalness, roughness, map: map ?? null }));
  const steel = standard('#c4c9cf', 0.88, 0.34, platingMap);
  const pipeSteel = standard('#aeb4bc', 0.85, 0.4);
  const rust = standard('#8a4a30', 0.55, 0.62);
  const structure = standard('#8d7766', 0.65, 0.5);
  const darkSteel = standard('#3c3a40', 0.7, 0.55);
  const cream = standard('#c9bba4', 0.4, 0.5, platingMap);
  const red = standard('#d8452a', 0.2, 0.55);
  const white = standard('#d8d4cc', 0.2, 0.55);
  const yellow = standard('#c99a1c', 0.4, 0.55);
  const orangeFence = keep(new THREE.MeshStandardMaterial({ color: '#8f3d18', metalness: 0.35, roughness: 0.62 }));
  const concrete = standard('#090a10', 0.05, 0.98);
  const lampGlow = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff3e0').multiplyScalar(2.6) }));
  const amberGlow = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb256').multiplyScalar(1.7) }));
  const redGlow = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2414').multiplyScalar(5) }));
  const tubeGlow = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#dfeaff').multiplyScalar(1.5) }));
  const labGlow = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe6ff').multiplyScalar(1.7) }));

  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const pole = keep(new THREE.CylinderGeometry(1, 1, 1, 6));
  const round = keep(new THREE.CylinderGeometry(1, 1, 1, 28));
  const dome = keep(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2));
  const ball = keep(new THREE.SphereGeometry(1, 24, 16));
  const bulb = keep(new THREE.SphereGeometry(1, 6, 4));
  const ring = keep(new THREE.TorusGeometry(1, 0.028, 5, 40).rotateX(Math.PI / 2));
  const flange = keep(new THREE.TorusGeometry(1, 0.1, 6, 24).rotateX(Math.PI / 2));

  const lights: Array<{ p: THREE.Vector3; color: THREE.Color; size: number }> = [];
  const warmLight = new THREE.Color('#ffd9a6'), coolLight = new THREE.Color('#eef4ff'), redLight = new THREE.Color('#ff3a20');
  const lamp = (x: number, y: number, z: number, size = 1, kind: 'white' | 'amber' | 'red' = 'white') => {
    put(bulb, kind === 'red' ? redGlow : kind === 'amber' ? amberGlow : lampGlow, [x, y, z], [0.13 * size, 0.13 * size, 0.13 * size]);
    lights.push({ p: new THREE.Vector3(x, y, z), color: kind === 'red' ? redLight : kind === 'amber' ? warmLight : coolLight, size });
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // A walkway ring with handrail and posts around a vessel.
  const platform = (x: number, y: number, z: number, radius: number, lampChance: number) => {
    put(round, darkSteel, [x, y, z], [radius, 0.16, radius]);
    put(ring, structure, [x, y + 1.05, z], [radius, 1.6, radius]);
    put(ring, structure, [x, y + 0.55, z], [radius, 1, radius]);
    const posts = Math.max(10, Math.round(radius * 6));
    for (let index = 0; index < posts; index += 1) {
      const angle = index / posts * Math.PI * 2, px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
      put(pole, structure, [px, y + 0.52, pz], [0.035, 1.05, 0.035]);
      if (Math.sin(angle) > -0.35 && random() < lampChance) lamp(px, y + between(0.9, 1.5), pz, between(0.7, 1.4), random() < 0.2 ? 'amber' : 'white');
    }
    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * Math.PI * 2;
      strut(box, darkSteel, v(x, y - 1.1, z), v(x + Math.cos(angle) * radius, y - 0.1, z + Math.sin(angle) * radius), 0.09);
    }
  };
  const ladder = (x: number, z: number, from: number, to: number) => {
    for (const dx of [-0.28, 0.28]) put(box, yellow, [x + dx, (from + to) / 2, z], [0.06, to - from, 0.06]);
    for (let y = from; y < to; y += 0.42) put(box, yellow, [x, y, z], [0.56, 0.045, 0.045]);
  };
  // A tall distillation column.
  const column = (x: number, z: number, radius: number, height: number, material: THREE.Material, decks: number) => {
    put(round, material, [x, height / 2, z], [radius, height, radius]);
    put(dome, material, [x, height, z], [radius, radius * 0.75, radius]);
    put(round, darkSteel, [x, 1.5, z], [radius * 1.18, 3, radius * 1.18]);
    for (let y = 4; y < height; y += 3.1) put(flange, pipeSteel, [x, y, z], [radius * 1.02, radius * 0.7, radius * 1.02]);
    for (let index = 1; index <= decks; index += 1) platform(x, height * index / decks - 0.6, z, radius + between(0.9, 1.5), 0.4);
    ladder(x + radius * 0.45, z + radius + 0.16, 0, height);
    for (const angle of [0.2, 1.3, 2.5]) {
      const px = x + Math.cos(angle) * (radius + 0.55), pz = z + Math.sin(angle) * (radius + 0.55);
      const top = height * between(0.55, 0.96);
      put(round, random() < 0.5 ? pipeSteel : cream, [px, top / 2, pz], [0.22, top, 0.22]);
      strut(round, pipeSteel, v(px, top, pz), v(x, top + 0.4, z), 0.2);
    }
    put(pole, structure, [x, height + radius * 0.75 + 1.4, z], [0.07, 2.8, 0.07]);
    lamp(x, height + radius * 0.75 + 2.9, z, 2.1);
  };
  // An open steel frame tower with cross bracing, decks and equipment.
  const lattice = (x: number, z: number, width: number, depth: number, height: number, storey: number, material: THREE.Material, lampChance: number) => {
    const xs = [x - width / 2, x, x + width / 2], zs = [z - depth / 2, z + depth / 2];
    for (const px of xs) for (const pz of zs) put(box, material, [px, height / 2, pz], [0.24, height, 0.24]);
    for (let y = storey; y <= height + 0.01; y += storey) {
      for (const pz of zs) strut(box, material, v(xs[0], y, pz), v(xs[2], y, pz), 0.16);
      for (const px of xs) strut(box, material, v(px, y, zs[0]), v(px, y, zs[1]), 0.14);
      put(box, darkSteel, [x, y - 0.06, z], [width * 0.98, 0.07, depth * 0.98]);
      const front = zs[1] + 0.25;
      for (const rail of [0.6, 1.1]) strut(box, structure, v(xs[0] - 0.3, y + rail, front), v(xs[2] + 0.3, y + rail, front), 0.05);
      for (let px = xs[0] - 0.3; px <= xs[2] + 0.31; px += 1.1) {
        put(box, structure, [px, y + 0.55, front], [0.045, 1.1, 0.045]);
        if (random() < lampChance) lamp(px, y + between(1.2, 2), front, between(0.6, 1.3), random() < 0.3 ? 'amber' : 'white');
      }
      for (const [a, b] of [[0, 1], [1, 2]]) {
        for (const pz of zs) {
          strut(pole, material, v(xs[a], y - storey, pz), v(xs[b], y, pz), 0.06);
          if (random() < 0.7) strut(pole, material, v(xs[b], y - storey, pz), v(xs[a], y, pz), 0.06);
        }
      }
      for (let index = 0; index < Math.ceil(width / 3); index += 1) {
        const px = between(xs[0] + 0.7, xs[2] - 0.7), r = between(0.35, 1);
        if (random() < 0.5) put(round, random() < 0.6 ? steel : cream, [px, y - storey + r * 1.4, z], [r, r * 2.6, r]);
        else put(round, random() < 0.3 ? rust : pipeSteel, [px, y - storey + r + 0.1, z], [r * 0.7, between(2, 4.5), r * 0.7], [0, 0, Math.PI / 2]);
      }
    }
  };
  // A pipe that runs through the given points with rounded bends.
  const pipe = (points: THREE.Vector3[], radius: number, material: THREE.Material) => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    let cursor = points[0];
    for (let index = 1; index < points.length - 1; index += 1) {
      const corner = points[index];
      const bend = Math.min(radius * 3.2, corner.distanceTo(cursor) * 0.45, corner.distanceTo(points[index + 1]) * 0.45);
      const enter = corner.clone().add(cursor.clone().sub(corner).setLength(bend));
      const leave = corner.clone().add(points[index + 1].clone().sub(corner).setLength(bend));
      path.add(new THREE.LineCurve3(cursor, enter));
      path.add(new THREE.QuadraticBezierCurve3(enter, corner, leave));
      cursor = leave;
    }
    path.add(new THREE.LineCurve3(cursor, points[points.length - 1]));
    const geometry = new THREE.TubeGeometry(path, Math.max(24, points.length * 28), radius, 10, false);
    put(geometry, material, [0, 0, 0]);
    geometry.dispose();
  };

  // Ground.
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(1_200, 1_200).rotateX(-Math.PI / 2)), concrete);
  scene.add(floor);

  // ---- Principal structures, arranged like a night photograph of a works ----
  column(-6, -36, 2.5, 25, steel, 3);
  column(17.5, -40, 1.8, 31, cream, 7);
  column(5.5, -44, 1, 15, cream, 4);
  column(27, -37, 0.9, 12.5, steel, 3);
  column(-33, -46, 1.2, 20, rust, 4);
  // Striped chimney with aircraft warning lamps.
  for (let band = 0; band < 7; band += 1) put(round, band % 2 ? white : red, [-14.5, 28 + band * 3.2 - 8, -48], [1.25 - band * 0.035, 3.2, 1.25 - band * 0.035]);
  put(round, rust, [-14.5, 10, -48], [1.3, 20, 1.3]);
  platform(-14.5, 40.8, -48, 2.2, 0);
  for (let index = 0; index < 10; index += 1) lamp(-14.5 + Math.cos(index) * 2.1, 41.9, -48 + Math.sin(index) * 2.1, 1.1, 'red');
  lattice(-24, -44, 8, 6, 36, 4, structure, 0.16);
  lattice(-42, -35, 20, 8, 19, 4.4, white, 0.3);
  lattice(34, -42, 15, 8, 17.5, 3.5, structure, 0.45);
  lattice(34, -42, 15, 8, 17.5, 3.5, red, 0);
  lattice(6, -48, 16, 7, 10.5, 3.5, structure, 0.35);
  lattice(-13, -32, 9, 5, 9, 3, rust, 0.35);
  lattice(55, -60, 18, 9, 14, 4.6, structure, 0.3);
  lattice(-64, -58, 20, 9, 22, 4.4, rust, 0.25);

  // Storage tank in the foreground.
  put(round, cream, [13.5, 4.2, -27], [6.2, 8.4, 6.2]);
  put(dome, cream, [13.5, 8.4, -27], [6.2, 1.1, 6.2]);
  platform(13.5, 8.5, -27, 6.35, 0.18);
  for (const y of [2.8, 5.6]) put(flange, pipeSteel, [13.5, y, -27], [6.22, 1, 6.22]);
  // Horizontal drums and spheres.
  for (const [x, y, z, r, length] of [[-5.5, 7.2, -27, 1.5, 6], [0.4, 6.4, -28, 1.35, 4], [-27, 9, -33, 1.1, 11], [-36, 5, -25, 1.6, 9], [26, 3.6, -22, 1, 7]]) {
    put(round, y > 8 ? pipeSteel : steel, [x, y, z], [r, length, r], [0, 0, Math.PI / 2]);
    for (const end of [-1, 1]) put(ball, steel, [x + end * length / 2, y, z], [r * 0.5, r, r]);
    for (const dx of [-length * 0.3, length * 0.3]) put(box, darkSteel, [x + dx, (y - r) / 2, z], [0.5, y - r, r * 1.5]);
    put(flange, pipeSteel, [x + length * 0.2, y, z], [r * 1.02, 1, r * 1.02], [0, 0, Math.PI / 2]);
  }
  for (const [x, z, r] of [[-52, -70, 6], [-38, -76, 5], [48, -78, 5.5]]) {
    put(ball, white, [x, r + 3, z], [r, r, r]);
    put(flange, structure, [x, r + 3, z], [r * 1.02, 1, r * 1.02]);
    for (let leg = 0; leg < 8; leg += 1) {
      const angle = leg / 8 * Math.PI * 2;
      strut(pole, structure, v(x + Math.cos(angle) * r * 1.1, 0, z + Math.sin(angle) * r * 1.1), v(x + Math.cos(angle) * r * 0.92, r + 3, z + Math.sin(angle) * r * 0.92), 0.24);
    }
  }

  // ---- Pipework ----
  for (let rack = 0; rack < 3; rack += 1) {
    const z = -23 - rack * 7.5;
    for (let x = -62; x <= 48; x += 6.5) {
      for (const dz of [-1.2, 1.2]) put(box, structure, [x, 4.6, z + dz], [0.28, 9.2, 0.28]);
      for (const y of [4.2, 6.4, 8.8]) put(box, structure, [x, y, z], [0.22, 0.22, 2.7]);
      if (random() < 0.5) lamp(x, between(4.8, 11), z + 1.5, between(0.6, 1.2), random() < 0.45 ? 'amber' : 'white');
    }
    for (let lane = 0; lane < 7; lane += 1) {
      const y = [4.55, 6.75, 9.15][lane % 3], r = between(0.13, 0.42);
      pipe([v(-66, y + r, z - 1 + (lane % 4) * 0.7), v(52, y + r, z - 1 + (lane % 4) * 0.7)], r, [pipeSteel, pipeSteel, cream, rust, white][Math.floor(random() * 5)]);
    }
  }
  for (let index = 0; index < 110; index += 1) {
    const x = between(-55, 46), z = between(-46, -20), low = between(0.5, 6), high = between(5, 17), run = between(-9, 9), r = between(0.1, 0.4);
    pipe([v(x, low, z), v(x, high, z), v(x + run, high, z), v(x + run, high, z - between(1, 6)), v(x + run, between(1, high), z - between(6, 8))], r, [pipeSteel, pipeSteel, steel, rust, cream, darkSteel][index % 6]);
    if (random() < 0.4) put(flange, structure, [x, (low + high) / 2, z], [r * 1.5, r * 2.4, r * 1.5]);
  }
  // The large looping pipes in front of the main column.
  pipe([v(-9.5, 10, -31), v(-9.5, 12.6, -27), v(-5.8, 12.6, -25.5), v(-5.8, 8.4, -25.5)], 0.55, steel);
  pipe([v(-6, 11, -32), v(-1.4, 11, -27), v(0.4, 9.4, -26), v(0.4, 7.2, -27)], 0.48, steel);
  pipe([v(-1, 9, -30), v(4.6, 10.4, -28), v(5.2, 5, -26)], 0.5, steel);

  // Long lit gallery on the left, stairs and a control building with research domes.
  lattice(-46, -28, 26, 4, 12.6, 4.2, white, 0.24);
  for (const y of [12.9, 8.7]) for (let x = -58; x < -34; x += 3.4) put(box, tubeGlow, [x, y - 0.35, -25.8], [2.4, 0.14, 0.1]);
  for (const [x0, x1] of [[22, 30], [30, 23], [38, 45]]) {
    const y0 = x0 === 30 ? 6.5 : 2.5, y1 = y0 + 4.5;
    for (const dz of [-0.7, 0.7]) strut(box, yellow, v(x0, y0, -30 + dz), v(x1, y1, -30 + dz), 0.12);
    for (let step = 0; step <= 16; step += 1) put(box, darkSteel, [x0 + (x1 - x0) * step / 16, y0 + (y1 - y0) * step / 16, -30], [0.4, 0.08, 1.4]);
  }
  const laboratory = (x: number, z: number, radius: number) => {
    put(round, white, [x, 5, z], [radius, 10, radius]);
    put(dome, steel, [x, 10, z], [radius, radius, radius]);
    for (const y of [3, 6.4, 9.4]) put(round, labGlow, [x, y, z], [radius * 1.012, 0.28, radius * 1.012]);
    put(box, labGlow, [x, 10 + radius * 0.72, z + radius * 0.7], [0.35, radius * 0.9, 0.15], [-0.78, 0, 0]);
  };
  laboratory(62, -92, 8);
  laboratory(-20, -96, 6);
  // Radio dish.
  const dish = new THREE.SphereGeometry(5.5, 28, 10, 0, Math.PI * 2, 0, 0.9);
  put(dish, white, [47, 24, -56], [1, 0.8, 1], [Math.PI + 0.75, 0, 0.3]);
  dish.dispose();
  put(round, structure, [47, 10, -57], [0.55, 20, 0.55]);
  lamp(47, 22, -53.4, 1.1, 'red');

  // Distant plant silhouettes keep the horizon busy.
  for (let index = 0; index < 90; index += 1) {
    const x = between(-190, 190), z = between(-210, -85), h = between(6, 30);
    if (index % 3 === 0) lattice(x, z, between(3, 8), 4, h, 5, darkSteel, 0.08);
    else {
      put(round, darkSteel, [x, h / 2, z], [between(0.6, 2.4), h, between(0.6, 2.4)]);
      for (let k = 0; k < 3; k += 1) lamp(x + between(-1.5, 1.5), between(2, h + 1), z + 2.6, between(0.5, 1), random() < 0.4 ? 'amber' : 'white');
    }
  }

  // ---- Corrugated fence, signal boxes, street lamp and cables in front ----
  const wallGeometry = new THREE.PlaneGeometry(150, 3.7, 900, 1);
  const wallPosition = wallGeometry.getAttribute('position');
  for (let index = 0; index < wallPosition.count; index += 1) wallPosition.setZ(index, Math.sin(wallPosition.getX(index) * 12) * 0.09);
  wallGeometry.computeVertexNormals();
  put(wallGeometry, orangeFence, [0, 1.85, -13]);
  wallGeometry.dispose();
  put(box, orangeFence, [0, 3.76, -13], [150, 0.12, 0.28]);
  for (let x = -70; x <= 70; x += 9.4) put(box, darkSteel, [x, 1.9, -12.82], [0.22, 3.9, 0.12]);
  put(pole, rust, [-10.8, 2.7, -12.3], [0.14, 5.4, 0.14]);
  for (const [dx, material] of [[-1.25, yellow], [-0.35, standard('#2f7a3a', 0.2, 0.5)], [0.6, yellow]] as const) put(box, material, [-10.8 + dx, 5.5, -12.3], [0.82, 0.95, 0.5]);
  put(pole, darkSteel, [26, 4.5, -12], [0.1, 9, 0.1]);
  put(box, darkSteel, [24.8, 9, -12], [2.5, 0.12, 0.12]);
  lamp(23.6, 8.85, -12, 1.8);
  for (const [y, sag] of [[3.5, 0.5], [3, 0.9], [2.4, 0.6]]) pipe(Array.from({ length: 21 }, (_, i) => v(-60 + i * 6, y - Math.sin(i * 0.9) * sag * 0.5, -12.55)), 0.035, darkSteel);

  flush(false);

  // ---- Star-shaped flares on every lamp ----
  const flare = texture(128, (g, size) => {
    g.clearRect(0, 0, size, size);
    const centre = size / 2;
    const halo = g.createRadialGradient(centre, centre, 0, centre, centre, centre * 0.55);
    halo.addColorStop(0, 'rgba(255,255,255,1)'); halo.addColorStop(0.2, 'rgba(255,255,255,0.42)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = halo; g.fillRect(0, 0, size, size);
    for (let ray = 0; ray < 8; ray += 1) {
      g.save(); g.translate(centre, centre); g.rotate(ray * Math.PI / 4 + 0.12);
      const gradient = g.createLinearGradient(0, 0, centre, 0);
      gradient.addColorStop(0, 'rgba(255,255,255,0.85)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gradient; g.beginPath(); g.moveTo(0, -1.4); g.lineTo(centre * (ray % 2 ? 0.7 : 1), 0); g.lineTo(0, 1.4); g.fill(); g.restore();
    }
  });
  const flareGroups = [0.8, 1.2, 2].map((limit, group) => {
    const chosen = lights.filter((light) => light.size <= limit && (group === 0 || light.size > [0.8, 1.2][group - 1]) || (group === 2 && light.size > 2));
    const geometry = new THREE.BufferGeometry().setFromPoints(chosen.map((light) => light.p));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(chosen.flatMap((light) => [light.color.r, light.color.g, light.color.b]), 3));
    const material = keep(new THREE.PointsMaterial({ map: flare, size: [1.5, 2.4, 5.5][group], vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const points = new THREE.Points(keep(geometry), material);
    scene.add(points);
    return material;
  });

  // Steam drifting from vents.
  const puff = kit.glowMap();
  const steam = Array.from({ length: 54 }, (_, index) => {
    const source = [[-33, 21.5, -46], [5.5, 17, -44], [30, 19, -41], [-46, 20, -36], [52, 16, -60], [-6, 27.5, -36]][index % 6];
    const material = keep(new THREE.SpriteMaterial({ map: puff, color: '#a9b6d8', transparent: true, opacity: 0, depthWrite: false }));
    const sprite = new THREE.Sprite(material);
    sprite.userData = { source, phase: index / 54 * 9 + random() };
    scene.add(sprite);
    return sprite;
  });

  return {
    camera: { position: [-1, 1.7, 13], pitch: 19.5, portraitPitch: 27, fov: 55, far: 1_600 },
    exposure: 1.12,
    bloom: { strength: 0.28, radius: 0.35, threshold: 0.97 },
    update: (time) => {
      sky.update(time);
      flareGroups.forEach((material, index) => { material.opacity = 0.82 + Math.sin(time * (1.7 + index) + index) * 0.05; });
      steam.forEach((sprite) => {
        const { source, phase } = sprite.userData as { source: number[]; phase: number };
        const life = ((time * 0.45 + phase) % 3) / 3;
        sprite.position.set(source[0] + life * 5 + Math.sin(phase * 9) * 0.6, source[1] + life * 7, source[2]);
        sprite.scale.setScalar(1.5 + life * 6);
        (sprite.material as THREE.SpriteMaterial).opacity = Math.sin(life * Math.PI) * 0.17;
      });
    },
  };
}
