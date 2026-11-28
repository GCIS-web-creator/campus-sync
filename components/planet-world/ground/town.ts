import * as THREE from 'three';
import { addSky, addSun, makeKit, type GroundContext, type GroundScene } from './kit';

// Stage 2: a stone town in the golden hour, with a castle closing the street.

const streetX = (z: number) => Math.sin(z * 0.045) * 2.2 + Math.max(0, -z - 40) * 0.06;
const streetY = (z: number) => Math.max(0, -z - 30) * 0.045;

export function buildTown(context: GroundContext): GroundScene {
  const kit = makeKit(context, 211);
  const { between, random, put, keep, flush, instances, texture, strut } = kit;
  const { scene } = context;
  // The sun hangs low behind the castle, a little to the right, and rakes the street.
  const glowDirection = new THREE.Vector3(0.24, 0.3, -0.92).normalize();
  scene.fog = new THREE.FogExp2(context.tone(new THREE.Color('#f0c58a').lerp(context.atmosphere, 0.08), 0), 0.0048);
  const sky = addSky(context, {
    zenith: '#4f78b4', middle: '#e6c08a', horizon: '#ffcd80',
    cloudLight: '#fff1cf', cloudShade: '#d9a878', cover: 0.38, puff: 0.35,
    sunDirection: glowDirection, sunColor: '#ffd58a', sunStrength: 0.72, stars: 0,
  }, 900);
  scene.add(new THREE.HemisphereLight(context.tone('#bcc8e6', 0.6), '#6a4a30', 1.05));
  addSun(context, '#ffc06a', 4.2, new THREE.Vector3(0.62, 0.55, -0.5), [0, 0, -34], 62);
  const fill = new THREE.DirectionalLight('#ffd9b0', 0.55);
  fill.position.set(-0.3, 0.5, 1);
  scene.add(fill);

  const masonry = (base: [number, number, number], rows: number, jitter: number) => texture(512, (g, size) => {
    g.fillStyle = 'rgb(' + Math.floor(base[0] * 0.42) + ',' + Math.floor(base[1] * 0.4) + ',' + Math.floor(base[2] * 0.38) + ')';
    g.fillRect(0, 0, size, size);
    const course = size / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let x = -between(0, course); x < size;) {
        const width = course * between(1.1, 2.3);
        const tone = between(1 - jitter, 1 + jitter * 0.5);
        const draw = (left: number) => {
          g.fillStyle = 'rgb(' + [0, 1, 2].map((i) => Math.min(255, Math.floor(base[i] * tone))).join(',') + ')';
          g.beginPath(); g.roundRect(left + 2, row * course + 2, width - 4, course - 4, course * 0.22); g.fill();
          g.fillStyle = 'rgba(255,244,220,0.22)'; g.fillRect(left + 5, row * course + 4, width - 10, 3);
          g.fillStyle = 'rgba(30,18,8,0.28)'; g.fillRect(left + 5, row * course + course - 8, width - 10, 4);
        };
        draw(x);
        if (x < 0) draw(x + size);
        x += width;
      }
    }
    for (let index = 0; index < 3_500; index += 1) {
      g.fillStyle = random() > 0.5 ? 'rgba(255,240,215,0.14)' : 'rgba(25,15,8,0.17)';
      g.fillRect(between(0, size), between(0, size), between(1, 4), between(1, 4));
    }
  });
  const wallMap = masonry([172, 154, 130], 11, 0.24);
  const towerMap = masonry([196, 180, 156], 10, 0.18);
  towerMap.repeat.set(5, 6);
  const timberMap = texture(256, (g, size) => {
    for (let x = 0; x < size; x += 26) {
      const tone = between(0.78, 1.12);
      g.fillStyle = 'rgb(' + Math.floor(126 * tone) + ',' + Math.floor(78 * tone) + ',' + Math.floor(42 * tone) + ')'; g.fillRect(x, 0, 26, size);
      g.fillStyle = 'rgba(28,14,6,0.8)'; g.fillRect(x, 0, 3, size);
      for (let line = 0; line < 16; line += 1) { g.fillStyle = 'rgba(40,20,8,' + between(0.1, 0.35) + ')'; g.fillRect(x + between(4, 24), between(0, size), 1, between(20, 90)); }
    }
  });
  const shingleMap = texture(256, (g, size) => {
    g.fillStyle = '#4a2416'; g.fillRect(0, 0, size, size);
    for (let row = 0; row < 12; row += 1) for (let col = -1; col < 13; col += 1) {
      const tone = between(0.7, 1.25);
      g.fillStyle = 'rgb(' + Math.floor(150 * tone) + ',' + Math.floor(78 * tone) + ',' + Math.floor(46 * tone) + ')';
      g.beginPath(); g.roundRect(col * 22 + (row % 2) * 11, row * 21.4, 20, 25, [0, 0, 9, 9]); g.fill();
    }
  }, [3, 2]);
  const cobbleMap = texture(512, (g, size) => {
    g.fillStyle = '#4d3d2c'; g.fillRect(0, 0, size, size);
    for (let row = 0; row < 10; row += 1) for (let col = 0; col < 10; col += 1) {
      const x = col * 51.2 + (row % 2) * 24 + between(-6, 6), y = row * 51.2 + between(-6, 6), tone = between(0.72, 1.18);
      for (const dx of [-size, 0]) {
        g.fillStyle = 'rgb(' + Math.floor(168 * tone) + ',' + Math.floor(146 * tone) + ',' + Math.floor(118 * tone) + ')';
        g.beginPath(); g.ellipse(x + dx + 26, y + 26, between(21, 27), between(18, 25), between(-0.5, 0.5), 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,236,200,0.2)'; g.beginPath(); g.ellipse(x + dx + 22, y + 20, 13, 8, -0.4, 0, Math.PI * 2); g.fill();
      }
    }
  }, [16, 90]);

  const stone = keep(new THREE.MeshStandardMaterial({ map: wallMap, bumpMap: wallMap, bumpScale: 2.4, roughness: 0.92 }));
  const towerStone = keep(new THREE.MeshStandardMaterial({ map: towerMap, bumpMap: towerMap, bumpScale: 2.2, roughness: 0.9 }));
  const timber = keep(new THREE.MeshStandardMaterial({ map: timberMap, roughness: 0.78 }));
  const beam = keep(new THREE.MeshStandardMaterial({ color: '#4a2c18', roughness: 0.75 }));
  const roof = keep(new THREE.MeshStandardMaterial({ map: shingleMap, bumpMap: shingleMap, bumpScale: 2, roughness: 0.8, side: THREE.DoubleSide }));
  const slate = keep(new THREE.MeshStandardMaterial({ map: shingleMap, color: '#c7a489', roughness: 0.7 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: '#160d07', roughness: 1 }));
  const warm = keep(new THREE.MeshStandardMaterial({ color: '#3a2108', emissive: '#d98a2c', emissiveIntensity: 1.1 }));
  const iron = keep(new THREE.MeshStandardMaterial({ color: '#221c18', metalness: 0.7, roughness: 0.45 }));
  const cloths = ['#a9482a', '#c8a05a', '#2f3b34', '#7a2f34'].map((color) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide })));
  const blue = keep(new THREE.MeshStandardMaterial({ color: '#1f3566', roughness: 0.8, side: THREE.DoubleSide }));
  const fruit = ['#b0301f', '#d98a1c', '#6a8a2a'].map((color) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.6 })));
  const clay = keep(new THREE.MeshStandardMaterial({ color: '#9a5630', roughness: 0.85 }));

  // Boxes whose texture repeats once per few metres, whatever their size.
  const boxCache = new Map<string, THREE.BufferGeometry>();
  const block = (material: THREE.Material, position: [number, number, number], size: [number, number, number], turn = 0, tile = 3.4) => {
    const key = size.map((v) => v.toFixed(1)).join('x') + '/' + tile;
    let geometry = boxCache.get(key);
    if (!geometry) {
      geometry = keep(new THREE.BoxGeometry(...size));
      const uv = geometry.getAttribute('uv');
      const dims = [[size[2], size[1]], [size[2], size[1]], [size[0], size[2]], [size[0], size[2]], [size[0], size[1]], [size[0], size[1]]];
      for (let face = 0; face < 6; face += 1) for (let i = face * 4; i < face * 4 + 4; i += 1) uv.setXY(i, uv.getX(i) * dims[face][0] / tile, uv.getY(i) * dims[face][1] / tile);
      boxCache.set(key, geometry);
    }
    put(geometry, material, position, [1, 1, 1], [0, turn, 0]);
  };
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = keep(new THREE.CylinderGeometry(1, 1, 1, 32, 1));
  const pole = keep(new THREE.CylinderGeometry(1, 1, 1, 8));
  const cone = keep(new THREE.ConeGeometry(1, 1, 28));
  const rock = keep(new THREE.DodecahedronGeometry(1, 0));
  const ball = keep(new THREE.SphereGeometry(1, 8, 6));
  const barrel = keep(new THREE.LatheGeometry([new THREE.Vector2(0, -0.5), new THREE.Vector2(0.36, -0.5), new THREE.Vector2(0.45, -0.22), new THREE.Vector2(0.47, 0), new THREE.Vector2(0.45, 0.22), new THREE.Vector2(0.36, 0.5), new THREE.Vector2(0, 0.5)], 16));
  const hoop = keep(new THREE.TorusGeometry(0.45, 0.025, 6, 18).rotateX(Math.PI / 2));
  const archShape = new THREE.Shape();
  archShape.moveTo(-0.5, 0); archShape.lineTo(-0.5, 0.65); archShape.absarc(0, 0.65, 0.5, Math.PI, 0, true); archShape.lineTo(0.5, 0);
  const arch = keep(new THREE.ShapeGeometry(archShape, 12));
  const archRing = keep(new THREE.TorusGeometry(0.58, 0.11, 6, 16, Math.PI));

  // ---- Street ----
  const road = new THREE.PlaneGeometry(40, 230, 80, 230).rotateX(-Math.PI / 2);
  const roadPosition = road.getAttribute('position');
  for (let index = 0; index < roadPosition.count; index += 1) {
    const x = roadPosition.getX(index), z = roadPosition.getZ(index) - 80;
    roadPosition.setXYZ(index, x + streetX(z), streetY(z) + Math.sin(x * 2.4) * Math.cos(z * 2.1) * 0.018, z);
  }
  road.computeVertexNormals();
  const roadMesh = new THREE.Mesh(keep(road), keep(new THREE.MeshStandardMaterial({ map: cobbleMap, bumpMap: cobbleMap, bumpScale: 3, roughness: 0.72 })));
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);
  for (let index = 0; index < 700; index += 1) {
    const z = between(-70, 16), side = random() < 0.5 ? -1 : 1;
    put(rock, stone, [streetX(z) + side * between(1.2, 6.5), streetY(z), z], [between(0.06, 0.3), between(0.02, 0.08), between(0.06, 0.3)], [0, random() * 3, 0]);
  }

  const windowAt = (x: number, y: number, z: number, face: number, width: number, height: number, lit: boolean) => {
    const turn = face > 0 ? Math.PI / 2 : -Math.PI / 2;
    put(arch, lit ? warm : dark, [x + face * 0.03, y, z], [width, height, 1], [0, turn, 0]);
    put(archRing, towerStone, [x + face * 0.04, y + height * 0.65, z], [width, width * 0.95, 1], [0, turn, 0]);
    put(box, towerStone, [x + face * 0.1, y - 0.05, z], [0.25, 0.14, width * 1.35]);
    put(box, beam, [x + face * 0.07, y + height * 0.45, z], [0.05, height * 0.9, 0.06]);
    put(box, beam, [x + face * 0.07, y + height * 0.5, z], [0.05, 0.06, width * 0.9]);
  };

  // A gable roof running along z.
  const gableRoof = (x: number, y: number, z: number, width: number, depth: number, rise: number, material: THREE.Material) => {
    const run = width / 2 + 0.7, drop = rise * run / (width / 2);
    const length = Math.hypot(run, drop), angle = Math.atan2(drop, run);
    for (const side of [-1, 1]) {
      put(box, material, [x + side * run / 2, y + rise - drop / 2 + 0.1, z], [length, 0.2, depth + 0.9], [0, 0, -side * angle]);
    }
    const shape = new THREE.Shape([new THREE.Vector2(-width / 2, 0), new THREE.Vector2(width / 2, 0), new THREE.Vector2(0, rise)]);
    const end = new THREE.ShapeGeometry(shape);
    for (const sz of [-1, 1]) {
      put(end, timber, [x, y, z + sz * depth / 2], [1, 1, 1], [0, sz < 0 ? Math.PI : 0, 0]);
      for (const side of [-1, 1]) strut(box, beam, new THREE.Vector3(x, y + rise + 0.1, z + sz * (depth / 2 + 0.35)), new THREE.Vector3(x + side * run, y + rise - drop + 0.1, z + sz * (depth / 2 + 0.35)), 0.2);
      for (const fan of [-0.55, -0.25, 0, 0.25, 0.55]) strut(box, beam, new THREE.Vector3(x, y + 0.15, z + sz * (depth / 2 + 0.05)), new THREE.Vector3(x + fan * width * 0.55, y + rise * (1 - Math.abs(fan) * 0.9), z + sz * (depth / 2 + 0.05)), 0.09);
    }
    end.dispose();
  };

  // ---- Houses lining the street ----
  const foliageSpots: Array<[number, number, number, number]> = [];
  const houseRow = (side: number) => {
    for (let z = side < 0 ? 15 : 13; z > -78;) {
      const along = between(6.5, 10);
      const depth = between(6, 9);
      const mid = z - along / 2;
      // Leave room for the great tower on the left and keep the middle distance open.
      const inner = streetX(mid) + side * (side < 0 ? between(6.6, 8.4) : between(6.4, 8));
      const x = inner + side * depth / 2;
      const y = streetY(mid);
      const lower = between(3.6, 5.6);
      block(stone, [x, y + lower / 2, mid], [depth, lower, along]);
      const jetty = z > -20 || random() < 0.5;
      const upper = between(2.8, 4.6);
      const overhang = jetty ? 0.8 : 0.1;
      const ux = x - side * overhang / 2;
      block(jetty ? timber : stone, [ux, y + lower + upper / 2, mid], [depth + overhang, upper, along - 0.3], 0, jetty ? 2.4 : 3.4);
      const face = -side;
      const upperFace = ux + face * (depth + overhang) / 2;
      block(beam, [upperFace, y + lower + 0.05, mid], [0.28, 0.32, along], 0);
      block(beam, [upperFace, y + lower + upper - 0.1, mid], [0.24, 0.24, along], 0);
      for (let post = -along / 2 + 0.3; post < along / 2; post += between(1.3, 2)) {
        put(box, beam, [upperFace + face * 0.04, y + lower + upper / 2, mid + post], [0.13, upper, 0.16]);
        if (jetty) strut(box, beam, new THREE.Vector3(inner + face * 0.05, y + lower - 1.3, mid + post), new THREE.Vector3(upperFace - face * 0.05, y + lower - 0.1, mid + post), 0.17);
        if (jetty) put(box, beam, [upperFace + face * 0.06, y + lower + upper * 0.28, mid + post + 0.4], [0.08, 0.1, 0.9], [0.6, 0, 0]);
      }
      for (let w = -along / 2 + 1.5; w < along / 2 - 1; w += 2.4) {
        windowAt(upperFace, y + lower + upper * 0.3, mid + w, face, 0.85, 1.25, random() < 0.3);
        if (random() < 0.6) windowAt(inner, y + between(2.2, 2.9), mid + w, face, 0.7, 0.85, random() < 0.18);
      }
      // Doorway with a stone surround.
      const door = mid + between(-along / 4, along / 4);
      put(arch, dark, [inner + face * 0.06, y, door], [1.5, 2.1, 1], [0, face * Math.PI / 2, 0]);
      put(archRing, towerStone, [inner + face * 0.1, y + 1.37, door], [1.55, 1.5, 2.2], [0, face * Math.PI / 2, 0]);
      for (const leg of [-0.9, 0.9]) block(towerStone, [inner + face * 0.08, y + 0.7, door + leg], [0.32, 1.45, 0.34], 0, 1.6);
      gableRoof(ux, y + lower + upper, mid, depth + overhang, along - 0.3, between(1.8, 3.2), random() < 0.75 ? roof : slate);
      // Chimney, lantern and climbing plants.
      block(stone, [x + side * 1.5, y + lower + upper + 2.2, mid + between(-2, 2)], [0.8, 2.6, 0.8], 0, 1.8);
      if (random() < 0.55) {
        const lz = mid + between(-along / 3, along / 3), lx = inner + face * 0.75;
        strut(pole, iron, new THREE.Vector3(inner, y + 3.5, lz), new THREE.Vector3(lx, y + 3.6, lz), 0.04);
        put(box, warm, [lx, y + 3.15, lz], [0.3, 0.46, 0.3]);
        for (const dx of [-0.17, 0.17]) for (const dz of [-0.17, 0.17]) put(box, iron, [lx + dx, y + 3.15, lz + dz], [0.04, 0.56, 0.04]);
        put(cone, iron, [lx, y + 3.55, lz], [0.3, 0.28, 0.3]);
      }
      if (random() < 0.8) {
        const vz = mid + between(-along / 2, along / 2);
        for (let leaf = 0; leaf < 22; leaf += 1) {
          const rise = (leaf / 22) * (lower + upper * 0.7);
          foliageSpots.push([(rise > lower ? upperFace : inner) + face * 0.12, y + rise, vz + between(-0.9, 0.9) * (1 - leaf / 30), between(0.2, 0.55)]);
        }
      }
      z -= along + between(0.1, 0.5);
    }
  };
  houseRow(-1);
  houseRow(1);

  // ---- Rugged foreground wall on the near right ----
  block(stone, [streetX(5) + 8, 7.5, 5.5], [4, 15, 19], 0, 4.2);
  block(towerStone, [streetX(5) + 5.9, 0.7, 5.5], [0.7, 1.4, 19], 0, 2.4);
  block(beam, [streetX(5) + 5.85, 7.4, 5.5], [0.45, 0.4, 19], 0);
  for (let index = 0; index < 45; index += 1) {
    put(rock, index % 3 ? stone : towerStone, [streetX(5) + 6.02, between(0.3, 14.5), between(-3.8, 14)], [between(0.08, 0.17), between(0.2, 0.34), between(0.28, 0.6)], [between(-0.15, 0.15), 0, between(-0.1, 0.1)]);
  }
  for (const z of [-2.5, 3.5, 9.5]) {
    windowAt(streetX(5) + 6, 9.3, z, -1, 1.1, 1.7, z === 3.5);
  }
  put(arch, dark, [streetX(5) + 5.5, 0, 0.5], [2, 2.9, 1], [0, -Math.PI / 2, 0]);
  put(archRing, towerStone, [streetX(5) + 5.45, 1.88, 0.5], [2.05, 2, 3], [0, -Math.PI / 2, 0]);

  // ---- Towers ----
  const tower = (x: number, y: number, z: number, radius: number, height: number, cap: 'crown' | 'cone', banner: boolean) => {
    put(cylinder, towerStone, [x, y + height / 2, z], [radius, height, radius]);
    for (const band of [0.38, 0.72]) put(cylinder, stone, [x, y + height * band, z], [radius * 1.04, 0.5, radius * 1.04]);
    put(cylinder, stone, [x, y + 1, z], [radius * 1.12, 2, radius * 1.12]);
    for (let level = 0; level < Math.floor(height / 4.2); level += 1) {
      for (let around = 0; around < 3; around += 1) {
        const angle = -0.9 + around * 0.9 + (level % 2) * 0.35 + (x < 0 ? 0.35 : -0.35);
        put(arch, random() < 0.25 ? warm : dark, [x + Math.sin(angle) * radius * 1.005, y + 3.6 + level * 4.1, z + Math.cos(angle) * radius * 1.005], [radius * 0.17, radius * 0.3, 1], [0, angle, 0]);
      }
    }
    put(cylinder, stone, [x, y + height + 0.4, z], [radius * 1.14, 0.8, radius * 1.14]);
    for (let around = 0; around < 20; around += 1) {
      const angle = around / 20 * Math.PI * 2;
      put(box, beam, [x + Math.sin(angle) * radius * 1.08, y + height - 0.3, z + Math.cos(angle) * radius * 1.08], [0.3, 0.7, 0.45], [0, angle, 0]);
    }
    if (cap === 'cone') {
      put(cylinder, towerStone, [x, y + height + 1.6, z], [radius * 0.92, 2, radius * 0.92]);
      put(cone, slate, [x, y + height + 2.6 + radius * 1.1, z], [radius * 1.18, radius * 2.2, radius * 1.18]);
      put(pole, iron, [x, y + height + 3.1 + radius * 2.3, z], [0.06, 1.6, 0.06]);
    } else {
      put(cylinder, towerStone, [x, y + height + 1.5, z], [radius * 1.1, 1.5, radius * 1.1]);
      for (let around = 0; around < 14; around += 1) {
        const angle = around / 14 * Math.PI * 2;
        put(box, towerStone, [x + Math.sin(angle) * radius * 1.04, y + height + 2.7, z + Math.cos(angle) * radius * 1.04], [radius * 0.28, 1.1, 0.55], [0, angle, 0]);
      }
    }
    if (banner) {
      put(box, blue, [x + radius * 0.55, y + height * 0.52, z + radius * 0.86], [radius * 0.32, height * 0.26, 0.08], [0, 0.55, 0]);
      put(box, beam, [x + radius * 0.56, y + height * 0.655, z + radius * 0.9], [radius * 0.45, 0.18, 0.18], [0, 0.55, 0]);
    }
  };
  tower(-8.5, streetY(-52), -52, 5.6, 36, 'crown', true);
  tower(-23, streetY(-48), -48, 5, 27, 'crown', false);
  tower(21, streetY(-72), -72, 5.2, 27, 'crown', false);
  tower(-3.8, streetY(-52), -45.5, 1.5, 12, 'cone', false);

  // The castle at the end of the street, standing on rising ground.
  const castleY = streetY(-135);
  block(towerStone, [8, castleY + 7, -138], [42, 14, 8], 0, 5);
  block(stone, [8, castleY + 1.5, -131], [46, 3, 6], 0, 4);
  for (let x = -12; x <= 28; x += 2.4) block(towerStone, [x, castleY + 14.8, -134.4], [1.3, 1.6, 1], 0, 2);
  for (let x = -9; x <= 26; x += 3.4) put(arch, random() < 0.4 ? warm : dark, [x, castleY + 8.5, -133.9], [1, 2, 1]);
  put(arch, dark, [streetX(-135), castleY, -127.8], [4.6, 5.6, 1]);
  put(archRing, towerStone, [streetX(-135), castleY + 3.65, -127.7], [4.7, 4.6, 3]);
  tower(-5, castleY, -136, 3.2, 19, 'cone', false);
  tower(9, castleY, -146, 5, 24, 'cone', false);
  tower(22, castleY, -137, 3, 17, 'cone', false);
  tower(32, castleY, -140, 3.6, 21, 'crown', false);
  tower(-24, castleY, -150, 4, 18, 'crown', false);
  put(pole, iron, [-1, castleY + 34, -137], [0.12, 6, 0.12]);
  put(box, cloths[1], [0.2, castleY + 36, -137], [2.3, 1.1, 0.06], [0, 0, -0.12]);
  for (let index = 0; index < 60; index += 1) {
    const x = (random() < 0.5 ? -1 : 1) * between(16, 70), z = between(-190, -82);
    const h = between(4, 11), w = between(5, 9), y = streetY(z);
    block(index % 3 ? stone : towerStone, [x, y + h / 2, z], [w, h, w], 0, 4);
    gableRoof(x, y + h, z, w, w, between(2, 4), index % 4 ? roof : slate);
  }

  // ---- Market stalls ----
  const stall = (z: number, side: number, cloth: THREE.Material) => {
    const x = streetX(z) + side * 4.3, y = streetY(z);
    for (const dx of [-1.15, 1.15]) for (const dz of [-1.4, 1.4]) put(pole, beam, [x + dx, y + 1.25 + (dx * side < 0 ? -0.15 : 0.15), z + dz], [0.07, 2.5, 0.07]);
    const awning = new THREE.PlaneGeometry(3.2, 3.5, 12, 8).rotateX(-Math.PI / 2);
    const p = awning.getAttribute('position');
    for (let i = 0; i < p.count; i += 1) p.setY(i, Math.sin((p.getZ(i) / 3.5 + 0.5) * Math.PI * 3) * 0.1 - Math.cos(p.getX(i) / 3.2 * Math.PI) * -0.12);
    awning.computeVertexNormals();
    put(awning, cloth, [x - side * 0.2, y + 2.55, z], [1, 1, 1], [0, 0, side * 0.3]);
    put(box, cloth, [x - side * 1.7, y + 1.93, z], [0.05, 0.28, 3.4]);
    awning.dispose();
    block(timber, [x, y + 0.55, z], [1.9, 1.1, 2.7], 0, 1.6);
    block(beam, [x - side * 1, y + 1.13, z], [0.14, 0.12, 2.9], 0);
    for (let index = 0; index < 90; index += 1) {
      const s = between(0.09, 0.16);
      put(ball, fruit[Math.floor(Math.abs(z + index / 30)) % 3], [x + between(-0.75, 0.75), y + 1.18 + random() * 0.22, z + between(-1.2, 1.2)], [s, s, s]);
    }
  };
  stall(-9, -1, cloths[0]);
  stall(-15.5, -1, cloths[0]);
  stall(-24, -1, cloths[1]);
  stall(-6, 1, cloths[2]);
  stall(-14, 1, cloths[2]);
  stall(-36, 1, cloths[3]);

  // Barrels, crates and pots.
  const barrelAt = (x: number, z: number, s: number) => {
    const y = streetY(z) + s * 0.5;
    put(barrel, timber, [x, y, z], [s, s, s]);
    for (const h of [-0.28, 0.28]) put(hoop, iron, [x, y + h * s, z], [s, s, s]);
  };
  [[4.4, 3, 1.15], [5, 1.6, 1], [3.9, 0.4, 0.9], [4.6, -2, 1.1], [-5.2, -4, 0.9], [-4.7, -5.4, 0.75], [5, -10, 0.9], [-5.4, -19, 1], [4.8, -22, 0.8]].forEach(([dx, z, s]) => barrelAt(streetX(z) + dx, z, s * 1.05));
  for (let index = 0; index < 26; index += 1) {
    const z = between(-40, 8), side = random() < 0.5 ? -1 : 1, x = streetX(z) + side * between(4.8, 5.8), s = between(0.4, 0.8);
    block(timber, [x, streetY(z) + s / 2, z], [s, s, s], random() * 1.5, 1);
  }
  for (let index = 0; index < 20; index += 1) {
    const z = between(-34, 10), side = random() < 0.5 ? -1 : 1, x = streetX(z) + side * between(5, 5.9), s = between(0.3, 0.6);
    put(barrel, clay, [x, streetY(z) + s * 0.45, z], [s, s * 0.9, s]);
    for (let leaf = 0; leaf < 5; leaf += 1) foliageSpots.push([x + between(-0.2, 0.2), streetY(z) + s * 1.1 + between(0, 0.6), z + between(-0.2, 0.2), s * between(0.5, 0.9)]);
  }
  // Wooden hand rail on the near right.
  strut(box, timber, new THREE.Vector3(2.6, streetY(6) + 0.95, 6.5), new THREE.Vector3(4.9, streetY(3) + 1.9, 2.5), 0.16);
  put(box, beam, [2.65, 0.5, 6.4], [0.18, 1.05, 0.18]);

  // Townsfolk, seen at a distance.
  const body = keep(new THREE.CapsuleGeometry(0.22, 0.75, 4, 8));
  for (let index = 0; index < 16; index += 1) {
    const z = between(-90, -20), x = streetX(z) + between(-2.6, 2.6), y = streetY(z);
    put(body, cloths[index % 4], [x, y + 0.72, z], [1, 1, 0.8]);
    put(ball, clay, [x, y + 1.55, z], [0.15, 0.17, 0.15]);
  }

  // Foreground left: heavy timber overhang close to the viewer.
  block(timber, [-8.2, 8.2, 8], [3.2, 3.6, 7], 0, 2);
  for (const z of [5, 7.5, 10]) strut(box, timber, new THREE.Vector3(-8.6, 4.2, z), new THREE.Vector3(-6.7, 6.5, z), 0.34);
  block(beam, [-6.6, 6.45, 8], [0.35, 0.45, 7.4]);
  for (let z = 5; z < 11.6; z += 0.55) put(box, beam, [-6.55, 8.6, z], [0.12, 2.1, 0.16]);
  for (let leaf = 0; leaf < 150; leaf += 1) {
    const z = between(-1, 9);
    foliageSpots.push([streetX(z) - between(5.8, 6.7), between(0.2, 4.6) * (1 - Math.abs(z - 4) / 12), z, between(0.22, 0.55)]);
  }
  for (let leaf = 0; leaf < 90; leaf += 1) foliageSpots.push([streetX(0) + between(5.1, 5.6), between(5, 13), between(-3, 1), between(0.2, 0.5)]);

  flush(true);

  const cluster = kit.leafCluster(70, 0.3);
  const greens = ['#6f8a24', '#93a62e', '#4c6e22'].map((color) => kit.leafMaterial(color, 0.14));
  greens.forEach((material, tone) => {
    instances(cluster, material, foliageSpots.filter((_, index) => index % 3 === tone).map(([x, y, z, s]) => ({ p: [x, y, z] as [number, number, number], s: [s, s, s] as [number, number, number], r: [random(), random() * 6, 0] as [number, number, number] })), true);
  });

  // Warm haze where the evening light pours down the street, drifting dust and birds.
  const glow = kit.glowMap();
  const haze = (x: number, y: number, z: number, size: number, opacity: number) => {
    const material = keep(new THREE.SpriteMaterial({ map: glow, color: context.tone('#ffcf85', 0), opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size);
    scene.add(sprite);
  };
  haze(24, 34, -165, 100, 0.34);
  haze(7, 8, -75, 34, 0.13);
  haze(3, 5, -30, 18, 0.12);
  const dust = new Float32Array(600 * 3);
  for (let index = 0; index < 600; index += 1) dust.set([between(-6, 8), between(0.3, 11), between(-45, 8)], index * 3);
  const motes = new THREE.BufferGeometry();
  motes.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const moteCloud = new THREE.Points(keep(motes), keep(new THREE.PointsMaterial({ color: '#ffe2ad', size: 0.07, map: glow, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })));
  scene.add(moteCloud);
  const wing = keep(new THREE.BufferGeometry());
  wing.setAttribute('position', new THREE.Float32BufferAttribute([-0.7, 0.18, 0, 0, 0, 0.12, 0, 0, -0.12, 0.7, 0.18, 0, 0, 0, -0.12, 0, 0, 0.12], 3));
  const birdMaterial = keep(new THREE.MeshBasicMaterial({ color: '#fff3dc', side: THREE.DoubleSide }));
  const birds = Array.from({ length: 22 }, () => {
    const bird = new THREE.Mesh(wing, birdMaterial);
    bird.userData = { x: between(-8, 18), y: between(14, 30), z: between(-110, -70), phase: random() * 6.3 };
    scene.add(bird);
    return bird;
  });

  return {
    camera: { position: [-0.4, 3.1, 14], pitch: 12, portraitPitch: 18, fov: 60, far: 1_600 },
    exposure: 1.02,
    bloom: { strength: 0.38, radius: 0.7, threshold: 0.82 },
    update: (time) => {
      sky.update(time);
      moteCloud.position.y = Math.sin(time * 0.25) * 0.35;
      moteCloud.position.x = Math.sin(time * 0.13) * 0.4;
      birds.forEach((bird, index) => {
        const { x, y, z, phase } = bird.userData as { x: number; y: number; z: number; phase: number };
        bird.position.set(x + Math.sin(time * 0.2 + phase) * 6, y + Math.sin(time * 0.7 + phase) * 0.8, z + Math.cos(time * 0.2 + phase) * 4);
        bird.scale.set(1, Math.sin(time * 7 + index) * 2, 1);
      });
    },
  };
}
