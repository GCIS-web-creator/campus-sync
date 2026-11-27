'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { applyMoonSurfaceDetail, applyPlanetSurfaceDetail } from '@/components/planet-world/celestial-surface-detail';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getPlanetSystemSpec, STAR_PROFILES } from '@/lib/planet-system-catalog';
import { getPlanetCatalogV50TextureUrl, getPlanetSurfaceTextureUrl, hasPlanetCatalogV50Texture } from '@/lib/planet-world/planet-catalog-v50';
import { createMoonCelestialDetail, createStarCelestialDetail, type CelestialDetail } from '@/lib/planet-celestial-details';
import VerdiaGroundView from '@/components/planet-world/VerdiaGroundView';
import PlanetGroundView from '@/components/planet-world/PlanetGroundView';
import StarSystemVoyage from '@/components/planet-world/StarSystemVoyage';
import FreeFlightSimulator from '@/components/planet-world/FreeFlightSimulator';
import { makeAtmosphereShell, makeDeepSky, makeStarCorona, makeStarSurfaceMaterial } from '@/components/planet-world/space-effects';

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
  const moonGeometry = new THREE.SphereGeometry(moonRadius, 128, 96);
  const moonMaterial = new THREE.MeshStandardMaterial({ color: moonColor, roughness: 0.98, metalness: 0.01 });
  applyMoonSurfaceDetail(moonMaterial, seed + index * 13);
  const moon = new THREE.Mesh(moonGeometry, moonMaterial);
  moon.position.set(orbitRadius, 0, 0);
  plane.add(moon);
  scene.add(plane);
  resources.push(moonGeometry, moonMaterial);
  return { plane, moon, speed: 0.16 / (1 + index * 0.58) * (index % 2 === 0 ? 1 : -1), orbitRadius, moonRadius };
}

