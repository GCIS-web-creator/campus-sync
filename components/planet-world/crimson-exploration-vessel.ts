import * as THREE from 'three';
import { applyShipSelfLight, makeGlowFactory, type ShipSelfLight } from '@/components/planet-world/ship-self-lighting';
import { VOYAGE_SCALE } from '@/lib/planet-star-voyage';

type Point = [x: number, z: number];

// Original CampusSync design: slender forked bow, black dorsal spine, swept
// wings, five bell-nozzle drives, forward neutron cannons and missile racks. The nose points to local -Z. All dimensions below are
// fractions of the ship length, so nose-to-nozzle stays exactly 1 km.
// Hull widths are multiplied by this to keep the silhouette long and slender.
const SLIM = 0.66;

// Soft studio-like surroundings so the glossy paint has something to reflect.
function makeReflectionMap(renderer: THREE.WebGLRenderer, resources: Array<{ dispose: () => void }>) {
  const room = new THREE.Scene();
  room.background = new THREE.Color('#0a0f1c');
  const owned: Array<{ dispose: () => void }> = [];
  const panel = (color: string, intensity: number, w: number, h: number, x: number, y: number, z: number) => {
    const geometry = new THREE.PlaneGeometry(w, h);
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    room.add(mesh);
    owned.push(geometry, material);
  };
  panel('#ffffff', 2.6, 7, 0.9, 0, 8, 1);
  panel('#fff0dd', 3, 1.5, 8, -8, 2, -2);
  panel('#8fb8ff', 2, 1.2, 8, 8, 1, 3);
  panel('#ffffff', 1.4, 9, 0.7, 0, 1, -9);
  panel('#ff8a66', 0.8, 6, 1.2, 0, -6, 5);
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(room, 0.02);
  generator.dispose();
  owned.forEach(resource => resource.dispose());
  resources.push(target);
  return target.texture;
}

