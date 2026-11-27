'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { makeTerrainMaterial } from '@/components/planet-world/ground-materials';
import {
  GROUND_LIQUID_LEVEL,
  GROUND_LOCATIONS,
  fractalNoise,
  getPlanetGroundTheme,
  groundHeightAt,
  groundSiteHeight,
  type PlanetGroundTheme,
} from '@/lib/planet-ground';

type Props = { planetId: string; planetName: string; stage: number; onBack: () => void };
type Resources = Array<{ dispose: () => void }>;

function randomFrom(seed: number) {
  let n = seed >>> 0;
  return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
}

// Square terrain grid; `hole` leaves the middle to the finer inner mesh.
function terrainGeometry(ground: PlanetGroundTheme, size: number, divisions: number, hole: number) {
  const step = size / divisions;
  const positions = new Float32Array((divisions + 1) ** 2 * 3);
  const blend = new Float32Array((divisions + 1) ** 2 * 3);
  const indices: number[] = [];
  const row = divisions + 1;
  const heights = new Float32Array(row * row);
  for (let iz = 0; iz < row; iz += 1) {
    for (let ix = 0; ix < row; ix += 1) {
      // The unused middle of the outer ring needs no terrain.
      const x = -size / 2 + ix * step, z = -size / 2 + iz * step;
      if (hole && Math.abs(x) < hole / 2 - step && Math.abs(z) < hole / 2 - step) continue;
      heights[iz * row + ix] = groundHeightAt(ground, x, z);
    }
  }
  for (let iz = 0; iz < row; iz += 1) {
    for (let ix = 0; ix < row; ix += 1) {
      const x = -size / 2 + ix * step, z = -size / 2 + iz * step;
      const index = iz * row + ix, y = heights[index];
      const nextX = heights[ix < divisions ? index + 1 : index - 1];
      const nextZ = heights[iz < divisions ? index + row : index - row];
      const slope = Math.hypot(nextX - y, nextZ - y) / step;
      const cliff = THREE.MathUtils.smoothstep(slope, 0.28, 0.75);
      const patches = fractalNoise(x / 120, z / 120, 4_411, 4);
      const high = THREE.MathUtils.clamp(
        THREE.MathUtils.smoothstep(y, 8, 26) + THREE.MathUtils.smoothstep(patches, 0.5, 0.66), 0, 1,
      );
      positions.set([x, y, z], index * 3);
      blend.set([(1 - cliff) * (1 - high), (1 - cliff) * high, cliff], index * 3);
    }
  }
  for (let iz = 0; iz < divisions; iz += 1) {
    for (let ix = 0; ix < divisions; ix += 1) {
      const x0 = -size / 2 + ix * step, z0 = -size / 2 + iz * step;
      if (hole && x0 >= -hole / 2 && x0 + step <= hole / 2 && z0 >= -hole / 2 && z0 + step <= hole / 2) continue;
      const a = iz * (divisions + 1) + ix, b = a + divisions + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('blend', new THREE.BufferAttribute(blend, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeSky(ground: PlanetGroundTheme, sunDirections: THREE.Vector3[], resources: Resources) {
  const geometry = new THREE.SphereGeometry(9_000, 48, 32);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(ground.zenith) },
      uHorizon: { value: new THREE.Color(ground.horizon) },
      uSunA: { value: sunDirections[0] ?? new THREE.Vector3(0, -1, 0) },
      uSunB: { value: sunDirections[1] ?? new THREE.Vector3(0, -1, 0) },
      uStars: { value: ground.stars ? 1 : 0 },
      uClouds: { value: ground.stars ? 0 : 0.55 },
    },
    vertexShader: 'varying vec3 vDirection; void main(){ vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunA; uniform vec3 uSunB;
      uniform float uStars; uniform float uClouds;
      varying vec3 vDirection;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 d = normalize(vDirection);
        vec3 sky = mix(uHorizon, uZenith, pow(smoothstep(-0.05, 0.75, d.y), 0.7));
        vec3 p = vec3(d.x, d.y * 3.2, d.z) * 4.0;
        float cloud = noise(p) * 0.55 + noise(p * 2.3) * 0.3 + noise(p * 5.1) * 0.15;
        sky = mix(sky, mix(uHorizon, vec3(1.0), 0.55), smoothstep(0.52, 0.78, cloud) * smoothstep(0.0, 0.2, d.y) * uClouds);
        vec3 cell = floor(d * 420.0);
        sky += vec3(step(0.9965, hash(cell)) * hash(cell + 3.0) * uStars * smoothstep(0.0, 0.25, d.y));
        float a = max(dot(d, normalize(uSunA)), 0.0), b = max(dot(d, normalize(uSunB)), 0.0);
        sky += vec3(1.0, 0.82, 0.58) * (pow(a, 40.0) * 0.35 + smoothstep(0.99965, 0.99985, a) * 1.6);
        sky += vec3(0.72, 0.8, 1.0) * (pow(b, 60.0) * 0.25 + smoothstep(0.9998, 0.99992, b) * 1.4);
        gl_FragColor = vec4(sky, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  resources.push(geometry, material);
  const sky = new THREE.Mesh(geometry, material);
  sky.renderOrder = -1;
  return sky;
}

// Rocks, crystals, ice shards and plants, instanced over dry ground away from the building pads.
function scatter(
  scene: THREE.Scene, ground: PlanetGroundTheme, geometry: THREE.BufferGeometry, material: THREE.Material,
  count: number, seed: number, resources: Resources,
  shape: (random: () => number) => { scale: [number, number, number]; lift: number; tilt: number },
) {
  const random = randomFrom(seed);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  let placed = 0;
  for (let tries = 0; tries < count * 8 && placed < count; tries += 1) {
    const x = (random() - 0.5) * 560, z = (random() - 0.5) * 560;
    const y = groundHeightAt(ground, x, z);
    if (ground.liquid && y < GROUND_LIQUID_LEVEL + 0.8) continue;
    if (GROUND_LOCATIONS.some((site) => Math.hypot(x - site.x, z - site.z) < 44)) continue;
    const { scale, lift, tilt } = shape(random);
    dummy.position.set(x, y + lift, z);
    dummy.scale.set(...scale);
    dummy.rotation.set((random() - 0.5) * tilt, random() * Math.PI * 2, (random() - 0.5) * tilt);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  mesh.count = placed;
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  resources.push(geometry, material, mesh);
}

function roughRock(seed: number) {
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  const position = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index);
    const bump = fractalNoise(point.x * 1.8 + point.z, point.y * 1.8 - point.z, seed, 4);
    point.multiplyScalar(0.62 + bump * 0.76);
    position.setXYZ(index, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function addScenery(scene: THREE.Scene, ground: PlanetGroundTheme, rockMap: THREE.Texture, rockNormal: THREE.Texture, resources: Resources) {
  const seed = Number(ground.id.slice(-3)) * 131;
  const stone = () => new THREE.MeshStandardMaterial({ map: rockMap, normalMap: rockNormal, roughness: 0.94 });
  if (ground.kind !== 'gas') {
    scatter(scene, ground, roughRock(seed), stone(), 420, seed + 1, resources, (random) => {
      const size = 0.25 + Math.pow(random(), 4) * 4.5;
      return { scale: [size * 1.2, size * (0.5 + random() * 0.4), size], lift: size * 0.2, tilt: 0.5 };
    });
  }
  if (ground.kind === 'crystal' || ground.kind === 'ice') {
    const crystal = ground.kind === 'crystal';
    const material = new THREE.MeshPhysicalMaterial({
      color: crystal ? ground.colors[1] : '#d4f0ff', emissive: ground.glow ?? '#1c4a68', emissiveIntensity: crystal ? 0.28 : 0.16,
      roughness: 0.14, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.88, flatShading: true,
    });
    scatter(scene, ground, new THREE.ConeGeometry(1, 4, 6), material, crystal ? 260 : 90, seed + 2, resources, (random) => {
      const size = 0.5 + Math.pow(random(), 3) * (crystal ? 4.2 : 2.4);
      return { scale: [size * 0.6, size * (0.9 + random()), size * 0.6], lift: size, tilt: 0.65 };
    });
  }
  if (ground.flora === 'trees') {
    const trunk = new THREE.MeshStandardMaterial({ color: '#5c4432', roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: ground.floraColor, roughness: 0.92, flatShading: true });
    const place = (random: () => number) => 0.65 + random() * 1.1;
    // The same seed puts each crown on its trunk.
    scatter(scene, ground, new THREE.CylinderGeometry(0.2, 0.42, 5, 8), trunk, 330, seed + 3, resources, (random) => {
      const size = place(random);
      return { scale: [size, size, size], lift: 2.3 * size, tilt: 0 };
    });
    const crown = new THREE.IcosahedronGeometry(1, 2);
    scatter(scene, ground, crown, leaf, 330, seed + 3, resources, (random) => {
      const size = place(random);
      return { scale: [2.1 * size, 2.7 * size, 2.1 * size], lift: 6 * size, tilt: 0 };
    });
  }
  if (ground.flora === 'glow') {
    const material = new THREE.MeshStandardMaterial({ color: '#12302a', emissive: ground.floraColor, emissiveIntensity: 0.9, roughness: 0.5 });
    scatter(scene, ground, new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), material, 300, seed + 4, resources, (random) => {
      const size = 0.3 + Math.pow(random(), 2) * 1.8;
      return { scale: [size, size * 0.7, size], lift: size * 0.6, tilt: 0.2 };
    });
  }
}

// Settlements grow with the civilisation stage; each landing zone gets its own cluster.
function addSettlements(scene: THREE.Scene, ground: PlanetGroundTheme, stage: number, resources: Resources) {
  const night = ground.stars || ground.suns === 0;
  const wall = new THREE.MeshStandardMaterial({ color: '#c9d2d8', roughness: 0.46, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: '#34404c', roughness: 0.4, metalness: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#8fd8e6', roughness: 0.1, metalness: 0.25, transparent: true, opacity: 0.72, clearcoat: 1 });
  const light = new THREE.MeshStandardMaterial({ color: '#c8b890', emissive: '#ffd27a', emissiveIntensity: night ? 1.2 : 0.35 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
  const dome = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const ring = new THREE.TorusGeometry(1, 0.035, 8, 40);
  resources.push(wall, dark, glass, light, box, cylinder, dome, ring);
  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  GROUND_LOCATIONS.forEach((site, siteIndex) => {
    const random = randomFrom(Number(ground.id.slice(-3)) * 17 + siteIndex * 911);
    const base = groundSiteHeight(ground, site);
    // A platform carries the district; over the cloud tops it hangs on glowing lift rings.
    part(cylinder, dark, site.x, base - (ground.kind === 'gas' ? 1.2 : 2.6), site.z, 34, ground.kind === 'gas' ? 2.6 : 5.4, 34);
    part(ring, light, site.x, base + 0.15, site.z, 33, 33, 33).rotation.x = Math.PI / 2;
    if (ground.kind === 'gas') {
      part(cylinder, wall, site.x, base - 16, site.z, 5, 28, 5);
      for (const depth of [8, 17]) part(ring, light, site.x, base - depth, site.z, 20 - depth * 0.6, 20 - depth * 0.6, 20).rotation.x = Math.PI / 2;
    }
    const count = Math.min(11, 4 + stage * 2);
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2 + random() * 0.4;
      const radius = 14 + random() * 14;
      const x = site.x + Math.cos(angle) * radius, z = site.z + Math.sin(angle) * radius;
      const width = 2.4 + random() * 2.4;
      const kind = stage >= 3 && index % 3 === 0 ? 'tower' : index % 3 === 1 ? 'dome' : 'block';
      if (kind === 'dome') {
        part(cylinder, wall, x, base + 0.7, z, width * 1.08, 1.4, width * 1.08);
        part(dome, glass, x, base + 1.4, z, width, width * 0.9, width);
        part(ring, light, x, base + 1.45, z, width * 1.03, width * 1.03, width).rotation.x = Math.PI / 2;
        continue;
      }
      const height = kind === 'tower' ? 16 + random() * stage * 9 : 4 + random() * 6;
      const geometry = kind === 'tower' ? cylinder : box;
      const half = kind === 'tower' ? width * 0.55 : width * 0.62;
      part(geometry, kind === 'tower' ? glass : wall, x, base + height / 2, z, kind === 'tower' ? half : width * 1.25, height, kind === 'tower' ? half : width);
      part(geometry, dark, x, base + height + 0.35, z, kind === 'tower' ? half * 1.15 : width * 1.35, 0.7, kind === 'tower' ? half * 1.15 : width * 1.1);
      for (let floor = 2; floor < height - 1; floor += 3) {
        part(geometry, light, x, base + floor, z, kind === 'tower' ? half * 1.02 : width * 1.27, 0.34, kind === 'tower' ? half * 1.02 : width * 1.02);
      }
    }
    part(cylinder, wall, site.x, base + 5 + stage * 2, site.z, 0.7, 10 + stage * 4, 0.7);
    part(dome, light, site.x, base + 10 + stage * 4, site.z, 1.5, 1.5, 1.5);
  });
}

export default function PlanetGroundView({ planetId, planetName, stage, onBack }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<(id: string) => void>(() => {});
  const [choice, setChoice] = useState('glassfield');
  const [active, setActive] = useState('glassfield');
  const [landed, setLanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); }
    catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.setSize(Math.max(1, mount.clientWidth), Math.max(1, mount.clientHeight));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    mount.appendChild(renderer.domElement);

    const ground = getPlanetGroundTheme(planetId);
    const resources: Resources = [];
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(new THREE.Color(ground.horizon), ground.stars ? 0.00012 : 0.00032);
    const camera = new THREE.PerspectiveCamera(59, mount.clientWidth / Math.max(1, mount.clientHeight), 0.5, 15_000);
    const viewFrom = (id: string) => {
      const site = GROUND_LOCATIONS.find((item) => item.id === id) ?? GROUND_LOCATIONS[1];
      const target = new THREE.Vector3(site.x, groundSiteHeight(ground, site) + 9, site.z);
      const z = site.z + 105;
      const position = new THREE.Vector3(site.x + 24, Math.max(target.y + 20, groundHeightAt(ground, site.x + 24, z) + 12), z);
      return { target, position };
    };
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.minDistance = 8;
    controls.maxDistance = 900;
    controls.minPolarAngle = 0.13;
    controls.maxPolarAngle = Math.PI * 0.495;
    const start = viewFrom('glassfield');
    camera.position.copy(start.position);
    controls.target.copy(start.target);
    controls.update();

    const sunDirections = [
      new THREE.Vector3(-0.42, 0.36, -0.83).normalize(),
      new THREE.Vector3(0.34, 0.22, -0.91).normalize(),
    ].slice(0, ground.suns);
    const sky = makeSky(ground, sunDirections, resources);
    scene.add(sky);
    // Airless and night worlds get a brighter fill so their dark sides stay readable.
    scene.add(ground.stars
      ? new THREE.HemisphereLight('#a8b8e0', '#5a5660', 1.7)
      : new THREE.HemisphereLight(ground.horizon, ground.colors[2], 1.35));
    const sunDirection = sunDirections[0] ?? new THREE.Vector3(0.3, 0.8, 0.4).normalize();
    const sun = new THREE.DirectionalLight(ground.suns === 0 ? '#8a96d8' : '#fff0d8', ground.suns === 0 ? 0.7 : 2.7);
    sun.position.copy(sunDirection).multiplyScalar(700);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -320;
    sun.shadow.camera.right = sun.shadow.camera.top = 320;
    sun.shadow.camera.far = 1_600;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target);
    if (sunDirections[1]) {
      const second = new THREE.DirectionalLight('#b8ccff', 0.9);
      second.position.copy(sunDirections[1]).multiplyScalar(700);
      scene.add(second);
    }

    let liquidNormal: THREE.Texture | null = null;
    let frame = 0;
    let alive = true;
    let cameraMove: { start: number; from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3 } | null = null;
    // Texture synthesis takes a moment, so let the panel paint first.
    const build = window.setTimeout(() => {
      const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      const { material, tiles } = makeTerrainMaterial(ground, anisotropy, resources);
      for (const [size, divisions, hole] of [[640, 320, 0], [8_320, 208, 640]]) {
        const geometry = terrainGeometry(ground, size, divisions, hole);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.castShadow = hole === 0;
        scene.add(mesh);
        resources.push(geometry);
      }
      if (ground.liquid) {
        const molten = ground.liquid === 'lava';
        liquidNormal = tiles[0].normal.clone();
        liquidNormal.repeat.set(260, 260);
        liquidNormal.needsUpdate = true;
        const glowMap = molten ? tiles[2].color.clone() : null;
        if (glowMap) { glowMap.repeat.set(120, 120); glowMap.needsUpdate = true; resources.push(glowMap); }
        const liquid = new THREE.MeshPhysicalMaterial({
          color: ground.liquidColor, normalMap: liquidNormal,
          normalScale: new THREE.Vector2(molten ? 0.8 : 0.28, molten ? 0.8 : 0.28),
          roughness: molten ? 0.65 : 0.12, metalness: 0.1, clearcoat: molten ? 0 : 1,
          emissive: molten ? ground.liquidColor : '#000000', emissiveMap: glowMap, emissiveIntensity: molten ? 2.6 : 0,
          transparent: !molten, opacity: molten ? 1 : 0.9,
        });
        const geometry = new THREE.PlaneGeometry(8_320, 8_320);
        const surface = new THREE.Mesh(geometry, liquid);
        surface.rotation.x = -Math.PI / 2;
        surface.position.y = GROUND_LIQUID_LEVEL;
        surface.receiveShadow = true;
        scene.add(surface);
        resources.push(liquidNormal, liquid, geometry);
      }
      addScenery(scene, ground, tiles[2].color, tiles[2].normal, resources);
      addSettlements(scene, ground, stage, resources);
      setReady(true);
    }, 30);

    moveRef.current = (id) => {
      const view = viewFrom(id);
      cameraMove = { start: performance.now(), from: camera.position.clone(), to: view.position, fromTarget: controls.target.clone(), toTarget: view.target };
      controls.enabled = false;
    };
    const clock = new THREE.Clock();
    const render = () => {
      if (!alive) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      if (liquidNormal) liquidNormal.offset.x += delta * 0.02;
      if (cameraMove) {
        const t = Math.min(1, (performance.now() - cameraMove.start) / 1250), eased = t * t * (3 - 2 * t);
        camera.position.lerpVectors(cameraMove.from, cameraMove.to, eased);
        controls.target.lerpVectors(cameraMove.fromTarget, cameraMove.toTarget, eased);
        camera.lookAt(controls.target);
        if (t >= 1) { cameraMove = null; controls.enabled = true; controls.update(); }
      } else {
        controls.update();
        // Keep the camera above hills after orbiting or zooming.
        const floor = Math.max(groundHeightAt(ground, camera.position.x, camera.position.z), ground.liquid ? GROUND_LIQUID_LEVEL : -Infinity) + 3;
        if (camera.position.y < floor) camera.position.y = floor;
      }
      sky.position.copy(camera.position);
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();
    const observer = new ResizeObserver(() => {
      const width = Math.max(1, mount.clientWidth), height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    });
    observer.observe(mount);
    return () => {
      alive = false;
      window.clearTimeout(build);
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      moveRef.current = () => {};
      controls.dispose();
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [planetId, stage]);

  const land = () => { setActive(choice); setLanded(true); moveRef.current(choice); };
  const location = GROUND_LOCATIONS.find((item) => item.id === active) ?? GROUND_LOCATIONS[1];
  return (
    <div className="absolute inset-0 z-20 overflow-hidden bg-slate-900 text-white">
      <div ref={mountRef} className="absolute inset-0" aria-label={planetName + 'の地表の3D景観'} data-ready={ready} />
      <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="rounded-xl border border-white/20 bg-slate-950/65 px-3 py-2 shadow-xl backdrop-blur-md">
          <p className="text-[9px] font-black tracking-[.2em] text-emerald-200">SURFACE EXPLORATION</p>
          <p className="mt-0.5 text-xs font-bold">{planetName} · 地上探査</p>
          <p className="mt-1 text-[9px] text-emerald-100/80">文明 Stage {stage} · {stage < 2 ? '初期居住区' : stage < 4 ? '都市・研究インフラ' : '未来都市'}</p>
        </div>
        <button type="button" onClick={onBack} className="rounded-xl border border-white/20 bg-slate-950/70 px-3 py-2 text-[10px] font-bold shadow-lg backdrop-blur-md">惑星視点へ戻る</button>
      </div>
      {!ready && !failed && <p className="pointer-events-none absolute inset-x-0 top-24 z-40 text-center text-xs font-bold">地表を生成しています…</p>}
      {failed && <p className="absolute inset-x-0 top-24 z-40 text-center text-xs font-bold text-amber-200">この端末では3D表示を初期化できませんでした。</p>}
      {!landed ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/24 p-3 pt-16 backdrop-blur-[2px]">
          <div className="max-h-full w-full max-w-[520px] overflow-y-auto rounded-2xl border border-white/20 bg-slate-950/82 p-4 shadow-2xl backdrop-blur-xl sm:p-5">
            <p className="text-[9px] font-black tracking-[.22em] text-emerald-200">CHOOSE LANDING ZONE</p>
            <h3 className="mt-1 text-lg font-black">{planetName}の地表へ降り立つ</h3>
            <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {GROUND_LOCATIONS.map((item) => (
                <button key={item.id} type="button" onClick={() => setChoice(item.id)} className={'rounded-xl border p-2.5 text-left ' + (choice === item.id ? 'border-emerald-300 bg-emerald-300/15' : 'border-white/10 bg-white/5')}>
                  <span className="block text-xs font-bold">{item.name}</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-300">{item.detail}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={land} disabled={!ready} className="mt-3 w-full rounded-xl bg-emerald-300 px-3 py-2.5 text-xs font-black text-emerald-950 disabled:opacity-40">選択した地点に降り立つ</button>
          </div>
        </div>
      ) : (
        <>
          <div className="absolute left-3 top-[88px] z-30 max-w-[260px] rounded-xl border border-white/15 bg-slate-950/65 px-3 py-2 shadow-lg backdrop-blur-md">
            <p className="text-[9px] font-black tracking-[.16em] text-emerald-200">CURRENT LANDING ZONE</p><p className="mt-0.5 text-sm font-black">{location.name}</p><p className="mt-0.5 text-[10px] text-slate-300">{location.detail}</p>
          </div>
          <div className="absolute bottom-3 left-3 right-3 z-30 flex items-end justify-between gap-2 sm:bottom-4 sm:left-4 sm:right-4">
            <p className="max-w-[300px] rounded-xl border border-white/15 bg-slate-950/65 px-3 py-2 text-[10px] leading-4 text-slate-200 backdrop-blur-md">ドラッグで周囲を見渡し、ホイール／ピンチで地形に近づけます。</p>
            <button type="button" onClick={() => setLanded(false)} className="rounded-xl border border-white/20 bg-slate-950/75 px-3 py-2 text-[10px] font-bold shadow-lg backdrop-blur-md">地点を変更</button>
          </div>
        </>
      )}
    </div>
  );
}
