'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { applyMoonSurfaceDetail, applyPlanetSurfaceDetail } from '@/components/planet-world/celestial-surface-detail';
import { makeExplorationVessel } from '@/components/planet-world/crimson-exploration-vessel';
import { makeDeepSky, makeStarCorona, makeStarSurfaceMaterial } from '@/components/planet-world/space-effects';
import type { PlanetSystemSpec, StarClass } from '@/lib/planet-system-catalog';
import { STAR_PROFILES } from '@/lib/planet-system-catalog';
import { VOYAGE_SCALE } from '@/lib/planet-star-voyage';
import {
  FREE_FLIGHT_DELTA_V_BUDGET_KM_S,
  FREE_FLIGHT_ENGINE_ACCELERATION_KM_S2,
  FREE_FLIGHT_REFERENCE_MOON_DISTANCE_KM,
  FREE_FLIGHT_REFERENCE_MOON_MU_KM3_S2,
  FREE_FLIGHT_REFERENCE_MOON_RADIUS_KM,
  FREE_FLIGHT_REFERENCE_PLANET_MU_KM3_S2,
  FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM,
  FREE_FLIGHT_START_ALTITUDE_KM,
  FREE_FLIGHT_MAX_CRUISE_SPEED_KM_S,
  FREE_FLIGHT_SPEED_OF_LIGHT_KM_S,
  createInitialFreeFlightMotionState,
  findSphereImpactKm,
  stepFreeFlightCruise,
  stepFreeFlightMotion,
  type FreeFlightMotionState,
  type GravitySource,
  type SphereObstacle,
} from '@/lib/planet-free-flight-physics';
import { getDirectionPointer } from '@/lib/planet-free-flight-pointer';

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
  status: string;
};

const KM_PER_SCENE_UNIT = 1_000;
const metersToSceneUnits = (meters: number) => meters / (KM_PER_SCENE_UNIT * 1_000);
const CRAFT_LENGTH_METERS = 100; // Nose to nozzle.

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

function formatDistance(km: number) {
  if (km >= 1_000_000) return (km / 1_000_000).toFixed(2) + ' M km';
  if (km >= 10_000) return Math.round(km).toLocaleString('ja-JP') + ' km';
  return km.toFixed(1) + ' km';
}

function formatSpeed(speedKmS: number) {
  if (speedKmS >= 1_000) return Math.round(speedKmS).toLocaleString('ja-JP') + ' km/s';
  return speedKmS.toFixed(2) + ' km/s';
}

function formatLightFraction(speedKmS: number) {
  return (speedKmS / FREE_FLIGHT_SPEED_OF_LIGHT_KM_S).toFixed(3) + ' c';
}

function formatAcceleration(metersPerSecond2: number) {
  if (metersPerSecond2 >= 10_000) return Math.round(metersPerSecond2 / 1_000).toLocaleString('ja-JP') + ' km/s²';
  return metersPerSecond2.toFixed(2) + ' m/s²';
}

