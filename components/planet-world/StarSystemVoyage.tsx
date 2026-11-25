'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PlanetSystemSpec, StarClass } from '@/lib/planet-system-catalog';
import { STAR_PROFILES } from '@/lib/planet-system-catalog';
import {
  getVoyageStarRadius,
  STAR_SYSTEM_VOYAGE_DURATION_MS,
  STAR_SYSTEM_VOYAGE_PHASES,
  VOYAGE_SCALE,
} from '@/lib/planet-star-voyage';

type PurchaseResult = { success: boolean; balance?: number; message?: string };
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
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const gradient = context.createRadialGradient(128, 128, 6, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.12, color + 'ee');
  gradient.addColorStop(0.3, color + '88');
  gradient.addColorStop(0.62, color + '25');
  gradient.addColorStop(1, color + '00');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
  const startAtRef = useRef(0);
  const [purchasing, setPurchasing] = useState(false);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [error, setError] = useState('');
  const starProfile = starClass ? STAR_PROFILES[starClass] : null;

  const beginVoyage = async () => {
    if (purchasing || started || !starClass) return;
    if (mpBalance < 30) {
      setError('星系旅行には30MP必要です。技術ツリーで所持MPを確認してください。');
      return;
    }
    setPurchasing(true);
    setError('');
    try {
      const result = await onPurchase(crypto.randomUUID());
      if (!result.success) throw new Error(result.message || '決済できませんでした。');
      startAtRef.current = performance.now();
      setElapsed(0);
      setPhaseIndex(0);
      setPhaseProgress(0);
      setStarted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '星系旅行を開始できませんでした。');
    } finally {
      setPurchasing(false);
    }
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !started || !starClass || !starProfile) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
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
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#02050d');
    const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / Math.max(1, mount.clientHeight), 0.08, 120_000);
    const resources: Array<{ dispose: () => void }> = [];

    const starfield = makeStarfield(Number.parseInt(system.id.slice(-3), 10) || 1);
    scene.add(starfield);
    resources.push(starfield.geometry, starfield.material);

    const starRadius = getVoyageStarRadius(starClass);
    const starGeometry = new THREE.SphereGeometry(starRadius, 96, 72);
    const starMaterial = new THREE.MeshBasicMaterial({ color: starProfile.lightColor, toneMapped: false });
    const star = new THREE.Mesh(starGeometry, starMaterial);
    scene.add(star);
    resources.push(starGeometry, starMaterial);

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
    halo.scale.setScalar(starRadius * 10);
    scene.add(halo);
    resources.push(haloTexture, haloMaterial);

    const planetPosition = new THREE.Vector3(-VOYAGE_SCALE.astronomicalUnit, 0, 0);
    const moonPosition = planetPosition.clone().add(new THREE.Vector3(0, 0, VOYAGE_SCALE.earthMoonDistance));
    const planetGeometry = new THREE.SphereGeometry(VOYAGE_SCALE.earthRadius, 72, 52);
    const loader = new THREE.TextureLoader();
    const planetTexture = loader.load(
      '/planet-assets/planets/' + system.id + (Number.parseInt(system.id.slice(-3), 10) >= 11 && Number.parseInt(system.id.slice(-3), 10) <= 20 ? '/surface.webp' : '/surface.jpg'),
    );
    planetTexture.colorSpace = THREE.SRGBColorSpace;
    planetTexture.wrapS = THREE.RepeatWrapping;
    planetTexture.wrapT = THREE.ClampToEdgeWrapping;
    const planetMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', map: planetTexture, roughness: 0.96, metalness: 0 });
    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    planet.position.copy(planetPosition);
    scene.add(planet);
    resources.push(planetGeometry, planetMaterial, planetTexture);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(VOYAGE_SCALE.earthRadius * 1.035, 64, 48),
      new THREE.MeshBasicMaterial({ color: system.atmosphereColor, transparent: true, opacity: 0.14, side: THREE.BackSide, depthWrite: false }),
    );
    atmosphere.position.copy(planetPosition);
    scene.add(atmosphere);
    resources.push(atmosphere.geometry, atmosphere.material);

    const moonGeometry = new THREE.SphereGeometry(VOYAGE_SCALE.moonRadius, 48, 32);
    const moonTexture = makeMoonTexture();
    const moonMaterial = new THREE.MeshStandardMaterial({ map: moonTexture, roughness: 1, metalness: 0 });
    const moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.position.copy(moonPosition);
    scene.add(moon);
    resources.push(moonGeometry, moonMaterial, moonTexture);

    const sunlight = new THREE.DirectionalLight(starProfile.lightColor, 2.8);
    sunlight.position.set(0, 0, 0);
    sunlight.target.position.copy(planetPosition);
    scene.add(sunlight, sunlight.target);
    scene.add(new THREE.AmbientLight('#9eafc8', 0.25));

    const starOrbitRadius = starRadius + 85;
    const outerStart = new THREE.Vector3(-VOYAGE_SCALE.outerSystemDistance, 160, 3_600);
    const planetFlyby = planetPosition.clone().add(new THREE.Vector3(-420, 92, 250));
    const planetOrbitRadius = 3.6;
    const moonOrbitRadius = 1.5;
    const starSkimPoint = new THREE.Vector3(-starRadius - 15, 0, 0);
    const outerEnd = new THREE.Vector3(-VOYAGE_SCALE.outerSystemDistance, 520, 3_800);
    const totalDuration = STAR_SYSTEM_VOYAGE_DURATION_MS;

    const getPose = (id: string, progress: number) => {
      const t = ease(progress);
      if (id === 'outer-cruise') {
        return {
          position: outerStart.clone().lerp(planetFlyby, t),
          target: planetPosition.clone().lerp(new THREE.Vector3(0, 0, 0), t * 0.18),
        };
      }
      if (id === 'planet-flyby-inbound') {
        const end = new THREE.Vector3(-starOrbitRadius, 0, 0);
        return {
          position: planetFlyby.clone().lerp(end, t),
          target: planetPosition.clone().lerp(new THREE.Vector3(0, 0, 0), t),
        };
      }
      if (id === 'star-orbit') {
        const angle = Math.PI + Math.PI * 2 * progress;
        return {
          position: new THREE.Vector3(Math.cos(angle) * starOrbitRadius, 13 + Math.sin(angle * 2) * 5, Math.sin(angle) * starOrbitRadius),
          target: new THREE.Vector3(0, 0, 0),
        };
      }
      if (id === 'planet-transfer') {
        const start = new THREE.Vector3(-starOrbitRadius, 0, 0);
        const end = planetPosition.clone().add(new THREE.Vector3(planetOrbitRadius, 0.35, 0));
        const position = start.clone().lerp(end, t);
        position.y += Math.sin(Math.PI * progress) * 440;
        position.z += Math.sin(Math.PI * progress) * 160;
        return {
          position,
          target: new THREE.Vector3(0, 0, 0).lerp(planetPosition, t),
        };
      }
      if (id === 'planet-orbit') {
        const angle = Math.PI * 4 * progress;
        return {
          position: planetPosition.clone().add(new THREE.Vector3(
            Math.cos(angle) * planetOrbitRadius,
            0.48 + Math.sin(angle * 2) * 0.16,
            Math.sin(angle) * planetOrbitRadius,
          )),
          target: planetPosition.clone(),
        };
      }
      if (id === 'moon-transfer') {
        const start = planetPosition.clone().add(new THREE.Vector3(planetOrbitRadius, 0.48, 0));
        const end = moonPosition.clone().add(new THREE.Vector3(moonOrbitRadius, 0.12, 0));
        const position = start.clone().lerp(end, t);
        position.y += Math.sin(Math.PI * progress) * 8;
        return {
          position,
          target: planetPosition.clone().lerp(moonPosition, t),
        };
      }
      if (id === 'moon-orbit') {
        const angle = Math.PI * 2 * progress;
        return {
          position: moonPosition.clone().add(new THREE.Vector3(
            Math.cos(angle) * moonOrbitRadius,
            0.2 + Math.sin(angle * 2) * 0.12,
            Math.sin(angle) * moonOrbitRadius,
          )),
          target: moonPosition.clone(),
        };
      }
      if (id === 'star-skim') {
        const start = moonPosition.clone().add(new THREE.Vector3(moonOrbitRadius, 0.2, 0));
        const position = start.clone().lerp(starSkimPoint, t);
        position.z += Math.sin(Math.PI * progress) * 28;
        position.y += Math.sin(Math.PI * progress) * 14;
        return { position, target: new THREE.Vector3(0, 0, 0) };
      }
      const position = starSkimPoint.clone().lerp(outerEnd, t);
      return {
        position,
        target: position.clone().add(new THREE.Vector3(-5_000, 120, 1_800)),
      };
    };

    let frame = 0;
    let lastUiUpdate = 0;
    let alive = true;
    const render = (now: number) => {
      if (!alive) return;
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
      const pose = getPose(STAR_SYSTEM_VOYAGE_PHASES[index].id, localProgress);
      camera.position.copy(pose.position);
      camera.lookAt(pose.target);
      star.rotation.y += 0.0008;
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
      resources.forEach(resource => resource.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [started, starClass, starProfile, system]);

  const activePhase = STAR_SYSTEM_VOYAGE_PHASES[phaseIndex];
  const remaining = Math.max(0, STAR_SYSTEM_VOYAGE_DURATION_MS - elapsed);
  const noStar = !starClass || !starProfile || system.rogue;

  return (
    <div className="absolute inset-0 z-40 overflow-hidden bg-[#02050d] text-white">
      <div ref={mountRef} className="absolute inset-0" aria-label="宇宙船の操縦席から見た星系旅行3D映像" />
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-[2px] sm:p-6">
          <div className="w-full max-w-xl rounded-3xl border border-cyan-200/20 bg-slate-950/88 p-5 shadow-2xl backdrop-blur-xl sm:p-7">
            <p className="text-[9px] font-black tracking-[.26em] text-cyan-200">CAMPUSSYNC · DEEP SPACE FLIGHT</p>
            <h2 className="mt-2 text-2xl font-black">星系周遊航行</h2>
            <p className="mt-2 text-xs leading-6 text-slate-300">{system.name}の外縁から出発し、恒星・惑星・衛星を順番に巡る約1分の自動航行です。視点は宇宙船の前面キャノピー内に固定されます。</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[9px] text-slate-400">巡航速度</p><p className="mt-1 text-lg font-black text-cyan-100">0.82c</p><p className="text-[9px] text-slate-500">演出上の速度表示</p></div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[9px] text-slate-400">飛行時間</p><p className="mt-1 text-lg font-black">約60秒</p><p className="text-[9px] text-slate-500">航行シーンを圧縮再生</p></div>
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
            <p className="mt-3 text-[10px] leading-5 text-slate-400">天体の大きさ・軌道距離は地球、月、太陽に近い比率で配置し、宇宙船のカメラ位置から描画します。実際の宇宙船や天体観測データではなく、距離を保ったゲーム内シミュレーションです。</p>
            <p className="mt-2 text-[10px] font-bold text-amber-200">航行開始後に途中で終了しても、消費したMPは返還されません。</p>
            {noStar && <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">この惑星は恒星を持たない自由浮遊惑星のため、恒星を巡る航行はできません。</p>}
            {error && <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-slate-300">所持MP <b className="text-white">{mpBalance.toLocaleString('ja-JP')}</b> / 30 MP</span>
              <div className="flex gap-2">
                <button type="button" onClick={onExit} className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/5">戻る</button>
                <button type="button" onClick={() => void beginVoyage()} disabled={purchasing || noStar || mpBalance < 30} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">{purchasing ? '決済中…' : mpBalance < 30 ? 'MPが不足しています' : '30 MPで航行開始'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {started && (
        <>
          <div className="pointer-events-none absolute inset-0 z-10" style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,5,15,.26) 78%, rgba(0,3,10,.88) 100%)' }} />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[15%] bg-gradient-to-b from-slate-950/45 via-slate-900/15 to-transparent" />
          <div className="pointer-events-none absolute left-0 top-[8%] z-10 h-[64%] w-[7%] border-r border-cyan-100/15 bg-gradient-to-r from-slate-950/65 to-transparent [clip-path:polygon(0_0,100%_8%,74%_100%,0_91%)] sm:w-[5%]" />
          <div className="pointer-events-none absolute right-0 top-[8%] z-10 h-[64%] w-[7%] border-l border-cyan-100/15 bg-gradient-to-l from-slate-950/65 to-transparent [clip-path:polygon(0_8%,100%_0,100%_91%,26%_100%)] sm:w-[5%]" />
          <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-[9%] w-[54%] -translate-x-1/2 rounded-b-[50%] border-b border-x border-cyan-100/20 bg-gradient-to-b from-slate-950/50 to-transparent" />
          <div className="pointer-events-none absolute bottom-[23%] left-1/2 z-10 h-[3%] w-[44%] -translate-x-1/2 rounded-t-full border-t border-cyan-100/20 bg-gradient-to-t from-slate-950/55 to-transparent sm:w-[35%]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-5">
            <div className="rounded-xl border border-cyan-200/20 bg-slate-950/55 px-3 py-2 backdrop-blur-md">
              <p className="text-[9px] font-black tracking-[.22em] text-cyan-200">VESSEL SYSTEMS · AUTO PILOT</p>
              <p className="mt-1 text-xs font-black">{system.name} · {starProfile?.label}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-right backdrop-blur-md">
              <p className="text-[9px] font-bold text-slate-400">MISSION ELAPSED</p>
              <p className="mt-0.5 font-mono text-sm font-black tabular-nums">{formatClock(elapsed)}</p>
            </div>
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
                <p className="mt-1 text-[9px] text-slate-400">{completed ? '全航行フェーズを完了。帰還可能です。' : 'AUTOPILOT · SUBLIGHT CRUISE · ' + (phaseIndex < 2 ? '0.82c' : 'ORBITAL MANEUVER')}</p>
              </div>
              <div className="hidden grid-cols-3 gap-2 text-right sm:grid">
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[8px] text-slate-500">DISTANCE UNIT</p><p className="mt-1 text-[10px] font-bold">10,000 km</p></div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[8px] text-slate-500">REMAINING</p><p className="mt-1 text-[10px] font-bold tabular-nums">{formatClock(remaining)}</p></div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[8px] text-slate-500">MP SPENT</p><p className="mt-1 text-[10px] font-bold">30 MP</p></div>
              </div>
              {completed && <button type="button" onClick={onExit} className="pointer-events-auto shrink-0 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-black text-slate-950">惑星視点へ戻る</button>}
            </div>
          </div>

          {!completed && (
            <div className="pointer-events-none absolute bottom-[27%] left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 text-[9px] text-cyan-100/80 sm:bottom-[28%]">
              <span className="h-1 w-1 rounded-full bg-cyan-200 shadow-[0_0_8px_#67e8f9]" />
              {activePhase?.label}
              <span className="font-mono tabular-nums">{Math.round(phaseProgress * 100)}%</span>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-[8%] bottom-[22%] z-10 h-[1px] bg-gradient-to-r from-transparent via-cyan-200/35 to-transparent sm:inset-x-[18%]" />
          <div className="pointer-events-none absolute left-1/2 top-[46%] z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/35 opacity-65">
            <span className="absolute left-1/2 top-0 h-1 w-px -translate-x-1/2 bg-cyan-100/80" />
            <span className="absolute bottom-0 left-1/2 h-1 w-px -translate-x-1/2 bg-cyan-100/80" />
            <span className="absolute left-0 top-1/2 h-px w-1 -translate-y-1/2 bg-cyan-100/80" />
            <span className="absolute right-0 top-1/2 h-px w-1 -translate-y-1/2 bg-cyan-100/80" />
          </div>
          {!completed && <button type="button" onClick={onExit} className="pointer-events-auto absolute bottom-[27%] right-3 z-30 rounded-lg border border-white/15 bg-slate-950/75 px-3 py-2 text-[10px] font-bold text-slate-200 backdrop-blur-md sm:right-5">航行を終了</button>}
        </>
      )}
    </div>
  );
}
