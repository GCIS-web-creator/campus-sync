'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { applyMoonSurfaceDetail, applyPlanetSurfaceDetail } from '@/components/planet-world/celestial-surface-detail';
import { createGalaxyBackdrop } from '@/components/planet-world/galaxy-backdrop';
import { createStellarCoronaMaterial, createStellarSurfaceMaterial } from '@/components/planet-world/stellar-surface-shader';
import type { PlanetSystemSpec, StarClass } from '@/lib/planet-system-catalog';
import { STAR_PROFILES } from '@/lib/planet-system-catalog';
import {
  FREE_FLIGHT_DELTA_V_BUDGET_KM_S,
  FREE_FLIGHT_ENGINE_ACCELERATION_KM_S2,
  FREE_FLIGHT_REFERENCE_MOON_DISTANCE_KM,
  FREE_FLIGHT_REFERENCE_MOON_MU_KM3_S2,
  FREE_FLIGHT_REFERENCE_MOON_RADIUS_KM,
  FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2,
  FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM,
  FREE_FLIGHT_START_ALTITUDE_KM,
  createInitialFreeFlightMotionState,
  stepFreeFlightMotion,
  type FreeFlightMotionState,
  type GravitySource,
} from '@/lib/planet-free-flight-physics';

type Props = {
  system: PlanetSystemSpec;
  starClass: StarClass | null;
  onExit: () => void;
};

type CameraMode = 'cockpit' | 'chase' | 'inspection';
type HudState = {
  speed: number;
  altitude: number;
  acceleration: number;
  moonDistance: number | null;
  deltaV: number;
  throttle: number;
  status: string;
};

const KM_PER_SCENE_UNIT = 1_000;
const metersToSceneUnits = (meters: number) => meters / (KM_PER_SCENE_UNIT * 1_000);
const CRAFT_VISUAL_LENGTH = 0.00025; // Approximately 100 m nose-to-tail at the current geometry scale.

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