// Letters are read from the physical key so Japanese input modes do not swallow them.
function flightKey(event: KeyboardEvent) {
  return /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : event.key.toLowerCase();
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
  const pointerRef = useRef<HTMLDivElement>(null);
  const pointerArrowRef = useRef<HTMLSpanElement>(null);
  const pointerRingRef = useRef<HTMLSpanElement>(null);
  const pointerLabelRef = useRef<HTMLSpanElement>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [hud, setHud] = useState<HudState>({
    speed: 0,
    altitude: FREE_FLIGHT_START_ALTITUDE_KM,
    acceleration: 0,
    moonDistance: system.moonCount > 0 ? FREE_FLIGHT_REFERENCE_MOON_DISTANCE_KM : null,
    deltaV: FREE_FLIGHT_DELTA_V_BUDGET_KM_S,
    status: '軌道投入済み · 慣性飛行',
  });
  const cameraModeRef = useRef<CameraMode>('chase');
  const inspectionRef = useRef({ yaw: 0.6, pitch: 0.35, distance: metersToSceneUnits(210) });

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
    scene.add(makeDeepSky(Number.parseInt(system.id.slice(-3), 10) || 1, resources));

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
    const stellarEffects: Array<{ update: (seconds: number) => void }> = [];
    if (starProfile && starClass) {
      const starMassSolar: Record<StarClass, number> = { M: 0.25, K: 0.7, G: 1, F: 1.35, A: 2.1, B: 7.5, DA: 0.6 };
      const starMu = 132_712_440_018 * starMassSolar[starClass];
      gravitySources.push({ positionKm: starPositionKm, gravitationalParameterKm3S2: starMu });
      const starRadiusKm = 695_700 * (starClass === 'DA' ? 0.012 : starProfile.radius);
      const starRadius = starRadiusKm / KM_PER_SCENE_UNIT;
      const starGeometry = new THREE.SphereGeometry(starRadius, 160, 120);
      const starSurface = makeStarSurfaceMaterial(starProfile.lightColor, 4_721, resources);
      star = new THREE.Mesh(starGeometry, starSurface.material);
      star.position.copy(starPosition);
      star.name = 'Distant self-luminous star';
      scene.add(star);
      resources.push(starGeometry);
      const corona = makeStarCorona(starRadius, starRadius * 2.9, starProfile.color, 8_413, resources);
      corona.mesh.position.copy(starPosition);
      scene.add(corona.mesh);
      stellarEffects.push(starSurface, corona);
      const starLight = new THREE.DirectionalLight(starProfile.lightColor, 1.55);
      starLight.position.copy(starPosition);
      scene.add(starLight);
    }
    const obstacles: SphereObstacle[] = [
      { positionKm: { x: 0, y: 0, z: 0 }, radiusKm: FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM + 0.5 },
      ...moonMeshes.map((_, index) => ({
        positionKm: moonPositionsKm[index],
        radiusKm: [FREE_FLIGHT_REFERENCE_MOON_RADIUS_KM, 1_120, 780][index] + 0.5,
      })),
    ];
    if (starProfile && starClass) {
      obstacles.push({ positionKm: starPositionKm, radiusKm: 695_700 * (starClass === 'DA' ? 0.012 : starProfile.radius) * 1.05 });
    }
    scene.add(new THREE.AmbientLight('#92a8c8', system.rogue ? 0.42 : 0.22));

    // The same vessel as the star voyage, scaled down for piloting.
    const craft = makeExplorationVessel(renderer, resources);
    craft.scale.setScalar(metersToSceneUnits(CRAFT_LENGTH_METERS) / VOYAGE_SCALE.spacecraftLength);
    scene.add(craft);

    let motion: FreeFlightMotionState = createInitialFreeFlightMotionState();
    const shipPosition = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const thrustDirection = new THREE.Vector3();
    const localThrust = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const cameraOffset = new THREE.Vector3();
    const acceleration = new THREE.Vector3();
    // Nose along the orbital velocity, belly toward the planet.
    const initialForward = new THREE.Vector3(motion.velocityKmS.x, motion.velocityKmS.y, motion.velocityKmS.z).normalize();
    const initialUp = new THREE.Vector3(motion.positionKm.x, motion.positionKm.y, motion.positionKm.z).normalize();
    const initialRight = new THREE.Vector3().crossVectors(initialForward, initialUp);
    craft.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(initialRight, initialUp, initialForward.clone().negate()));
    const chaseOrientation = craft.quaternion.clone();
    const chaseUp = new THREE.Vector3();
    const chaseForward = new THREE.Vector3();
    let cruising = false;
    let impactNoticeUntil = 0;
    const planetInView = new THREE.Vector3();

    // Moved directly in the DOM so the marker follows every frame without re-rendering React.
    const updatePlanetPointer = () => {
      const marker = pointerRef.current;
      const arrow = pointerArrowRef.current;
      const ring = pointerRingRef.current;
      const label = pointerLabelRef.current;
      if (!marker || !arrow || !ring || !label) return;
      camera.updateMatrixWorld();
      planetInView.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse);
      const pointer = getDirectionPointer(planetInView, camera.fov, camera.aspect);
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      // Off screen, the arrow rides an ellipse around the ship, clear of the HUD panels.
      const left = pointer.onScreen ? (pointer.x + 1) / 2 * width : width * (0.5 + Math.cos(pointer.angle) * 0.27);
      const vertical = Math.sin(pointer.angle);
      // Downward there is only a narrow gap between the ship and the controls.
      const reach = vertical > 0 ? (height > width ? 0.17 : 0.27) : 0.24;
      const top = pointer.onScreen ? (1 - pointer.y) / 2 * height : height * (0.45 + vertical * reach);
      label.style.top = !pointer.onScreen && vertical > 0.5 ? '-38px' : '24px';
      marker.style.transform = 'translate(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px)';
      marker.style.visibility = 'visible';
      marker.dataset.state = pointer.onScreen ? 'onscreen' : 'offscreen';
      ring.style.display = pointer.onScreen ? 'block' : 'none';
      arrow.style.display = pointer.onScreen ? 'none' : 'block';
      arrow.style.transform = 'translate(-50%,-50%) rotate(' + pointer.angle.toFixed(3) + 'rad)';
      const altitude = Math.max(0, Math.hypot(motion.positionKm.x, motion.positionKm.y, motion.positionKm.z) - FREE_FLIGHT_REFERENCE_PLANET_RADIUS_KM);
      const text = system.name + (pointer.behind ? '（後方）' : '') + ' ' + formatDistance(altitude);
      if (label.textContent !== text) label.textContent = text;
    };

    let frame = 0;
    let alive = true;
    let lastFrameTime = performance.now();
    let lastHudTime = 0;
    let elapsed = 0;
    let activePointer: number | null = null;
    let pointerX = 0;
    let pointerY = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = flightKey(event);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
      keysRef.current.add(key);
    };
    const onKeyUp = (event: KeyboardEvent) => keysRef.current.delete(flightKey(event));
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
      inspectionRef.current.distance = Math.max(metersToSceneUnits(110), Math.min(metersToSceneUnits(2_500), inspectionRef.current.distance * (event.deltaY > 0 ? 1.12 : 0.89)));
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
      // Positive rotation about local +Y turns the nose left; about +Z it rolls left.
      const yawInput = (keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0);
      const rollInput = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0);
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
      // O / L hand control to the sub-light drive; the manoeuvring thrusters hand it back.
      const accelerating = keys.has('o');
      const decelerating = keys.has('l');
      if (throttle > 0) cruising = false;
      else if (accelerating || decelerating) cruising = true;
      const driveCommand = cruising
        ? (keys.has(' ') ? -3 : (accelerating ? 1 : 0) - (decelerating ? 1 : 0))
        : 0;

      forward.set(0, 0, -1).applyQuaternion(craft.quaternion).normalize();
      let impacted = false;
      if (cruising) {
        const cruised = stepFreeFlightCruise(motion, {
          dtSeconds: dt,
          forward: { x: forward.x, y: forward.y, z: forward.z },
          command: driveCommand,
        }, obstacles);
        motion = cruised.state;
        impacted = cruised.impacted;
        acceleration.copy(forward).multiplyScalar(cruised.accelerationKmS2);
      } else {
        const stepped = stepFreeFlightMotion(motion, {
          dtSeconds: dt,
          thrustDirection: { x: thrustDirection.x, y: thrustDirection.y, z: thrustDirection.z },
          throttle,
          brake: keys.has(' '),
        }, gravitySources);
        // Fast coasting after leaving the drive must not tunnel through a body.
        const fast = Math.hypot(stepped.state.velocityKmS.x, stepped.state.velocityKmS.y, stepped.state.velocityKmS.z) > 50;
        const impact = fast ? findSphereImpactKm(motion.positionKm, stepped.state.positionKm, obstacles) : null;
        motion = impact
          ? { ...stepped.state, positionKm: impact.positionKm, velocityKmS: { x: 0, y: 0, z: 0 } }
          : stepped.state;
        impacted = Boolean(impact);
        acceleration.set(
          stepped.gravityAccelerationKmS2.x + stepped.thrustAccelerationKmS2.x,
          stepped.gravityAccelerationKmS2.y + stepped.thrustAccelerationKmS2.y,
          stepped.gravityAccelerationKmS2.z + stepped.thrustAccelerationKmS2.z,
        );
      }
      if (impacted) impactNoticeUntil = elapsed + 2.5;

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

      const thrustIntensity = driveCommand > 0 ? 1
        : throttle > 0 && motion.deltaVRemainingKmS > 0 ? 0.18 + throttle * 0.82
          : cruising && driveCommand === 0 ? 0.2 : 0.06;
      craft.userData.setThrust(thrustIntensity);
      planet.rotation.y += dt * 0.00017;
      clouds.rotation.y += dt * 0.00019;
      moonMeshes.forEach((moon, index) => { moon.rotation.y += dt * (0.00018 + index * 0.00004); });
      if (star) star.rotation.y += dt * 0.000025;
      stellarEffects.forEach(effect => effect.update(elapsed));

      chaseOrientation.slerp(craft.quaternion, 1 - Math.exp(-dt * 7));
      const selectedCamera = cameraModeRef.current;
      craft.visible = selectedCamera !== 'cockpit';
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
        // Follow slightly behind the ship's attitude so each turn is visible.
        chaseUp.set(0, 1, 0).applyQuaternion(chaseOrientation);
        chaseForward.set(0, 0, -1).applyQuaternion(chaseOrientation);
        cameraOffset.copy(chaseUp).multiplyScalar(metersToSceneUnits(75)).addScaledVector(chaseForward, metersToSceneUnits(-170));
        camera.position.copy(shipPosition).add(cameraOffset);
        cameraTarget.copy(shipPosition).addScaledVector(chaseForward, metersToSceneUnits(130)).addScaledVector(chaseUp, metersToSceneUnits(-35));
        camera.up.copy(chaseUp);
        camera.lookAt(cameraTarget);
      }
      renderer.render(scene, camera);
      updatePlanetPointer();

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
        const speed = Math.hypot(motion.velocityKmS.x, motion.velocityKmS.y, motion.velocityKmS.z);
        setHud({
          speed,
          altitude,
          acceleration: totalAcceleration * 1_000,
          moonDistance,
          deltaV: motion.deltaVRemainingKmS,
          status: elapsed < impactNoticeUntil ? '衝突回避 · 緊急停止'
            : cruising
              ? driveCommand > 0
                ? speed >= FREE_FLIGHT_MAX_CRUISE_SPEED_KM_S - 1
                  ? '亜光速ドライブ · 最大速度'
                  : '亜光速ドライブ · 加速中'
                : driveCommand < 0 ? '亜光速ドライブ · 減速中' : '亜光速ドライブ · 巡航'
              : motion.deltaVRemainingKmS <= 0
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

      <div ref={pointerRef} data-testid="planet-pointer" aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 z-[25] h-0 w-0">
        <span ref={pointerRingRef} className="absolute left-0 top-0 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300 shadow-[0_0_10px_rgba(252,211,77,.8)]" />
        <span ref={pointerArrowRef} className="absolute left-0 top-0 text-3xl font-black leading-none text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,.9)]">➤</span>
        <span ref={pointerLabelRef} className="absolute left-0 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-black text-amber-200" />
      </div>

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
          <p className="mt-1 font-mono text-sm font-black tabular-nums text-cyan-100" data-testid="free-flight-speed">{formatSpeed(hud.speed)}</p>
          <p className="mt-0.5 font-mono text-[10px] font-bold tabular-nums text-slate-300">{formatLightFraction(hud.speed)}</p>
        </div>
        <div className="min-w-[108px] rounded-lg border border-white/10 bg-slate-950/65 p-2 backdrop-blur-md">
          <p className="text-[8px] font-bold tracking-wide text-slate-400">ALTITUDE</p>
          <p className="mt-1 font-mono text-xs font-black tabular-nums">{formatDistance(hud.altitude)}</p>
        </div>
        <div className="min-w-[108px] rounded-lg border border-white/10 bg-slate-950/65 p-2 backdrop-blur-md">
          <p className="text-[8px] font-bold tracking-wide text-slate-400">ACCELERATION</p>
          <p className="mt-1 font-mono text-xs font-black tabular-nums">{formatAcceleration(hud.acceleration)}</p>
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
        <p className="mt-2 text-[8px] text-slate-400">姿勢制御スラスター用 Δv {FREE_FLIGHT_DELTA_V_BUDGET_KM_S} km/s · {FREE_FLIGHT_ENGINE_ACCELERATION_KM_S2 * 1_000} m/s²（亜光速ドライブは消費なし）</p>
      </div>

      <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-20 flex items-end justify-between gap-2 sm:bottom-4 sm:left-5 sm:right-5">
        <div className="pointer-events-auto max-w-[min(68%,540px)] rounded-xl border border-white/10 bg-slate-950/78 p-2.5 backdrop-blur-md sm:p-3">
          <p className="text-[8px] font-black tracking-[.15em] text-cyan-200">6-DOF FLIGHT CONTROLS</p>
          <div className="mt-1.5 grid grid-cols-4 gap-1 sm:grid-cols-6">
            {keyMap.map((control) => (
              <ControlButton key={control.keyName} label={control.label} keyName={control.keyName} keysRef={keysRef} />
            ))}
          </div>
          <p className="mt-1.5 text-[8px] leading-4 text-slate-400">矢印：機首の向き · O：加速 / L：減速（最大0.9c） · Space：ブレーキ · W/A/S/D/R/Fで慣性飛行に戻る · 360°観察中はドラッグで回転・ホイールでズーム</p>
        </div>
        <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-1">
          <div className="flex gap-1">
            <ControlButton label="O 加速" keyName="o" keysRef={keysRef} />
            <ControlButton label="L 減速" keyName="l" keysRef={keysRef} />
          </div>
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
