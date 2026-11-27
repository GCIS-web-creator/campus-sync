import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CITY_LANDMARK, CITY_STREET_HALF_WIDTH, CITY_VIEWPOINT, type CityBuilding } from '@/lib/planet-city';

type Resources = Array<{ dispose: () => void }>;

// Invented businesses for the street signs.
const SIGNS = [
  '電脳横丁', '星間酒場', '量子書房', '機巧堂', '重力喫茶', '虹光電機', '深宇宙ラーメン', '反物質薬局',
  'NEON ORBIT', 'SYNTH BAR', 'HOLO MART', 'ZERO-G HOTEL', 'LUMEN 24H', 'ASTRO DINER',
];

function randomFrom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

function signTexture(text: string, color: THREE.Color, vertical: boolean, resources: Resources) {
  const canvas = document.createElement('canvas');
  canvas.width = vertical ? 128 : 512;
  canvas.height = vertical ? 512 : 128;
  const context = canvas.getContext('2d');
  const css = '#' + color.getHexString();
  if (context) {
    context.fillStyle = 'rgba(8,6,26,0.92)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = css;
    context.lineWidth = 7;
    context.shadowColor = css;
    context.shadowBlur = 18;
    context.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const letters = [...text];
    if (vertical) {
      const step = Math.min(92, 470 / letters.length);
      context.font = '900 ' + Math.round(step * 0.88) + 'px sans-serif';
      letters.forEach((letter, index) => {
        context.fillText(letter === 'ー' ? '｜' : letter, 64, 256 + (index - (letters.length - 1) / 2) * step);
      });
    } else {
      context.font = '900 ' + Math.round(Math.min(78, 460 / letters.length * 1.35)) + 'px sans-serif';
      context.fillText(text, 256, 66, 470);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  resources.push(texture);
  return texture;
}

function glowTexture(resources: Resources) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - 31.5, y - 31.5) / 32;
      data.set([255, 255, 255, Math.round(Math.pow(Math.max(0, 1 - distance), 2.4) * 255)], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  resources.push(texture);
  return texture;
}

/**
 * Everything on and above the street. `shared` is always shown, `night` holds the
 * neon, and `green` holds the planting of the day view.
 */
export function makeCityProps(
  layout: { buildings: CityBuilding[]; landmarkHeight: number },
  planetNumber: number,
  accents: THREE.Color[],
  resources: Resources,
) {
  const shared = new THREE.Group();
  const night = new THREE.Group();
  const green = new THREE.Group();
  const random = randomFrom(planetNumber * 7_717 + 3);
  const between = (low: number, high: number) => low + random() * (high - low);
  const keep = <T extends { dispose: () => void }>(resource: T) => { resources.push(resource); return resource; };

  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = keep(new THREE.CylinderGeometry(1, 1, 1, 10));
  const sphere = keep(new THREE.SphereGeometry(1, 16, 10));
  const metal = keep(new THREE.MeshStandardMaterial({ color: '#2a2f48', metalness: 0.75, roughness: 0.35 }));
  const white = keep(new THREE.MeshStandardMaterial({ color: '#e8eef0', metalness: 0.25, roughness: 0.3 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: '#0c0d18', metalness: 0.4, roughness: 0.6 }));
  const lamps = accents.map((color) => keep(new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.8) })));
  const warm = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2b0').multiplyScalar(2) }));
  const part = (group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale: [number, number, number]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    group.add(mesh);
    return mesh;
  };

  // Rooftop masts, tanks and machinery.
  const masts: Array<[number, number, number, number, number, number]> = [];
  for (const building of layout.buildings) {
    const top = building.y + building.height;
    if (building.tier !== 'frontage' && random() > 0.3) continue;
    for (let index = 0; index < (building.tier === 'frontage' ? 5 : 2); index += 1) {
      const thin = random() < 0.5;
      const h = thin ? between(3, building.tier === 'tower' ? 28 : 12) : between(0.8, 3);
      const w = thin ? between(0.12, 0.45) : between(1.2, 4);
      const spread = building.shape === 'box' ? 0.4 : 0.18;
      masts.push([building.x + between(-spread, spread) * building.width, top + h / 2, building.z + between(-spread, spread) * building.depth, w, h, w]);
    }
  }
  const dummy = new THREE.Object3D();
  const instances = (group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, list: Array<[number, number, number, number, number, number]>) => {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach(([x, y, z, sx, sy, sz], index) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, (index * 2.39996) % (Math.PI * 2), 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.frustumCulled = false;
    group.add(mesh);
    resources.push(mesh);
    return mesh;
  };
  instances(shared, box, metal, masts);

  // Balconies, ducts and ledges crowd the facades along the street.
  const ledges: Array<[number, number, number, number, number, number]> = [];
  const pipes: Array<[number, number, number, number, number, number]> = [];
  for (const building of layout.buildings.filter((item) => item.tier === 'frontage' && item.y === 0)) {
    const face = building.x - Math.sign(building.x) * building.width / 2;
    for (let floor = 5; floor < building.height - 2; floor += between(3.4, 7)) {
      ledges.push([face, floor, building.z + between(-0.25, 0.25) * building.depth, between(0.8, 1.8), 0.22, between(2, building.depth * 0.8)]);
    }
    pipes.push([face, building.height / 2, building.z + between(-0.45, 0.45) * building.depth, 0.18, building.height, 0.18]);
  }
  // Rotation-free instances keep ledges flush with the walls.
  for (const [list, geometry] of [[ledges, box], [pipes, cylinder]] as const) {
    const mesh = instances(shared, geometry, metal, [...list]);
    list.forEach(([x, y, z, sx, sy, sz], index) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
  }

  // Skybridges across the street, with lit edges at night.
  for (const [z, y] of [[-58, 17], [-118, 34], [-196, 23], [-262, 52], [-352, 38], [64, 24]]) {
    part(shared, box, metal, [0, y, z], [CITY_STREET_HALF_WIDTH * 2 + 6, 1.8, 4.2]);
    for (const dz of [-2.15, 2.15]) {
      part(night, box, lamps[Math.floor(random() * 3)], [0, y - 0.8, z + dz], [CITY_STREET_HALF_WIDTH * 2 + 4, 0.12, 0.08]);
      part(green, box, white, [0, y + 1.5, z + dz], [CITY_STREET_HALF_WIDTH * 2 + 6, 0.16, 0.16]);
    }
  }
  // Sagging cables between the street walls.
  const wire: THREE.Vector3[] = [];
  for (let index = 0; index < 46; index += 1) {
    const z = 30 - index * 9 + between(-4, 4);
    const left = new THREE.Vector3(-CITY_STREET_HALF_WIDTH, between(8, 24), z);
    const right = new THREE.Vector3(CITY_STREET_HALF_WIDTH, between(8, 24), z + between(-14, 14));
    const sag = between(0.8, 2.6);
    for (let step = 0; step < 14; step += 1) {
      for (const t of [step / 14, (step + 1) / 14]) {
        const point = left.clone().lerp(right, t);
        point.y -= Math.sin(t * Math.PI) * sag;
        wire.push(point);
      }
    }
  }
  const wireGeometry = keep(new THREE.BufferGeometry().setFromPoints(wire));
  night.add(new THREE.LineSegments(wireGeometry, keep(new THREE.LineBasicMaterial({ color: '#04050c' }))));

  // Neon signs: blade signs facing the viewer and banners on the shop fronts.
  const plane = keep(new THREE.PlaneGeometry(1, 1));
  const signMaterials = [true, false].map((vertical) => SIGNS.map((text, index) => {
    const color = accents[index % 3];
    return keep(new THREE.MeshBasicMaterial({
      map: signTexture(text, color, vertical, resources), color: new THREE.Color(1.12, 1.12, 1.12), side: THREE.DoubleSide,
    }));
  }));
  for (const side of [-1, 1]) {
    for (let z = 4; z > -430; z -= between(5.5, 12)) {
      const tall = between(4, 11);
      const wide = tall / 4;
      const y = between(5.5, 22);
      const x = side * (CITY_STREET_HALF_WIDTH - wide / 2 - 0.35 - between(0, 1.2));
      part(night, plane, signMaterials[0][Math.floor(random() * SIGNS.length)], [x, y, z], [wide, tall, 1]);
      part(shared, box, dark, [x + side * wide * 0.65, y + tall / 2, z - 0.05], [wide * 0.5, 0.14, 0.14]);
    }
    for (let z = 16; z > -330; z -= between(8, 17)) {
      const wide = between(4.5, 8.5);
      const banner = part(night, plane, signMaterials[1][Math.floor(random() * SIGNS.length)], [side * (CITY_STREET_HALF_WIDTH - 0.15), between(4.6, 8), z], [wide, wide / 4, 1]);
      banner.rotation.y = -side * Math.PI / 2;
    }
  }

  // Street lamps, bollards and their halos.
  const glow = glowTexture(resources);
  const halo = (group: THREE.Group, color: THREE.Color, size: number, x: number, y: number, z: number, opacity: number) => {
    const material = keep(new THREE.SpriteMaterial({ map: glow, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size);
    group.add(sprite);
    return sprite;
  };
  for (let z = 6; z > -420; z -= 21) {
    for (const side of [-1, 1]) {
      part(shared, cylinder, metal, [side * 8.2, 3, z], [0.09, 6, 0.09]);
      part(shared, box, metal, [side * 7.6, 6, z], [1.3, 0.12, 0.18]);
      part(night, sphere, warm, [side * 7.05, 5.88, z], [0.2, 0.12, 0.2]);
      halo(night, new THREE.Color('#ffbd80'), 2.4, side * 7.05, 5.85, z, 0.4);
      part(night, cylinder, lamps[side < 0 ? 0 : 1], [side * 7.9, 0.45, z - 10], [0.09, 0.9, 0.09]);
    }
  }

  // Parked hover cars and passers-by give the view a human scale.
  const vehicle = (z: number, side: number, accent: number) => {
    const x = side * 5.6;
    part(shared, sphere, metal, [x, 0.95, z], [1.15, 0.62, 2.5]);
    part(shared, sphere, dark, [x, 1.32, z + 0.25], [0.85, 0.48, 1.25]);
    part(night, box, lamps[accent], [x, 0.46, z], [1.9, 0.07, 3.6]);
    part(night, box, lamps[0], [x, 1.0, z + 2.46], [1.3, 0.12, 0.08]);
    part(green, box, white, [x, 0.55, z], [2, 0.16, 3.8]);
  };
  [[-9, -1], [-31, 1], [-57, -1], [-96, 1], [-150, -1], [-205, 1]].forEach(([z, side], index) => vehicle(z, side, index % 3));
  const torso = keep(new THREE.CapsuleGeometry(0.2, 0.46, 4, 10));
  const limb = keep(new THREE.CapsuleGeometry(0.07, 0.66, 3, 8));
  for (let index = 0; index < 34; index += 1) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side * between(8.6, 11.6);
    const z = between(-120, CITY_VIEWPOINT.z - 14);
    const stride = between(-0.22, 0.22);
    part(shared, torso, dark, [x, 1.13, z], [1, 1, 0.65]);
    part(shared, sphere, dark, [x, 1.7, z], [0.13, 0.155, 0.13]);
    for (const leg of [-1, 1]) {
      part(shared, limb, dark, [x + leg * 0.1, 0.43, z + leg * stride * 0.5], [1, 1, 1]).rotation.x = -leg * stride;
      part(shared, limb, dark, [x + leg * 0.29, 1.05, z], [0.75, 0.82, 0.75]).rotation.z = leg * 0.12;
    }
    if (index % 4 === 0) part(night, box, lamps[index % 3], [x, 1.28, z + 0.15], [0.26, 0.035, 0.02]);
  }

  // Beacons on the tallest roofs.
  for (const building of layout.buildings.filter((item) => item.y + item.height > 250)) {
    const color = accents[Math.floor(random() * 3)];
    halo(night, color, 26, building.x, building.y + building.height + 3, building.z, 0.85);
  }
  part(shared, cylinder, metal, [CITY_LANDMARK.x, layout.landmarkHeight + 38, CITY_LANDMARK.z], [1.1, 80, 1.1]);
  halo(night, new THREE.Color('#bfe0ff'), 95, CITY_LANDMARK.x, layout.landmarkHeight + 80, CITY_LANDMARK.z, 1);

  // Daytime planting: street trees, roof gardens, hanging greenery and white arches.
  // A clump is a cloud of small leaf blades, lit as if it were a soft sphere.
  const leafPoints: number[] = [];
  const leafNormals: number[] = [];
  const centre = new THREE.Vector3(), edgeA = new THREE.Vector3(), edgeB = new THREE.Vector3();
  for (let index = 0; index < 150; index += 1) {
    centre.set(between(-1, 1), between(-1, 1), between(-1, 1)).normalize().multiplyScalar(between(0.45, 1.05));
    edgeA.set(between(-1, 1), between(-1, 1), between(-1, 1)).normalize().multiplyScalar(0.24);
    edgeB.set(between(-1, 1), between(-1, 1), between(-1, 1)).cross(edgeA).normalize().multiplyScalar(0.12);
    const normal = centre.clone().normalize().add(new THREE.Vector3(0, 0.5, 0)).normalize();
    for (const point of [centre.clone().add(edgeA), centre.clone().add(edgeB), centre.clone().sub(edgeA), centre.clone().sub(edgeB)].flatMap((p, i, q) => (i === 0 ? [q[0], q[1], q[2], q[0], q[2], q[3]] : []))) {
      leafPoints.push(point.x, point.y, point.z);
      leafNormals.push(normal.x, normal.y, normal.z);
    }
  }
  const leaf = keep(new THREE.BufferGeometry());
  leaf.setAttribute('position', new THREE.Float32BufferAttribute(leafPoints, 3));
  leaf.setAttribute('normal', new THREE.Float32BufferAttribute(leafNormals, 3));
  const foliage = ['#62ad36', '#93c944', '#3f8f45'].map((color) => {
    const material = keep(new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.16), roughness: 0.8, side: THREE.DoubleSide }));
    // Keep the outward leaf normal on both sides of a blade.
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', 'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
    };
    return material;
  });
  const clumps: Array<Array<[number, number, number, number, number, number]>> = [[], [], []];
  const clump = (x: number, y: number, z: number, size: number, squash = 1) => {
    clumps[Math.floor(random() * 3)].push([x, y, z, size, size * squash, size]);
  };
  for (let z = 8; z > -440; z -= 8.5) {
    for (const side of [-1, 1]) {
      const x = side * between(9.8, 11.2);
      part(green, cylinder, white, [x, 1.5, z], [0.12, 3, 0.12]);
      for (let index = 0; index < 5; index += 1) clump(x + between(-0.9, 0.9), between(3, 4.8), z + between(-0.9, 0.9), between(0.6, 1.25));
      for (let index = 0; index < 6; index += 1) clump(side * between(8.9, 12.4), 0.25, z + between(-4, 4), between(0.25, 0.65), 0.8);
    }
  }
  for (const building of layout.buildings) {
    if (building.tier === 'frontage') {
      const face = building.x - Math.sign(building.x) * building.width / 2;
      for (let index = 0; index < 14; index += 1) {
        clump(face + between(-0.4, 0.4), random() < 0.5 ? building.y + building.height : between(5, building.height), building.z + between(-0.5, 0.5) * building.depth, between(0.5, 1.2), between(0.6, 1.3));
      }
    } else if (building.tier === 'midtown' && Math.abs(building.x) < 130 && building.z > -420 && random() < 0.7) {
      for (let index = 0; index < 8; index += 1) {
        clump(building.x + between(-0.4, 0.4) * building.width, building.y + building.height + 0.8, building.z + between(-0.4, 0.4) * building.depth, between(1.4, 3.2), 0.75);
      }
    }
  }
  clumps.forEach((list, index) => instances(green, leaf, foliage[index], list));
  const arch = keep(new THREE.TorusGeometry(1, 0.012, 8, 72, Math.PI));
  for (const [z, radius, rise] of [[-42, 16, 13], [-88, 18, 27], [-150, 22, 20], [-232, 26, 44], [-320, 34, 30]]) {
    for (const offset of [0, 2.5]) part(green, arch, white, [0, 0, z - offset], [radius, rise, radius]);
    part(green, box, white, [0, rise * 0.72, z - 1.25], [radius * 1.5, 0.35, 3.4]);
  }

  // Air traffic streaming along sky lanes.
  const trafficCount = 150;
  const lanes = Array.from({ length: trafficCount }, (_, index) => {
    const along = index % 3 === 0; // every third craft flies along the street
    return {
      along,
      lane: along ? between(-9, 9) : between(-460, -35),
      height: along ? between(28, 110) : between(48, 230),
      speed: between(14, 46) * (random() < 0.5 ? -1 : 1),
      phase: random(),
      color: index % 3,
    };
  });
  const craft = lamps.map((material, color) => {
    const mesh = new THREE.InstancedMesh(box, material.clone(), lanes.filter((item) => item.color === color).length);
    keep(mesh.material as THREE.Material);
    mesh.frustumCulled = false;
    shared.add(mesh);
    resources.push(mesh);
    return mesh;
  });
  const update = (time: number) => {
    const used = [0, 0, 0];
    for (const lane of lanes) {
      const span = lane.along ? 520 : 640;
      const travel = (((lane.phase * span + time * lane.speed) % span) + span) % span;
      if (lane.along) {
        dummy.position.set(lane.lane, lane.height, 60 - travel);
        dummy.scale.set(0.34, 0.16, 1.7);
      } else {
        dummy.position.set(travel - span / 2, lane.height, lane.lane);
        dummy.scale.set(2.8, 0.2, 0.4);
      }
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      craft[lane.color].setMatrixAt(used[lane.color]++, dummy.matrix);
    }
    craft.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
  };
  update(0);

  // Daylight turns the dark street hardware pale and the sky craft white.
  const setDay = (day: boolean) => {
    metal.color.set(day ? '#c9d3d6' : '#2a2f48');
    metal.metalness = day ? 0.2 : 0.75;
    metal.emissive.set(day ? '#000000' : '#12182f');
    dark.color.set(day ? '#41505c' : '#0c0d18');
    craft.forEach((mesh, color) => {
      (mesh.material as THREE.MeshBasicMaterial).color.copy(day ? new THREE.Color('#f4fbff') : lamps[color].color);
    });
  };

  // Merge the static parts by material so the street costs few draw calls.
  for (const group of [shared, night, green]) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of group.children) {
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh) continue;
      const list = batches.get(child.material as THREE.Material) ?? [];
      list.push(child);
      batches.set(child.material as THREE.Material, list);
    }
    batches.forEach((meshes, material) => {
      const parts = meshes.map((mesh) => { mesh.updateMatrix(); return mesh.geometry.clone().applyMatrix4(mesh.matrix); });
      const merged = mergeGeometries(parts);
      parts.forEach((geometry) => geometry.dispose());
      if (!merged) return;
      group.remove(...meshes);
      group.add(new THREE.Mesh(keep(merged), material));
    });
  }

  return { shared, night, green, update, setDay };
}
