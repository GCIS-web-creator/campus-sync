'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { getPlanetSky } from '@/lib/planet-ground-climate';
import type { GroundSceneKind } from '@/lib/planet-ground-stage';
import type { Disposable, GroundContext, GroundScene } from './kit';
import { buildIndustry } from './industry';
import { buildStellar } from './stellar';
import { buildTown } from './town';
import { makeSkyTone } from './tone';
import { buildVillage } from './village';

const BUILDERS: Record<Exclude<GroundSceneKind, 'cyber'>, (context: GroundContext) => GroundScene> = {
  wilderness: (context) => buildVillage(context, false),
  village: (context) => buildVillage(context, true),
  town: buildTown,
  industry: buildIndustry,
  stellar: buildStellar,
};

type Props = {
  kind: Exclude<GroundSceneKind, 'cyber'>;
  stage: number;
  stageName: string;
  planetId: string;
  planetName: string;
  atmosphereColor: string;
  onBack: () => void;
};

export default function SceneGroundView({ kind, stage, stageName, planetId, planetName, atmosphereColor, onBack }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    delete mount.dataset.ready;
    setFailed(false);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' }); }
    catch { setFailed(true); return; }
    const width = () => Math.max(1, mount.clientWidth);
    const height = () => Math.max(1, mount.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, mount.clientWidth < 700 ? 1.25 : 1.5);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width(), height(), false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;';
    mount.appendChild(renderer.domElement);

    const resources: Disposable[] = [];
    const scene = new THREE.Scene();
    const built = BUILDERS[kind]({
      scene,
      renderer,
      resources,
      planetNumber: Number.parseInt(planetId.slice(-3), 10) || 1,
      atmosphere: new THREE.Color(atmosphereColor),
      tone: makeSkyTone(getPlanetSky(planetId)),
      pixels: { width: width() * pixelRatio, height: height() * pixelRatio },
      compact: mount.clientWidth < 700,
    });
    renderer.toneMappingExposure = built.exposure;
    const camera = new THREE.PerspectiveCamera(built.camera.fov, width() / height(), 0.3, built.camera.far ?? 3_000);
    camera.position.set(...built.camera.position);
    camera.rotation.order = 'YXZ';

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, target);
    const bloom = new UnrealBloomPass(new THREE.Vector2(width(), height()), built.bloom.strength, built.bloom.radius, built.bloom.threshold);
    const output = new OutputPass();
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloom);
    composer.addPass(output);
    resources.push(target, composer, bloom, output);

    let yaw = THREE.MathUtils.degToRad(built.camera.yaw ?? 0);
    let fov = built.camera.fov;
    const applyLens = () => {
      camera.aspect = width() / height();
      camera.fov = Math.min(96, fov + (camera.aspect < 1 ? 14 : 0));
      camera.updateProjectionMatrix();
    };
    const resize = () => {
      renderer.setSize(width(), height(), false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width(), height());
      applyLens();
    };
    resize();
    let pitch = THREE.MathUtils.degToRad(camera.aspect < 1 ? built.camera.portraitPitch : built.camera.pitch);

    const pointers = new Map<number, { x: number; y: number }>();
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const canvas = renderer.domElement;
    const onPointerDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      const last = pointers.get(event.pointerId);
      if (!last) return;
      const before = pointers.size === 2 ? spread() : 0;
      const dx = event.clientX - last.x, dy = event.clientY - last.y;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        fov = THREE.MathUtils.clamp(fov - (spread() - before) * 0.12, 34, 78);
        applyLens();
        return;
      }
      const speed = camera.fov / height() * Math.PI / 180;
      yaw += dx * speed;
      pitch = THREE.MathUtils.clamp(pitch + dy * speed, -0.45, 1.4);
    };
    const onPointerUp = (event: PointerEvent) => { pointers.delete(event.pointerId); };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      fov = THREE.MathUtils.clamp(fov + Math.sign(event.deltaY) * 4, 34, 78);
      applyLens();
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const clock = new THREE.Clock();
    let elapsed = 0;
    let frame = 0;
    let alive = true;
    const render = () => {
      if (!alive) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      elapsed += delta;
      built.update?.(elapsed);
      camera.rotation.set(pitch, yaw, 0);
      composer.render(delta);
      mount.dataset.ready = 'true';
      frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      scene.environment = null;
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      if (canvas.parentElement === mount) mount.removeChild(canvas);
    };
  }, [kind, planetId, atmosphereColor]);

  return (
    <div className="absolute inset-0 z-20 overflow-hidden bg-[#0a1030] text-white">
      <div ref={mountRef} className="absolute inset-0" data-ground-stage={stage} aria-label={planetName + 'の' + stageName + 'を地上から眺める3D景観'} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 60%, rgba(8,6,20,.34) 100%)' }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="rounded-xl border border-white/20 bg-slate-950/55 px-3 py-2 backdrop-blur-md">
          <p className="text-[9px] font-black tracking-[.2em] text-cyan-200">GROUND VIEW</p>
          <p className="mt-0.5 text-xs font-bold">{planetName} · {stageName}</p>
          <p className="mt-0.5 text-[9px] text-slate-300">文明 Stage {stage}</p>
        </div>
        <button type="button" onClick={onBack} className="pointer-events-auto rounded-xl border border-white/20 bg-slate-950/65 px-3 py-2 text-[10px] font-bold backdrop-blur-md">惑星視点へ戻る</button>
      </div>
      {failed && <p className="absolute inset-x-0 top-1/2 z-30 text-center text-xs font-bold text-amber-200">この端末では3D表示を初期化できませんでした。</p>}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 p-3 sm:p-4">
        <p className="inline-block rounded-lg bg-slate-950/50 px-2.5 py-1.5 text-[10px] text-slate-200">ドラッグで見回す · ホイール／ピンチで拡大</p>
      </div>
    </div>
  );
}
