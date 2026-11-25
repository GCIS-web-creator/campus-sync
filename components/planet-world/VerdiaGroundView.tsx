'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Props = { atmosphereColor: string; stage: number; onBack: () => void };
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
  const local = Math.sin(x * 0.026) * 4.8
    + Math.cos(z * 0.021) * 4.2
    + Math.sin((x + z) * 0.014) * 3.4
    + Math.sin((x - z) * 0.041) * 1.6;
  const foothills = 25 * Math.exp(-(((x + 62) / 84) ** 2 + ((z + 30) / 118) ** 2))
    + 18 * Math.exp(-(((x - 66) / 105) ** 2 + ((z - 54) / 92) ** 2));
  const distance = Math.max(Math.abs(x), Math.abs(z));
  const farBlend = Math.max(0, Math.min(1, (distance - 150) / 700));
  const rolling = (Math.sin(x * 0.0028) * 24 + Math.cos(z * 0.0032) * 28
    + Math.sin((x + z) * 0.0017) * 18) * farBlend;
  const westernRidge = 250 * Math.exp(-Math.pow((z - (-1850 + Math.sin(x * 0.0011) * 320)) / 390, 2));
  const northernRidge = 320 * Math.exp(-Math.pow((z - (3350 + Math.cos(x * 0.0009) * 420)) / 510, 2));
  return local + foothills + rolling + (westernRidge + northernRidge) * farBlend;
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
  const size = 240, half = size / 2, divisions = 144, step = size / divisions;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let iz = 0; iz <= divisions; iz++) {
    for (let ix = 0; ix <= divisions; ix++) {
      const x = -half + ix * step, z = -half + iz * step;
      positions.push(x, heightAt(x, z), z);
      uvs.push(x / tile, z / tile);
    }
  }
  const vertexIndex = (ix: number, iz: number) => iz * (divisions + 1) + ix;
  for (let iz = 0; iz < divisions; iz++) {
    for (let ix = 0; ix < divisions; ix++) {
      const x0 = -half + ix * step, x1 = x0 + step;
      const z0 = -half + iz * step, z1 = z0 + step;
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
      const lake = lakeDistance(x, z);
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
      const a = vertexIndex(ix, iz), b = vertexIndex(ix, iz + 1);
      const c = vertexIndex(ix + 1, iz), d = vertexIndex(ix + 1, iz + 1);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  withUv2(geo);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
function makeGabledRoof(width: number, depth: number, ridgeHeight: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const addTriangle = (a: number[], b: number[], c: number[]) => {
    for (const point of [a, b, c]) {
      positions.push(...point);
      uvs.push(point[0] / width + 0.5, point[2] / depth + 0.5);
    }
  };
  const leftFront = [-width / 2, 0, -depth / 2], leftBack = [-width / 2, 0, depth / 2];
  const rightFront = [width / 2, 0, -depth / 2], rightBack = [width / 2, 0, depth / 2];
  const ridgeFront = [0, ridgeHeight, -depth / 2], ridgeBack = [0, ridgeHeight, depth / 2];
  addTriangle(leftFront, ridgeFront, leftBack); addTriangle(leftBack, ridgeFront, ridgeBack);
  addTriangle(ridgeFront, rightFront, ridgeBack); addTriangle(rightFront, rightBack, ridgeBack);
  addTriangle(leftFront, rightFront, ridgeFront); addTriangle(leftBack, ridgeBack, rightBack);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  withUv2(geometry);
  geometry.computeVertexNormals();
  return geometry;
}

function addBuilding(scene: THREE.Scene, bindings: Binding[], resources: Array<{ dispose: () => void }>, plan: number[], index: number, fallback: Record<MaterialKey, THREE.Material>, windows: THREE.Material, stage: number) {
  const [x, z, w, d, h] = plan;
  const group = new THREE.Group();
  group.position.set(x, heightAt(x, z), z);
  group.rotation.y = (index % 5 - 2) * 0.11;
  scene.add(group);

  const stone = index % 5 === 2 || index % 7 === 0;
  const wallKey: MaterialKey = stone ? 'sedimentary-rock' : 'biocomposite-wood';
  const wallGeo = scaledUvs(new THREE.BoxGeometry(w, h, d), Math.max(2, w / 2), Math.max(2, h / 2));
  const wall = new THREE.Mesh(wallGeo, fallback[wallKey]);
  wall.position.y = h / 2;
  wall.castShadow = wall.receiveShadow = true;
  group.add(wall);
  bindings.push({ mesh: wall, key: wallKey });
  resources.push(wallGeo);

  // Offset annexes, porches and upper volumes keep the silhouette from becoming a row of boxes.
  if (index % 3 !== 1) {
    const wingGeo = new THREE.BoxGeometry(w * 0.48, h * (index % 4 === 0 ? 0.56 : 0.72), d * 0.54);
    const wing = new THREE.Mesh(wingGeo, fallback[wallKey]);
    wing.position.set((index % 2 ? -1 : 1) * w * 0.37, h * (index % 4 === 0 ? 0.28 : 0.36), -d * 0.24);
    wing.castShadow = wing.receiveShadow = true;
    group.add(wing);
    bindings.push({ mesh: wing, key: wallKey });
    resources.push(wingGeo);
  }

  const roofHeight = Math.max(2.2, Math.min(6.5, w * 0.38));
  const roofGeo = makeGabledRoof(w * 1.18, d * 1.16, roofHeight);
  const roof = new THREE.Mesh(roofGeo, fallback['biofilm-roof']);
  roof.position.y = h + 0.2;
  roof.castShadow = roof.receiveShadow = true;
  group.add(roof);
  bindings.push({ mesh: roof, key: 'biofilm-roof' });
  resources.push(roofGeo);

  const trim = new THREE.MeshStandardMaterial({ color: stone ? '#665c4c' : '#493c2e', roughness: 0.88 });
  resources.push(trim);
  const beamGeo = new THREE.BoxGeometry(0.28, h + 0.35, 0.32);
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(beamGeo, trim);
    beam.position.set(side * (w * 0.46), (h + 0.35) / 2, d * 0.48);
    group.add(beam);
  }
  resources.push(beamGeo);

  const floors = Math.max(1, Math.floor(h / 3.1));
  for (let floor = 0; floor < floors; floor++) {
    for (let col = 0; col < 3; col++) {
      const geo = new THREE.BoxGeometry(w * 0.16, 1.05, 0.11);
      const pane = new THREE.Mesh(geo, windows);
      pane.position.set((col - 1) * w * 0.27, 1.6 + floor * (h - 2.1) / floors, d / 2 + 0.065);
      group.add(pane);
      resources.push(geo);
    }
  }

  const doorGeo = new THREE.BoxGeometry(w * 0.18, h * 0.3, 0.13);
  const door = new THREE.Mesh(doorGeo, trim);
  door.position.set(0, h * 0.15, d / 2 + 0.08);
  group.add(door);
  resources.push(doorGeo);

  // Chimneys, dormers, balconies and buttresses create distinct rooflines and façades.
  if (index % 2 === 0) {
    const chimneyGeo = new THREE.BoxGeometry(0.8, 2.8 + (index % 3), 0.9);
    const chimney = new THREE.Mesh(chimneyGeo, fallback['sedimentary-rock']);
    chimney.position.set(w * 0.28, h + roofHeight * 0.64, -d * 0.2);
    group.add(chimney);
    bindings.push({ mesh: chimney, key: 'sedimentary-rock' });
    resources.push(chimneyGeo);
  }
  if (index % 3 === 0) {
    const balconyGeo = new THREE.BoxGeometry(w * 0.72, 0.2, 1.5);
    const balcony = new THREE.Mesh(balconyGeo, trim);
    balcony.position.set(0, h * 0.58, d / 2 + 0.75);
    group.add(balcony);
    resources.push(balconyGeo);
    for (let post = 0; post < 4; post++) {
      const postGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.25, 6);
      const rail = new THREE.Mesh(postGeo, trim);
      rail.position.set((post - 1.5) * w * 0.22, h * 0.58 + 0.62, d / 2 + 1.35);
      group.add(rail);
      resources.push(postGeo);
    }
  }

  // More advanced eras add glazed conservatories and asymmetric rooftop gardens.
  if (stage >= 2 && index % 3 === 1) {
    const glassGeo = new THREE.BoxGeometry(w * 0.46, h * 0.48, d * 0.46);
    const glassMat = new THREE.MeshPhysicalMaterial({ color: '#9ddfe3', roughness: 0.18, metalness: 0.08, transmission: 0.14, transparent: true, opacity: 0.76, clearcoat: 0.9 });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(w * 0.33, h * 0.76, -d * 0.25);
    group.add(glass);
    resources.push(glassGeo, glassMat);
  }

  // The central mill district gains an original waterwheel and a timber footbridge.
  if (index % 7 === 3) {
    const wheel = new THREE.Group();
    wheel.position.set(w * 0.62, h * 0.48, 0);
    wheel.rotation.y = Math.PI / 2;
    const rimGeo = new THREE.TorusGeometry(2.1, 0.16, 8, 28);
    const rim = new THREE.Mesh(rimGeo, trim);
    wheel.add(rim);
    resources.push(rimGeo);
    for (let spoke = 0; spoke < 10; spoke++) {
      const angle = spoke / 10 * Math.PI * 2;
      const spokeGeo = new THREE.BoxGeometry(0.12, 4, 0.16);
      const spokeMesh = new THREE.Mesh(spokeGeo, trim);
      spokeMesh.rotation.z = angle;
      wheel.add(spokeMesh);
      resources.push(spokeGeo);
      const paddleGeo = new THREE.BoxGeometry(0.42, 0.9, 0.18);
      const paddle = new THREE.Mesh(paddleGeo, fallback['biocomposite-wood']);
      paddle.position.set(Math.cos(angle) * 2.1, Math.sin(angle) * 2.1, 0);
      wheel.add(paddle);
      resources.push(paddleGeo);
    }
    group.add(wheel);
  }
}

