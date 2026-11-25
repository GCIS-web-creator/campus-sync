'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Props = { atmosphereColor: string; onBack: () => void };
type MaterialKey = 'grassland' | 'forest-floor' | 'sedimentary-rock' | 'lakeshore' | 'permeable-road' | 'biocomposite-wood' | 'biofilm-roof';
type Binding = { mesh: THREE.Mesh; key: MaterialKey };
type GeographyMasks = {
  sampleBiome: (x: number, z: number) => [number, number, number, number];
  sampleWater: (x: number, z: number) => [number, number, number, number];
  breakupTexture: THREE.Texture;
};

const ASSET = '/planet-world/planet-006/verdia-material-pack-v1/material-atlas.webp';
const GEO_MASK_ASSET = '/planet-world/planet-006/verdia-material-pack-v1/geography-masks-atlas.webp';
const CELL = 96;
const GEO_MASK_CELL = 128;
const KEYS: MaterialKey[] = ['grassland', 'forest-floor', 'sedimentary-rock', 'lakeshore', 'permeable-road', 'biocomposite-wood', 'biofilm-roof'];
const COLUMNS = { baseColor: 0, normal: 1, roughness: 2, ao: 3, height: 4, emissive: 5 };
const LOCATIONS = [
  { id: 'aurora', name: 'Aurora Reach', detail: '北西の森林と湖岸が接する緑豊かな居住区', target: [-105, 4, 85] as [number, number, number] },
  { id: 'glassfield', name: 'Glassfield', detail: '西側の草原と海岸平野に広がる研究都市', target: [-95, 3, 65] as [number, number, number] },
  { id: 'ember', name: 'Ember Haven', detail: '中央西部の高低差と森林に囲まれた丘陵都市', target: [-45, 7, -20] as [number, number, number] },
  { id: 'tidal', name: 'Tidal Arc', detail: '東寄りの内陸湖と湿地に沿って続く水辺の街', target: [30, 4, 40] as [number, number, number] },
  { id: 'nova', name: 'Nova Suburb', detail: '東側の森林帯に計画された緑化住宅地区', target: [85, 4, 15] as [number, number, number] },
];

function randomFrom(seed: number) {
  let n = seed >>> 0;
  return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
}
function heightAt(x: number, z: number) {
  const waves = Math.sin(x * 0.032) * 1.8 + Math.cos(z * 0.027) * 1.35 + Math.sin((x + z) * 0.019) * 1.1;
  const ridge = 8.5 * Math.exp(-(((x + 60) / 28) ** 2 + ((z + 28) / 44) ** 2));
  const west = 5.5 * Math.exp(-(((x + 48) / 34) ** 2 + ((z - 34) / 30) ** 2));
  const east = 4.2 * Math.exp(-(((x - 70) / 36) ** 2 + ((z + 62) / 30) ** 2));
  return waves + ridge + west + east;
}
function lakeDistance(x: number, z: number) { return Math.sqrt(((x - 39) / 25) ** 2 + ((z + 24) / 17) ** 2); }
function roadX(z: number) { return Math.sin(z * 0.022) * 14 + Math.sin(z * 0.051) * 3.5; }
function forestAt(x: number, z: number) {
  return [((x + 43) / 29) ** 2 + ((z - 7) / 43) ** 2, ((x - 55) / 30) ** 2 + ((z - 48) / 27) ** 2, ((x + 3) / 24) ** 2 + ((z + 68) / 24) ** 2].some(v => v < 1.1);
}
function withUv2(geometry: THREE.BufferGeometry) {
  const uv = geometry.getAttribute('uv');
  if (uv && !geometry.getAttribute('uv2')) geometry.setAttribute('uv2', uv.clone());
  return geometry;
}
function scaledUvs(geometry: THREE.BufferGeometry, x: number, y: number) {
  const uv = geometry.getAttribute('uv');
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * x, uv.getY(i) * y);
  return withUv2(geometry);
}
function crop(source: CanvasImageSource, column: number, row: number, colorSpace: THREE.ColorSpace, anisotropy: number) {
  const canvas = document.createElement('canvas');
  canvas.width = CELL; canvas.height = CELL;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Atlas canvas unavailable');
  ctx.drawImage(source, column * CELL, row * CELL, CELL, CELL, 0, 0, CELL, CELL);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = anisotropy; texture.needsUpdate = true;
  return texture;
}
function makeMaterials(source: CanvasImageSource, anisotropy: number, textures: THREE.Texture[]) {
  const mats = {} as Record<MaterialKey, THREE.MeshStandardMaterial>;
  const bump: Record<MaterialKey, number> = { grassland: 0.035, 'forest-floor': 0.05, 'sedimentary-rock': 0.07, lakeshore: 0.035, 'permeable-road': 0.018, 'biocomposite-wood': 0.018, 'biofilm-roof': 0.025 };
  KEYS.forEach((key, row) => {
    const map = crop(source, COLUMNS.baseColor, row, THREE.SRGBColorSpace, anisotropy);
    const normalMap = crop(source, COLUMNS.normal, row, THREE.NoColorSpace, anisotropy);
    const roughnessMap = crop(source, COLUMNS.roughness, row, THREE.NoColorSpace, anisotropy);
    const aoMap = crop(source, COLUMNS.ao, row, THREE.NoColorSpace, anisotropy);
    const bumpMap = crop(source, COLUMNS.height, row, THREE.NoColorSpace, anisotropy);
    textures.push(map, normalMap, roughnessMap, aoMap, bumpMap);
    const glow = key === 'forest-floor' ? crop(source, COLUMNS.emissive, row, THREE.SRGBColorSpace, anisotropy) : null;
    if (glow) textures.push(glow);
    mats[key] = new THREE.MeshStandardMaterial({
      map, normalMap, roughnessMap, aoMap, aoMapIntensity: 1, bumpMap, bumpScale: bump[key],
      roughness: 1, metalness: 0, emissive: glow ? '#ffffff' : '#000000',
      emissiveMap: glow, emissiveIntensity: glow ? 0.35 : 0,
    });
  });
  return mats;
}

