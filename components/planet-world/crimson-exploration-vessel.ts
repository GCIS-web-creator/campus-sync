import * as THREE from 'three';
import { VOYAGE_SCALE } from '@/lib/planet-star-voyage';

type Point = [x: number, z: number];

// Original CampusSync design: forked bow, black dorsal spine, swept wings and
// four outboard drives. The nose points to local -Z. All dimensions below are
// fractions of the ship length, so nose-to-nozzle stays exactly 1 km.
export function makeExplorationVessel(resources: Array<{ dispose: () => void }>) {
  const ship = new THREE.Group();
  ship.name = 'CampusSync Crimson Fork Explorer';
  const length = VOYAGE_SCALE.spacecraftLength;

  const paint = (color: string, metalness: number, roughness: number, glow = '#000000') => {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive: glow, flatShading: true });
    resources.push(material);
    return material;
  };
  // A faint emissive keeps the red and black readable on the night side.
  const red = paint('#c4121f', 0.38, 0.42, '#2a0206');
  const deepRed = paint('#770a14', 0.45, 0.48, '#160103');
  const black = paint('#0c0d11', 0.62, 0.3, '#030305');
  const gunmetal = paint('#32343c', 0.75, 0.4, '#07070a');
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
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x * length, z * length)));
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
    addPart(new THREE.BoxGeometry(w * length, h * length, d * length), material, x, y, z);
  // Cylinder or cone laid along the flight axis; `front` is the radius toward the nose.
  const tube = (front: number, rear: number, depth: number, material: THREE.Material, x: number, y: number, z: number, sides = 8) => {
    const geometry = new THREE.CylinderGeometry(rear * length, front * length, depth * length, sides);
    geometry.rotateX(Math.PI / 2);
    return addPart(geometry, material, x, y, z);
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
    tube(0.003, 0.008, 0.07, gunmetal, side * 0.045, -0.012, -0.39);

    // Swept wings, black leading edge and a tip pod.
    plate(mirrored([[0.095, 0.03], [0.31, 0.25], [0.33, 0.36], [0.22, 0.31], [0.105, 0.33]], side), 0.018, red, -0.006);
    plate(mirrored([[0.1, 0.045], [0.305, 0.255], [0.312, 0.285], [0.105, 0.095]], side), 0.008, black, 0.007);
    tube(0.005, 0.019, 0.08, black, side * 0.325, -0.006, 0.25, 6);
    tube(0.019, 0.013, 0.11, deepRed, side * 0.325, -0.006, 0.345, 6);
    box(0.006, 0.006, 0.03, light, side * 0.325, 0.012, 0.33);

    // Four drives in an X arrangement.
    for (const level of [-1, 1]) {
      const x = side * 0.13;
      const y = level * 0.052;
      const pylon = box(0.085, 0.014, 0.1, black, side * 0.09, level * 0.03, 0.31);
      pylon.rotation.z = side * level * 0.55;
      tube(0.012, 0.036, 0.09, red, x, y, 0.235);
      tube(0.036, 0.036, 0.13, red, x, y, 0.345);
      tube(0.04, 0.04, 0.025, black, x, y, 0.33);
      tube(0.032, 0.041, 0.07, gunmetal, x, y, 0.445);
      addPart(new THREE.CircleGeometry(0.033 * length, 20), light, x, y, 0.482);
      addPart(new THREE.CircleGeometry(0.016 * length, 20), core, x, y, 0.485);
      plate(mirrored([[0.122, 0.27], [0.138, 0.27], [0.142, 0.44], [0.118, 0.44]], side), 0.008, black, y + level * 0.039);
    }

    // Angled tail fins.
    const fin = box(0.008, 0.1, 0.075, red, side * 0.06, 0.095, 0.325);
    fin.rotation.set(0.45, 0, -side * 0.42);

    // Hull vents.
    for (let index = 0; index < 5; index += 1) {
      box(0.02, 0.004, 0.011, black, side * 0.066, 0.056, 0.1 + index * 0.034);
    }
  }

  // Main drive.
  tube(0.052, 0.046, 0.1, gunmetal, 0, 0, 0.43, 12);
  tube(0.044, 0.052, 0.03, black, 0, 0, 0.481, 12);
  addPart(new THREE.CircleGeometry(0.042 * length, 24), light, 0, 0, 0.4975);
  addPart(new THREE.CircleGeometry(0.022 * length, 24), core, 0, 0, 0.5);

  return ship;
}
