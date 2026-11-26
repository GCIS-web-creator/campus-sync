'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PlanetSystemSpec, StarClass } from '@/lib/planet-system-catalog';
import { STAR_PROFILES } from '@/lib/planet-system-catalog';
import {
  getLowOrbitRadius,
  getStarCoronaClearanceKm,
  getStarTangentFlybyGeometry,
  getStarOrbitRadius,
  getVoyageStarRadius,
  getWarpIntensity,
  STAR_SYSTEM_VOYAGE_DURATION_MS,
  STAR_SYSTEM_VOYAGE_PHASES,
  VOYAGE_SCALE,
} from '@/lib/planet-star-voyage';

type PurchaseResult = { success: boolean; balance?: number; message?: string };
type ViewMode = 'cockpit' | 'chase';
type Props = {
  system: PlanetSystemSpec;
  starClass: StarClass | null;
  mpBalance: number;
  onPurchase: (travelId: string) => Promise<PurchaseResult>;
  onExit: () => void;
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

function makePlanetSurfaceTexture(seed: number, atmosphereColor: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const random = seeded(seed + 1_091);
  const ocean = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  ocean.addColorStop(0, '#102c49');
  ocean.addColorStop(0.45, '#174f67');
  ocean.addColorStop(1, '#071c35');
  context.fillStyle = ocean;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const continents = [
    [0.18, 0.37, 0.105, 0.19], [0.31, 0.63, 0.075, 0.17],
    [0.47, 0.33, 0.14, 0.22], [0.63, 0.62, 0.12, 0.2],
    [0.79, 0.36, 0.12, 0.18], [0.9, 0.7, 0.06, 0.12],
    [0.54, 0.79, 0.08, 0.1],
  ];
  for (const [cx, cy, rx, ry] of continents) {
    const centerX = cx * canvas.width;
    const centerY = cy * canvas.height;
    context.beginPath();
    for (let index = 0; index <= 80; index++) {
      const angle = index / 80 * Math.PI * 2;
      const irregular = 0.72 + random() * 0.28 + Math.sin(angle * 5 + cx * 11) * 0.09;
      const x = centerX + Math.cos(angle) * rx * canvas.width * irregular;
      const y = centerY + Math.sin(angle) * ry * canvas.height * irregular;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = random() > 0.5 ? '#6d9874' : '#8e9d70';
    context.fill();
    context.strokeStyle = 'rgba(201,217,160,0.32)';
    context.lineWidth = 8;
    context.stroke();
    for (let patch = 0; patch < 24; patch++) {
      const x = centerX + (random() - 0.5) * rx * canvas.width * 1.25;
      const y = centerY + (random() - 0.5) * ry * canvas.height * 1.25;
      context.fillStyle = random() > 0.5 ? 'rgba(35,89,70,0.26)' : 'rgba(194,177,122,0.2)';
      context.beginPath();
      context.ellipse(x, y, 8 + random() * 32, 4 + random() * 18, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
  }

  for (let index = 0; index < 180; index++) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const width = 24 + random() * 110;
    context.save();
    context.translate(x, y);
    context.rotate((random() - 0.5) * 0.42);
    context.fillStyle = 'rgba(239,247,247,' + (0.018 + random() * 0.055).toFixed(3) + ')';
    context.beginPath();
    context.ellipse(0, 0, width, 3 + random() * 13, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  const tint = new THREE.Color(atmosphereColor);
  context.fillStyle = 'rgba(' + Math.round(tint.r * 255) + ',' + Math.round(tint.g * 255) + ',' + Math.round(tint.b * 255) + ',0.035)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}

function makeNightLightsTexture(seed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const random = seeded(seed + 2_071);
  const clusters = [
    [0.18, 0.37, 0.105, 0.19], [0.31, 0.63, 0.075, 0.17],
    [0.47, 0.33, 0.14, 0.22], [0.63, 0.62, 0.12, 0.2],
    [0.79, 0.36, 0.12, 0.18], [0.9, 0.7, 0.06, 0.12],
    [0.54, 0.79, 0.08, 0.1],
  ];
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const [cx, cy, rx, ry] of clusters) {
    const centerX = cx * canvas.width;
    const centerY = cy * canvas.height;
    for (let city = 0; city < 58; city++) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random());
      const x = centerX + Math.cos(angle) * rx * canvas.width * radius;
      const y = centerY + Math.sin(angle) * ry * canvas.height * radius;
      const glow = 1.5 + random() * 4.5;
      const gradient = context.createRadialGradient(x, y, 0, x, y, glow * 4);
      gradient.addColorStop(0, 'rgba(255,239,185,0.95)');
      gradient.addColorStop(0.24, 'rgba(255,177,91,0.62)');
      gradient.addColorStop(1, 'rgba(255,136,54,0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, glow * 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = random() > 0.25 ? 'rgba(255,230,174,0.88)' : 'rgba(255,177,128,0.8)';
      context.beginPath();
      context.arc(x, y, 0.6 + random() * 1.1, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}


function makeStarGranulationTexture(color: string, seed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const random = seeded(seed + 8_821);
  const tint = new THREE.Color(color);
  const hue = tint.getHSL({ h: 0, s: 0, l: 0 });
  const base = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  if (hue.h < 0.12 || hue.h > 0.92) {
    base.addColorStop(0, '#ffedaa');
    base.addColorStop(0.28, '#ffb64d');
    base.addColorStop(0.65, '#eb6a2d');
    base.addColorStop(1, '#ad3218');
  } else {
    const hex = '#' + tint.getHexString();
    base.addColorStop(0, '#fff0c4');
    base.addColorStop(0.45, hex);
    base.addColorStop(1, '#6c547e');
  }
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Dense, irregular convection cells: bright granule centres surrounded by
  // darker intergranular lanes, rather than a flat emissive sphere.
  for (let index = 0; index < 2_800; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const rx = 2.4 + random() * 7.6;
    const ry = rx * (0.42 + random() * 0.72);
    const turn = random() * Math.PI;
    const warm = random();
    const gradient = context.createRadialGradient(x, y, 0, x, y, rx * 1.5);
    gradient.addColorStop(0, warm > 0.52 ? 'rgba(255,250,204,0.42)' : 'rgba(255,195,104,0.34)');
    gradient.addColorStop(0.55, 'rgba(255,150,61,0.16)');
    gradient.addColorStop(1, 'rgba(103,35,18,0.03)');
    context.save();
    context.translate(x, y);
    context.rotate(turn);
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(0, 0, rx * 1.5, ry * 1.5, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(95,34,16,' + (0.04 + random() * 0.08).toFixed(3) + ')';
    context.lineWidth = 0.5 + random() * 1.1;
    context.beginPath();
    context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  // A few subtle sunspot groups help make surface rotation legible.
  for (let spot = 0; spot < 18; spot += 1) {
    const x = random() * canvas.width;
    const y = 28 + random() * (canvas.height - 56);
    const radius = 4 + random() * 13;
    context.save();
    context.translate(x, y);
    context.rotate((random() - 0.5) * 0.8);
    context.fillStyle = 'rgba(74,28,16,0.34)';
    context.beginPath();
    context.ellipse(0, 0, radius * 1.65, radius * 0.62, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(45,20,16,0.62)';
    context.beginPath();
    context.ellipse(0, 0, radius, radius * 0.42, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}

function makeNightLightsOverlay(radius: number, texture: THREE.Texture, sunDirection: THREE.Vector3) {
  const geometry = new THREE.SphereGeometry(radius * 1.002, 256, 128);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uNightMap: { value: texture },
      uSunDirection: { value: sunDirection.clone().normalize() },
    },
    vertexShader: [
      'varying vec2 vUv;',
      'varying vec3 vWorldNormal;',
      'void main(){',
      '  vUv = uv;',
      '  vWorldNormal = normalize(mat3(modelMatrix) * normal);',
      '  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);',
      '}',
    ].join('\\n'),
    fragmentShader: [
      'uniform sampler2D uNightMap;',
      'uniform vec3 uSunDirection;',
      'varying vec2 vUv;',
      'varying vec3 vWorldNormal;',
      'void main(){',
      '  float daylight = dot(normalize(vWorldNormal), normalize(uSunDirection));',
      '  float night = 1.0 - smoothstep(-0.12, 0.10, daylight);',
      '  float city = texture2D(uNightMap, vUv).a;',
      '  float glow = city * night * 0.96;',
      '  if (glow < 0.008) discard;',
      '  gl_FragColor = vec4(vec3(1.0, 0.66, 0.34), glow);',
      '}',
    ].join('\\n'),
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  return { geometry, material, mesh: new THREE.Mesh(geometry, material) };
}

function makeExplorationVessel(resources: Array<{ dispose: () => void }>) {
  const ship = new THREE.Group();
  ship.name = 'CampusSync Deep Space Explorer';
  const length = VOYAGE_SCALE.spacecraftLength;
  const width = length * 0.42;
  const height = length * 0.12;
  const hull = new THREE.MeshStandardMaterial({ color: '#9fb4c7', metalness: 0.78, roughness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: '#17283a', metalness: 0.7, roughness: 0.42 });
  const wingMaterial = new THREE.MeshStandardMaterial({ color: '#627e96', metalness: 0.72, roughness: 0.38, side: THREE.DoubleSide });
  const accent = new THREE.MeshStandardMaterial({ color: '#b9d9e8', metalness: 0.84, roughness: 0.24 });
  const glass = new THREE.MeshStandardMaterial({ color: '#102e49', emissive: '#1f83ad', emissiveIntensity: 0.7, metalness: 0.45, roughness: 0.16 });
  const engineGlow = new THREE.MeshBasicMaterial({ color: '#66dfff', toneMapped: false });
  const navGlow = new THREE.MeshBasicMaterial({ color: '#ffb779', toneMapped: false });
  resources.push(hull, dark, wingMaterial, accent, glass, engineGlow, navGlow);

  const addPart = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: THREE.Vector3,
    rotation = new THREE.Euler(),
    scale = new THREE.Vector3(1, 1, 1),
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.rotation.copy(rotation);
    mesh.scale.copy(scale);
    ship.add(mesh);
    resources.push(geometry);
    return mesh;
  };

  // Long central pressure hull and pointed forward command section.
  addPart(new THREE.CylinderGeometry(width * 0.105, width * 0.14, length * 0.76, 14), hull,
    new THREE.Vector3(0, 0, length * 0.045), new THREE.Euler(Math.PI / 2, 0, 0));
  addPart(new THREE.ConeGeometry(width * 0.14, length * 0.27, 14), accent,
    new THREE.Vector3(0, 0, -length * 0.455), new THREE.Euler(-Math.PI / 2, 0, 0));
  addPart(new THREE.CylinderGeometry(width * 0.095, width * 0.12, length * 0.22, 12), dark,
    new THREE.Vector3(0, 0, length * 0.48), new THREE.Euler(Math.PI / 2, 0, 0));

  // Swept delta wings and stabilizers create a recognisable, fast explorer profile.
  const wing = new THREE.Shape();
  wing.moveTo(-width * 0.13, -length * 0.2);
  wing.lineTo(width * 0.13, -length * 0.2);
  wing.lineTo(width * 0.5, length * 0.31);
  wing.lineTo(width * 0.46, length * 0.43);
  wing.lineTo(width * 0.19, length * 0.34);
  wing.lineTo(0, length * 0.14);
  wing.lineTo(-width * 0.19, length * 0.34);
  wing.lineTo(-width * 0.46, length * 0.43);
  wing.lineTo(-width * 0.5, length * 0.31);
  wing.closePath();
  const wingGeometry = new THREE.ExtrudeGeometry(wing, { depth: height * 0.065, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: length * 0.002, bevelThickness: length * 0.002 });
  addPart(wingGeometry, wingMaterial, new THREE.Vector3(0, -height * 0.04, 0), new THREE.Euler(Math.PI / 2, 0, 0));

  const dorsalFin = new THREE.Shape();
  dorsalFin.moveTo(-width * 0.07, length * 0.14);
  dorsalFin.lineTo(width * 0.07, length * 0.14);
  dorsalFin.lineTo(width * 0.045, length * 0.48);
  dorsalFin.lineTo(0, length * 0.52);
  dorsalFin.lineTo(-width * 0.045, length * 0.48);
  dorsalFin.closePath();
  addPart(new THREE.ExtrudeGeometry(dorsalFin, { depth: height * 0.48, bevelEnabled: false }), accent,
    new THREE.Vector3(0, height * 0.12, 0), new THREE.Euler(Math.PI / 2, 0, 0));

  // Twin outboard engine pods, central booster and glowing exhaust throats.
  for (const side of [-1, 1]) {
    const x = side * width * 0.3;
    addPart(new THREE.CylinderGeometry(width * 0.052, width * 0.064, length * 0.48, 12), dark,
      new THREE.Vector3(x, -height * 0.03, length * 0.28), new THREE.Euler(Math.PI / 2, 0, 0));
    addPart(new THREE.CylinderGeometry(width * 0.058, width * 0.058, length * 0.055, 12), accent,
      new THREE.Vector3(x, -height * 0.03, length * 0.535), new THREE.Euler(Math.PI / 2, 0, 0));
    addPart(new THREE.ConeGeometry(width * 0.042, length * 0.18, 12), engineGlow,
      new THREE.Vector3(x, -height * 0.03, length * 0.64), new THREE.Euler(Math.PI / 2, 0, 0));
    addPart(new THREE.BoxGeometry(width * 0.14, height * 0.055, length * 0.16), hull,
      new THREE.Vector3(side * width * 0.34, height * 0.17, length * 0.13));
    addPart(new THREE.SphereGeometry(width * 0.018, 8, 6), navGlow,
      new THREE.Vector3(side * width * 0.48, 0, length * 0.3));
  }

  addPart(new THREE.CylinderGeometry(width * 0.075, width * 0.09, length * 0.35, 12), dark,
    new THREE.Vector3(0, -height * 0.01, length * 0.34), new THREE.Euler(Math.PI / 2, 0, 0));
  addPart(new THREE.ConeGeometry(width * 0.065, length * 0.2, 12), engineGlow,
    new THREE.Vector3(0, -height * 0.01, length * 0.58), new THREE.Euler(Math.PI / 2, 0, 0));

  // Raised bridge glazing, dorsal sensor blister and a spine of service modules.
  addPart(new THREE.SphereGeometry(1, 18, 10), glass,
    new THREE.Vector3(0, height * 0.72, -length * 0.19), new THREE.Euler(0, 0, 0),
    new THREE.Vector3(width * 0.105, height * 0.42, length * 0.14));
  addPart(new THREE.BoxGeometry(width * 0.13, height * 0.07, length * 0.26), accent,
    new THREE.Vector3(0, height * 0.38, length * 0.12));
  addPart(new THREE.SphereGeometry(width * 0.035, 10, 8), glass,
    new THREE.Vector3(0, height * 0.57, length * 0.29));
  for (let module = 0; module < 5; module += 1) {
    addPart(new THREE.BoxGeometry(width * 0.16, height * 0.045, length * 0.06), dark,
      new THREE.Vector3(0, height * 0.33, -length * 0.04 + module * length * 0.085));
  }
  return ship;
}

function makeWarpOverlay() {
  const geometry = new THREE.PlaneGeometry(52, 32);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWarp: { value: 0 },
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\\n'),
    fragmentShader: [
      'uniform float uTime;',
      'uniform float uWarp;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 p = (vUv - 0.5) * vec2(1.65, 1.0);',
      '  float radius = length(p);',
      '  float angle = atan(p.y, p.x);',
      '  float twist = angle + radius * (9.0 + uWarp * 22.0) - uTime * (0.45 + uWarp * 4.2);',
      '  float spiral = pow(max(0.0, cos(twist * 7.0 + sin(radius * 18.0 - uTime * 2.2))), 15.0);',
      '  float radial = pow(max(0.0, cos(radius * 78.0 - uTime * 18.0 + angle * 4.0)), 18.0);',
      '  float sweep = 0.5 + 0.5 * sin(uTime * 7.0 + radius * 34.0 - angle * 9.0);',
      '  float edge = 1.0 - smoothstep(0.58, 0.98, radius);',
      '  float center = smoothstep(0.045, 0.26, radius);',
      '  float filaments = spiral * 0.34 + radial * 0.12 + sweep * 0.055;',
      '  float alpha = clamp(filaments * edge * center * uWarp, 0.0, 0.42);',
      '  vec3 cyan = vec3(0.18, 0.78, 1.0);',
      '  vec3 violet = vec3(0.67, 0.34, 1.0);',
      '  vec3 color = mix(cyan, violet, 0.5 + 0.5 * sin(twist + uTime));',
      '  gl_FragColor = vec4(color, alpha);',
      '}',
    ].join('\\n'),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, -18);
  mesh.renderOrder = 100;
  return { mesh, geometry, material };
}

function makeWarpRings() {
  return [0, 1, 2].map(index => {
    const geometry = new THREE.TorusGeometry(3.6 + index * 2.2, 0.025 + index * 0.008, 6, 144);
    const material = new THREE.MeshBasicMaterial({
      color: index === 1 ? '#c39aff' : '#86eaff',
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, -7 - index * 8);
    mesh.rotation.set(0.16 * (index + 1), 0.27 * (index + 1), 0);
    return { mesh, geometry, material, index };
  });
}

function makeMoonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = '#8c8b83';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = seeded(6419);
  for (let index = 0; index < 420; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 1 + Math.pow(random(), 2) * 12;
    context.fillStyle = random() > 0.5 ? 'rgba(235,231,217,0.22)' : 'rgba(26,31,37,0.25)';
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function makeCorona(color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const random = seeded(6_419);
  const tint = new THREE.Color(color);
  const rgb = 'rgba(' + Math.round(tint.r * 255) + ',' + Math.round(tint.g * 255) + ',' + Math.round(tint.b * 255) + ',';
  const gradient = context.createRadialGradient(256, 256, 5, 256, 256, 250);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.035, rgb + '0.98)');
  gradient.addColorStop(0.12, rgb + '0.7)');
  gradient.addColorStop(0.28, rgb + '0.3)');
  gradient.addColorStop(0.56, rgb + '0.1)');
  gradient.addColorStop(1, rgb + '0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);

  for (let ray = 0; ray < 260; ray++) {
    const angle = random() * Math.PI * 2;
    const inner = 52 + random() * 38;
    const outer = 132 + random() * 118;
    const bend = (random() - 0.5) * 54;
    context.beginPath();
    context.moveTo(256 + Math.cos(angle) * inner, 256 + Math.sin(angle) * inner);
    context.quadraticCurveTo(
      256 + Math.cos(angle) * (inner + outer) * 0.5 - Math.sin(angle) * bend,
      256 + Math.sin(angle) * (inner + outer) * 0.5 + Math.cos(angle) * bend,
      256 + Math.cos(angle) * outer,
      256 + Math.sin(angle) * outer,
    );
    context.strokeStyle = rgb + (0.025 + random() * 0.16).toFixed(3) + ')';
    context.lineWidth = 0.5 + random() * 2;
    context.stroke();
  }
  for (let arc = 0; arc < 42; arc++) {
    const angle = random() * Math.PI * 2;
    const radius = 116 + random() * 72;
    const span = 0.12 + random() * 0.58;
    context.beginPath();
    context.ellipse(256, 256, radius, radius * (0.76 + random() * 0.4), angle, -span, span);
    context.strokeStyle = rgb + (0.018 + random() * 0.1).toFixed(3) + ')';
    context.lineWidth = 0.6 + random() * 1.5;
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSpeedStreaks() {
  const random = seeded(7_713);
  const positions: number[] = [];
  for (let index = 0; index < 230; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 7 + random() * 48;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const z = -72 - random() * 50;
    const length = 12 + random() * 48;
    positions.push(x, y, z, x + Math.cos(angle) * length * 0.18, y + Math.sin(angle) * length * 0.18, z + length);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: '#a8dcff',
    transparent: true,
    opacity: 0.035,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return { lines: new THREE.LineSegments(geometry, material), geometry, material };
}
function makeStarfield(seed: number) {
  const random = seeded(seed + 91);
  const positions: number[] = [];
  const colors: number[] = [];
  const choices = [0xa9c9ff, 0xffe2c2, 0xffffff, 0xffc8a9, 0xc0f0ff];
  for (let index = 0; index < 3_600; index += 1) {
    const y = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(1 - y * y);
    const distance = 48_000 + random() * 48_000;
    positions.push(Math.cos(angle) * radius * distance, y * distance, Math.sin(angle) * radius * distance);
    const color = new THREE.Color(choices[Math.floor(random() * choices.length)]);
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 8,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}

function ease(value: number) {
  return value * value * (3 - 2 * value);
}

function formatClock(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

export default function StarSystemVoyage({ system, starClass, mpBalance, onPurchase, onExit }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const displayStarRadius = starClass ? getVoyageStarRadius(starClass) : 0;
  const coronaClearanceKm = starClass ? getStarCoronaClearanceKm(displayStarRadius) : 0;
  const startAtRef = useRef(0);
  const purchaseLockRef = useRef(false);
  const pendingTravelIdRef = useRef<string | null>(null);
  const viewModeRef = useRef<ViewMode>('cockpit');
  const lookOffsetRef = useRef({ yaw: 0, pitch: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>('cockpit');
  const [purchasing, setPurchasing] = useState(false);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [error, setError] = useState('');
  const starProfile = starClass ? STAR_PROFILES[starClass] : null;

  const selectViewMode = (mode: ViewMode) => {
    viewModeRef.current = mode;
    setViewMode(mode);
  };
  const resetFlightView = () => {
    lookOffsetRef.current = { yaw: 0, pitch: 0 };
  };

  const beginVoyage = async () => {
    if (purchaseLockRef.current || purchasing || started || !starClass) return;
    if (mpBalance < 30) {
      setError('星系旅行には30MP必要です。技術ツリーで所持MPを確認してください。');
      return;
    }
    purchaseLockRef.current = true;
    setPurchasing(true);
    setError('');
    try {
      const travelId = pendingTravelIdRef.current ?? crypto.randomUUID();
      pendingTravelIdRef.current = travelId;
      const result = await onPurchase(travelId);
      if (!result.success) throw new Error(result.message || '決済できませんでした。');
      pendingTravelIdRef.current = null;
      startAtRef.current = performance.now();
      setElapsed(0);
      setPhaseIndex(0);
      setPhaseProgress(0);
      viewModeRef.current = 'cockpit';
      lookOffsetRef.current = { yaw: 0, pitch: 0 };
      setViewMode('cockpit');
      setStarted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '星系旅行を開始できませんでした。');
    } finally {
      purchaseLockRef.current = false;
      setPurchasing(false);
    }
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !started || !starClass || !starProfile) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        logarithmicDepthBuffer: true,
      });
    } catch {
      setError('この端末では3D航行表示を初期化できませんでした。');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
    renderer.setSize(Math.max(1, mount.clientWidth), Math.max(1, mount.clientHeight));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setClearColor('#02050d', 1);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;';
    mount.appendChild(renderer.domElement);

    let activePointerId: number | null = null;
    let lastPointerX = 0;
    let lastPointerY = 0;
    const pointerDown = (event: PointerEvent) => {
      if (activePointerId !== null || event.button !== 0) return;
      activePointerId = event.pointerId;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      renderer.domElement.style.cursor = 'grabbing';
      renderer.domElement.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const pointerMove = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) return;
      const deltaX = event.clientX - lastPointerX;
      const deltaY = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lookOffsetRef.current = {
        yaw: THREE.MathUtils.clamp(lookOffsetRef.current.yaw - deltaX * 0.004, -Math.PI * 0.9, Math.PI * 0.9),
        pitch: THREE.MathUtils.clamp(lookOffsetRef.current.pitch - deltaY * 0.0035, -1.18, 1.18),
      };
      event.preventDefault();
    };
    const pointerUp = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) return;
      activePointerId = null;
      renderer.domElement.style.cursor = 'grab';
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointermove', pointerMove);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('pointercancel', pointerUp);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#02050d');
    const camera = new THREE.PerspectiveCamera(46, mount.clientWidth / Math.max(1, mount.clientHeight), 0.00001, 120_000);
    scene.add(camera);
    const resources: Array<{ dispose: () => void }> = [];
    // Warp streaks and rings live in the ship's flight frame, not on the
    // camera. Looking around therefore does not drag the acceleration lines.
    const warpFrame = new THREE.Group();
    scene.add(warpFrame);
    const speedEffects = makeSpeedStreaks();
    warpFrame.add(speedEffects.lines);
    resources.push(speedEffects.geometry, speedEffects.material);
    const warpOverlay = makeWarpOverlay();
    warpFrame.add(warpOverlay.mesh);
    resources.push(warpOverlay.geometry, warpOverlay.material);
    const warpRings = makeWarpRings();
    warpRings.forEach(ring => {
      warpFrame.add(ring.mesh);
      resources.push(ring.geometry, ring.material);
    });

    const starfield = makeStarfield(Number.parseInt(system.id.slice(-3), 10) || 1);
    scene.add(starfield);
    resources.push(starfield.geometry, starfield.material);

    const starRadius = getVoyageStarRadius(starClass);
    const starGeometry = new THREE.SphereGeometry(starRadius, 320, 192);
    const starSurfaceTexture = makeStarGranulationTexture(starProfile.lightColor, Number.parseInt(system.id.slice(-3), 10) || 1);
    const starMaterial = new THREE.MeshBasicMaterial({ map: starSurfaceTexture, color: '#ffffff', toneMapped: false });
    const star = new THREE.Mesh(starGeometry, starMaterial);
    scene.add(star);
    resources.push(starGeometry, starSurfaceTexture, starMaterial);

    const coronaTexture = makeCorona(starProfile.color);
    const coronaMaterial = new THREE.SpriteMaterial({
      map: coronaTexture,
      color: '#ffffff',
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const corona = new THREE.Sprite(coronaMaterial);
    corona.scale.setScalar(starRadius * 5.8);
    scene.add(corona);
    resources.push(coronaTexture, coronaMaterial);

    const haloTexture = makeCorona(starProfile.lightColor);
    const haloMaterial = new THREE.SpriteMaterial({
      map: haloTexture,
      color: starProfile.lightColor,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.setScalar(starRadius * 6.0);
    scene.add(halo);
    resources.push(haloTexture, haloMaterial);

    const planetPosition = new THREE.Vector3(-VOYAGE_SCALE.astronomicalUnit, 0, 0);
    const moonPosition = planetPosition.clone().add(new THREE.Vector3(0, 0, VOYAGE_SCALE.earthMoonDistance));
    const planetGeometry = new THREE.SphereGeometry(VOYAGE_SCALE.earthRadius, 512, 256);
    const loader = new THREE.TextureLoader();
    const fallbackPlanetTexture = makePlanetSurfaceTexture(Number.parseInt(system.id.slice(-3), 10) || 1, system.atmosphereColor);
    const nightLightsTexture = makeNightLightsTexture(Number.parseInt(system.id.slice(-3), 10) || 1);
    let planetMaterial: THREE.MeshStandardMaterial;
    const planetTexture = loader.load(
      '/planet-assets/planets/' + system.id + (Number.parseInt(system.id.slice(-3), 10) >= 11 && Number.parseInt(system.id.slice(-3), 10) <= 20 ? '/surface.webp' : '/surface.jpg'),
      (loaded) => {
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.ClampToEdgeWrapping;
        loaded.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        loaded.needsUpdate = true;
      },
      undefined,
      () => { planetMaterial.map = fallbackPlanetTexture; planetMaterial.needsUpdate = true; },
    );
    planetTexture.colorSpace = THREE.SRGBColorSpace;
    planetTexture.wrapS = THREE.RepeatWrapping;
    planetTexture.wrapT = THREE.ClampToEdgeWrapping;
    planetMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: planetTexture,
      roughness: 0.96,
      metalness: 0,
    });
    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    planet.position.copy(planetPosition);
    scene.add(planet);
    const nightOverlay = makeNightLightsOverlay(
      VOYAGE_SCALE.earthRadius,
      nightLightsTexture,
      new THREE.Vector3().sub(planetPosition),
    );
    nightOverlay.mesh.position.copy(planetPosition);
    scene.add(nightOverlay.mesh);
    resources.push(planetGeometry, planetMaterial, planetTexture, fallbackPlanetTexture, nightLightsTexture, nightOverlay.geometry, nightOverlay.material);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(VOYAGE_SCALE.earthRadius * 1.035, 256, 128),
      new THREE.MeshBasicMaterial({ color: system.atmosphereColor, transparent: true, opacity: 0.14, side: THREE.BackSide, depthWrite: false }),
    );
    atmosphere.position.copy(planetPosition);
    scene.add(atmosphere);
    resources.push(atmosphere.geometry, atmosphere.material);

    const moonGeometry = new THREE.SphereGeometry(VOYAGE_SCALE.moonRadius, 256, 128);
    const moonTexture = makeMoonTexture();
    const moonMaterial = new THREE.MeshStandardMaterial({
      map: moonTexture,
      color: '#e3e5e9',
      roughness: 1,
      metalness: 0,
    });
    const moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.position.copy(moonPosition);
    scene.add(moon);
    const moonGlowTexture = makeCorona('#aabfe8');
    const moonGlowMaterial = new THREE.SpriteMaterial({
      map: moonGlowTexture,
      color: '#b8c8ef',
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const moonGlow = new THREE.Sprite(moonGlowMaterial);
    moonGlow.position.copy(moonPosition);
    moonGlow.scale.setScalar(VOYAGE_SCALE.moonRadius * 3.6);
    scene.add(moonGlow);
    resources.push(moonGeometry, moonMaterial, moonTexture, moonGlowTexture, moonGlowMaterial);

    const sunlight = new THREE.DirectionalLight(starProfile.lightColor, 3.5);
    sunlight.position.set(0, 0, 0);
    sunlight.target.position.copy(planetPosition);
    scene.add(sunlight, sunlight.target);
    // Keep a restrained fill so the day/night terminator remains obvious.
    scene.add(new THREE.HemisphereLight('#b6c9e3', '#18263b', 0.14));
    scene.add(new THREE.AmbientLight('#64758e', 0.11));

    const explorationVessel = makeExplorationVessel(resources);
    explorationVessel.visible = false;
    scene.add(explorationVessel);

    const worldUp = new THREE.Vector3(0, 1, 0);
    const starOrbitRadius = getStarOrbitRadius(starRadius);
    const planetOrbitRadius = getLowOrbitRadius(VOYAGE_SCALE.earthRadius);
    const moonOrbitRadius = getLowOrbitRadius(VOYAGE_SCALE.moonRadius);
    const outerStart = new THREE.Vector3(-VOYAGE_SCALE.outerSystemDistance, 160, 3_600);
    const planetFlybyRadius = VOYAGE_SCALE.earthRadius * 4.5;
    const planetFlyby = planetPosition.clone().add(new THREE.Vector3(
      -planetFlybyRadius * 0.82,
      planetFlybyRadius * 0.36,
      planetFlybyRadius * 0.42,
    ));
    const moonToPlanetDirection = planetPosition.clone().sub(moonPosition).normalize();
    const moonOrbitBasisA = new THREE.Vector3(1, 0, 0);
    const moonOrbitBasisB = new THREE.Vector3().crossVectors(moonToPlanetDirection, moonOrbitBasisA).normalize();
    const moonOrbitEndPosition = moonPosition.clone().add(new THREE.Vector3(moonOrbitRadius, 0, 0));
    const tangentFlyby = getStarTangentFlybyGeometry(moonOrbitEndPosition.x, moonOrbitEndPosition.z, starRadius);
    const starTangentPoint = new THREE.Vector3(tangentFlyby.tangentX, 0, tangentFlyby.tangentZ);
    const starFlybyDirection = new THREE.Vector3(tangentFlyby.directionX, 0, tangentFlyby.directionZ);
    const outerEnd = starTangentPoint.clone().addScaledVector(starFlybyDirection, VOYAGE_SCALE.outerSystemDistance * 2.4);
    const totalDuration = STAR_SYSTEM_VOYAGE_DURATION_MS;

    const getPlanetOrbitPose = (angle: number) => {
      const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize();
      const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).normalize();
      const position = planetPosition.clone().addScaledVector(radial, planetOrbitRadius);
      // 500 km altitude: skim above the visible atmosphere and keep the
      // horizon, day/night terminator and sunlit limb together in frame.
      const target = position.clone()
        .addScaledVector(tangent, 2.25)
        .addScaledVector(radial, -0.15);
      return { position, target, up: radial };
    };

    const getMoonOrbitPose = (angle: number) => {
      const radial = moonOrbitBasisA.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(moonOrbitBasisB, Math.sin(angle)).normalize();
      const tangent = moonOrbitBasisA.clone().multiplyScalar(-Math.sin(angle))
        .addScaledVector(moonOrbitBasisB, Math.cos(angle)).normalize();
      const position = moonPosition.clone().addScaledVector(radial, moonOrbitRadius);
      // At 500 km altitude, look close to the lunar horizon. The bright limb
      // and the terminator stay in view without turning the Moon behind us.
      const target = position.clone()
        .addScaledVector(tangent, 0.82)
        .addScaledVector(radial, -0.045);
      return { position, target, up: radial };
    };

    const getStarOrbitPose = (angle: number) => {
      const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const position = radial.clone().multiplyScalar(starOrbitRadius);
      // Keep the enlarged, granular stellar disc centred for the entire lap.
      return { position, target: new THREE.Vector3(0, 0, 0), up: worldUp };
    };

    const getPose = (id: string, progress: number) => {
      const t = ease(progress);
      if (id === 'outer-cruise') {
        return {
          position: outerStart.clone().lerp(planetFlyby, t),
          target: planetPosition.clone().lerp(new THREE.Vector3(0, 0, 0), t * 0.18),
          up: worldUp,
        };
      }
      if (id === 'planet-flyby-inbound') {
        const end = new THREE.Vector3(-starOrbitRadius, 0, 0);
        return {
          position: planetFlyby.clone().lerp(end, t),
          target: planetPosition.clone().lerp(new THREE.Vector3(0, 0, 0), t),
          up: worldUp,
        };
      }
      if (id === 'star-orbit') {
        return getStarOrbitPose(Math.PI + Math.PI * 2 * progress);
      }
      if (id === 'planet-transfer') {
        const startPose = getStarOrbitPose(Math.PI);
        const endPose = getPlanetOrbitPose(0);
        const position = startPose.position.clone().lerp(endPose.position, t);
        const target = startPose.target.clone().lerp(endPose.target, t);
        const up = startPose.up.clone().lerp(endPose.up, t).normalize();
        position.y += Math.sin(Math.PI * progress) * 440;
        position.z += Math.sin(Math.PI * progress) * 160;
        return { position, target, up };
      }
      if (id === 'planet-orbit') {
        return getPlanetOrbitPose(Math.PI * 4 * progress);
      }
      if (id === 'moon-transfer') {
        const startPose = getPlanetOrbitPose(Math.PI * 4);
        const endPose = getMoonOrbitPose(0);
        const position = startPose.position.clone().lerp(endPose.position, t);
        // Keep the Moon as the explicit destination. It begins as a tiny disk
        // and grows toward the centre of the windscreen throughout the transfer.
        const target = planetPosition.clone().lerp(moonPosition, ease(progress * 1.06));
        const up = startPose.up.clone().lerp(endPose.up, t).normalize();
        return { position, target, up };
      }
      if (id === 'moon-orbit') {
        return getMoonOrbitPose(Math.PI * 2 * progress);
      }
      if (id === 'star-skim') {
        const startPose = getMoonOrbitPose(Math.PI * 2);
        // A mathematically tangent line reaches the edge of the game's
        // stellar gravity boundary without crossing inside it.
        const position = startPose.position.clone().lerp(starTangentPoint, t);
        const towardStar = position.clone().negate().normalize();
        const lookDirection = starFlybyDirection.clone().multiplyScalar(0.78)
          .addScaledVector(towardStar, 0.22).normalize();
        return {
          position,
          target: position.clone().addScaledVector(lookDirection, 1_200),
          up: worldUp,
        };
      }
      // Continue on the exact same tangent vector and fly straight away.
      const position = starTangentPoint.clone().lerp(outerEnd, t);
      const target = position.clone().addScaledVector(starFlybyDirection, 4_000);
      return { position, target, up: worldUp };
    };
    let frame = 0;
    let lastUiUpdate = 0;
    let lastFrameTime = 0;
    let alive = true;
    const render = (now: number) => {
      if (!alive) return;
      const deltaSeconds = lastFrameTime === 0 ? 0 : Math.min(0.05, (now - lastFrameTime) / 1_000);
      lastFrameTime = now;
      const current = Math.min(totalDuration, Math.max(0, now - startAtRef.current));
      let consumed = 0;
      let index = STAR_SYSTEM_VOYAGE_PHASES.length - 1;
      let localProgress = 1;
      for (let i = 0; i < STAR_SYSTEM_VOYAGE_PHASES.length; i += 1) {
        const phase = STAR_SYSTEM_VOYAGE_PHASES[i];
        if (current <= consumed + phase.durationMs || i === STAR_SYSTEM_VOYAGE_PHASES.length - 1) {
          index = i;
          localProgress = Math.min(1, Math.max(0, (current - consumed) / phase.durationMs));
          break;
        }
        consumed += phase.durationMs;
      }
      const phaseId = STAR_SYSTEM_VOYAGE_PHASES[index].id;
      const pose = getPose(phaseId, localProgress);
      const highSpeed = phaseId === 'outer-cruise' || phaseId === 'planet-flyby-inbound' || phaseId === 'outer-departure';
      const warpAmount = getWarpIntensity(phaseId, localProgress);
      const timeSeconds = current / 1_000;
      const desiredFov = highSpeed ? 58
        : phaseId === 'planet-transfer' || phaseId === 'moon-transfer' ? 38
          : phaseId === 'star-orbit' ? 18
            : phaseId === 'star-skim' ? 26
              : phaseId === 'moon-orbit' ? 42
                : phaseId === 'planet-orbit' ? 48
                  : 46;
      if (camera.fov !== desiredFov) {
        camera.fov = desiredFov;
        camera.updateProjectionMatrix();
      }
      speedEffects.material.opacity = 0.04 + warpAmount * 0.9;
      speedEffects.lines.rotation.z += deltaSeconds * (0.025 + warpAmount * 0.84);
      warpOverlay.material.uniforms.uTime.value = timeSeconds;
      warpOverlay.material.uniforms.uWarp.value = warpAmount;
      warpRings.forEach((ring, ringIndex) => {
        const direction = ringIndex % 2 === 0 ? 1 : -1;
        ring.mesh.rotation.z = timeSeconds * (0.18 + warpAmount * 1.7) * direction + ringIndex * 0.8;
        ring.mesh.rotation.x = 0.16 * (ringIndex + 1) + Math.sin(timeSeconds * 1.3 + ringIndex) * warpAmount * 0.48;
        ring.mesh.rotation.y = 0.27 * (ringIndex + 1) + Math.cos(timeSeconds * 1.1 + ringIndex) * warpAmount * 0.42;
        ring.mesh.scale.setScalar(1 + Math.sin(timeSeconds * 3.2 + ringIndex * 2) * warpAmount * 0.13);
        ring.material.opacity = warpAmount * (0.19 - ringIndex * 0.035);
      });

      // This is the autopilot's fixed flight direction. Warp streaks and rings
      // inherit this frame before any manual camera rotation is applied.
      camera.position.copy(pose.position);
      camera.up.copy(pose.up);
      camera.lookAt(pose.target);
      camera.rotateZ(Math.sin(timeSeconds * 1.8) * warpAmount * 0.045 + Math.sin(timeSeconds * 5.4) * warpAmount * 0.012);
      const flightQuaternion = camera.quaternion.clone();
      warpFrame.position.copy(pose.position);
      warpFrame.quaternion.copy(flightQuaternion);

      explorationVessel.position.copy(pose.position);
      explorationVessel.quaternion.copy(flightQuaternion);
      explorationVessel.visible = viewModeRef.current === 'chase';

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(flightQuaternion).normalize();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(flightQuaternion).normalize();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(flightQuaternion).normalize();
      const lookOffset = lookOffsetRef.current;

      if (viewModeRef.current === 'chase') {
        // Broadcast-style exterior camera follows the one-kilometre ship from
        // behind and above, with a slight lateral sweep along the route.
        const cameraDrift = Math.sin(timeSeconds * 0.18) * VOYAGE_SCALE.spacecraftLength * 0.9;
        camera.position.copy(pose.position)
          .addScaledVector(forward, -VOYAGE_SCALE.spacecraftLength * 8.5)
          .addScaledVector(up, VOYAGE_SCALE.spacecraftLength * 2.6)
          .addScaledVector(right, VOYAGE_SCALE.spacecraftLength * (1.2 + cameraDrift / VOYAGE_SCALE.spacecraftLength));
        camera.up.copy(up);
        camera.lookAt(pose.position.clone().addScaledVector(forward, VOYAGE_SCALE.spacecraftLength * 1.5));
        camera.rotateY(lookOffset.yaw);
        camera.rotateX(lookOffset.pitch);
      } else {
        camera.position.copy(pose.position);
        camera.up.copy(pose.up);
        camera.quaternion.copy(flightQuaternion);
        camera.rotateY(lookOffset.yaw);
        camera.rotateX(lookOffset.pitch);
      }

      // Granulation rotates with the stellar surface, rather than being a
      // static featureless emissive sphere. Delta time keeps it FPS-independent.
      star.rotation.y += deltaSeconds * 0.018;
      moon.rotation.y += deltaSeconds * 0.00016;
      renderer.render(scene, camera);

      if (now - lastUiUpdate > 130 || current >= totalDuration) {
        setElapsed(current);
        setPhaseIndex(index);
        setPhaseProgress(localProgress);
        lastUiUpdate = now;
      }
      if (current >= totalDuration) {
        setCompleted(true);
        return;
      }
      frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', pointerUp);
      resources.forEach(resource => resource.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [started, starClass, starProfile, system]);

  const activePhase = STAR_SYSTEM_VOYAGE_PHASES[phaseIndex];
  const remaining = Math.max(0, STAR_SYSTEM_VOYAGE_DURATION_MS - elapsed);
  const noStar = !starClass || !starProfile || system.rogue;
  const lowOrbitActive = activePhase?.id === 'planet-orbit' || activePhase?.id === 'moon-orbit';
  const starOrbitActive = activePhase?.id === 'star-orbit';
  const destinationLabel = activePhase?.id === 'star-orbit'
    ? '目的地：恒星周回'
    : activePhase?.id === 'star-skim'
      ? '恒星脇を直進フライバイ'
      : activePhase?.id === 'outer-departure'
        ? '重力境界外から星系離脱'
        : activePhase?.id === 'planet-orbit' || activePhase?.id === 'planet-transfer' || activePhase?.id === 'planet-flyby-inbound'
          ? '目的地：惑星'
          : activePhase?.id === 'moon-orbit' || activePhase?.id === 'moon-transfer'
            ? '目的地：衛星'
            : '目的地：星系内縁';
  const highSpeedActive = activePhase?.id === 'outer-cruise' || activePhase?.id === 'planet-flyby-inbound' || activePhase?.id === 'outer-departure';
  const orbitReadout = lowOrbitActive
    ? '地表高度 500 km · 低軌道'
    : starOrbitActive
      ? 'コロナ外縁 + ' + Math.round(coronaClearanceKm).toLocaleString('ja-JP') + ' km'
      : activePhase?.id === 'star-skim' || activePhase?.id === 'outer-departure'
        ? '恒星重力境界の外側'
        : '宇宙船全長 1 km';

  return (
    <div className="absolute inset-0 z-40 overflow-hidden bg-[#02050d] text-white">
      <div ref={mountRef} className="absolute inset-0" aria-label="宇宙船の操縦席から見た星系旅行3D映像" />
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-[2px] sm:p-6">
          <div className="w-full max-w-xl rounded-3xl border border-cyan-200/20 bg-slate-950/88 p-5 shadow-2xl backdrop-blur-xl sm:p-7">
            <p className="text-[9px] font-black tracking-[.26em] text-cyan-200">CAMPUSSYNC · DEEP SPACE FLIGHT</p>
            <h2 className="mt-2 text-2xl font-black">星系周遊航行</h2>
            <p className="mt-2 text-xs leading-6 text-slate-300">{system.name}の外縁から出発し、恒星・惑星・衛星を順番に巡る約5分42秒の自動航行です。惑星・衛星は地表500km、恒星は従来の10倍の高度を周回。最後は恒星の重力境界を避けて直線フライバイします。</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[9px] text-slate-400">巡航速度</p><p className="mt-1 text-lg font-black text-cyan-100">0.27c</p><p className="text-[9px] text-slate-500">演出上の速度表示</p></div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[9px] text-slate-400">飛行時間</p><p className="mt-1 text-lg font-black">約5分42秒</p><p className="text-[9px] text-slate-500">全航程を従来の1/3速度に</p></div>
              <div className="col-span-2 rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3 sm:col-span-1"><p className="text-[9px] text-cyan-200">航行費用</p><p className="mt-1 text-lg font-black">30 MP</p><p className="text-[9px] text-slate-400">開始時に一度だけ消費</p></div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-[9px] font-black tracking-[.16em] text-slate-400">FLIGHT PLAN · 09 PHASES</p>
              <ol className="mt-2 space-y-1.5">
                {STAR_SYSTEM_VOYAGE_PHASES.map((phase, index) => (
                  <li key={phase.id} className="flex items-center gap-2 text-[10px] text-slate-300">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-300/10 text-[9px] font-black text-cyan-200">{index + 1}</span>
                    {phase.label}
                    {phase.laps > 0 && <span className="ml-auto text-[9px] text-cyan-200">×{phase.laps}</span>}
                  </li>
                ))}
              </ol>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-slate-400">1ワールド単位=10,000km。地球直径は船体長の約12,742倍、月は約3,475倍、G型恒星は演出スケールで地球直径の約136倍。恒星表面には粒状斑を描き、ゆっくり自転させています。恒星フライバイは設定した重力境界の外側を接線方向に通過し、そのまま直進離脱します。</p>
            <p className="mt-2 text-[10px] font-bold text-amber-200">航行開始後に途中で終了しても、消費したMPは返還されません。</p>
            {noStar && <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">この惑星は恒星を持たない自由浮遊惑星のため、恒星を巡る航行はできません。</p>}
            {error && <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-slate-300">所持MP <b className="text-white">{mpBalance.toLocaleString('ja-JP')}</b> / 30 MP</span>
              <div className="flex gap-2">
                <button type="button" onClick={onExit} disabled={purchasing} className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/5 disabled:opacity-40">戻る</button>
                <button type="button" onClick={() => void beginVoyage()} disabled={purchasing || noStar || mpBalance < 30} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">{purchasing ? '決済中…' : mpBalance < 30 ? 'MPが不足しています' : '30 MPで航行開始'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {started && (
        <>
          <div className="pointer-events-none absolute inset-0 z-10" style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,5,15,.26) 78%, rgba(0,3,10,.88) 100%)' }} />
          {viewMode === 'cockpit' && (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[15%] bg-gradient-to-b from-slate-950/45 via-slate-900/15 to-transparent" />
              <div className="pointer-events-none absolute left-0 top-[8%] z-10 h-[64%] w-[7%] border-r border-cyan-100/15 bg-gradient-to-r from-slate-950/65 to-transparent [clip-path:polygon(0_0,100%_8%,74%_100%,0_91%)] sm:w-[5%]" />
              <div className="pointer-events-none absolute right-0 top-[8%] z-10 h-[64%] w-[7%] border-l border-cyan-100/15 bg-gradient-to-l from-slate-950/65 to-transparent [clip-path:polygon(0_8%,100%_0,100%_91%,26%_100%)] sm:w-[5%]" />
              <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-[9%] w-[54%] -translate-x-1/2 rounded-b-[50%] border-b border-x border-cyan-100/20 bg-gradient-to-b from-slate-950/50 to-transparent" />
              <div className="pointer-events-none absolute bottom-[23%] left-1/2 z-10 h-[3%] w-[44%] -translate-x-1/2 rounded-t-full border-t border-cyan-100/20 bg-gradient-to-t from-slate-950/55 to-transparent sm:w-[35%]" />
            </>
          )}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-5">
            <div className="rounded-xl border border-cyan-200/20 bg-slate-950/55 px-3 py-2 backdrop-blur-md">
              <p className="text-[9px] font-black tracking-[.22em] text-cyan-200">{viewMode === 'chase' ? 'EXTERIOR TRACKING CAMERA' : 'VESSEL SYSTEMS · AUTO PILOT'}</p>
              <p className="mt-1 text-xs font-black">{system.name} · {starProfile?.label}</p>
              <p className="mt-1 text-[9px] font-bold text-cyan-100/80">船体 1 km · {orbitReadout}</p>
              <p className="mt-1 text-[9px] font-black tracking-wide text-amber-100">{destinationLabel}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-right backdrop-blur-md">
              <p className="text-[9px] font-bold text-slate-400">MISSION ELAPSED</p>
              <p className="mt-0.5 font-mono text-sm font-black tabular-nums">{formatClock(elapsed)}</p>
            </div>
          </div>

          <div className="pointer-events-auto absolute right-3 top-[15%] z-30 flex flex-col items-end gap-1.5 sm:right-5">
            <div className="flex overflow-hidden rounded-xl border border-cyan-100/20 bg-slate-950/75 shadow-lg backdrop-blur-md">
              <button
                type="button"
                aria-pressed={viewMode === 'cockpit'}
                onClick={() => selectViewMode('cockpit')}
                className={`px-3 py-2 text-[10px] font-black transition ${viewMode === 'cockpit' ? 'bg-cyan-300 text-slate-950' : 'text-slate-200 hover:bg-white/10'}`}
              >船内視点</button>
              <button
                type="button"
                aria-pressed={viewMode === 'chase'}
                onClick={() => selectViewMode('chase')}
                className={`px-3 py-2 text-[10px] font-black transition ${viewMode === 'chase' ? 'bg-cyan-300 text-slate-950' : 'text-slate-200 hover:bg-white/10'}`}
              >外部追跡カメラ</button>
            </div>
            <button type="button" onClick={resetFlightView} className="rounded-lg border border-white/15 bg-slate-950/70 px-3 py-1.5 text-[9px] font-bold text-slate-200 backdrop-blur-md">視点リセット</button>
            <p className="rounded-lg bg-slate-950/55 px-2 py-1 text-[9px] text-cyan-100/80 backdrop-blur-sm">画面をドラッグ／スワイプして見回す</p>
          </div>

          <div className="pointer-events-none absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-xl border border-cyan-200/15 bg-slate-950/35 p-3 backdrop-blur-sm sm:block">
            <p className="text-[8px] font-black tracking-[.18em] text-cyan-200">NAVIGATION</p>
            <p className="mt-1 text-[10px] font-bold">{activePhase?.label}</p>
            <div className="mt-2 h-1.5 w-36 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300 transition-[width]" style={{ width: (phaseProgress * 100) + '%' }} /></div>
            <p className="mt-1 text-[9px] text-slate-400">PHASE {phaseIndex + 1} / {STAR_SYSTEM_VOYAGE_PHASES.length}</p>
          </div>

          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-[25%] min-h-[118px] border-t border-cyan-100/20 bg-gradient-to-b from-slate-900/60 via-slate-950/90 to-black/98 backdrop-blur-[2px]">
            <div className="mx-auto flex h-full max-w-5xl items-center justify-between gap-3 px-4 pb-4 pt-3 sm:px-8">
              <div className="min-w-0">
                <p className="text-[8px] font-black tracking-[.22em] text-cyan-200">FLIGHT CONTROL</p>
                <p className="mt-1 max-w-[240px] text-sm font-black leading-5 sm:max-w-sm">{completed ? '星系周遊航行を完了しました' : activePhase?.label}</p>
                <p className="mt-1 text-[9px] text-slate-400">{completed ? '全航行フェーズを完了。帰還可能です。' : 'AUTOPILOT · ' + (highSpeedActive ? 'WARP / 0.27c' : 'SLOW ORBITAL MANEUVER')}</p>
              </div>
              <div className="hidden grid-cols-3 gap-2 text-right sm:grid">
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[8px] text-slate-500">DISTANCE UNIT</p><p className="mt-1 text-[10px] font-bold">10,000 km</p></div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[8px] text-slate-500">REMAINING</p><p className="mt-1 text-[10px] font-bold tabular-nums">{formatClock(remaining)}</p></div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[8px] text-slate-500">MP SPENT</p><p className="mt-1 text-[10px] font-bold">30 MP</p></div>
              </div>
              {completed && <button type="button" onClick={onExit} className="pointer-events-auto shrink-0 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-black text-slate-950">惑星視点へ戻る</button>}
            </div>
          </div>

          {!completed && highSpeedActive && (
            <div className="pointer-events-none absolute bottom-[27%] left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 text-[9px] text-cyan-100/80 sm:bottom-[28%]">
              <span className="h-1 w-1 rounded-full bg-cyan-200 shadow-[0_0_8px_#67e8f9]" />
              {activePhase?.label}
              <span className="font-mono tabular-nums">{Math.round(phaseProgress * 100)}%</span>
            </div>
          )}

          {viewMode === 'cockpit' && (
            <>
              <div className="pointer-events-none absolute inset-x-[8%] bottom-[22%] z-10 h-[1px] bg-gradient-to-r from-transparent via-cyan-200/35 to-transparent sm:inset-x-[18%]" />
              <div className="pointer-events-none absolute left-1/2 top-[46%] z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/35 opacity-65">
                <span className="absolute left-1/2 top-0 h-1 w-px -translate-x-1/2 bg-cyan-100/80" />
                <span className="absolute bottom-0 left-1/2 h-1 w-px -translate-x-1/2 bg-cyan-100/80" />
                <span className="absolute left-0 top-1/2 h-px w-1 -translate-y-1/2 bg-cyan-100/80" />
                <span className="absolute right-0 top-1/2 h-px w-1 -translate-y-1/2 bg-cyan-100/80" />
              </div>
            </>
          )}
          {!completed && <button type="button" onClick={onExit} className="pointer-events-auto absolute bottom-[27%] right-3 z-30 rounded-lg border border-white/15 bg-slate-950/75 px-3 py-2 text-[10px] font-bold text-slate-200 backdrop-blur-md sm:right-5">航行を終了</button>}
        </>
      )}
    </div>
  );
}