async function loadGeographyMasks(): Promise<GeographyMasks> {
  const response = await fetch(GEO_MASK_ASSET, { cache: 'force-cache' });
  if (!response.ok) throw new Error('ヴェルディア地理マスクを取得できません');
  const bitmap = await createImageBitmap(await response.blob(), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  try {
    if (bitmap.width !== GEO_MASK_CELL * 2 || bitmap.height !== GEO_MASK_CELL * 2) {
      throw new Error('ヴェルディア地理マスクのサイズが不正です');
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('地理マスク用Canvasを作成できません');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const sample = (left: number, top: number, x: number, z: number): [number, number, number, number] => {
      const u = Math.max(0, Math.min(0.999999, (x + 120) / 240));
      const v = Math.max(0, Math.min(0.999999, (z + 120) / 240));
      const px = left + Math.floor(u * GEO_MASK_CELL);
      const py = top + Math.floor(v * GEO_MASK_CELL);
      const offset = (py * canvas.width + px) * 4;
      return [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
    };
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = GEO_MASK_CELL;
    noiseCanvas.height = GEO_MASK_CELL;
    const noiseContext = noiseCanvas.getContext('2d');
    if (!noiseContext) throw new Error('タイリングノイズを作成できません');
    noiseContext.drawImage(canvas, 0, GEO_MASK_CELL, GEO_MASK_CELL, GEO_MASK_CELL, 0, 0, GEO_MASK_CELL, GEO_MASK_CELL);
    const breakupTexture = new THREE.CanvasTexture(noiseCanvas);
    breakupTexture.colorSpace = THREE.NoColorSpace;
    breakupTexture.wrapS = breakupTexture.wrapT = THREE.RepeatWrapping;
    breakupTexture.magFilter = THREE.LinearFilter;
    breakupTexture.minFilter = THREE.LinearMipmapLinearFilter;
    breakupTexture.generateMipmaps = true;
    breakupTexture.needsUpdate = true;
    return {
      sampleBiome: (x, z) => sample(0, 0, x, z),
      sampleWater: (x, z) => sample(GEO_MASK_CELL, 0, x, z),
      breakupTexture,
    };
  } finally {
    bitmap.close();
  }
}

function applyTileBreakup(material: THREE.MeshStandardMaterial, noise: THREE.Texture) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.verdiaTileBreakup = { value: noise };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vVerdiaBreakupUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVerdiaBreakupUv = (modelMatrix * vec4(transformed, 1.0)).xz / 41.0;');
    const breakupFragment = '#include <map_fragment>\n' +
      'float verdiaNoiseA = texture2D(verdiaTileBreakup, vVerdiaBreakupUv).r;\n' +
      'vec2 verdiaRotatedUv = mat2(0.8660254, -0.5, 0.5, 0.8660254) * vVerdiaBreakupUv;\n' +
      'float verdiaNoiseB = texture2D(verdiaTileBreakup, verdiaRotatedUv).r;\n' +
      'diffuseColor.rgb *= 1.0 + (((verdiaNoiseA + verdiaNoiseB) * 0.5) - 0.5) * 0.2;';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D verdiaTileBreakup;\nvarying vec2 vVerdiaBreakupUv;')
      .replace('#include <map_fragment>', breakupFragment);
  };
  material.customProgramCacheKey = () => 'campussync-verdia-tile-breakup-v1';
}

function terrainGeometry(key: MaterialKey, tile: number, masks?: GeographyMasks) {
  const size = 240, half = size / 2, divisions = 112, step = size / divisions;
  const positions: number[] = [], uvs: number[] = [];
  const vertex = (x: number, z: number) => { positions.push(x, heightAt(x, z), z); uvs.push(x / tile, z / tile); };
  for (let iz = 0; iz < divisions; iz++) for (let ix = 0; ix < divisions; ix++) {
    const x0 = -half + ix * step, x1 = x0 + step, z0 = -half + iz * step, z1 = z0 + step;
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2, lake = lakeDistance(x, z);
    const biome = masks?.sampleBiome(x, z);
    const water = masks?.sampleWater(x, z);
    if (masks ? water![0] >= 128 : lake < 0.84) continue;
    let category: MaterialKey;
    if (Math.abs(x - roadX(z)) < 5.4) category = 'permeable-road';
    else if (biome) {
      const channels = [biome[0], biome[1], biome[2], biome[3]];
      const dominant = channels.indexOf(Math.max(...channels));
      category = Math.max(...channels) < 28
        ? (heightAt(x, z) > 5 ? 'sedimentary-rock' : 'grassland')
        : dominant === 0 ? 'grassland' : dominant === 1 ? 'forest-floor' : dominant === 2 ? 'lakeshore' : 'sedimentary-rock';
    } else category = lake < 1.14 ? 'lakeshore' : forestAt(x, z) ? 'forest-floor' : heightAt(x, z) > 5 || (x < -75 && Math.sin(z * 0.09) > -0.2) ? 'sedimentary-rock' : 'grassland';
    if (category !== key) continue;
    vertex(x0, z0); vertex(x0, z1); vertex(x1, z0);
    vertex(x0, z1); vertex(x1, z1); vertex(x1, z0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  withUv2(geo); geo.computeVertexNormals(); geo.computeBoundingSphere();
  return geo;
}
function addBuilding(scene: THREE.Scene, bindings: Binding[], resources: Array<{ dispose: () => void }>, plan: number[], index: number, fallback: Record<MaterialKey, THREE.Material>, windows: THREE.Material) {
  const [x, z, w, d, h] = plan;
  const group = new THREE.Group();
  group.position.set(x, heightAt(x, z), z); group.rotation.y = (index % 3 - 1) * 0.13; scene.add(group);
  const wallGeo = scaledUvs(new THREE.BoxGeometry(w, h, d), Math.max(2, w / 2), Math.max(2, h / 2));
  const wall = new THREE.Mesh(wallGeo, fallback['biocomposite-wood']);
  wall.position.y = h / 2; wall.castShadow = wall.receiveShadow = true; group.add(wall);
  bindings.push({ mesh: wall, key: 'biocomposite-wood' }); resources.push(wallGeo);
  const roofGeo = scaledUvs(new THREE.BoxGeometry(w + 1, 0.65, d + 1), Math.max(2, w / 2), Math.max(2, d / 2));
  const roof = new THREE.Mesh(roofGeo, fallback['biofilm-roof']);
  roof.position.y = h + 0.3; roof.castShadow = roof.receiveShadow = true; group.add(roof);
  bindings.push({ mesh: roof, key: 'biofilm-roof' }); resources.push(roofGeo);
  const floors = Math.max(2, Math.floor(h / 3.4));
  for (let floor = 0; floor < floors; floor++) for (let col = 0; col < 3; col++) {
    const geo = new THREE.BoxGeometry(w * 0.19, 1.15, 0.09);
    const pane = new THREE.Mesh(geo, windows);
    pane.position.set((col - 1) * w * 0.27, 1.8 + floor * (h - 2.4) / floors, d / 2 + 0.055);
    group.add(pane); resources.push(geo);
  }
}
function addTrees(scene: THREE.Scene, resources: Array<{ dispose: () => void }>, masks?: GeographyMasks) {
  const random = randomFrom(617), count = 128, dummy = new THREE.Object3D();
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.4, 4.4, 7);
  const leafGeo = new THREE.ConeGeometry(2.1, 6.2, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#705440', roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#59825f', roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
  let n = 0;
  for (let tries = 0; tries < count * 12 && n < count; tries++) {
    const x = (random() - 0.5) * 218, z = (random() - 0.5) * 218;
    const biome = masks?.sampleBiome(x, z);
    const water = masks?.sampleWater(x, z);
    const inForest = biome ? biome[1] > 76 && biome[1] >= biome[0] && biome[1] >= biome[2] : forestAt(x, z);
    if (!inForest || (water ? water[0] >= 128 : lakeDistance(x, z) < 1.2) || Math.abs(x - roadX(z)) < 8) continue;
    const scale = 0.7 + random() * 0.8, y = heightAt(x, z);
    dummy.position.set(x, y + 2.1 * scale, z); dummy.scale.setScalar(scale); dummy.rotation.y = random() * Math.PI * 2; dummy.updateMatrix(); trunks.setMatrixAt(n, dummy.matrix);
    dummy.position.set(x, y + 5.3 * scale, z); dummy.scale.setScalar(scale); dummy.updateMatrix(); leaves.setMatrixAt(n, dummy.matrix); n++;
  }
  trunks.count = leaves.count = n; trunks.castShadow = leaves.castShadow = true;
  scene.add(trunks, leaves); resources.push(trunkGeo, leafGeo, trunkMat, leafMat, trunks, leaves);
}


function createWaterGeometry(masks: GeographyMasks) {
  const size = 240, divisions = GEO_MASK_CELL, step = size / divisions;
  const positions: number[] = [], colors: number[] = [];
  const addVertex = (x: number, z: number) => {
    const water = masks.sampleWater(x, z);
    const depth = Math.max(0, Math.min(1, water[1] / 220));
    const tint = new THREE.Color('#8bc5c9').lerp(new THREE.Color('#20516e'), depth);
    positions.push(x, heightAt(x, z) - 0.42, z);
    colors.push(tint.r, tint.g, tint.b);
  };
  for (let iz = 0; iz < divisions; iz++) {
    for (let ix = 0; ix < divisions; ix++) {
      const x0 = -size / 2 + ix * step, x1 = x0 + step;
      const z0 = -size / 2 + iz * step, z1 = z0 + step;
      if (masks.sampleWater((x0 + x1) / 2, (z0 + z1) / 2)[0] < 128) continue;
      addVertex(x0, z0); addVertex(x0, z1); addVertex(x1, z0);
      addVertex(x0, z1); addVertex(x1, z1); addVertex(x1, z0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

export default function VerdiaGroundView({ atmosphereColor, onBack }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<(id: string) => void>(() => {});
  const [choice, setChoice] = useState('glassfield');
  const [active, setActive] = useState('glassfield');
  const [landed, setLanded] = useState(false);
  const [assetError, setAssetError] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); }
    catch { setAssetError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.setSize(Math.max(1, mount.clientWidth), Math.max(1, mount.clientHeight));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;'; mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const sky = new THREE.Color(atmosphereColor).lerp(new THREE.Color('#d3e3df'), 0.48);
    scene.background = sky; scene.fog = new THREE.Fog(sky, 110, 270);
    const camera = new THREE.PerspectiveCamera(48, mount.clientWidth / Math.max(1, mount.clientHeight), 0.1, 700);
    camera.position.set(8, 18, 34);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 3, 0); controls.enableDamping = true; controls.dampingFactor = 0.06;
    controls.enablePan = true; controls.minDistance = 10; controls.maxDistance = 110;
    controls.minPolarAngle = 0.18; controls.maxPolarAngle = Math.PI * 0.48; controls.update();

    const resources: Array<{ dispose: () => void }> = [];
    const bindings: Binding[] = [];
    const fallback: Record<MaterialKey, THREE.Material> = {
      grassland: new THREE.MeshStandardMaterial({ color: '#638b58', roughness: 1 }),
      'forest-floor': new THREE.MeshStandardMaterial({ color: '#425d3b', roughness: 1 }),
      'sedimentary-rock': new THREE.MeshStandardMaterial({ color: '#817765', roughness: 1 }),
      lakeshore: new THREE.MeshStandardMaterial({ color: '#9c9d7a', roughness: 1 }),
      'permeable-road': new THREE.MeshStandardMaterial({ color: '#69766c', roughness: 1 }),
      'biocomposite-wood': new THREE.MeshStandardMaterial({ color: '#927b60', roughness: 1 }),
      'biofilm-roof': new THREE.MeshStandardMaterial({ color: '#6b9162', roughness: 1 }),
    };
    Object.values(fallback).forEach(m => resources.push(m));

    scene.add(new THREE.HemisphereLight('#effbff', '#52654b', 2));
    const sun = new THREE.DirectionalLight('#fff2d7', 3.1);
    sun.position.set(-55, 82, 38); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -135; sun.shadow.camera.right = sun.shadow.camera.top = 135;
    sun.shadow.bias = -0.00018; scene.add(sun); scene.add(sun.target);

    const groundTiles: Array<[MaterialKey, number]> = [['grassland', 3], ['forest-floor', 3], ['sedimentary-rock', 6], ['lakeshore', 3], ['permeable-road', 2.4]];
    const terrainMeshes = new Map<MaterialKey, THREE.Mesh>();
    groundTiles.forEach(([key, tile]) => {
      const geo = terrainGeometry(key, tile), mesh = new THREE.Mesh(geo, fallback[key]);
      mesh.receiveShadow = true; scene.add(mesh); bindings.push({ mesh, key }); resources.push(geo);
      terrainMeshes.set(key, mesh);
    });

    const waterMat = new THREE.MeshPhysicalMaterial({ color: '#6ea9ae', roughness: 0.24, metalness: 0, transmission: 0.08, transparent: true, opacity: 0.9, clearcoat: 0.75, clearcoatRoughness: 0.2 });
    const water = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>(new THREE.CircleGeometry(1, 96), waterMat);
    water.rotation.x = -Math.PI / 2; water.scale.set(20.8, 13.8, 1);
    water.position.set(39, heightAt(39, -24) - 0.45, -24); scene.add(water); resources.push(water.geometry, waterMat);

    const windows = new THREE.MeshStandardMaterial({ color: '#9fd7d0', emissive: '#2c6862', emissiveIntensity: 0.32, roughness: 0.24, metalness: 0.08 });
    resources.push(windows);
    const plans = [[-104, 85, 12, 10, 10], [-94, 65, 10, 9, 14], [-45, -20, 13, 11, 12], [30, 40, 11, 10, 9], [85, 15, 9, 9, 12], [20, 70, 12, 10, 11], [55, 30, 10, 9, 8], [80, 0, 13, 10, 13]];
    plans.forEach((plan, i) => addBuilding(scene, bindings, resources, plan, i, fallback, windows));

    const edgeMat = new THREE.LineBasicMaterial({ color: '#d8d5bc', transparent: true, opacity: 0.55 });
    const roadEdgeLines: THREE.Line[] = [];
    const rebuildRoadEdges = (masks?: GeographyMasks) => {
      roadEdgeLines.forEach(line => { scene.remove(line); line.geometry.dispose(); }); roadEdgeLines.length = 0;
      for (const side of [-4.9, 4.9]) {
        let points: THREE.Vector3[] = [];
        const flush = () => {
          if (points.length > 1) { const geo = new THREE.BufferGeometry().setFromPoints(points); const line = new THREE.Line(geo, edgeMat); scene.add(line); resources.push(geo); roadEdgeLines.push(line); }
          points = [];
        };
        for (let i = 0; i <= 96; i++) {
          const z = -112 + i * (224 / 96), x = roadX(z) + side;
          if (masks && masks.sampleWater(x, z)[0] >= 128) { flush(); continue; }
          points.push(new THREE.Vector3(x, heightAt(x, z) + 0.09, z));
        }
        flush();
      }
    };
    resources.push(edgeMat); rebuildRoadEdges();

    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const rocks = new THREE.InstancedMesh(rockGeo, fallback['sedimentary-rock'], 58);
    const populateRocks = (masks?: GeographyMasks) => {
      const random = randomFrom(1606), dummy = new THREE.Object3D(); let count = 0;
      for (let i = 0; i < 900 && count < 58; i++) {
        const x = -116 + random() * 108, z = -112 + random() * 224;
        const biome = masks?.sampleBiome(x, z), waterData = masks?.sampleWater(x, z);
        if (waterData && waterData[0] >= 128) continue;
        if (masks && (biome?.[3] ?? 0) < 70 && heightAt(x, z) < 4.2) continue;
        if (!masks && heightAt(x, z) < 3.5) continue;
        if (Math.abs(x - roadX(z)) < 10) continue;
        const size = 0.45 + random() * 1.6;
        dummy.position.set(x, heightAt(x, z) + size * 0.42, z); dummy.scale.set(size * 1.2, size * 0.68, size);
        dummy.rotation.set(random() * 0.4, random() * Math.PI, random() * 0.3); dummy.updateMatrix(); rocks.setMatrixAt(count++, dummy.matrix);
      }
      rocks.count = count; rocks.instanceMatrix.needsUpdate = true;
    };
    populateRocks(); rocks.castShadow = rocks.receiveShadow = true; scene.add(rocks); resources.push(rockGeo, rocks);

    let alive = true;
    const loadMaterialAtlas = (masks?: GeographyMasks) => {
      new THREE.TextureLoader().load(ASSET, (atlas) => {
        if (!alive) { atlas.dispose(); return; }
        const textures: THREE.Texture[] = [atlas];
        try {
          const materials = makeMaterials(atlas.image as CanvasImageSource, Math.min(renderer.capabilities.getMaxAnisotropy(), 8), textures);
          if (masks) Object.values(materials).forEach(material => applyTileBreakup(material, masks.breakupTexture));
          resources.push(...textures, ...Object.values(materials));
          bindings.forEach(({ mesh, key }) => { mesh.material = materials[key]; });
          rocks.material = materials['sedimentary-rock'];
        } catch { if (alive) setAssetError(true); }
      }, undefined, () => { if (alive) setAssetError(true); });
    };
    void loadGeographyMasks().then((masks) => {
      if (!alive) { masks.breakupTexture.dispose(); return; }
      resources.push(masks.breakupTexture);
      groundTiles.forEach(([key, tile]) => {
        const mesh = terrainMeshes.get(key); if (!mesh) return;
        const nextGeometry = terrainGeometry(key, tile, masks), previousGeometry = mesh.geometry;
        mesh.geometry = nextGeometry; previousGeometry.dispose(); resources.push(nextGeometry);
      });
      const nextWaterGeometry = createWaterGeometry(masks);
      water.geometry.dispose(); water.geometry = nextWaterGeometry;
      water.material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, metalness: 0, transmission: 0.08, transparent: true, opacity: 0.88, clearcoat: 0.8, clearcoatRoughness: 0.18 });
      water.rotation.set(0, 0, 0); water.position.set(0, 0, 0); water.scale.set(1, 1, 1);
      resources.push(nextWaterGeometry, water.material as THREE.Material);
      rebuildRoadEdges(masks); populateRocks(masks); addTrees(scene, resources, masks); loadMaterialAtlas(masks);
    }).catch(() => {
      if (!alive) return;
      setAssetError(true); addTrees(scene, resources); loadMaterialAtlas();
    });

    let cameraMove: { start: number; from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3 } | null = null;
    moveRef.current = (id) => {
      const data = LOCATIONS.find(x => x.id === id) ?? LOCATIONS[1], target = new THREE.Vector3(...data.target);
      cameraMove = { start: performance.now(), from: camera.position.clone(), to: target.clone().add(new THREE.Vector3(7, 14, 27)), fromTarget: controls.target.clone(), toTarget: target };
      controls.enabled = false;
    };
    const clock = new THREE.Clock(); let frame = 0;
    const render = () => {
      clock.getDelta();
      if (cameraMove) {
        const t = Math.min(1, (performance.now() - cameraMove.start) / 1250), e = t * t * (3 - 2 * t);
        camera.position.lerpVectors(cameraMove.from, cameraMove.to, e); controls.target.lerpVectors(cameraMove.fromTarget, cameraMove.toTarget, e);
        if (t >= 1) { cameraMove = null; controls.enabled = true; controls.update(); }
      } else controls.update();
      renderer.render(scene, camera); frame = window.requestAnimationFrame(render);
    };
    render();
    const resize = () => { const w = Math.max(1, mount.clientWidth), h = Math.max(1, mount.clientHeight); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); };
    const observer = new ResizeObserver(resize); observer.observe(mount);
    return () => {
      alive = false; window.cancelAnimationFrame(frame); observer.disconnect(); moveRef.current = () => {};
      controls.dispose(); resources.forEach(x => x.dispose()); renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [atmosphereColor]);

  const land = () => { setActive(choice); setLanded(true); moveRef.current(choice); };
  const location = LOCATIONS.find(x => x.id === active) ?? LOCATIONS[1];
  return (
    <div className="absolute inset-0 z-20 overflow-hidden bg-[#b9d1d1] text-white">
      <div ref={mountRef} className="absolute inset-0" aria-label="ヴェルディアのPBR地表・森林・道路・湖・建築の3D景観" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/30 via-transparent to-slate-950/25" />
      <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="rounded-xl border border-white/20 bg-slate-950/65 px-3 py-2 shadow-xl backdrop-blur-md">
          <p className="text-[9px] font-black tracking-[.2em] text-emerald-200">VERDIA · SURFACE EXPLORATION</p><p className="mt-0.5 text-xs font-bold">地上探査 · PBR MATERIALS</p>
        </div>
        <button type="button" onClick={onBack} className="pointer-events-auto rounded-xl border border-white/20 bg-slate-950/70 px-3 py-2 text-[10px] font-bold shadow-lg backdrop-blur-md">惑星視点へ戻る</button>
      </div>
      {!landed ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/24 p-3 pt-16 backdrop-blur-[2px]">
          <div className="w-full max-w-[520px] rounded-2xl border border-white/20 bg-slate-950/82 p-4 shadow-2xl backdrop-blur-xl sm:p-5">
            <p className="text-[9px] font-black tracking-[.22em] text-emerald-200">CHOOSE LANDING ZONE</p>
            <h3 className="mt-1 text-lg font-black">ヴェルディアの地表へ降り立つ</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-300">草原・森林床・堆積岩・湖岸・透水性道路と、木質複合材／バイオフィルム屋根を使った地上景観を探索できます。</p>
            <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {LOCATIONS.map(item => <button key={item.id} type="button" onClick={() => setChoice(item.id)} className={'rounded-xl border p-2.5 text-left ' + (choice === item.id ? 'border-emerald-300 bg-emerald-300/15' : 'border-white/10 bg-white/5')}>
                <span className="block text-xs font-bold">{item.name}</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-300">{item.detail}</span>
              </button>)}
            </div>
            {assetError && <p className="mt-2 text-[10px] text-amber-200">素材の読込に失敗しました。基本景観で表示しています。</p>}
            <button type="button" onClick={land} className="mt-3 w-full rounded-xl bg-emerald-300 px-3 py-2.5 text-xs font-black text-emerald-950">選択した地点に降り立つ</button>
          </div>
        </div>
      ) : (
        <>
          <div className="absolute left-3 top-[76px] z-30 max-w-[260px] rounded-xl border border-white/15 bg-slate-950/65 px-3 py-2 shadow-lg backdrop-blur-md">
            <p className="text-[9px] font-black tracking-[.16em] text-emerald-200">CURRENT LANDING ZONE</p><p className="mt-0.5 text-sm font-black">{location.name}</p><p className="mt-0.5 text-[10px] text-slate-300">{location.detail}</p>
          </div>
          <div className="absolute bottom-3 left-3 right-3 z-30 flex items-end justify-between gap-2 sm:bottom-4 sm:left-4 sm:right-4">
            <div className="max-w-[300px] rounded-xl border border-white/15 bg-slate-950/65 px-3 py-2 backdrop-blur-md">
              <p className="text-[9px] font-black tracking-[.16em] text-emerald-200">GROUND MATERIALS · 07</p><p className="mt-0.5 text-[10px] leading-4 text-slate-200">ドラッグで周囲を見渡し、ホイール／ピンチで地形に近づけます。</p>
            </div>
            <button type="button" onClick={() => setLanded(false)} className="rounded-xl border border-white/20 bg-slate-950/75 px-3 py-2 text-[10px] font-bold shadow-lg backdrop-blur-md">地点を変更</button>
          </div>
        </>
      )}
    </div>
  );
}
