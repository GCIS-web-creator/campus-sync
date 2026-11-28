'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  makeBeamMaterial,
  makeFacadeMaterial,
  makeHologramMaterial,
  makeSkyMaterial,
  makeStreetShader,
  type CityUniforms,
} from '@/components/planet-world/city-shaders';
import { makeCityProps } from '@/components/planet-world/city-props';
import { makeSkyTone } from '@/components/planet-world/ground/tone';
import type { PlanetSky } from '@/lib/planet-ground-climate';
import { CITY_VIEWPOINT, buildCityLayout, type CityShape } from '@/lib/planet-city';

type Props = {
  planetId: string; planetName: string; atmosphereColor: string; stage: number; onBack: () => void;
  /** Shown beside the planet name. */
  title?: string;
  /** Planet motif for the sky; omit to keep the standard colours. */
  sky?: PlanetSky;
};
type Mood = 'neon' | 'green';

export default function CityGroundView({ planetId, planetName, atmosphereColor, stage, onBack, title = '近未来都市', sky: planetSky = null }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const moodRef = useRef<Mood>('neon');
  const [mood, setMood] = useState<Mood>('neon');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
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

    const number = Number.parseInt(planetId.slice(-3), 10) || 1;
    const resources: Array<{ dispose: () => void }> = [];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, width() / height(), 0.2, 9_000);
    camera.position.set(CITY_VIEWPOINT.x, CITY_VIEWPOINT.y, CITY_VIEWPOINT.z);
    camera.rotation.order = 'YXZ';

    // Each planet tints the neon with its own atmosphere colour.
    const tint = new THREE.Color(atmosphereColor);
    const accentA = new THREE.Color(number % 3 === 0 ? '#ff3d8a' : number % 3 === 1 ? '#ff35d0' : '#b44cff');
    const accentB = new THREE.Color(number % 2 ? '#22d8ff' : '#2f8bff');
    const accentC = tint.clone().lerp(new THREE.Color('#7a5cff'), 0.35);
    const tone = makeSkyTone(planetSky);
    const nightHaze = tone(new THREE.Color('#0c1048').lerp(tint, 0.12), 0.55);
    const nightLow = tone(new THREE.Color('#2a1260').lerp(tint, 0.18), 0.1);
    const dayHaze = tone(new THREE.Color('#9cc8ea').lerp(tint, 0.2), 0.2);
    const dayLow = tone(new THREE.Color('#d4e8ee').lerp(tint, 0.15), 0);
    const uniforms: CityUniforms = {
      uTime: { value: 0 },
      uDay: { value: 0 },
      uHaze: { value: nightHaze.clone() },
      uHazeLow: { value: nightLow.clone() },
      uSkyNightMid: { value: tone(new THREE.Color().setRGB(0.012, 0.02, 0.085), 0.7) },
      uSkyNightTop: { value: tone(new THREE.Color().setRGB(0.002, 0.003, 0.018), 1) },
      uSkyDayLow: { value: tone(new THREE.Color().setRGB(0.62, 0.82, 0.95), 0.1) },
      uSkyDayTop: { value: tone(new THREE.Color().setRGB(0.05, 0.27, 0.72), 1) },
      uSunDirection: { value: new THREE.Vector3(0.45, 0.6, 0.35).normalize() },
      uAccentA: { value: accentA },
      uAccentB: { value: accentB },
      uAccentC: { value: accentC },
    };

    const skyGeometry = new THREE.SphereGeometry(6_000, 48, 32);
    const skyMaterial = makeSkyMaterial(uniforms);
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(sky);
    resources.push(skyGeometry, skyMaterial);

    // Every building is an instance of one of three unit solids sharing one facade shader.
    const layout = buildCityLayout(number, stage);
    const facade = makeFacadeMaterial(uniforms);
    resources.push(facade);
    const solids: Record<CityShape, THREE.BufferGeometry> = {
      box: new THREE.BoxGeometry(1, 1, 1),
      round: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
      taper: new THREE.CylinderGeometry(0.34, 0.5 * Math.SQRT2, 1, 4).rotateY(Math.PI / 4),
    };
    const dummy = new THREE.Object3D();
    (Object.keys(solids) as CityShape[]).forEach((shape) => {
      const list = layout.buildings.filter((building) => building.shape === shape);
      const geometry = solids[shape].translate(0, 0.5, 0);
      resources.push(geometry);
      if (!list.length) return;
      const size = new Float32Array(list.length * 3);
      const info = new Float32Array(list.length * 3);
      const mesh = new THREE.InstancedMesh(geometry, facade, list.length);
      list.forEach((building, index) => {
        dummy.position.set(building.x, building.y, building.z);
        dummy.scale.set(building.width, building.height, building.depth);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        size.set([building.width, building.height, building.depth], index * 3);
        const tier = building.tier === 'frontage' ? 0 : building.tier === 'midtown' ? 1 : building.tier === 'tower' ? 2 : 3;
        info.set([building.seed, building.style, tier], index * 3);
      });
      geometry.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(size, 3));
      geometry.setAttribute('instanceInfo', new THREE.InstancedBufferAttribute(info, 3));
      mesh.frustumCulled = false;
      scene.add(mesh);
      resources.push(mesh);
    });

    const streetGeometry = new THREE.PlaneGeometry(3_200, 3_200);
    const street = new Reflector(streetGeometry, {
      textureWidth: Math.round(Math.min(1_024, width() * pixelRatio * 0.6)),
      textureHeight: Math.round(Math.min(1_024, height() * pixelRatio * 0.6)),
      shader: makeStreetShader(uniforms),
      clipBias: 0.003,
    });
    // Reflector clones shader uniforms; reconnect them so time and mood stay shared.
    Object.assign((street.material as THREE.ShaderMaterial).uniforms, uniforms);
    street.rotation.x = -Math.PI / 2;
    scene.add(street);
    resources.push(streetGeometry, street);

    const props = makeCityProps(layout, number, [accentA, accentB, accentC], resources);
    scene.add(props.shared, props.night, props.green);

    const hologramPlane = new THREE.PlaneGeometry(1, 1);
    resources.push(hologramPlane);
    layout.buildings
      .filter((building) => building.tier === 'midtown' && building.y === 0 && building.height > 52 && building.z < -50 && Math.abs(building.x) < 190)
      .filter((_, index) => index % 5 === 0)
      .forEach((building, index) => {
        const material = makeHologramMaterial(uniforms, [accentA, accentB, accentC][index % 3], building.seed);
        const screen = new THREE.Mesh(hologramPlane, material);
        screen.scale.set(building.width * 0.82, building.height * 0.26, 1);
        screen.position.set(building.x, building.height * 0.68, building.z + building.depth / 2 + 0.8);
        props.night.add(screen);
        resources.push(material);
      });

    const beamGeometry = new THREE.CylinderGeometry(34, 1.5, 900, 24, 1, true).translate(0, 450, 0);
    resources.push(beamGeometry);
    const beams = [[-190, -520, '#8fb8ff'], [230, -640, '#d49cff'], [-330, -240, '#7fe8ff']].map(([x, z, color]) => {
      const material = makeBeamMaterial(color as string);
      const beam = new THREE.Mesh(beamGeometry, material);
      beam.position.set(x as number, 60, z as number);
      props.night.add(beam);
      resources.push(material);
      return beam;
    });

    const sunlight = new THREE.DirectionalLight('#fff1da', 2.4);
    sunlight.position.copy(uniforms.uSunDirection.value).multiplyScalar(100);
    const fill = new THREE.HemisphereLight('#8a86ff', '#2a1440', 0.9);
    scene.add(sunlight, fill);

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, target);
    const bloom = new UnrealBloomPass(new THREE.Vector2(width(), height()), 0.5, 0.45, 0.92);
    const output = new OutputPass();
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloom);
    composer.addPass(output);
    resources.push(target, composer, bloom, output);

    // The viewer stays on one spot and looks around and up, like a person on the street.
    let yaw = 0;
    let pitch = 0;
    let fov = 70;
    const applyLens = () => {
      camera.aspect = width() / height();
      const portrait = camera.aspect < 1;
      camera.fov = Math.min(96, fov + (portrait ? 14 : 0));
      camera.updateProjectionMatrix();
    };
    const resize = () => {
      renderer.setSize(width(), height(), false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width(), height());
      applyLens();
    };
    resize();
    pitch = THREE.MathUtils.degToRad(camera.aspect < 1 ? 30 : 22);

    const pointers = new Map<number, { x: number; y: number }>();
    const pinchDistance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onPointerDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      const last = pointers.get(event.pointerId);
      if (!last) return;
      const before = pointers.size === 2 ? pinchDistance() : 0;
      const dx = event.clientX - last.x, dy = event.clientY - last.y;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        fov = THREE.MathUtils.clamp(fov - (pinchDistance() - before) * 0.12, 40, 82);
        applyLens();
        return;
      }
      const speed = camera.fov / height() * Math.PI / 180;
      yaw += dx * speed;
      pitch = THREE.MathUtils.clamp(pitch + dy * speed, -0.12, 1.45);
    };
    const onPointerUp = (event: PointerEvent) => { pointers.delete(event.pointerId); };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      fov = THREE.MathUtils.clamp(fov + Math.sign(event.deltaY) * 4, 40, 82);
      applyLens();
    };
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let applied: Mood | null = null;
    const applyMood = (next: Mood) => {
      const day = next === 'green';
      uniforms.uDay.value = day ? 1 : 0;
      uniforms.uHaze.value.copy(day ? dayHaze : nightHaze);
      uniforms.uHazeLow.value.copy(day ? dayLow : nightLow);
      props.setDay(day);
      props.night.visible = !day;
      props.green.visible = day;
      bloom.strength = day ? 0.12 : 0.5;
      bloom.threshold = day ? 1.1 : 0.92;
      renderer.toneMappingExposure = day ? 0.8 : 0.95;
      sunlight.intensity = day ? 2.4 : 0.15;
      fill.color.set(day ? '#cfe8ff' : '#8a86ff');
      fill.groundColor.set(day ? '#5a6a40' : '#2a1440');
      fill.intensity = day ? 1.5 : 0.9;
      applied = next;
    };

    const clock = new THREE.Clock();
    let frame = 0;
    let alive = true;
    const render = () => {
      if (!alive) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      uniforms.uTime.value += delta;
      if (applied !== moodRef.current) applyMood(moodRef.current);
      props.update(uniforms.uTime.value);
      beams.forEach((beam, index) => {
        beam.rotation.z = Math.sin(uniforms.uTime.value * 0.13 + index * 2.1) * 0.36;
        beam.rotation.x = Math.cos(uniforms.uTime.value * 0.09 + index) * 0.2;
      });
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
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      if (canvas.parentElement === mount) mount.removeChild(canvas);
    };
  }, [planetId, atmosphereColor, stage, planetSky]);

  const choose = (next: Mood) => { moodRef.current = next; setMood(next); };
  return (
    <div className="absolute inset-0 z-20 overflow-hidden bg-[#070a24] text-white">
      <div ref={mountRef} className="absolute inset-0" data-ground-stage={stage} aria-label={planetName + 'の近未来都市を地上から見上げる3D景観'} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 58%, rgba(4,2,20,.42) 100%)' }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="rounded-xl border border-cyan-200/20 bg-slate-950/55 px-3 py-2 backdrop-blur-md">
          <p className="text-[9px] font-black tracking-[.2em] text-cyan-200">CITY STREET VIEW</p>
          <p className="mt-0.5 text-xs font-bold">{planetName} · {title}</p>
          <p className="mt-0.5 text-[9px] text-slate-300">文明 Stage {stage}</p>
        </div>
        <button type="button" onClick={onBack} className="pointer-events-auto rounded-xl border border-white/20 bg-slate-950/65 px-3 py-2 text-[10px] font-bold backdrop-blur-md">惑星視点へ戻る</button>
      </div>
      {failed && <p className="absolute inset-x-0 top-1/2 z-30 text-center text-xs font-bold text-amber-200">この端末では3D表示を初期化できませんでした。</p>}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-wrap items-end justify-between gap-2 p-3 sm:p-4">
        <p className="rounded-lg bg-slate-950/50 px-2.5 py-1.5 text-[10px] text-slate-200">ドラッグで見上げる・見回す · ホイール／ピンチで拡大</p>
        <div className="pointer-events-auto flex gap-1 rounded-xl border border-white/15 bg-slate-950/65 p-1 backdrop-blur-md">
          {([['neon', '夜 · ネオン'], ['green', '昼 · グリーン']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={mood === value} onClick={() => choose(value)} className={'rounded-lg px-2.5 py-1.5 text-[10px] font-black ' + (mood === value ? 'bg-cyan-300 text-slate-950' : 'text-slate-200')}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