function makePlanetTexture(seed: number, atmosphereColor: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 768;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const random = seeded(seed + 2_037);
  const ocean = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  ocean.addColorStop(0, '#102e49');
  ocean.addColorStop(0.48, '#176078');
  ocean.addColorStop(1, '#071d37');
  context.fillStyle = ocean;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const land = ['#6f9674', '#8f9b72', '#b1a17d', '#466f65', '#a9a078'];
  for (let continent = 0; continent < 18; continent += 1) {
    const centerX = random() * canvas.width;
    const centerY = canvas.height * (0.18 + random() * 0.64);
    const radiusX = 25 + random() * 115;
    const radiusY = 16 + random() * 74;
    context.beginPath();
    for (let point = 0; point <= 80; point += 1) {
      const angle = point / 80 * Math.PI * 2;
      const irregular = 0.76 + random() * 0.24 + Math.sin(angle * 5 + continent) * 0.08;
      const x = centerX + Math.cos(angle) * radiusX * irregular;
      const y = centerY + Math.sin(angle) * radiusY * irregular;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = land[Math.floor(random() * land.length)];
    context.fill();
    context.strokeStyle = 'rgba(202,221,175,0.22)';
    context.lineWidth = 3;
    context.stroke();
  }

  for (let cloud = 0; cloud < 260; cloud += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    context.save();
    context.translate(x, y);
    context.rotate((random() - 0.5) * 0.45);
    context.fillStyle = 'rgba(239,247,255,' + (0.018 + random() * 0.075).toFixed(3) + ')';
    context.beginPath();
    context.ellipse(0, 0, 12 + random() * 95, 2 + random() * 15, 0, 0, Math.PI * 2);
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


function makeCloudTexture(seed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const random = seeded(seed + 97);
  for (let index = 0; index < 230; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const width = 18 + random() * 82;
    const height = 5 + random() * 22;
    context.save();
    context.translate(x, y);
    context.rotate((random() - 0.5) * 0.9);
    context.fillStyle = 'rgba(255,255,255,' + (0.06 + random() * 0.16).toFixed(3) + ')';
    context.shadowColor = 'rgba(255,255,255,0.55)';
    context.shadowBlur = 10 + random() * 16;
    context.beginPath();
    context.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function makeAtmosphere(radius: number, color: string) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.035, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { uAtmosphereColor: { value: new THREE.Color(color) } },
      vertexShader: [
        '#include <common>',
        '#include <logdepthbuf_pars_vertex>',
        'varying vec3 vNormal;',
        'varying vec3 vViewDirection;',
        'void main(){',
        '  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
        '  vNormal = normalize(mat3(modelMatrix) * normal);',
        '  vViewDirection = normalize(cameraPosition - worldPosition.xyz);',
        '  gl_Position = projectionMatrix * viewMatrix * worldPosition;',
        '  #include <logdepthbuf_vertex>',
        '}',
      ].join('\n'),
      fragmentShader: [
        '#include <common>',
        '#include <logdepthbuf_pars_fragment>',
        'uniform vec3 uAtmosphereColor;',
        'varying vec3 vNormal;',
        'varying vec3 vViewDirection;',
        'void main(){',
        '  #include <logdepthbuf_fragment>',
        '  float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDirection)), 0.0), 2.25);',
        '  float alpha = smoothstep(0.03, 0.92, rim) * 0.34;',
        '  gl_FragColor = vec4(uAtmosphereColor, alpha);',
        '}',
      ].join('\n'),
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

function makeFreeFlightCraft(resources: Array<{ dispose: () => void }>) {
  const craft = new THREE.Group();
  craft.name = 'CampusSync non-combat free-flight explorer';
  const hull = new THREE.MeshPhysicalMaterial({
    color: '#b80d1c',
    metalness: 0.56,
    roughness: 0.26,
    clearcoat: 0.9,
    clearcoatRoughness: 0.14,
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#111923', metalness: 0.78, roughness: 0.32 });
  const trim = new THREE.MeshStandardMaterial({ color: '#9ca9b9', metalness: 0.92, roughness: 0.28 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#72d9ef',
    metalness: 0.28,
    roughness: 0.08,
    transparent: true,
    opacity: 0.8,
    clearcoat: 1,
  });
  const lights = new THREE.MeshBasicMaterial({ color: '#9ff6ff', toneMapped: false });
  const exhaustMaterials: THREE.MeshBasicMaterial[] = [];
  resources.push(hull, dark, trim, glass, lights);

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    craft.add(mesh);
    resources.push(geometry);
    return mesh;
  };

  // The nose points along local -Z. The airframe is an exploration vehicle;
  // no weapon, targeting or combat systems are created in this mode.
  const fuselage = add(new THREE.CylinderGeometry(0.018, 0.031, 0.205, 16, 1), hull, 0, 0, 0.005);
  fuselage.rotation.x = Math.PI / 2;
  const nose = add(new THREE.ConeGeometry(0.021, 0.095, 16), trim, 0, 0, -0.145);
  nose.rotation.x = -Math.PI / 2;
  const dorsal = add(new THREE.BoxGeometry(0.018, 0.012, 0.16), dark, 0, 0.026, 0.025);
  dorsal.rotation.x = 0.025;

  const canopy = add(new THREE.SphereGeometry(0.029, 20, 14), glass, 0, 0.025, -0.045);
  canopy.scale.set(0.74, 0.5, 1.55);

  for (const side of [-1, 1]) {
    const wing = add(new THREE.BoxGeometry(0.155, 0.008, 0.085), hull, side * 0.082, -0.004, 0.025);
    wing.rotation.y = side * -0.16;
    const wingEdge = add(new THREE.BoxGeometry(0.13, 0.003, 0.007), trim, side * 0.084, 0.002, 0.056);
    wingEdge.rotation.y = side * -0.16;
    const engine = add(new THREE.CylinderGeometry(0.018, 0.023, 0.105, 16), dark, side * 0.034, -0.018, 0.115);
    engine.rotation.x = Math.PI / 2;
    const nozzle = add(new THREE.TorusGeometry(0.018, 0.003, 8, 20), trim, side * 0.034, -0.018, 0.171);
    nozzle.rotation.x = Math.PI / 2;
    const plumeMaterial = new THREE.MeshBasicMaterial({
      color: '#79eaff',
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    exhaustMaterials.push(plumeMaterial);
    resources.push(plumeMaterial);
    const plume = add(new THREE.ConeGeometry(0.017, 0.105, 16, 1, true), plumeMaterial, side * 0.034, -0.018, 0.22);
    plume.rotation.x = Math.PI / 2;
  }

  const dorsalFin = add(new THREE.BoxGeometry(0.009, 0.038, 0.062), dark, 0, 0.026, 0.075);
  dorsalFin.rotation.x = 0.12;
  for (const side of [-1, 1]) {
    const navigationLight = add(new THREE.SphereGeometry(0.004, 10, 8), lights, side * 0.158, 0.006, 0.038);
    navigationLight.scale.set(1.2, 0.8, 1.2);
  }

  craft.scale.setScalar(CRAFT_VISUAL_LENGTH);
  return { craft, exhaustMaterials };
}

function formatDistance(km: number) {
  if (km >= 1_000_000) return (km / 1_000_000).toFixed(2) + ' M km';
  if (km >= 10_000) return Math.round(km).toLocaleString('ja-JP') + ' km';
  return km.toFixed(1) + ' km';
}

function formatSpeed(speedKmS: number) {
  return speedKmS.toFixed(2) + ' km/s';
}

function ControlButton({
  label,
  keyName,
  keysRef,
}: {
  label: string;
  keyName: string;
  keysRef: MutableRefObject<Set<string>>;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        keysRef.current.add(keyName);
      }}
      onPointerUp={() => keysRef.current.delete(keyName)}
      onPointerLeave={() => keysRef.current.delete(keyName)}
      onPointerCancel={() => keysRef.current.delete(keyName)}
      className="touch-none rounded-lg border border-cyan-100/15 bg-slate-900/85 px-2.5 py-2 text-[10px] font-black text-cyan-50 active:bg-cyan-300 active:text-slate-950"
    >
      {label}
    </button>
  );
}

export default function FreeFlightSimulator({ system, starClass, onExit }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [hud, setHud] = useState<HudState>({
    speed: 0,
    altitude: FREE_FLIGHT_START_ALTITUDE_KM,
    acceleration: 0,
    moonDistance: system.moonCount > 0 ? FREE_FLIGHT_REFERENCE_MOON_DISTANCE_KM : null,
    deltaV: FREE_FLIGHT_DELTA_V_BUDGET_KM_S,
    throttle: 0,
    status: '軌道投入済み · 慣性飛行',
  });
  const cameraModeRef = useRef<CameraMode>('chase');
  const inspectionRef = useRef({ yaw: 0.4, pitch: 0.18, distance: metersToSceneUnits(650) });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    } catch {
      setHud((current) => ({ ...current, status: 'この端末ではWebGLを初期化できません' }));
      return;
    }

    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor('#030711', 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(72, width / height, 0.000000001, 340_000);
    camera.position.set(0, 0.5, 10);
    const resources: Array<{ dispose: () => void }> = [];
    const backdrop = createGalaxyBackdrop(Number.parseInt(system.id.slice(-3), 10) || 1, {
      radius: 170_000,
      starCount: 18_000,
    });
    scene.add(backdrop.group);
    resources.push({ dispose: () => backdrop.dispose() });

    const planetRadiusKm = FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM;
    const planetRadius = planetRadiusKm / KM_PER_SCENE_UNIT;
    const numericPlanetId = Number.parseInt(system.id.slice(-3), 10) || 1;
    const fallbackTexture = makePlanetTexture(numericPlanetId, system.atmosphereColor);
    const loader = new THREE.TextureLoader();
    let planetMaterial: THREE.MeshStandardMaterial;
    const planetTexture = loader.load(
      '/planet-assets/planets/' + system.id + (numericPlanetId >= 11 && numericPlanetId <= 20 ? '/surface.webp' : '/surface.jpg'),
      (loaded) => {
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.ClampToEdgeWrapping;
        loaded.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        loaded.needsUpdate = true;
      },
      undefined,
      () => {
        planetMaterial.map = fallbackTexture;
        planetMaterial.needsUpdate = true;
      },
    );
    planetTexture.colorSpace = THREE.SRGBColorSpace;
    planetTexture.wrapS = THREE.RepeatWrapping;
    planetTexture.wrapT = THREE.ClampToEdgeWrapping;
    planetMaterial = new THREE.MeshStandardMaterial({
      map: planetTexture,
      roughness: 0.9,
      metalness: 0.025,
      emissive: system.rogue ? '#291c48' : '#000000',
      emissiveIntensity: system.rogue ? 0.12 : 0,
    });
    applyPlanetSurfaceDetail(planetMaterial, numericPlanetId);
    const planetGeometry = new THREE.SphereGeometry(planetRadius, 160, 128);
    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    planet.name = system.name + ' · reference planet';
    scene.add(planet);
    resources.push(planetGeometry, planetMaterial, planetTexture, fallbackTexture);

    const cloudTexture = makeCloudTexture(numericPlanetId);
    const cloudMaterial = new THREE.MeshStandardMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.5,
      roughness: 1,
      metalness: 0,
      depthWrite: false,
    });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 1.012, 128, 96), cloudMaterial);
    scene.add(clouds);
    resources.push(clouds.geometry, cloudMaterial, cloudTexture);

    const atmosphere = makeAtmosphere(planetRadius, system.atmosphereColor);
    scene.add(atmosphere);
    resources.push(atmosphere.geometry, atmosphere.material);

    const orbitRadius = (planetRadiusKm + FREE_FLIGHT_START_ALTITUDE_KM) / KM_PER_SCENE_UNIT;
    const orbitPoints: THREE.Vector3[] = [];
    for (let index = 0; index < 192; index += 1) {
      const angle = index / 192 * Math.PI * 2;
      orbitPoints.push(new THREE.Vector3(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius));
    }
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMaterial = new THREE.LineBasicMaterial({ color: '#a9eaff', transparent: true, opacity: 0.34 });
    scene.add(new THREE.LineLoop(orbitGeometry, orbitMaterial));
    resources.push(orbitGeometry, orbitMaterial);

    const moonPositionsKm = [
      { x: -FREE_FLIGHT_REFERENCE_MOON_DISTANCE_KM, y: 0, z: 0 },
      { x: 0, y: FREE_FLIGHT_REFERENCE_MOON_DISTANCE_KM * 1.36, z: 0 },
      { x: 0, y: 0, z: FREE_FLIGHT_REFERENCE_MOON_DISTANCE_KM * 1.78 },
    ];
    const moonMeshes: THREE.Mesh[] = [];
    const starPositionKm = { x: 149_597_870.7, y: 0, z: -80_000_000 };
    const gravitySources: GravitySource[] = [{
      positionKm: { x: 0, y: 0, z: 0 },
      gravitationalParameterKm3S2: FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2,
    }];
    if (system.moonCount > 0) {
      moonPositionsKm.slice(0, system.moonCount).forEach((positionKm, index) => {
        const radiusKm = [FREE_FLIGHT_REFERENCE_MOON_RADIUS_KM, 1_120, 780][index];
        const moonGeometry = new THREE.SphereGeometry(radiusKm / KM_PER_SCENE_UNIT, 64, 48);
        const moonMaterial = new THREE.MeshStandardMaterial({
          color: ['#b7bdc5', '#c8b99e', '#a6b5c6'][index],
          roughness: 0.97,
          metalness: 0.01,
        });
        applyMoonSurfaceDetail(moonMaterial, numericPlanetId + index * 31);
        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
        moon.position.set(positionKm.x / KM_PER_SCENE_UNIT, positionKm.y / KM_PER_SCENE_UNIT, positionKm.z / KM_PER_SCENE_UNIT);
        moon.userData.index = index;
        scene.add(moon);
        moonMeshes.push(moon);
        resources.push(moonGeometry, moonMaterial);
        if (index === 0) {
          gravitySources.push({
            positionKm,
            gravitationalParameterKm3S2: FREE_FLIGHT_REFERENCE_MOON_MU_KM3_S2,
          });
        }
      });
    }

    const starProfile = starClass ? STAR_PROFILES[starClass] : null;
    const starPosition = new THREE.Vector3(starPositionKm.x / KM_PER_SCENE_UNIT, starPositionKm.y / KM_PER_SCENE_UNIT, starPositionKm.z / KM_PER_SCENE_UNIT);
    let star: THREE.Mesh | null = null;
    let starMaterial: THREE.ShaderMaterial | null = null;
    let coronaMaterial: THREE.ShaderMaterial | null = null;
    if (starProfile && starClass) {
      const starMassSolar: Record<StarClass, number> = { M: 0.25, K: 0.7, G: 1, F: 1.35, A: 2.1, B: 7.5, DA: 0.6 };
      const starMu = 132_712_440_018 * starMassSolar[starClass];
      gravitySources.push({ positionKm: starPositionKm, gravitationalParameterKm3S2: starMu });
      const starRadiusKm = 695_700 * (starClass === 'DA' ? 0.012 : starProfile.radius);
      const starRadius = starRadiusKm / KM_PER_SCENE_UNIT;
      const starGeometry = new THREE.SphereGeometry(starRadius, 160, 120);
      starMaterial = createStellarSurfaceMaterial(starProfile.lightColor, 4_721);
      star = new THREE.Mesh(starGeometry, starMaterial);
      star.position.copy(starPosition);
      star.name = 'Distant self-luminous star';
      scene.add(star);
      resources.push(starGeometry, starMaterial);
      const coronaGeometry = new THREE.SphereGeometry(starRadius * 1.25, 96, 72);
      coronaMaterial = createStellarCoronaMaterial(starProfile.color, 8_413);
      const corona = new THREE.Mesh(coronaGeometry, coronaMaterial);
      corona.position.copy(starPosition);
      scene.add(corona);
      resources.push(coronaGeometry, coronaMaterial);
      const starLight = new THREE.DirectionalLight(starProfile.lightColor, 1.55);
      starLight.position.copy(starPosition);
      scene.add(starLight);
    }
    scene.add(new THREE.AmbientLight('#92a8c8', system.rogue ? 0.42 : 0.22));

    const { craft, exhaustMaterials } = makeFreeFlightCraft(resources);
    scene.add(craft);

    let motion: FreeFlightMotionState = createInitialFreeFlightMotionState();
    const shipPosition = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const thrustDirection = new THREE.Vector3();
    const localThrust = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const cameraOffset = new THREE.Vector3();
    const unitRadial = new THREE.Vector3();
    const acceleration = new THREE.Vector3();
    const initialVelocity = new THREE.Vector3(motion.velocityKmS.x, motion.velocityKmS.y, motion.velocityKmS.z);
    craft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), initialVelocity.normalize());

    let frame = 0;
    let alive = true;
    let lastFrameTime = performance.now();
    let lastHudTime = 0;
    let elapsed = 0;
    let lastThrottle = 0;
    let activePointer: number | null = null;
    let pointerX = 0;
    let pointerY = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
      keysRef.current.add(key);
    };
    const onKeyUp = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    const onWindowBlur = () => keysRef.current.clear();

    const onPointerDown = (event: PointerEvent) => {
      if (cameraModeRef.current !== 'inspection') return;
      activePointer = event.pointerId;
      pointerX = event.clientX;
      pointerY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (activePointer !== event.pointerId || cameraModeRef.current !== 'inspection') return;
      const dx = event.clientX - pointerX;
      const dy = event.clientY - pointerY;
      pointerX = event.clientX;
      pointerY = event.clientY;
      inspectionRef.current.yaw -= dx * 0.006;
      inspectionRef.current.pitch = Math.max(-1.25, Math.min(1.25, inspectionRef.current.pitch + dy * 0.005));
    };
    const onPointerUp = (event: PointerEvent) => {
      if (activePointer !== event.pointerId) return;
      activePointer = null;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      if (cameraModeRef.current !== 'inspection') return;
      event.preventDefault();
      inspectionRef.current.distance = Math.max(metersToSceneUnits(280), Math.min(metersToSceneUnits(2_500), inspectionRef.current.distance * (event.deltaY > 0 ? 1.12 : 0.89)));
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => {
      const nextWidth = Math.max(1, mount.clientWidth);
      const nextHeight = Math.max(1, mount.clientHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    const render = (now: number) => {
      if (!alive) return;
      const dt = Math.max(0, Math.min(0.05, (now - lastFrameTime) / 1000));
      lastFrameTime = now;
      elapsed += dt;

      const keys = keysRef.current;
      const pitchInput = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
      const yawInput = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0);
      const rollInput = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
      if (pitchInput || yawInput || rollInput) {
        const axis = new THREE.Vector3(pitchInput, yawInput, rollInput).normalize();
        const amount = Math.hypot(pitchInput, yawInput, rollInput) > 1 ? 1 : Math.hypot(pitchInput, yawInput, rollInput);
        craft.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, amount * 0.82 * dt));
        craft.quaternion.normalize();
      }

      localThrust.set(
        (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0),
        (keys.has('r') ? 1 : 0) - (keys.has('f') ? 1 : 0),
        (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0),
      );
      const throttle = Math.min(1, localThrust.length());
      if (localThrust.lengthSq() > 1e-8) {
        thrustDirection.copy(localThrust).normalize().applyQuaternion(craft.quaternion).normalize();
      } else {
        thrustDirection.set(0, 0, 0);
      }
      lastThrottle = throttle;

      const stepped = stepFreeFlightMotion(motion, {
        dtSeconds: dt,
        thrustDirection: { x: thrustDirection.x, y: thrustDirection.y, z: thrustDirection.z },
        throttle,
        brake: keys.has(' '),
      }, gravitySources);
      motion = stepped.state;
      acceleration.set(
        stepped.gravityAccelerationKmS2.x + stepped.thrustAccelerationKmS2.x,
        stepped.gravityAccelerationKmS2.y + stepped.thrustAccelerationKmS2.y,
        stepped.gravityAccelerationKmS2.z + stepped.thrustAccelerationKmS2.z,
      );

      // The simulator uses a spherical reference planet. Prevent the craft from
      // falling through the surface; a separate atmospheric landing model can be added later.
      const radiusNow = Math.hypot(motion.positionKm.x, motion.positionKm.y, motion.positionKm.z);
      if (radiusNow < FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM + 0.5) {
        const normal = new THREE.Vector3(motion.positionKm.x, motion.positionKm.y, motion.positionKm.z).normalize();
        const radialVelocity = motion.velocityKmS.x * normal.x + motion.velocityKmS.y * normal.y + motion.velocityKmS.z * normal.z;
        if (radialVelocity < 0) {
          motion.velocityKmS = {
            x: motion.velocityKmS.x - normal.x * radialVelocity,
            y: motion.velocityKmS.y - normal.y * radialVelocity,
            z: motion.velocityKmS.z - normal.z * radialVelocity,
          };
        }
        motion.positionKm = {
          x: normal.x * (FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM + 0.5),
          y: normal.y * (FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM + 0.5),
          z: normal.z * (FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM + 0.5),
        };
      }

      shipPosition.set(
        motion.positionKm.x / KM_PER_SCENE_UNIT,
        motion.positionKm.y / KM_PER_SCENE_UNIT,
        motion.positionKm.z / KM_PER_SCENE_UNIT,
      );
      craft.position.copy(shipPosition);
      forward.set(0, 0, -1).applyQuaternion(craft.quaternion).normalize();

      const thrustIntensity = throttle > 0 && motion.deltaVRemainingKmS > 0 ? 0.18 + throttle * 0.82 : 0.035;
      exhaustMaterials.forEach((material) => {
        material.opacity = thrustIntensity;
      });
      planet.rotation.y += dt * 0.00017;
      clouds.rotation.y += dt * 0.00019;
      moonMeshes.forEach((moon, index) => { moon.rotation.y += dt * (0.00018 + index * 0.00004); });
      if (star && starMaterial && coronaMaterial) {
        star.rotation.y += dt * 0.000025;
        starMaterial.uniforms.uTime.value = elapsed;
        coronaMaterial.uniforms.uTime.value = elapsed;
      }
      backdrop.update(elapsed);

      const selectedCamera = cameraModeRef.current;
      if (selectedCamera === 'cockpit') {
        camera.position.copy(shipPosition).add(new THREE.Vector3(0, metersToSceneUnits(7), 0).applyQuaternion(craft.quaternion));
        camera.quaternion.copy(craft.quaternion);
      } else if (selectedCamera === 'inspection') {
        const angles = inspectionRef.current;
        const horizontal = Math.cos(angles.pitch);
        cameraOffset.set(
          Math.sin(angles.yaw) * horizontal,
          Math.sin(angles.pitch),
          Math.cos(angles.yaw) * horizontal,
        ).multiplyScalar(angles.distance).applyQuaternion(craft.quaternion);
        camera.position.copy(shipPosition).add(cameraOffset);
        camera.up.set(0, 1, 0).applyQuaternion(craft.quaternion);
        camera.lookAt(shipPosition);
      } else {
        unitRadial.set(shipPosition.x, shipPosition.y, shipPosition.z).normalize();
        const trailingDirection = forward.clone().negate();
        cameraOffset.copy(unitRadial).multiplyScalar(metersToSceneUnits(600)).addScaledVector(trailingDirection, metersToSceneUnits(1_400));
        camera.position.copy(shipPosition).add(cameraOffset);
        cameraTarget.copy(shipPosition).addScaledVector(forward, metersToSceneUnits(1_300)).addScaledVector(unitRadial, -metersToSceneUnits(250));
        camera.up.set(0, 1, 0);
        camera.lookAt(cameraTarget);
      }
      backdrop.group.position.copy(camera.position);
      renderer.render(scene, camera);

      if (now - lastHudTime > 160) {
        const altitude = Math.max(0, Math.hypot(motion.positionKm.x, motion.positionKm.y, motion.positionKm.z) - planetRadiusKm);
        const moonDistance = system.moonCount > 0
          ? Math.hypot(
            motion.positionKm.x - moonPositionsKm[0].x,
            motion.positionKm.y - moonPositionsKm[0].y,
            motion.positionKm.z - moonPositionsKm[0].z,
          )
          : null;
        const totalAcceleration = acceleration.length();
        setHud({
          speed: Math.hypot(motion.velocityKmS.x, motion.velocityKmS.y, motion.velocityKmS.z),
          altitude,
          acceleration: totalAcceleration * 1_000,
          moonDistance,
          deltaV: motion.deltaVRemainingKmS,
          throttle: lastThrottle,
          status: motion.deltaVRemainingKmS <= 0
            ? 'Δv残量なし · 慣性航行'
            : keys.has(' ') ? '逆噴射 · 減速中'
              : throttle > 0 ? '推進中 · 慣性航行'
                : 'エンジン停止 · 慣性航行',
        });
        lastHudTime = now;
      }

      frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);

    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      keysRef.current.clear();
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [system.id, system.name, system.atmosphereColor, system.moonCount, starClass]);

  const changeCamera = (mode: CameraMode) => {
    cameraModeRef.current = mode;
    setCameraMode(mode);
  };

  const keyMap = [
    { label: '↑ PITCH', keyName: 'arrowup' },
    { label: '↓ PITCH', keyName: 'arrowdown' },
    { label: '← YAW', keyName: 'arrowleft' },
    { label: '→ YAW', keyName: 'arrowright' },
    { label: 'Q ROLL', keyName: 'q' },
    { label: 'E ROLL', keyName: 'e' },
    { label: '前 W', keyName: 'w' },
    { label: '後 S', keyName: 's' },
    { label: '左 A', keyName: 'a' },
    { label: '右 D', keyName: 'd' },
    { label: '上 R', keyName: 'r' },
    { label: '下 F', keyName: 'f' },
  ];

  return (
    <div className="absolute inset-0 z-30 overflow-hidden bg-[#020611] text-white">
      <div ref={mountRef} className="absolute inset-0" aria-label="小型宇宙艇の自由航行3Dシミュレーター" />
      <div className="pointer-events-none absolute inset-0 z-10" style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,4,16,.18) 78%, rgba(0,2,8,.66) 100%)' }} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 sm:p-5">
        <div className="pointer-events-auto rounded-xl border border-cyan-200/20 bg-slate-950/75 px-3 py-2 backdrop-blur-md">
          <p className="text-[8px] font-black tracking-[.22em] text-cyan-200">CAMPUSSYNC · FREE FLIGHT</p>
          <p className="mt-1 text-xs font-black">{system.name} · 小型宇宙艇</p>
          <p className="mt-1 text-[9px] text-slate-400">NON-COMBAT EXPLORATION SIMULATOR</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {([
              ['cockpit', '操縦席'],
              ['chase', '追跡視点'],
              ['inspection', '360°観察'],
            ] as Array<[CameraMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={cameraMode === mode}
                onClick={() => changeCamera(mode)}
                className={'rounded-md px-2 py-1 text-[9px] font-black ' + (cameraMode === mode ? 'bg-cyan-300 text-slate-950' : 'bg-white/10 text-slate-200')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-right backdrop-blur-md">
            <p className="text-[8px] font-bold tracking-[.14em] text-cyan-200">FLIGHT STATUS</p>
            <p className="mt-1 text-[10px] font-black">{hud.status}</p>
          </div>
          <button type="button" onClick={onExit} className="rounded-lg border border-white/15 bg-slate-950/80 px-3 py-2 text-[10px] font-bold text-slate-100 hover:bg-white/10">
            惑星視点へ戻る
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute left-3 top-[25%] z-20 grid grid-cols-2 gap-1.5 sm:left-5 sm:grid-cols-1">
        <div className="min-w-[108px] rounded-lg border border-cyan-200/15 bg-slate-950/65 p-2 backdrop-blur-md">
          <p className="text-[8px] font-bold tracking-wide text-slate-400">VELOCITY</p>
          <p className="mt-1 font-mono text-sm font-black tabular-nums text-cyan-100">{formatSpeed(hud.speed)}</p>
        </div>
        <div className="min-w-[108px] rounded-lg border border-white/10 bg-slate-950/65 p-2 backdrop-blur-md">
          <p className="text-[8px] font-bold tracking-wide text-slate-400">ALTITUDE</p>
          <p className="mt-1 font-mono text-xs font-black tabular-nums">{formatDistance(hud.altitude)}</p>
        </div>
        <div className="min-w-[108px] rounded-lg border border-white/10 bg-slate-950/65 p-2 backdrop-blur-md">
          <p className="text-[8px] font-bold tracking-wide text-slate-400">ACCELERATION</p>
          <p className="mt-1 font-mono text-xs font-black tabular-nums">{hud.acceleration.toFixed(2)} m/s²</p>
        </div>
        {hud.moonDistance !== null && (
          <div className="min-w-[108px] rounded-lg border border-white/10 bg-slate-950/65 p-2 backdrop-blur-md">
            <p className="text-[8px] font-bold tracking-wide text-slate-400">MOON RANGE</p>
            <p className="mt-1 font-mono text-xs font-black tabular-nums">{formatDistance(hud.moonDistance)}</p>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-[22%] right-3 z-20 w-[min(188px,42vw)] rounded-xl border border-cyan-200/15 bg-slate-950/70 p-3 backdrop-blur-md sm:bottom-[21%] sm:right-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[8px] font-black tracking-[.16em] text-cyan-200">PROPULSION RESERVE</p>
          <p className="font-mono text-[10px] font-black tabular-nums">{hud.deltaV.toFixed(2)} km/s</p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-cyan-300 transition-[width]" style={{ width: (hud.deltaV / FREE_FLIGHT_DELTA_V_BUDGET_KM_S * 100) + '%' }} />
        </div>
        <p className="mt-2 text-[8px] text-slate-400">初期Δv {FREE_FLIGHT_DELTA_V_BUDGET_KM_S} km/s · 推力加速度 {FREE_FLIGHT_ENGINE_ACCELERATION_KM_S2 * 1_000} m/s²</p>
      </div>

      <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-20 flex items-end justify-between gap-2 sm:bottom-4 sm:left-5 sm:right-5">
        <div className="pointer-events-auto max-w-[min(68%,540px)] rounded-xl border border-white/10 bg-slate-950/78 p-2.5 backdrop-blur-md sm:p-3">
          <p className="text-[8px] font-black tracking-[.15em] text-cyan-200">6-DOF FLIGHT CONTROLS</p>
          <div className="mt-1.5 grid grid-cols-4 gap-1 sm:grid-cols-6">
            {keyMap.map((control) => (
              <ControlButton key={control.keyName} label={control.label} keyName={control.keyName} keysRef={keysRef} />
            ))}
          </div>
          <p className="mt-1.5 text-[8px] leading-4 text-slate-400">Space：速度と逆向きにブレーキ · 360°観察中はドラッグで回転・ホイールでズーム</p>
        </div>
        <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-1">
          <ControlButton label="SPACE ブレーキ" keyName=" " keysRef={keysRef} />
          <p className="rounded-lg bg-slate-950/70 px-2 py-1 text-[8px] text-slate-400">PC：キーボード / タッチ：ボタン長押し</p>
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-[16%] z-20 hidden rounded-lg border border-white/10 bg-slate-950/55 px-2 py-1.5 text-[8px] text-slate-400 sm:block">
        1 scene unit = 1,000 km · 速度/距離は実単位
      </div>
    </div>
  );
}