function createFarTerrainGeometry(key: 'grassland' | 'sedimentary-rock') {
  const size = 8_200, half = size / 2, divisions = 220, step = size / divisions;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let iz = 0; iz <= divisions; iz++) {
    for (let ix = 0; ix <= divisions; ix++) {
      const x = -half + ix * step, z = -half + iz * step;
      positions.push(x, heightAt(x, z), z);
      uvs.push(x / 110, z / 110);
    }
  }
  const vertexIndex = (ix: number, iz: number) => iz * (divisions + 1) + ix;
  for (let iz = 0; iz < divisions; iz++) {
    for (let ix = 0; ix < divisions; ix++) {
      const x0 = -half + ix * step, x1 = x0 + step;
      const z0 = -half + iz * step, z1 = z0 + step;
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
      if (Math.abs(x) < 124 && Math.abs(z) < 124) continue;
      const elevation = heightAt(x, z);
      const rock = elevation > 105 || (elevation > 48 && Math.sin(x * 0.006 + z * 0.004) > 0.12);
      if ((key === 'sedimentary-rock') !== rock) continue;
      const a = vertexIndex(ix, iz), b = vertexIndex(ix, iz + 1);
      const c = vertexIndex(ix + 1, iz), d = vertexIndex(ix + 1, iz + 1);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  withUv2(geometry);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
function addMountainRange(scene: THREE.Scene, resources: Array<{ dispose: () => void }>, depth: number, peakHeight: number, color: string, seed: number) {
  const segments = 180, width = 12_000;
  const positions: number[] = [], indices: number[] = [];
  const random = randomFrom(seed);
  const jitter = Array.from({ length: segments + 1 }, () => random());
  for (let i = 0; i <= segments; i++) {
    const x = -width / 2 + width * i / segments;
    const ridge = 0.56 + 0.17 * Math.sin(x * 0.0011 + seed)
      + 0.13 * Math.sin(x * 0.0037 + seed * 0.7)
      + 0.1 * Math.sin(x * 0.008 + seed * 1.3)
      + (jitter[i] - 0.5) * 0.08;
    const top = peakHeight * ridge;
    positions.push(x, -170, depth, x, top, depth);
    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  resources.push(geometry, material);
}

function createSkyDome(sunDirection: THREE.Vector3, atmosphereColor: string) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: sunDirection.clone() },
      uAtmosphereTint: { value: new THREE.Color(atmosphereColor) },
    },
    vertexShader: 'varying vec3 vSkyDirection; void main(){ vSkyDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 uSunDirection;',
      'uniform vec3 uAtmosphereTint;',
      'varying vec3 vSkyDirection;',
      'void main(){',
      '  vec3 direction = normalize(vSkyDirection);',
      '  float height = smoothstep(-0.18, 0.92, direction.y);',
      '  vec3 horizon = vec3(0.72, 0.84, 0.86);',
      '  vec3 zenith = vec3(0.19, 0.48, 0.73);',
      '  vec3 sky = mix(horizon, zenith, pow(height, 0.82));',
      '  sky = mix(sky, uAtmosphereTint, 0.10);',
      '  float sunDot = max(dot(direction, normalize(uSunDirection)), 0.0);',
      '  sky += vec3(1.0, 0.77, 0.48) * pow(sunDot, 26.0) * 0.42;',
      '  sky += vec3(1.0, 0.91, 0.76) * pow(sunDot, 420.0) * 1.6;',
      '  gl_FragColor = vec4(sky, 1.0);',
      '}',
    ].join('\n'),
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(9_600, 48, 32), material);
}

function createCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const random = randomFrom(9931);
  for (let cluster = 0; cluster < 210; cluster++) {
    const x = random() * canvas.width, y = random() * canvas.height * 0.76;
    const width = 38 + random() * 150, height = 9 + random() * 36;
    context.save();
    context.translate(x, y);
    context.rotate((random() - 0.5) * 0.45);
    context.shadowColor = 'rgba(255,255,255,0.8)';
    context.shadowBlur = 22 + random() * 28;
    context.fillStyle = 'rgba(255,255,255,' + (0.08 + random() * 0.16).toFixed(3) + ')';
    context.beginPath();
    context.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
    context.fill();
    for (let puff = 0; puff < 4; puff++) {
      context.beginPath();
      context.ellipse((random() - 0.5) * width, (random() - 0.5) * height, width * (0.16 + random() * 0.13), height * (0.42 + random() * 0.38), 0, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function createSolarGlow(color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const gradient = context.createRadialGradient(128, 128, 4, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.12, color + 'dd');
  gradient.addColorStop(0.36, color + '65');
  gradient.addColorStop(0.7, color + '20');
  gradient.addColorStop(1, color + '00');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addModernSkyline(scene: THREE.Scene, resources: Array<{ dispose: () => void }>, stage: number) {
  if (stage < 2) return;
  const random = randomFrom(6_206 + stage * 19);
  const count = 4 + stage * 4;
  const glass = new THREE.MeshPhysicalMaterial({ color: '#77b9c6', metalness: 0.2, roughness: 0.22, transmission: 0.08, transparent: true, opacity: 0.86, clearcoat: 1 });
  const metal = new THREE.MeshStandardMaterial({ color: '#7b969a', metalness: 0.72, roughness: 0.3 });
  const light = new THREE.MeshStandardMaterial({ color: '#d7f4ee', emissive: '#8ce8df', emissiveIntensity: 0.55, roughness: 0.24 });
  resources.push(glass, metal, light);
  const towers: THREE.Group[] = [];
  for (let index = 0; index < count; index++) {
    const x = -560 + index * (1120 / Math.max(1, count - 1)) + (random() - 0.5) * 90;
    const z = -480 - random() * (stage >= 4 ? 1_300 : 850);
    const width = 22 + random() * (stage >= 4 ? 38 : 24);
    const height = (stage >= 4 ? 210 : 100) + random() * (stage >= 5 ? 420 : stage >= 4 ? 220 : stage >= 3 ? 150 : 65);
    const tower = new THREE.Group();
    tower.position.set(x, heightAt(x, z), z);
    tower.rotation.y = (random() - 0.5) * 0.28;
    const coreGeo = index % 3 === 0
      ? new THREE.CylinderGeometry(width * 0.22, width * 0.58, height, 10, 4)
      : new THREE.BoxGeometry(width, height, width * (0.62 + random() * 0.32), 2, 6, 2);
    const core = new THREE.Mesh(coreGeo, glass);
    core.position.y = height / 2;
    core.castShadow = core.receiveShadow = true;
    tower.add(core);
    resources.push(coreGeo);
    const crownGeo = index % 2 === 0
      ? new THREE.ConeGeometry(width * 0.48, height * 0.1, 8)
      : new THREE.CylinderGeometry(width * 0.2, width * 0.54, height * 0.12, 8);
    const crown = new THREE.Mesh(crownGeo, metal);
    crown.position.y = height * 0.98;
    tower.add(crown);
    resources.push(crownGeo);
    for (let rib = 0; rib < 4; rib++) {
      const ribGeo = new THREE.BoxGeometry(0.8, height * 0.94, 1.0);
      const fin = new THREE.Mesh(ribGeo, metal);
      const angle = rib * Math.PI / 2;
      fin.position.set(Math.cos(angle) * width * 0.48, height * 0.49, Math.sin(angle) * width * 0.48);
      tower.add(fin);
      resources.push(ribGeo);
    }
    for (let terrace = 1; terrace < 5; terrace++) {
      const ringGeo = new THREE.TorusGeometry(width * (0.42 + terrace * 0.015), 0.55, 5, 36);
      const ring = new THREE.Mesh(ringGeo, terrace % 2 ? light : metal);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = height * terrace / 5;
      tower.add(ring);
      resources.push(ringGeo);
    }
    scene.add(tower);
    towers.push(tower);
  }
  if (stage >= 3) {
    for (let index = 0; index < Math.min(5, towers.length - 1); index++) {
      const a = towers[index].position.clone().add(new THREE.Vector3(0, 85 + index * 20, 0));
      const b = towers[index + 1].position.clone().add(new THREE.Vector3(0, 110 + index * 18, 0));
      const curve = new THREE.CatmullRomCurve3([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 35, 0)), b]);
      const bridgeGeo = new THREE.TubeGeometry(curve, 18, stage >= 4 ? 2.2 : 1.4, 8, false);
      const bridge = new THREE.Mesh(bridgeGeo, metal);
      scene.add(bridge);
      resources.push(bridgeGeo);
    }
  }
  if (stage >= 4) {
    const transit = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1_600, 82, -1_000),
      new THREE.Vector3(-500, 112, -1_420),
      new THREE.Vector3(700, 100, -1_180),
      new THREE.Vector3(1_700, 130, -1_700),
    ]);
    const transitGeo = new THREE.TubeGeometry(transit, 90, 4, 10, false);
    const transitLine = new THREE.Mesh(transitGeo, light);
    scene.add(transitLine);
    resources.push(transitGeo);
  }
}
function addTrees(scene: THREE.Scene, resources: Array<{ dispose: () => void }>, masks?: GeographyMasks, stage = 1) {
  const random = randomFrom(617 + stage * 71);
  const count = Math.min(210, 112 + stage * 16);
  const dummy = new THREE.Object3D();
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.48, 5.8, 9);
  const branchGeo = new THREE.CylinderGeometry(0.08, 0.18, 2.8, 6);
  const leafGeo = new THREE.IcosahedronGeometry(1, 2);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#6f523b', roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: stage >= 3 ? '#528c75' : '#5d8c58', roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const branches = new THREE.InstancedMesh(branchGeo, trunkMat, count * 2);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count * 4);
  let n = 0;
  for (let tries = 0; tries < count * 18 && n < count; tries++) {
    const x = (random() - 0.5) * 224, z = (random() - 0.5) * 224;
    const biome = masks?.sampleBiome(x, z);
    const water = masks?.sampleWater(x, z);
    const inForest = biome ? biome[1] > 58 && biome[1] >= biome[0] && biome[1] >= biome[2] : forestAt(x, z);
    if (!inForest || (water ? water[0] >= 128 : lakeDistance(x, z) < 1.2) || Math.abs(x - roadX(z)) < 8) continue;
    const scale = 0.72 + random() * 1.05, y = heightAt(x, z);
    dummy.position.set(x, y + 2.8 * scale, z);
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.y = random() * Math.PI * 2;
    dummy.updateMatrix();
    trunks.setMatrixAt(n, dummy.matrix);
    for (let branch = 0; branch < 2; branch++) {
      const branchDummy = new THREE.Object3D();
      branchDummy.position.set(x + (branch ? 1 : -1) * scale * 0.8, y + (3.6 + branch * 0.9) * scale, z + (random() - 0.5) * scale);
      branchDummy.rotation.z = (branch ? -1 : 1) * 0.58;
      branchDummy.rotation.x = (random() - 0.5) * 0.4;
      branchDummy.scale.setScalar(scale);
      branchDummy.updateMatrix();
      branches.setMatrixAt(n * 2 + branch, branchDummy.matrix);
    }
    for (let cluster = 0; cluster < 4; cluster++) {
      const foliage = new THREE.Object3D();
      foliage.position.set(
        x + (random() - 0.5) * 2.8 * scale,
        y + (4.8 + random() * 2.0) * scale,
        z + (random() - 0.5) * 2.8 * scale,
      );
      foliage.scale.set(1.5 * scale * (0.82 + random() * 0.45), 1.8 * scale * (0.82 + random() * 0.36), 1.35 * scale * (0.82 + random() * 0.4));
      foliage.rotation.set(random() * 0.3, random() * Math.PI, random() * 0.3);
      foliage.updateMatrix();
      leaves.setMatrixAt(n * 4 + cluster, foliage.matrix);
    }
    n++;
  }
  trunks.count = n;
  branches.count = n * 2;
  leaves.count = n * 4;
  trunks.castShadow = branches.castShadow = leaves.castShadow = true;
  trunks.receiveShadow = branches.receiveShadow = leaves.receiveShadow = true;
  scene.add(trunks, branches, leaves);
  resources.push(trunkGeo, branchGeo, leafGeo, trunkMat, leafMat, trunks, branches, leaves);
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