export function makeExplorationVessel(renderer: THREE.WebGLRenderer, resources: Array<{ dispose: () => void }>) {
  const ship = new THREE.Group();
  ship.name = 'CampusSync Crimson Fork Explorer';
  const length = VOYAGE_SCALE.spacecraftLength;

  const envMap = makeReflectionMap(renderer, resources);
  const paint = (color: string, metalness: number, roughness: number, glow = '#000000', selfLight: ShipSelfLight = {}) => {
    const material = new THREE.MeshPhysicalMaterial({
      color, metalness, roughness, emissive: glow, envMap, envMapIntensity: 0.9,
      clearcoat: 1, clearcoatRoughness: 0.08, flatShading: true,
    });
    applyShipSelfLight(material, selfLight);
    resources.push(material);
    return material;
  };
  // The hull lights itself so the red and black read clearly even without a star.
  const red = paint('#b80d1c', 0.55, 0.24, '#26020a', { fill: 0.3, key: 0.75, rim: '#ff5a46', rimStrength: 0.45 });
  const deepRed = paint('#6c0711', 0.6, 0.28, '#160104', { fill: 0.34, key: 0.8, rim: '#ff4a3a', rimStrength: 0.35 });
  const black = paint('#08090d', 0.7, 0.16, '#030406', { fill: 0.6, key: 1.6, rim: '#6f9dff', rimStrength: 0.3 });
  const gunmetal = paint('#454952', 0.92, 0.26, '#08090b');
  const metal = (color: string, roughness: number, glow = '#000000', glowIntensity = 1) => {
    const material = new THREE.MeshStandardMaterial({
      color, metalness: 0.95, roughness, emissive: glow, emissiveIntensity: glowIntensity,
      envMap, side: THREE.DoubleSide,
    });
    applyShipSelfLight(material, { fill: 0.16, key: 0.4 });
    resources.push(material);
    return material;
  };
  const titanium = metal('#8b8580', 0.34);
  const scorched = metal('#4a3a36', 0.42);
  const liner = metal('#1a1210', 0.65, '#ff3b12', 0.55);
  const hot = metal('#24120c', 0.6, '#ff7a30', 1.6);
  const plasma = new THREE.MeshBasicMaterial({ color: '#7fe9ff', toneMapped: false });
  resources.push(plasma);
  const light = new THREE.MeshBasicMaterial({ color: '#ff5a3c', toneMapped: false });
  const core = new THREE.MeshBasicMaterial({ color: '#ffe3c4', toneMapped: false });
  resources.push(light, core);

  const addPart = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x * length, y * length, z * length);
    ship.add(mesh);
    resources.push(geometry);
    return mesh;
  };

  // Faceted armour plate drawn from its top-view outline.
  const plate = (outline: Point[], thickness: number, material: THREE.Material, y: number) => {
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x * SLIM * length, z * length)));
    const bevel = Math.min(thickness * 0.3, 0.008) * length;
    const depth = thickness * length - bevel * 2;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1,
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.rotateX(Math.PI / 2);
    return addPart(geometry, material, 0, y, 0);
  };
  const mirrored = (outline: Point[], side: number): Point[] => outline.map(([x, z]) => [x * side, z]);
  const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) =>
    addPart(new THREE.BoxGeometry(w * SLIM * length, h * length, d * length), material, x * SLIM, y, z);
  // Cylinder or cone laid along the flight axis; `front` is the radius toward the nose.
  const tube = (front: number, rear: number, depth: number, material: THREE.Material, x: number, y: number, z: number, sides = 8) => {
    const geometry = new THREE.CylinderGeometry(rear * length, front * length, depth * length, sides);
    geometry.rotateX(Math.PI / 2);
    return addPart(geometry, material, x, y, z);
  };

  // Exhaust plume: additive, fading toward the tail, brightest along its axis.
  const plumeMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        vUv = uv;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-view.xyz)));
        gl_Position = projectionMatrix * view;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        #include <logdepthbuf_fragment>
        float along = 1.0 - vUv.y;
        float fade = pow(1.0 - along, 2.2);
        float diamonds = 0.78 + 0.22 * pow(abs(cos(along * 22.0)), 3.0);
        vec3 color = mix(vec3(1.0, 0.18, 0.04), vec3(1.0, 0.82, 0.62), pow(fade, 2.0));
        gl_FragColor = vec4(color, fade * diamonds * pow(vFacing, 1.6) * 0.75);
      }`,
  });
  resources.push(plumeMaterial);

  // Surface of revolution along the flight axis, from [radius, z] pairs.
  const lathe = (profile: Array<[number, number]>, material: THREE.Material, x: number, y: number) => {
    const geometry = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r * length, z * length)), 40);
    geometry.rotateX(Math.PI / 2);
    return addPart(geometry, material, x, y, 0);
  };
  const ring = (radius: number, thickness: number, material: THREE.Material, x: number, y: number, z: number) =>
    addPart(new THREE.TorusGeometry(radius * length, thickness * length, 8, 40), material, x, y, z);

  // One bell-nozzle drive whose exit plane sits at z = exit.
  const engine = (x: number, y: number, radius: number, exit: number) => {
    const throat = exit - radius * 1.7;
    // Gimbal collar and stiffening hoops.
    lathe([[radius * 0.82, throat - 0.03], [radius * 0.9, throat - 0.022], [radius * 0.9, throat - 0.004], [radius * 0.56, throat + 0.006]], gunmetal, x, y);
    ring(radius * 0.91, radius * 0.05, titanium, x, y, throat - 0.022);
    ring(radius * 0.91, radius * 0.05, titanium, x, y, throat - 0.006);
    // Hollow bell: outer skin, heat-stained inner liner and lip.
    const bell = (scale: number): Array<[number, number]> => Array.from({ length: 10 }, (_, index) => {
      const t = index / 9;
      return [radius * scale * (0.5 + 0.5 * Math.sin(t * Math.PI / 2)), throat + (exit - throat) * t];
    });
    lathe(bell(1), scorched, x, y);
    lathe(bell(0.9), liner, x, y);
    ring(radius * 0.95, radius * 0.055, titanium, x, y, exit - radius * 0.055);
    for (const t of [0.3, 0.62]) {
      ring(radius * (0.5 + 0.5 * Math.sin(t * Math.PI / 2)), radius * 0.028, gunmetal, x, y, throat + (exit - throat) * t);
    }
    // Vectoring actuators and feed pipes around the bell.
    for (let index = 0; index < 8; index += 1) {
      const angle = index / 8 * Math.PI * 2 + Math.PI / 8;
      const from = new THREE.Vector3(x + Math.cos(angle) * radius * 0.98, y + Math.sin(angle) * radius * 0.98, throat - 0.018);
      const to = new THREE.Vector3(x + Math.cos(angle) * radius * 0.9, y + Math.sin(angle) * radius * 0.9, throat + (exit - throat) * 0.62);
      const direction = to.clone().sub(from);
      const strut = addPart(
        new THREE.CylinderGeometry(radius * 0.045 * length, radius * 0.07 * length, direction.length() * length, 8),
        titanium, (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2,
      );
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    }
    // Injector face deep inside the nozzle.
    addPart(new THREE.CircleGeometry(radius * 0.46 * length, 32), hot, x, y, throat + 0.003);
    addPart(new THREE.CircleGeometry(radius * 0.2 * length, 24), core, x, y, throat + 0.005);
    for (const [size, scale] of [[0.74, 1], [0.38, 0.65]]) {
      const depth = radius * 6.5 * scale;
      const geometry = new THREE.CylinderGeometry(radius * size * length, radius * size * 0.12 * length, depth * length, 32, 1, true);
      geometry.rotateX(-Math.PI / 2);
      // After this rotation the wide end (uv.y = 1) sits at the nozzle.
      addPart(geometry, plumeMaterial, x, y, throat + depth / 2 + 0.008);
    }
  };

  // Central hull: stacked plates that taper upward and downward.
  plate([[-0.045, -0.2], [0.045, -0.2], [0.105, 0.04], [0.12, 0.27], [0.07, 0.39], [-0.07, 0.39], [-0.12, 0.27], [-0.105, 0.04]], 0.055, red, 0);
  plate([[-0.03, -0.17], [0.03, -0.17], [0.075, 0.06], [0.082, 0.28], [0.045, 0.36], [-0.045, 0.36], [-0.082, 0.28], [-0.075, 0.06]], 0.03, deepRed, 0.04);
  plate([[-0.035, -0.12], [0.035, -0.12], [0.08, 0.08], [0.07, 0.31], [-0.07, 0.31], [-0.08, 0.08]], 0.035, black, -0.042);

  // Black dorsal spine and the raised bridge.
  plate([[-0.008, -0.19], [0.008, -0.19], [0.032, 0.0], [0.04, 0.22], [0.018, 0.34], [-0.018, 0.34], [-0.04, 0.22], [-0.032, 0.0]], 0.016, black, 0.062);
  plate([[-0.016, 0.07], [0.016, 0.07], [0.034, 0.13], [0.028, 0.2], [-0.028, 0.2], [-0.034, 0.13]], 0.032, red, 0.083);
  box(0.044, 0.009, 0.006, light, 0, 0.087, 0.086);
  tube(0.002, 0.004, 0.11, gunmetal, 0, 0.115, 0.215);

  for (const side of [-1, 1]) {
    // Forked bow with a black inner blade on each prong.
    plate(mirrored([[0.04, -0.5], [0.062, -0.43], [0.098, -0.2], [0.1, -0.05], [0.04, -0.09], [0.026, -0.28]], side), 0.036, red, 0);
    plate(mirrored([[0.041, -0.45], [0.058, -0.38], [0.074, -0.2], [0.07, -0.11], [0.045, -0.14], [0.036, -0.3]], side), 0.012, black, 0.021);
    box(0.004, 0.006, 0.19, light, side * 0.033, 0, -0.23);
    tube(0.003, 0.008, 0.07, gunmetal, side * 0.045 * SLIM, -0.012, -0.39);

    // Swept wings, black leading edge and a tip pod.
    plate(mirrored([[0.095, 0.03], [0.31, 0.25], [0.33, 0.36], [0.22, 0.31], [0.105, 0.33]], side), 0.018, red, -0.006);
    plate(mirrored([[0.1, 0.045], [0.305, 0.255], [0.312, 0.285], [0.105, 0.095]], side), 0.008, black, 0.007);
    tube(0.005, 0.019, 0.08, black, side * 0.325 * SLIM, -0.006, 0.25, 6);
    tube(0.019, 0.013, 0.11, deepRed, side * 0.325 * SLIM, -0.006, 0.345, 6);
    box(0.006, 0.006, 0.03, light, side * 0.325, 0.012, 0.33);

    // Four drives in an X arrangement.
    for (const level of [-1, 1]) {
      const x = side * 0.092;
      const y = level * 0.052;
      const pylon = box(0.085, 0.014, 0.1, black, side * 0.09, level * 0.03, 0.31);
      pylon.rotation.z = side * level * 0.55;
      tube(0.01, 0.031, 0.09, red, x, y, 0.215, 24);
      tube(0.031, 0.031, 0.135, red, x, y, 0.327, 24);
      ring(0.0315, 0.0022, black, x, y, 0.29);
      ring(0.0315, 0.0022, titanium, x, y, 0.385);
      engine(x, y, 0.033, 0.5);
      plate(mirrored([[0.13, 0.26], [0.148, 0.26], [0.152, 0.39], [0.126, 0.39]], side), 0.007, black, y + level * 0.033);
    }

    // Angled tail fins.
    const fin = box(0.008, 0.1, 0.075, red, side * 0.06, 0.095, 0.325);
    fin.rotation.set(0.45, 0, -side * 0.42);

    // Hull vents.
    for (let index = 0; index < 5; index += 1) {
      box(0.02, 0.004, 0.011, black, side * 0.066, 0.056, 0.1 + index * 0.034);
    }
  }

  // Self-luminous hull lines and halos that trace the silhouette in the dark.
  const glow = makeGlowFactory(resources);
  const halo = (color: string, diameter: number, opacity: number, x: number, y: number, z: number) => {
    const sprite = glow(color, diameter * length, opacity);
    sprite.position.set(x * length, y * length, z * length);
    ship.add(sprite);
  };
  // A thin lit strip between two outline points ([x, z] before SLIM).
  const strip = (from: Point, to: Point, y: number, material: THREE.Material) => {
    const dx = (to[0] - from[0]) * SLIM;
    const dz = to[1] - from[1];
    const mesh = addPart(
      new THREE.BoxGeometry(0.0028 * length, 0.0028 * length, Math.hypot(dx, dz) * length),
      material, (from[0] + to[0]) / 2 * SLIM, y, (from[1] + to[1]) / 2,
    );
    mesh.rotation.y = Math.atan2(dx, dz);
  };
  for (const side of [-1, 1]) {
    const edge = (points: Point[], y: number, material: THREE.Material) => {
      const line = mirrored(points, side);
      line.slice(1).forEach((point, index) => strip(line[index], point, y, material));
    };
    edge([[0.04, -0.5], [0.062, -0.43], [0.098, -0.2], [0.1, -0.05]], 0.0185, light);
    edge([[0.095, 0.03], [0.31, 0.25], [0.33, 0.36]], 0.0045, light);
    edge([[0.33, 0.36], [0.22, 0.31], [0.105, 0.33]], -0.006, plasma);
    edge([[0.032, 0.0], [0.04, 0.22], [0.018, 0.34]], 0.071, plasma);
    halo('#ff4b30', 0.05, 0.75, side * 0.04 * SLIM, 0, -0.498);
    halo('#ff4b30', 0.055, 0.8, side * 0.33 * SLIM, 0.014, 0.33);
    for (const level of [-1, 1]) halo('#ff8a4a', 0.1, 0.55, side * 0.092, level * 0.052, 0.505);
  }
  halo('#ff8a4a', 0.13, 0.6, 0, 0, 0.505);
  halo('#7fe9ff', 0.045, 0.8, 0, 0, -0.463);

  // Main drive.
  tube(0.05, 0.044, 0.06, gunmetal, 0, 0, 0.39, 32);
  engine(0, 0, 0.042, 0.5);

  // Armament and exposed side machinery. Coordinates below are true ship-length
  // fractions (SLIM is not applied).
  const block = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) =>
    addPart(new THREE.BoxGeometry(w * length, h * length, d * length), material, x, y, z);

  // Spinal neutron cannon between the bow prongs: barrel, charge coils, muzzle.
  tube(0.0075, 0.0095, 0.25, gunmetal, 0, 0, -0.315, 24);
  tube(0.0125, 0.0125, 0.05, black, 0, 0, -0.205, 12);
  for (let index = 0; index < 7; index += 1) {
    const z = -0.42 + index * 0.029;
    ring(0.0118, 0.0022, titanium, 0, 0, z);
    ring(0.0108, 0.0009, plasma, 0, 0, z + 0.008);
  }
  tube(0.0125, 0.01, 0.024, black, 0, 0, -0.448, 8);
  ring(0.0085, 0.0024, titanium, 0, 0, -0.461);
  addPart(new THREE.SphereGeometry(0.0062 * length, 20, 12), plasma, 0, 0, -0.461);

  for (const side of [-1, 1]) {
    const at = (offset: number) => side * offset;

    // Sponson core with stacked armour, gaps and radiator slats.
    block(0.028, 0.05, 0.27, gunmetal, at(0.077), 0.004, 0.055);
    for (let index = 0; index < 6; index += 1) {
      const z = -0.055 + index * 0.044;
      block(0.01, 0.058, 0.014, black, at(0.092), 0.004, z);
      block(0.006, 0.022, 0.022, index % 2 ? red : deepRed, at(0.094), 0.016, z + 0.022);
      for (let slat = 0; slat < 3; slat += 1) {
        block(0.008, 0.0025, 0.022, titanium, at(0.093), -0.006 - slat * 0.0065, z + 0.022);
      }
      addPart(new THREE.SphereGeometry(0.0022 * length, 8, 6), light, at(0.0975), 0.026, z + 0.022);
    }
    // Conduits, couplings and hydraulic pistons running along the flank.
    for (const [offset, y, radius] of [[0.099, 0.03, 0.0035], [0.102, -0.027, 0.0048], [0.09, -0.037, 0.003]]) {
      tube(radius, radius, 0.26, titanium, at(offset), y, 0.055, 12);
      for (let index = 0; index < 5; index += 1) {
        tube(radius * 1.65, radius * 1.65, 0.008, black, at(offset), y, -0.045 + index * 0.052, 12);
      }
    }
    for (const z of [-0.02, 0.09]) {
      const piston = tube(0.0028, 0.0028, 0.065, titanium, at(0.104), 0.002, z, 10);
      piston.rotation.x = 0.55;
      const sleeve = tube(0.0048, 0.0048, 0.03, black, at(0.104), 0.01, z - 0.013, 10);
      sleeve.rotation.x = 0.55;
    }

    // Twin forward neutron cannons.
    block(0.032, 0.04, 0.06, black, at(0.087), 0.002, -0.105);
    for (const y of [-0.011, 0.015]) {
      tube(0.0048, 0.0062, 0.23, gunmetal, at(0.09), y, -0.245, 16);
      for (let index = 0; index < 5; index += 1) {
        ring(0.0072, 0.0015, titanium, at(0.09), y, -0.32 + index * 0.034);
        ring(0.0064, 0.0007, plasma, at(0.09), y, -0.309 + index * 0.034);
      }
      tube(0.0082, 0.0068, 0.022, black, at(0.09), y, -0.367, 8);
      addPart(new THREE.SphereGeometry(0.0042 * length, 16, 10), plasma, at(0.09), y, -0.379);
    }
    block(0.008, 0.035, 0.012, titanium, at(0.09), 0.002, -0.245);

    // Six-cell missile launcher on the upper flank, warheads showing.
    const podX = at(0.096);
    block(0.048, 0.036, 0.115, deepRed, podX, 0.05, -0.012);
    block(0.052, 0.006, 0.09, black, podX, 0.071, -0.004);
    block(0.052, 0.04, 0.008, black, podX, 0.05, -0.068);
    for (const column of [-1, 0, 1]) {
      for (const row of [-1, 1]) {
        const x = podX + column * 0.0155;
        const y = 0.05 + row * 0.0095;
        ring(0.0062, 0.0013, titanium, x, y, -0.073);
        tube(0.0004, 0.0052, 0.022, light, x, y, -0.083, 12);
      }
    }

    // Under-wing missiles on rails.
    for (const [offset, y, nose] of [[0.122, -0.038, -0.005], [0.155, -0.034, 0.075]]) {
      const x = at(offset);
      block(0.006, 0.024, 0.07, black, x, y + 0.017, nose + 0.1);
      tube(0.0003, 0.0075, 0.032, light, x, y, nose + 0.016, 16);
      tube(0.0075, 0.0075, 0.14, titanium, x, y, nose + 0.102, 16);
      ring(0.0076, 0.0011, black, x, y, nose + 0.05);
      ring(0.0076, 0.0011, black, x, y, nose + 0.145);
      tube(0.0055, 0.0068, 0.012, scorched, x, y, nose + 0.178, 16);
      for (const z of [nose + 0.062, nose + 0.158]) {
        block(0.032, 0.0018, 0.016, red, x, y, z);
        block(0.0018, 0.03, 0.016, red, x, y, z);
      }
    }
  }

  return ship;
}
