'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getPlanetSystemSpec, STAR_PROFILES } from '@/lib/planet-system-catalog';

type Props = { stage: number; planetAssetId?: string };

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
  const orbitRadius = 2.5 + index * 0.78;
  const plane = new THREE.Group();
  plane.rotation.set(0.2 + index * 0.27, index * 0.63, 0.35 + index * 0.41);
  const orbitPoints: THREE.Vector3[] = [];
  for (let point = 0; point < 128; point += 1) {
    const angle = point / 128 * Math.PI * 2;
    orbitPoints.push(new THREE.Vector3(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius));
  }
  const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
  const orbitMaterial = new THREE.LineBasicMaterial({ color: 0xa9c6e8, transparent: true, opacity: 0.2, depthWrite: false });
  plane.add(new THREE.LineLoop(orbitGeometry, orbitMaterial));
  resources.push(orbitGeometry, orbitMaterial);

  const moonGeometry = new THREE.SphereGeometry(0.12 + index * 0.045, 28, 20);
  const moonTexture = createMoonTexture(seed + index * 13, moonColor);
  const moonMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', map: moonTexture, bumpMap: moonTexture, bumpScale: 0.035, roughness: 0.98, metalness: 0.01 });
  const moon = new THREE.Mesh(moonGeometry, moonMaterial);
  moon.position.set(orbitRadius, 0, 0);
  plane.add(moon);
  scene.add(plane);
  resources.push(moonGeometry, moonMaterial, moonTexture);
  return { plane, moon, speed: 0.16 / (1 + index * 0.58) * (index % 2 === 0 ? 1 : -1) };
}

export default function Planet3DPanel({ stage, planetAssetId = 'planet-001' }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  const spec = getPlanetSystemSpec(planetAssetId);
  const numericId = Number.parseInt(spec.id.slice(-3), 10) || 1;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    setRendererFailed(false);
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
    const camera = new THREE.PerspectiveCamera(43, width / height, 0.1, 140);
    camera.position.set(0.1, 0.42, 7.25);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 3.6;
    controls.maxDistance = 12.5;
    controls.autoRotate = false;

    const resources: Array<{ dispose: () => void }> = [];
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
      '/planet-assets/planets/' + spec.id + '/surface.jpg',
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
        const direction = index === 0
          ? new THREE.Vector3(7.2 + (numericId % 4) * 0.25, 2.8 + (numericId % 3) * 0.22, 11.4).normalize()
          : new THREE.Vector3(-7.1, 2.25, 12.6).normalize();
        const position = direction.clone().multiplyScalar(index === 0 ? 15.2 : 17.3);
        sunPositions.push(direction.clone());

        const star = new THREE.Mesh(new THREE.SphereGeometry(profile.radius, 40, 28), new THREE.MeshBasicMaterial({ color: profile.color, toneMapped: false }));
        star.position.copy(position);
        scene.add(star);
        resources.push(star.geometry, star.material);

        const glowTexture = createGlowTexture(profile.color);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: profile.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        glow.position.copy(position);
        glow.scale.setScalar(2.7 + profile.radius * 2.1);
        scene.add(glow);
        resources.push(glow.material, glowTexture);

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
    surfaceMaterial.customProgramCacheKey = () => 'campussync-fixed-stellar-terminator-v1';

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

    if (spec.rogue) {
      const internalGlow = new THREE.PointLight('#9c74ff', 0.8, 5.2, 2);
      internalGlow.position.set(-0.8, -0.35, 0.35);
      system.add(internalGlow);
    }

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
      controls.update();
      renderer.render(scene, camera);
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
      controls.dispose();
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [numericId, spec, stage, planetAssetId]);

  const starSummary = spec.rogue ? '自由浮遊惑星 · 近傍恒星なし' : spec.starClasses.map((starClass) => STAR_PROFILES[starClass].label).join(' ＋ ');

  return (
    <section className="relative min-h-[340px] overflow-hidden rounded-[26px] border border-slate-700/80 bg-[#050914] text-white shadow-[0_18px_60px_rgba(2,6,23,0.26)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4">
        <div className="rounded-xl border border-white/10 bg-slate-950/65 px-3 py-2 backdrop-blur-md">
          <p className="text-[9px] font-black tracking-[.2em] text-cyan-300">STELLAR SYSTEM</p>
          <p className="mt-1 text-xs font-bold text-white">{spec.name}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/65 px-3 py-2 text-right backdrop-blur-md">
          <p className="text-[10px] font-bold text-amber-200">{starSummary}</p>
          <p className="mt-1 text-[9px] text-slate-400">{spec.moonCount} MOON{spec.moonCount > 1 ? 'S' : ''}</p>
        </div>
      </div>
      <div ref={mountRef} className="absolute inset-0" aria-label="太陽光源・衛星を含む3D惑星表示" />
      {rendererFailed && <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-slate-300">この端末では3D表示を初期化できませんでした。ブラウザのWebGL設定を確認してください。</div>}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-4">
        <div className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 backdrop-blur-md">
          <p className="text-[10px] font-semibold text-slate-200">☀ 恒星光源は宇宙空間に固定</p>
          <p className="mt-1 text-[9px] text-slate-400">視点を変えても昼夜の境界はカメラに追従しません</p>
        </div>
        <p className="rounded-lg bg-slate-950/55 px-2.5 py-1.5 text-[9px] text-slate-400 backdrop-blur-md">ドラッグ：視点変更 · ホイール：ズーム</p>
      </div>
    </section>
  );
}