export default function VerdiaGroundView({ atmosphereColor, stage, onBack }: Props) {
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
    scene.fog = new THREE.FogExp2(new THREE.Color('#bcd8dc'), 0.00019);
    const camera = new THREE.PerspectiveCamera(59, mount.clientWidth / Math.max(1, mount.clientHeight), 0.1, 15_000);
    camera.position.set(10, 30, 88);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 15, -210); controls.enableDamping = true; controls.dampingFactor = 0.055;
    controls.enablePan = true; controls.minDistance = 8; controls.maxDistance = 1_450;
    controls.minPolarAngle = 0.13; controls.maxPolarAngle = Math.PI * 0.485; controls.update();

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

    const sunDirection = new THREE.Vector3(-0.29, 0.36, -0.89).normalize();
    const skyDome = createSkyDome(sunDirection, atmosphereColor);
    scene.add(skyDome);
    resources.push(skyDome.geometry, skyDome.material);

    const cloudTexture = createCloudTexture();
    const cloudLayer = new THREE.Mesh(
      new THREE.SphereGeometry(8_900, 72, 48),
      new THREE.MeshBasicMaterial({ map: cloudTexture, color: '#ffffff', transparent: true, opacity: 0.28, side: THREE.BackSide, depthWrite: false }),
    );
    cloudLayer.position.y = 250;
    scene.add(cloudLayer);
    resources.push(cloudLayer.geometry, cloudLayer.material, cloudTexture);

    scene.add(new THREE.HemisphereLight('#eaf8ff', '#52634d', 1.8));
    const sunPosition = sunDirection.clone().multiplyScalar(7_000);
    const sun = new THREE.DirectionalLight('#fff1d7', 3.35);
    sun.position.copy(sunPosition);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -620;
    sun.shadow.camera.right = sun.shadow.camera.top = 620;
    sun.shadow.bias = -0.00018;
    scene.add(sun, sun.target);

    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(52, 36, 28),
      new THREE.MeshBasicMaterial({ color: '#fff3d4', toneMapped: false }),
    );
    sunCore.position.copy(sunPosition);
    scene.add(sunCore);
    resources.push(sunCore.geometry, sunCore.material);
    const solarGlowTexture = createSolarGlow('#ffbd70');
    const solarGlowMaterial = new THREE.SpriteMaterial({ map: solarGlowTexture, color: '#fff2d8', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const solarGlow = new THREE.Sprite(solarGlowMaterial);
    solarGlow.position.copy(sunPosition);
    solarGlow.scale.setScalar(780);
    scene.add(solarGlow);
    resources.push(solarGlowTexture, solarGlowMaterial);
    const solarHaloTexture = createSolarGlow('#f1b77c');
    const solarHaloMaterial = new THREE.SpriteMaterial({ map: solarHaloTexture, color: '#f4c28f', transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const solarHalo = new THREE.Sprite(solarHaloMaterial);
    solarHalo.position.copy(sunPosition);
    solarHalo.scale.setScalar(1_480);
    scene.add(solarHalo);
    resources.push(solarHaloTexture, solarHaloMaterial);

    const groundTiles: Array<[MaterialKey, number]> = [['grassland', 3], ['forest-floor', 3], ['sedimentary-rock', 6], ['lakeshore', 3], ['permeable-road', 2.4]];
    const terrainMeshes = new Map<MaterialKey, THREE.Mesh>();
    (['grassland', 'sedimentary-rock'] as const).forEach((key) => {
      const geometry = createFarTerrainGeometry(key);
      const mesh = new THREE.Mesh(geometry, fallback[key]);
      mesh.receiveShadow = true;
      scene.add(mesh);
      bindings.push({ mesh, key });
      resources.push(geometry);
    });
    groundTiles.forEach(([key, tile]) => {
      const geo = terrainGeometry(key, tile), mesh = new THREE.Mesh(geo, fallback[key]);
      mesh.receiveShadow = true; scene.add(mesh); bindings.push({ mesh, key }); resources.push(geo);
      terrainMeshes.set(key, mesh);
    });
    addMountainRange(scene, resources, -2_350, 510, '#748b82', 17);
    addMountainRange(scene, resources, -3_720, 690, '#8c9fa0', 29);
    addMountainRange(scene, resources, -4_650, 790, '#a8b7b6', 43);
    addModernSkyline(scene, resources, stage);

    let waterMat = new THREE.MeshPhysicalMaterial({ color: '#6ea9ae', roughness: 0.2, metalness: 0, transmission: 0.1, transparent: true, opacity: 0.92, clearcoat: 0.9, clearcoatRoughness: 0.14 });
    const water = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>(new THREE.CircleGeometry(1, 96), waterMat);
    water.rotation.x = -Math.PI / 2; water.scale.set(20.8, 13.8, 1);
    water.position.set(39, heightAt(39, -24) - 0.45, -24); scene.add(water);
    const creekCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(39, heightAt(39, -24) - 0.28, -24),
      new THREE.Vector3(34, heightAt(34, -8) - 0.3, -8),
      new THREE.Vector3(24, heightAt(24, 9) - 0.3, 9),
      new THREE.Vector3(24, heightAt(24, 26) - 0.3, 26),
      new THREE.Vector3(30, heightAt(30, 40) - 0.3, 40),
    ]);
    const creekGeometry = new THREE.TubeGeometry(creekCurve, 72, 0.95, 10, false);
    let creekMat = new THREE.MeshPhysicalMaterial({ color: '#68b9cf', roughness: 0.16, metalness: 0, clearcoat: 0.95, clearcoatRoughness: 0.1 });
    const creek = new THREE.Mesh(creekGeometry, creekMat);
    scene.add(creek);
    resources.push(water.geometry, waterMat, creekGeometry, creekMat);

    const windows = new THREE.MeshStandardMaterial({ color: '#a8ddd6', emissive: '#3c8079', emissiveIntensity: stage >= 3 ? 0.55 : 0.32, roughness: 0.2, metalness: 0.1 });
    resources.push(windows);
    const plans = [
      [-104, 85, 12, 10, 10], [-94, 65, 10, 9, 14], [-45, -20, 13, 11, 12],
      [30, 40, 11, 10, 9], [85, 15, 9, 9, 12], [20, 70, 12, 10, 11],
      [55, 30, 10, 9, 8], [80, 0, 13, 10, 13], [-84, -78, 12, 10, 8],
      [-58, 95, 15, 11, 11], [-20, 86, 10, 12, 9], [8, 96, 14, 10, 13],
      [72, 84, 13, 11, 10], [105, 70, 10, 9, 8], [104, -46, 12, 10, 12],
      [5, -88, 14, 11, 15], [-108, -18, 10, 10, 9], [-91, -96, 13, 10, 11],
      [-18, -82, 11, 9, 8], [94, -92, 14, 11, 12], [-65, 28, 9, 9, 8],
      [62, -76, 12, 9, 10], [105, 105, 11, 10, 9], [-25, 38, 10, 9, 8],
      [43, 70, 12, 10, 10], [-73, -42, 12, 10, 12],
    ];
    const settlementCount = stage >= 5 ? plans.length : stage >= 3 ? 22 : stage >= 2 ? 19 : stage >= 1 ? 16 : 9;
    plans.slice(0, settlementCount).forEach((plan, i) => addBuilding(scene, bindings, resources, plan, i, fallback, windows, stage));

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
      waterMat.dispose();
      waterMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.2, metalness: 0, transmission: 0.1, transparent: true, opacity: 0.9, clearcoat: 0.9, clearcoatRoughness: 0.14 });
      water.material = waterMat;
      creekMat.dispose();
      creekMat = new THREE.MeshPhysicalMaterial({ color: '#68b9cf', roughness: 0.16, metalness: 0, clearcoat: 0.95, clearcoatRoughness: 0.1 });
      creek.material = creekMat;
      water.rotation.set(0, 0, 0); water.position.set(0, 0, 0); water.scale.set(1, 1, 1);
      resources.push(nextWaterGeometry, waterMat, creekMat);
      rebuildRoadEdges(masks); populateRocks(masks); addTrees(scene, resources, masks, stage); loadMaterialAtlas(masks);
    }).catch(() => {
      if (!alive) return;
      setAssetError(true); addTrees(scene, resources, undefined, stage); loadMaterialAtlas();
    });

    let cameraMove: { start: number; from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3 } | null = null;
    moveRef.current = (id) => {
      const data = LOCATIONS.find(x => x.id === id) ?? LOCATIONS[1], target = new THREE.Vector3(...data.target);
      cameraMove = { start: performance.now(), from: camera.position.clone(), to: target.clone().add(new THREE.Vector3(14, 28, 62)), fromTarget: controls.target.clone(), toTarget: target };
      controls.enabled = false;
    };
    const clock = new THREE.Clock(); let frame = 0;
    const render = () => {
      const delta = Math.min(clock.getDelta(), 0.05);
      cloudLayer.rotation.y += delta * 0.00022;
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
  }, [atmosphereColor, stage]);

  const land = () => { setActive(choice); setLanded(true); moveRef.current(choice); };
  const location = LOCATIONS.find(x => x.id === active) ?? LOCATIONS[1];
  return (
    <div className="absolute inset-0 z-20 overflow-hidden bg-[#b9d1d1] text-white">
      <div ref={mountRef} className="absolute inset-0" aria-label="ヴェルディアのPBR地表・森林・道路・湖・建築の3D景観" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/30 via-transparent to-slate-950/25" />
      <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="rounded-xl border border-white/20 bg-slate-950/65 px-3 py-2 shadow-xl backdrop-blur-md">
          <p className="text-[9px] font-black tracking-[.2em] text-emerald-200">VERDIA · SURFACE EXPLORATION</p><p className="mt-0.5 text-xs font-bold">地上探査 · PBR MATERIALS</p><p className="mt-1 text-[9px] text-emerald-100/80">文明 Stage {stage} · {stage < 2 ? '自然集落・木石建築' : stage < 4 ? '都市・研究インフラ' : '未来都市・惑星規模交通'}</p>
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