export default function Planet3DPanel({ stage, planetAssetId = 'planet-001', mpBalance, onStartStarTravel }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [viewMode, setViewMode] = useState<'orbit'|'ground'|'voyage'|'free-flight'>('orbit');
  const viewModeRef = useRef<'orbit'|'ground'|'voyage'|'free-flight'>('orbit');
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
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

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 6500);
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
    let active = true;
    const stellarEffects: Array<{ update: (seconds: number) => void }> = [];
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
    scene.add(makeDeepSky(numericId, resources));

    const system = new THREE.Group();
    scene.add(system);
    scene.add(new THREE.AmbientLight('#8298bd', spec.rogue ? 0.42 : 0.22));

    const planetRadius = 1.52;
    const surfaceGeometry = new THREE.SphereGeometry(planetRadius, 256, 192);
    const loader = new THREE.TextureLoader();
    const fallbackTexture = createFallbackSurfaceTexture(numericId, spec.atmosphereColor);
    let surfaceMaterial: THREE.MeshStandardMaterial;
    const surfaceTexture = loader.load(
      getPlanetSurfaceTextureUrl(spec.id),
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
    let cityLightsTexture: THREE.Texture = cityTexture;
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

        // 惑星軌道画面でも航行画面と同じ自発光・粒状斑シェーダーを使う。
        // 表面に昼夜境界を作らず、画面上でも対流模様を視認できる大きさにする。
        const starCoreRadius = 36 * profile.radius;
        const starGeometry = new THREE.SphereGeometry(starCoreRadius, 256, 192);
        const starSurface = makeStarSurfaceMaterial(profile.lightColor, numericId * 37 + index, resources);
        const star = new THREE.Mesh(starGeometry, starSurface.material);
        star.name = 'Self-luminous stellar photosphere';
        star.position.copy(position);
        star.renderOrder = 1;
        scene.add(star);
        resources.push(starGeometry);

        const corona = makeStarCorona(starCoreRadius, starCoreRadius * 2.9, profile.color, numericId * 53 + index, resources);
        corona.mesh.position.copy(position);
        scene.add(corona.mesh);
        stellarEffects.push(starSurface, corona);

        const starHit = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(24, starCoreRadius * 2.2), 24, 18),
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
      shader.uniforms.uCampusCityLights = { value: cityLightsTexture };
      surfaceMaterial.userData.campusShader = shader;
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

    if (hasPlanetCatalogV50Texture(spec.id, 'emissive')) {
      loader.load(getPlanetCatalogV50TextureUrl(spec.id, 'emissive'), (loaded) => {
        if (!active) { loaded.dispose(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.ClampToEdgeWrapping;
        cityLightsTexture = loaded;
        const compiled = surfaceMaterial.userData.campusShader as { uniforms?: Record<string, { value: unknown }> } | undefined;
        if (compiled?.uniforms?.uCampusCityLights) compiled.uniforms.uCampusCityLights.value = loaded;
        resources.push(loaded);
      }, undefined, () => {});
    }

    applyPlanetSurfaceDetail(surfaceMaterial, numericId);
    const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
    system.add(surface);
    resources.push(surfaceGeometry, surfaceMaterial, surfaceTexture, fallbackTexture, cityTexture);

    const cloudTexture = createCloudTexture(numericId);
    const cloudMaterial = new THREE.MeshStandardMaterial({ map: cloudTexture, transparent: true, opacity: 0.5, roughness: 1, metalness: 0, depthWrite: false, side: THREE.FrontSide });
    if (hasPlanetCatalogV50Texture(spec.id, 'clouds')) {
      loader.load(getPlanetCatalogV50TextureUrl(spec.id, 'clouds'), (loaded) => {
        if (!active) { loaded.dispose(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.ClampToEdgeWrapping;
        cloudMaterial.map = loaded;
        cloudMaterial.needsUpdate = true;
        resources.push(loaded);
      }, undefined, () => {});
    }
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 1.012, 192, 128), cloudMaterial);
    clouds.rotation.set(0.1, numericId * 0.31, 0.03);
    system.add(clouds);
    resources.push(clouds.geometry, cloudMaterial, cloudTexture);

    system.add(makeAtmosphereShell(planetRadius, spec.atmosphereColor, spec.rogue ? defaultCameraPosition : primarySunDirection, resources));

    if (spec.hasRings) {
      const ringGeometry = new THREE.RingGeometry(planetRadius * 1.58, planetRadius * 2.45, 144);
      const ringMap = hasPlanetCatalogV50Texture(spec.id, 'ring')
        ? loader.load(getPlanetCatalogV50TextureUrl(spec.id, 'ring'), (loaded) => {
            if (!active) { loaded.dispose(); return; }
            loaded.colorSpace = THREE.SRGBColorSpace;
            loaded.wrapS = THREE.ClampToEdgeWrapping;
            loaded.wrapT = THREE.ClampToEdgeWrapping;
          }, undefined, () => {})
        : null;
      const ringMaterial = new THREE.MeshStandardMaterial({ color: ringMap ? '#ffffff' : '#b8c4da', map: ringMap, side: THREE.DoubleSide, transparent: true, opacity: 0.48, roughness: 0.9, metalness: 0.12, depthWrite: false });
      if (ringMap) resources.push(ringMap);
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
    const render = () => {
      if (!active) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      const effectTime = performance.now() / 1_000;
      stellarEffects.forEach(effect => effect.update(effectTime));
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
    <section className={'relative '+(viewMode==='free-flight'?'h-[min(82vh,900px)] min-h-[560px] ':'min-h-[340px] ')+'overflow-hidden rounded-[26px] border border-slate-700/80 bg-[#050914] text-white shadow-[0_18px_60px_rgba(2,6,23,0.26)]'}>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4">
        <div className="rounded-xl border border-white/10 bg-slate-950/65 px-3 py-2 backdrop-blur-md">
          <p className="text-[9px] font-black tracking-[.2em] text-cyan-300">STELLAR SYSTEM</p>
          <p className="mt-1 text-xs font-bold text-white">{spec.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 pointer-events-auto">
            <button type="button" onClick={()=>{setViewMode('orbit');}} className={'rounded-lg px-2 py-1 text-[10px] font-bold '+(viewMode==='orbit'?'bg-cyan-500 text-slate-950':'bg-white/10 text-white')}>惑星視点</button>
            <button type="button" onClick={()=>{setViewMode('ground');}} className={'rounded-lg px-2 py-1 text-[10px] font-bold '+(viewMode==='ground'?'bg-cyan-500 text-slate-950':'bg-white/10 text-white')}>地上視点</button>
            <button type="button" onClick={()=>{setSelectedCelestial(null);setViewMode('free-flight');}} className={'rounded-lg px-2 py-1 text-[10px] font-black '+(viewMode==='free-flight'?'bg-emerald-300 text-slate-950':'bg-emerald-300/15 text-emerald-100')}>自由航行 · 無料</button>
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
      {viewMode==='ground' && numericId !== 6 && <PlanetGroundView planetId={spec.id} planetName={spec.name} stage={stage} onBack={()=>setViewMode('orbit')}/>}
      {viewMode==='ground' && numericId === 6 && <VerdiaGroundView atmosphereColor={spec.atmosphereColor} stage={stage} onBack={()=>{setViewMode('orbit');}} />}
      {viewMode==='voyage' && <StarSystemVoyage system={spec} starClass={spec.starClasses[0] ?? null} mpBalance={mpBalance} onPurchase={onStartStarTravel} onExit={()=>setViewMode('orbit')}/>}
      {viewMode==='free-flight' && <FreeFlightSimulator system={spec} starClass={spec.starClasses[0] ?? null} onExit={()=>setViewMode('orbit')} />}
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
