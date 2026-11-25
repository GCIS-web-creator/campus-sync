'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getPlanetSystemSpec, STAR_PROFILES } from '@/lib/planet-system-catalog';
import { createMoonCelestialDetail, createStarCelestialDetail, type CelestialDetail } from '@/lib/planet-celestial-details';
import VerdiaGroundView from '@/components/planet-world/VerdiaGroundView';
import StarSystemVoyage from '@/components/planet-world/StarSystemVoyage';

type Props = {
  stage: number;
  planetAssetId?: string;
  mpBalance: number;
  onStartStarTravel: (travelId: string) => Promise<{ success: boolean; balance?: number; message?: string }>;
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

function createCloudTexture(seed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const random = seeded(seed + 97);
  for (let index = 0; index < 230; index += 1) {
    const x = random() * canvas.width; const y = random() * canvas.height;
    const width = 18 + random() * 82; const height = 5 + random() * 22;
    context.save(); context.translate(x, y); context.rotate((random() - 0.5) * 0.9);
    context.fillStyle = 'rgba(255,255,255,' + (0.06 + random() * 0.16).toFixed(3) + ')';
    context.shadowColor = 'rgba(255,255,255,0.55)'; context.shadowBlur = 10 + random() * 16;
    context.beginPath(); context.ellipse(0, 0, width, height, 0, 0, Math.PI * 2); context.fill(); context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.RepeatWrapping; texture.needsUpdate = true;
  return texture;
}

function createCityLightsTexture(seed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 1024;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const random = seeded(seed + 191);
  const clusters = 12 + Math.floor(random() * 14);
  for (let cluster = 0; cluster < clusters; cluster += 1) {
    const centerX = random() * canvas.width; const centerY = canvas.height * (0.2 + random() * 0.6);
    const count = 18 + Math.floor(random() * 62);
    for (let light = 0; light < count; light += 1) {
      const angle = random() * Math.PI * 2; const distance = Math.pow(random(), 1.6) * (18 + random() * 80);
      const x = (centerX + Math.cos(angle) * distance + canvas.width) % canvas.width;
      const y = Math.max(0, Math.min(canvas.height, centerY + Math.sin(angle) * distance * 0.55));
      context.fillStyle = 'rgba(255,' + Math.floor(165 + random() * 78) + ',105,' + (0.35 + random() * 0.65).toFixed(2) + ')';
      context.beginPath(); context.arc(x, y, 0.7 + random() * 1.7, 0, Math.PI * 2); context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.RepeatWrapping; texture.needsUpdate = true;
  return texture;
}

function createMoonTexture(seed: number, base: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const random = seeded(seed + 307);
  context.fillStyle = base; context.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 320; index += 1) {
    const x = random() * canvas.width; const y = random() * canvas.height;
    const radius = 1 + Math.pow(random(), 2) * 14;
    context.fillStyle = random() > 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.19)';
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
    context.strokeStyle = 'rgba(0,0,0,0.15)'; context.lineWidth = 1; context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.RepeatWrapping; texture.needsUpdate = true;
  return texture;
}

function createGlowTexture(color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, color); gradient.addColorStop(0.18, color + 'cc');
  gradient.addColorStop(0.48, color + '55'); gradient.addColorStop(1, color + '00');
  context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function createSolarCoronaTexture(color: string, seed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const random = seeded(seed + 503);
  const rgb = new THREE.Color(color);
  const red = Math.round(rgb.r * 255);
  const green = Math.round(rgb.g * 255);
  const blue = Math.round(rgb.b * 255);

  // A bright stellar core fading into a broad, coloured corona.
  const glow = context.createRadialGradient(256, 256, 2, 256, 256, 250);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.035, 'rgba(' + red + ',' + green + ',' + blue + ',0.98)');
  glow.addColorStop(0.12, 'rgba(' + red + ',' + green + ',' + blue + ',0.66)');
  glow.addColorStop(0.28, 'rgba(' + red + ',' + green + ',' + blue + ',0.28)');
  glow.addColorStop(0.52, 'rgba(' + red + ',' + green + ',' + blue + ',0.09)');
  glow.addColorStop(0.78, 'rgba(' + red + ',' + green + ',' + blue + ',0.025)');
  glow.addColorStop(1, 'rgba(' + red + ',' + green + ',' + blue + ',0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 512, 512);

  // Fine, uneven coronal streamers instead of a simple uniform blur.
  for (let ray = 0; ray < 230; ray += 1) {
    const angle = random() * Math.PI * 2;
    const inner = 54 + random() * 34;
    const outer = 125 + random() * 125;
    const bend = (random() - 0.5) * 48;
    const alpha = 0.035 + random() * 0.16;
    const startX = 256 + Math.cos(angle) * inner;
    const startY = 256 + Math.sin(angle) * inner;
    const endX = 256 + Math.cos(angle) * outer;
    const endY = 256 + Math.sin(angle) * outer;
    const controlX = 256 + Math.cos(angle) * (inner + outer) * 0.5 - Math.sin(angle) * bend;
    const controlY = 256 + Math.sin(angle) * (inner + outer) * 0.5 + Math.cos(angle) * bend;
    context.beginPath();
    context.moveTo(startX, startY);
    context.quadraticCurveTo(controlX, controlY, endX, endY);
    context.strokeStyle = 'rgba(' + red + ',' + green + ',' + blue + ',' + alpha.toFixed(3) + ')';
    context.lineWidth = 0.5 + random() * 1.8;
    context.stroke();
  }

  // Long, soft prominences and delicate loops around the stellar limb.
  for (let arc = 0; arc < 34; arc += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 104 + random() * 70;
    const span = 0.12 + random() * 0.5;
    context.beginPath();
    context.ellipse(256, 256, radius, radius * (0.78 + random() * 0.34), angle, -span, span);
    context.strokeStyle = 'rgba(' + red + ',' + green + ',' + blue + ',' + (0.025 + random() * 0.09).toFixed(3) + ')';
    context.lineWidth = 0.7 + random() * 1.4;
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStarField(seed: number) {
  const random = seeded(seed + 701);
  const positions: number[] = []; const colors: number[] = [];
  const colorChoices = [0xc4d8ff, 0xffe4c3, 0xffffff, 0xffc6a6, 0xb9f0ff];
  for (let index = 0; index < 1450; index += 1) {
    const y = random() * 2 - 1; const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(1 - y * y); const distance = 44 + random() * 22;
    positions.push(Math.cos(angle) * radius * distance, y * distance, Math.sin(angle) * radius * distance);
    const color = new THREE.Color(colorChoices[Math.floor(random() * colorChoices.length)]);
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.12, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false }));
}

function createFallbackSurfaceTexture(seed: number, atmosphereColor: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const random = seeded(seed + 11);
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#172a45'); gradient.addColorStop(0.52, atmosphereColor); gradient.addColorStop(1, '#142338');
  context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 150; index += 1) {
    const x = random() * canvas.width; const y = random() * canvas.height; const radius = 8 + random() * 70;
    context.fillStyle = random() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(5,15,35,0.12)';
    context.beginPath(); context.ellipse(x, y, radius, radius * (0.2 + random() * 0.5), random() * Math.PI, 0, Math.PI * 2); context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.RepeatWrapping; texture.needsUpdate = true;
  return texture;
}

function makeAtmosphere(radius: number, color: string) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.045, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: { uAtmosphereColor: { value: new THREE.Color(color) } },
      vertexShader: [
        'varying vec3 vWorldNormal;', 'varying vec3 vViewDirection;',
        'void main() {',
        '  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
        '  vWorldNormal = normalize(mat3(modelMatrix) * normal);',
        '  vViewDirection = normalize(cameraPosition - worldPosition.xyz);',
        '  gl_Position = projectionMatrix * viewMatrix * worldPosition;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uAtmosphereColor;', 'varying vec3 vWorldNormal;', 'varying vec3 vViewDirection;',
        'void main() {',
        '  float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), normalize(vViewDirection)), 0.0), 2.45);',
        '  float alpha = smoothstep(0.02, 0.95, fresnel) * 0.48;',
        '  gl_FragColor = vec4(uAtmosphereColor, alpha);',
        '}',
      ].join('\n'),
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
}

function addOrbitAndMoon(scene: THREE.Scene, index: number, seed: number, moonColor: string, resources: Array<{ dispose: () => void }>) {
  // Wider, visibly separated lunar orbits. The third moon is deliberately much farther out.
  const orbitRadii = [6.5, 10.5, 15.5];
  const orbitRadius = orbitRadii[index] ?? (15.5 + (index - 2) * 5);
  const plane = new THREE.Group();
  plane.rotation.set(0.2 + index * 0.27, index * 0.63, 0.62 + index * 0.41);
  const orbitPoints: THREE.Vector3[] = [];
  for (let point = 0; point < 128; point += 1) {
    const angle = point / 128 * Math.PI * 2;
    orbitPoints.push(new THREE.Vector3(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius));
  }
  const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
  const orbitMaterial = new THREE.LineBasicMaterial({ color: 0xa9c6e8, transparent: true, opacity: 0.2, depthWrite: false });
  plane.add(new THREE.LineLoop(orbitGeometry, orbitMaterial));
  resources.push(orbitGeometry, orbitMaterial);

  const moonRadius = 0.095 + (seeded(seed + index * 31)() * 0.045);
  const moonGeometry = new THREE.SphereGeometry(moonRadius, 28, 20);
  const moonTexture = createMoonTexture(seed + index * 13, moonColor);
  const moonMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', map: moonTexture, bumpMap: moonTexture, bumpScale: 0.035, roughness: 0.98, metalness: 0.01 });
  const moon = new THREE.Mesh(moonGeometry, moonMaterial);
  moon.position.set(orbitRadius, 0, 0);
  plane.add(moon);
  scene.add(plane);
  resources.push(moonGeometry, moonMaterial, moonTexture);
  return { plane, moon, speed: 0.16 / (1 + index * 0.58) * (index % 2 === 0 ? 1 : -1), orbitRadius, moonRadius };
}

export default function Planet3DPanel({ stage, planetAssetId = 'planet-001', mpBalance, onStartStarTravel }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [viewMode, setViewMode] = useState<'orbit'|'ground'|'voyage'>('orbit');
  const viewModeRef = useRef<'orbit'|'ground'|'voyage'>('orbit');
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [groundLanding, setGroundLanding] = useState(false);
  const [selectedCelestial, setSelectedCelestial] = useState<CelestialDetail | null>(null);
  const returnToPlanetRef = useRef<() => void>(() => {});
  const spec = getPlanetSystemSpec(planetAssetId);
  const numericId = Number.parseInt(spec.id.slice(-3), 10) || 1;

  useEffect(() => {
    // Keep only one active WebGL context: the ground renderer or the voyage renderer
    // replaces this orbital renderer while its mode is active.
    if (viewMode !== 'orbit') return;
    const mount = mountRef.current;
    if (!mount) return;
    setRendererFailed(false);
    setSelectedCelestial(null);
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setRendererFailed(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor('#050914', 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050914');
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 3000);
    const defaultCameraPosition = new THREE.Vector3(0.1, 0.42, 10.5);
    camera.position.copy(defaultCameraPosition);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 0.55;
    controls.maxDistance = 1400;
    controls.autoRotate = false;

    const resources: Array<{ dispose: () => void }> = [];
    const interactiveTargets: THREE.Object3D[] = [];
    let cameraTransition: {
      startedAt: number;
      duration: number;
      fromPosition: THREE.Vector3;
      controlPositionA: THREE.Vector3;
      controlPositionB: THREE.Vector3;
      fromTarget: THREE.Vector3;
      toPosition: THREE.Vector3;
      toTarget: THREE.Vector3;
    } | null = null;
    const moveCameraSmoothly = (target: THREE.Vector3, position: THREE.Vector3) => {
      const fromPosition = camera.position.clone();
      const travel = position.clone().sub(fromPosition);
      const side = new THREE.Vector3().crossVectors(travel, new THREE.Vector3(0, 1, 0));
      if (side.lengthSq() < 0.001) side.crossVectors(travel, new THREE.Vector3(1, 0, 0));
      side.normalize();
      const arcOffset = Math.min(18, Math.max(2.5, travel.length() * 0.02));
      const arc = side.multiplyScalar(arcOffset);
      cameraTransition = {
        startedAt: performance.now(),
        duration: 1450,
        fromPosition,
        controlPositionA: fromPosition.clone().add(arc),
        controlPositionB: position.clone().add(arc),
        fromTarget: controls.target.clone(),
        toPosition: position.clone(),
        toTarget: target.clone(),
      };
      controls.enabled = false;
    };
    const starField = createStarField(numericId);
    scene.add(starField);
    resources.push(starField.geometry, starField.material);

    const system = new THREE.Group();
    scene.add(system);
    scene.add(new THREE.AmbientLight('#8298bd', spec.rogue ? 0.42 : 0.22));

    const planetRadius = 1.52;
    const surfaceGeometry = new THREE.SphereGeometry(planetRadius, 112, 80);
    const loader = new THREE.TextureLoader();
    const fallbackTexture = createFallbackSurfaceTexture(numericId, spec.atmosphereColor);
    let surfaceMaterial: THREE.MeshStandardMaterial;
    const surfaceTexture = loader.load(
      '/planet-assets/planets/' + spec.id + (numericId >= 11 && numericId <= 20 ? '/surface.webp' : '/surface.jpg'),
      (loaded) => {
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.ClampToEdgeWrapping;
        loaded.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        loaded.needsUpdate = true;
      },
      undefined,
      () => { surfaceMaterial.map = fallbackTexture; surfaceMaterial.needsUpdate = true; },
    );
    surfaceTexture.colorSpace = THREE.SRGBColorSpace;
    surfaceTexture.wrapS = THREE.RepeatWrapping;
    surfaceTexture.wrapT = THREE.ClampToEdgeWrapping;

    const cityTexture = createCityLightsTexture(numericId);
    surfaceMaterial = new THREE.MeshStandardMaterial({
      map: surfaceTexture, roughness: 0.9, metalness: 0.025,
      emissive: spec.rogue ? '#291c48' : '#000000',
      emissiveIntensity: spec.rogue ? 0.12 : 0,
    });

    const sunPositions: THREE.Vector3[] = [];
    if (!spec.rogue) {
      spec.starClasses.forEach((starClass, index) => {
        const profile = STAR_PROFILES[starClass];
        // 恒星は惑星直径の数百倍離れた背景に置く。見えるのは小さな光球と広がるコロナ。
        const direction = index === 0
          ? new THREE.Vector3(0.20 + (numericId % 4) * 0.004, 0.17 + (numericId % 3) * 0.003, -1).normalize()
          : new THREE.Vector3(-0.23, 0.16, -1).normalize();
        const stellarDistance = index === 0 ? 920 : 1080;
        const position = direction.clone().multiplyScalar(stellarDistance);
        sunPositions.push(direction.clone());

        // 光球は1px前後の小ささに抑え、コロナとプロミネンスを見せる。
        const starCoreRadius = 1.6 * profile.radius;
        const star = new THREE.Mesh(
          new THREE.SphereGeometry(starCoreRadius, 32, 24),
          new THREE.MeshBasicMaterial({ color: profile.lightColor, toneMapped: false }),
        );
        star.position.copy(position);
        scene.add(star);
        resources.push(star.geometry, star.material);

        const starHit = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(24, starCoreRadius * 14), 18, 14),
          new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
        );
        starHit.position.copy(position);
        starHit.userData.celestialInfo = createStarCelestialDetail({
          id: 'star-' + index,
          systemName: spec.name,
          starClass,
          starLabel: profile.label,
          temperature: profile.temperature,
          planetId: numericId,
          starIndex: index,
          starCount: spec.starClasses.length,
        });
        scene.add(starHit);
        interactiveTargets.push(starHit);
        resources.push(starHit.geometry, starHit.material);

        const coronaTexture = createSolarCoronaTexture(profile.color, numericId * 17 + index);
        const coronaMaterial = new THREE.SpriteMaterial({
          map: coronaTexture,
          color: '#ffffff',
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          depthTest: true,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        });
        const corona = new THREE.Sprite(coronaMaterial);
        corona.position.copy(position);
        corona.scale.setScalar(92 + profile.radius * 12);
        corona.renderOrder = 3;
        scene.add(corona);
        resources.push(corona.material, coronaTexture);

        const haloTexture = createGlowTexture(profile.color);
        const haloMaterial = new THREE.SpriteMaterial({
          map: haloTexture,
          color: profile.color,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
          depthTest: true,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        });
        const halo = new THREE.Sprite(haloMaterial);
        halo.position.copy(position);
        halo.scale.setScalar(128 + profile.radius * 16);
        halo.renderOrder = 2;
        scene.add(halo);
        resources.push(halo.material, haloTexture);

        const light = new THREE.DirectionalLight(profile.lightColor, profile.intensity);
        light.position.copy(position);
        light.target.position.set(0, 0, 0);
        scene.add(light, light.target);
      });
    }

    const primarySunDirection = sunPositions[0] || new THREE.Vector3(0, 0, 0);
    const secondarySunDirection = sunPositions[1] || primarySunDirection;
    surfaceMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uCampusSunDirectionA = { value: primarySunDirection.clone() };
      shader.uniforms.uCampusSunDirectionB = { value: secondarySunDirection.clone() };
      shader.uniforms.uCampusHasSecondSun = { value: sunPositions.length > 1 ? 1 : 0 };
      shader.uniforms.uCampusCityLights = { value: cityTexture };
      shader.uniforms.uCampusNightGlow = { value: spec.rogue ? 0 : Math.max(0, Math.min(1.5, stage * 0.22)) };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCampusWorldNormal;');
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCampusWorldNormal = normalize(mat3(modelMatrix) * normal);');
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uCampusSunDirectionA;\nuniform vec3 uCampusSunDirectionB;\nuniform float uCampusHasSecondSun;\nuniform sampler2D uCampusCityLights;\nuniform float uCampusNightGlow;\nvarying vec3 vCampusWorldNormal;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        [
          '#include <emissivemap_fragment>',
          'float campusSunA = dot(normalize(vCampusWorldNormal), normalize(uCampusSunDirectionA));',
          'float campusSunB = dot(normalize(vCampusWorldNormal), normalize(uCampusSunDirectionB));',
          'float campusSunFacing = max(campusSunA, mix(-1.0, campusSunB, uCampusHasSecondSun));',
          'float campusNightMask = 1.0 - smoothstep(-0.11, 0.13, campusSunFacing);',
          'vec4 campusCity = texture2D(uCampusCityLights, vMapUv);',
          'totalEmissiveRadiance += campusCity.rgb * campusCity.a * campusNightMask * uCampusNightGlow;',
        ].join('\n'),
      );
    };
    surfaceMaterial.customProgramCacheKey = () => 'campussync-distant-star-corona-wide-moon-orbits-v2';

    const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
    system.add(surface);
    resources.push(surfaceGeometry, surfaceMaterial, surfaceTexture, fallbackTexture, cityTexture);

    const cloudTexture = createCloudTexture(numericId);
    const cloudMaterial = new THREE.MeshStandardMaterial({ map: cloudTexture, transparent: true, opacity: 0.5, roughness: 1, metalness: 0, depthWrite: false, side: THREE.FrontSide });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 1.012, 96, 64), cloudMaterial);
    clouds.rotation.set(0.1, numericId * 0.31, 0.03);
    system.add(clouds);
    resources.push(clouds.geometry, cloudMaterial, cloudTexture);

    const atmosphere = makeAtmosphere(planetRadius, spec.atmosphereColor);
    system.add(atmosphere);
    resources.push(atmosphere.geometry, atmosphere.material);

    if (spec.hasRings) {
      const ringGeometry = new THREE.RingGeometry(planetRadius * 1.58, planetRadius * 2.45, 144);
      const ringMaterial = new THREE.MeshStandardMaterial({ color: '#b8c4da', side: THREE.DoubleSide, transparent: true, opacity: 0.48, roughness: 0.9, metalness: 0.12, depthWrite: false });
      const rings = new THREE.Mesh(ringGeometry, ringMaterial);
      rings.rotation.x = Math.PI * 0.42;
      rings.rotation.y = 0.18;
      system.add(rings);
      resources.push(ringGeometry, ringMaterial);
    }

    const satelliteColors = ['#9fa8b8', '#b7aa94', '#91b6c7'];
    const moons = Array.from({ length: spec.moonCount }, (_, index) => addOrbitAndMoon(scene, index, numericId, satelliteColors[index % satelliteColors.length], resources));
    moons.forEach((moon, index) => {
      const hitTarget = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.52, moon.moonRadius * 5), 18, 14),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
      );
      hitTarget.userData.celestialInfo = createMoonCelestialDetail({
        id: 'moon-' + index,
        systemName: spec.name,
        moonIndex: index,
        moonRadius: moon.moonRadius,
        orbitRadius: moon.orbitRadius,
      });
      moon.moon.add(hitTarget);
      interactiveTargets.push(hitTarget);
      resources.push(hitTarget.geometry, hitTarget.material);
    });

    if (spec.rogue) {
      const internalGlow = new THREE.PointLight('#9c74ff', 0.8, 5.2, 2);
      internalGlow.position.set(-0.8, -0.35, 0.35);
      system.add(internalGlow);
    }

    const raycaster = new THREE.Raycaster();
    const pointerStart = new THREE.Vector2();
    const pointerEnd = new THREE.Vector2();
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerStart.set(event.clientX, event.clientY);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerEnd.set(event.clientX, event.clientY);
      if (pointerStart.distanceTo(pointerEnd) > 8) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const pointer = new THREE.Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld();
      raycaster.setFromCamera(pointer, camera);
      const planetOcclusion = raycaster.intersectObject(surface, false)[0];
      const intersections = raycaster.intersectObjects(interactiveTargets, true);
      const hit = intersections.find(item => item.object.userData.celestialInfo && (!planetOcclusion || item.distance < planetOcclusion.distance));
      if (!hit) return;
      const detail = hit.object.userData.celestialInfo as CelestialDetail | undefined;
      if (!detail) return;
      const bodyPosition = hit.object.getWorldPosition(new THREE.Vector3());
      const radial = bodyPosition.lengthSq() > 0 ? bodyPosition.clone().normalize() : new THREE.Vector3(0, 0, 1);
      const cameraPosition = detail.kind === 'star'
        ? bodyPosition.clone().sub(radial.multiplyScalar(22))
        : bodyPosition.clone().add(radial.multiplyScalar( Math.max(0.85, bodyPosition.distanceTo(new THREE.Vector3()) * 0.025) ));
      setSelectedCelestial(detail);
      moveCameraSmoothly(bodyPosition, cameraPosition);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    const restorePlanetView = () => {
      setSelectedCelestial(null);
      moveCameraSmoothly(new THREE.Vector3(0, 0, 0), defaultCameraPosition);
    };
    returnToPlanetRef.current = restorePlanetView;

    const clock = new THREE.Clock();
    let frame = 0;
    let active = true;
    const render = () => {
      if (!active) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      // 自転は惑星自身の座標系で進み、太陽光源の座標は変えない。
      system.rotation.y += delta * (spec.rogue ? 0.006 : 0.012);
      clouds.rotation.y += delta * 0.017;
      moons.forEach((moon) => {
        moon.plane.rotation.y += delta * moon.speed;
        moon.moon.rotation.y += delta * 0.12;
      });
      if (cameraTransition) {
        const progress = Math.min(1, (performance.now() - cameraTransition.startedAt) / cameraTransition.duration);
        const eased = progress * progress * (3 - 2 * progress);
        const reverse = 1 - eased;
        camera.position.set(0, 0, 0)
          .addScaledVector(cameraTransition.fromPosition, reverse * reverse * reverse)
          .addScaledVector(cameraTransition.controlPositionA, 3 * reverse * reverse * eased)
          .addScaledVector(cameraTransition.controlPositionB, 3 * reverse * eased * eased)
          .addScaledVector(cameraTransition.toPosition, eased * eased * eased);
        controls.target.lerpVectors(cameraTransition.fromTarget, cameraTransition.toTarget, eased);
        if (progress >= 1) {
          cameraTransition = null;
          controls.enabled = true;
          controls.update();
        }
      } else {
        controls.update();
      }
      if (viewModeRef.current === 'orbit') renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();

    const resize = () => {
      if (!active || !mount) return;
      const nextWidth = Math.max(1, mount.clientWidth);
      const nextHeight = Math.max(1, mount.clientHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      returnToPlanetRef.current = () => {};
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [numericId, spec, stage, planetAssetId, viewMode]);

  const closeCelestialDetails = () => setSelectedCelestial(null);
  const returnToPlanet = () => returnToPlanetRef.current();

  const starSummary = spec.rogue ? '自由浮遊惑星 · 近傍恒星なし' : spec.starClasses.map((starClass) => STAR_PROFILES[starClass].label).join(' ＋ ');

  return (
    <section className="relative min-h-[340px] overflow-hidden rounded-[26px] border border-slate-700/80 bg-[#050914] text-white shadow-[0_18px_60px_rgba(2,6,23,0.26)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4">
        <div className="rounded-xl border border-white/10 bg-slate-950/65 px-3 py-2 backdrop-blur-md">
          <p className="text-[9px] font-black tracking-[.2em] text-cyan-300">STELLAR SYSTEM</p>
          <p className="mt-1 text-xs font-bold text-white">{spec.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 pointer-events-auto">
            <button type="button" onClick={()=>{setViewMode('orbit');setGroundLanding(false);setSelectedCity('');}} className={'rounded-lg px-2 py-1 text-[10px] font-bold '+(viewMode==='orbit'?'bg-cyan-500 text-slate-950':'bg-white/10 text-white')}>惑星視点</button>
            <button type="button" onClick={()=>{setViewMode('ground');setGroundLanding(false);}} className={'rounded-lg px-2 py-1 text-[10px] font-bold '+(viewMode==='ground'?'bg-cyan-500 text-slate-950':'bg-white/10 text-white')}>地上視点</button>
            <button type="button" onClick={()=>{setSelectedCelestial(null);setViewMode('voyage');}} className={'rounded-lg px-2 py-1 text-[10px] font-black '+(viewMode==='voyage'?'bg-cyan-300 text-slate-950':'bg-cyan-300/15 text-cyan-100')}>星系旅行 · 30MP</button>
            <span className="rounded-lg border border-white/10 bg-slate-950/50 px-2 py-1 text-[9px] font-bold text-cyan-100">所持 {mpBalance.toLocaleString('ja-JP')} MP</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/65 px-3 py-2 text-right backdrop-blur-md">
          <p className="text-[10px] font-bold text-amber-200">{starSummary}</p>
          <p className="mt-1 text-[9px] text-slate-400">{spec.moonCount} MOON{spec.moonCount > 1 ? 'S' : ''}</p>
        </div>
      </div>
      <div ref={mountRef} className="absolute inset-0" aria-label="太陽光源・衛星を含む3D惑星表示" />
      {viewMode==='ground' && numericId !== 6 && <div className="absolute inset-0 z-20 overflow-hidden" style={{background:'linear-gradient(180deg, '+spec.atmosphereColor+' 0%, '+spec.atmosphereColor+'99 28%, #14202b 52%, #0a1119 100%)'}}>
        <div className="absolute inset-0 opacity-60" style={{background:'radial-gradient(circle at 70% 20%, rgba(255,255,255,.35), transparent 30%),linear-gradient(180deg,transparent 55%,rgba(0,0,0,.35))'}}/>
        <div className="absolute left-[12%] top-[26%] h-[35%] w-[20%] rounded-t-[40%] bg-black/20 blur-3xl"/>
        <div className="absolute right-[10%] top-[18%] h-[38%] w-[30%] rounded-full bg-white/10 blur-3xl"/>
        <div className="absolute inset-x-0 bottom-0 h-[43%] perspective-[900px]">
          <div className="absolute inset-x-[-20%] bottom-[-18%] h-[130%] origin-bottom rotate-x-[62deg]" style={{background:'repeating-linear-gradient(90deg,rgba(255,255,255,.06) 0 1px,transparent 1px 55px),repeating-linear-gradient(0deg,rgba(255,255,255,.06) 0 1px,transparent 1px 42px),linear-gradient(180deg,#263746,#101820)',boxShadow:'inset 0 18px 90px rgba(0,0,0,.65)'}}/>
        </div>
        <div className="absolute inset-x-0 bottom-[26%] flex items-end justify-center gap-1 px-2" style={{filter:'drop-shadow(0 14px 18px rgba(0,0,0,.4))'}}>
          {Array.from({length:24},(_,i)=>{const height=45+(i*37+numericId*13)%140;return <div key={i} className="relative flex-1 max-w-[48px] rounded-t-sm border border-white/10" style={{height,background:'linear-gradient(90deg,#101d2b,#334b60,#172538)',opacity:.82}}><div className="absolute inset-x-1 top-2 grid grid-cols-2 gap-1">{Array.from({length:Math.max(2,Math.floor(height/16))},(_,w)=><i key={w} className="h-1 rounded-sm" style={{background:spec.atmosphereColor,opacity:.85}}/>)}</div></div>})}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[25%]" style={{background:'linear-gradient(180deg,#263746,#111b23)'}}/>
        <div className="absolute left-3 bottom-3 right-3 z-30 rounded-2xl border border-white/15 bg-slate-950/70 p-3 backdrop-blur-md">
          <p className="text-xs font-black">地上の都市を選択</p><p className="mt-1 text-[10px] text-slate-300">大気の色・重力・地表環境を反映した景観プレビュー。都市へ降り立つ準備。</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{["Aurora Reach","Glassfield","Ember Haven","Tidal Arc","Nova Suburb"].map(city=><button key={city} type="button" onClick={()=>setSelectedCity(city)} className={'rounded-lg border px-2 py-1.5 text-[10px] font-bold '+(selectedCity===city?'border-cyan-400 bg-cyan-400/20 text-cyan-100':'border-white/10 bg-white/5 text-slate-200')}>{city}</button>)}</div>
          <button type="button" disabled={!selectedCity} onClick={()=>setGroundLanding(true)} className="mt-2 w-full rounded-xl bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-40">{selectedCity?selectedCity+' に降り立つ':'都市を選んでください'}</button>
          {groundLanding&&<p className="mt-2 rounded-lg bg-white/10 px-2 py-1.5 text-[10px]">降下先：{selectedCity} ・ {spec.rogue?'恒星光のない環境に合わせた人工照明と断熱居住区':'近未来の郊外居住区'}（景観プレビュー）</p>}
        </div>
      </div>}
      {viewMode==='ground' && numericId === 6 && <VerdiaGroundView atmosphereColor={spec.atmosphereColor} stage={stage} onBack={()=>{setViewMode('orbit');setGroundLanding(false);setSelectedCity('');}} />}
      {viewMode==='voyage' && <StarSystemVoyage system={spec} starClass={spec.starClasses[0] ?? null} mpBalance={mpBalance} onPurchase={onStartStarTravel} onExit={()=>setViewMode('orbit')}/>} 
      {rendererFailed && <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-slate-300">この端末では3D表示を初期化できませんでした。ブラウザのWebGL設定を確認してください。</div>}
      {selectedCelestial && <div className="absolute bottom-3 left-3 right-3 z-20 max-h-[62%] overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/90 p-3 text-white shadow-2xl backdrop-blur-xl sm:bottom-4 sm:left-4 sm:right-auto sm:w-[min(440px,calc(100%-2rem))] sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-[9px] font-black tracking-[.18em] text-cyan-300">{selectedCelestial.kind === 'star' ? 'STELLAR OBJECT' : 'NATURAL SATELLITE'}</p><h3 className="mt-1 text-base font-black">{selectedCelestial.name}</h3><p className="mt-1 text-[10px] text-slate-400">{selectedCelestial.subtitle}</p></div>
          <button type="button" onClick={closeCelestialDetails} aria-label="天体の説明を閉じる" className="rounded-lg border border-white/15 px-2.5 py-1.5 text-sm text-slate-300 hover:bg-white/10">×</button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[['直径', selectedCelestial.diameter], ['公転周期', selectedCelestial.orbitalPeriod], ['自転周期', selectedCelestial.rotationPeriod], ['温度', selectedCelestial.temperature]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-2"><p className="text-[9px] font-bold text-slate-400">{label}</p><p className="mt-1 text-[10px] font-semibold leading-4">{value}</p></div>)}
        </div>
        <div className="mt-2 rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-2.5"><p className="text-[9px] font-black text-cyan-200">人が住める可能性</p><p className="mt-1 text-[10px] leading-5 text-slate-200">{selectedCelestial.habitability}</p></div>
        <p className="mt-2 text-[10px] leading-5 text-slate-300">{selectedCelestial.description}</p>
        <p className="mt-2 text-[9px] leading-4 text-slate-500">表示値は架空の惑星系シミュレーション用推定値です。実在する天体の観測データではありません。</p>
        <button type="button" onClick={returnToPlanet} className="mt-3 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[11px] font-bold text-white hover:bg-white/15">惑星全体に戻る</button>
      </div>}
      {!selectedCelestial && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-end p-4">
        <p className="rounded-lg bg-slate-950/55 px-2.5 py-1.5 text-[9px] text-slate-400 backdrop-blur-md">天体をタップ：詳細表示・接近 · ドラッグ：視点変更 · ホイール：ズーム</p>
      </div>}
    </section>
  );
}
