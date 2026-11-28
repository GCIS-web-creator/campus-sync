import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundRandom } from '@/lib/planet-ground-stage';
import type { SkyTone } from './tone';


export type Disposable = { dispose: () => void };

export type GroundContext = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  resources: Disposable[];
  planetNumber: number;
  atmosphere: THREE.Color;
  /** Recolours sky, haze and reflections to the planet's motif. */
  tone: SkyTone;
  /** Backing-store size of the canvas when the scene is built. */
  pixels: { width: number; height: number };
  /** Phone-sized screens get lighter vegetation. */
  compact: boolean;
};

export type GroundScene = {
  camera: {
    position: [number, number, number];
    /** Degrees. Positive pitch looks up. */
    pitch: number;
    portraitPitch: number;
    yaw?: number;
    fov: number;
    far?: number;
  };
  exposure: number;
  bloom: { strength: number; radius: number; threshold: number };
  update?: (time: number) => void;
};

export function makeKit(context: GroundContext, salt: number) {
  const random = groundRandom(context.planetNumber * 92_821 + salt);
  const between = (low: number, high: number) => low + random() * (high - low);
  const keep = <T extends Disposable>(resource: T) => { context.resources.push(resource); return resource; };

  // Static parts are collected per material and merged into one mesh each.
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const dummy = new THREE.Object3D();
  const put = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    scale: [number, number, number] = [1, 1, 1],
    rotation: [number, number, number] = [0, 0, 0],
    parent?: THREE.Matrix4,
  ) => {
    dummy.position.set(...position);
    dummy.scale.set(...scale);
    dummy.rotation.set(...rotation);
    dummy.updateMatrix();
    const matrix = parent ? parent.clone().multiply(dummy.matrix) : dummy.matrix;
    const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    copy.applyMatrix4(matrix);
    const list = batches.get(material);
    if (list) list.push(copy); else batches.set(material, [copy]);
  };
  /** A cylinder (or box) stretched between two points. */
  const strut = (geometry: THREE.BufferGeometry, material: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, radius: number) => {
    const direction = to.clone().sub(from);
    const length = direction.length();
    if (length < 1e-4) return;
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.divideScalar(length));
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    const middle = from.clone().add(to).multiplyScalar(0.5);
    put(geometry, material, [middle.x, middle.y, middle.z], [radius, length, radius], [euler.x, euler.y, euler.z]);
  };
  const flush = (shadows: boolean) => {
    batches.forEach((parts, material) => {
      const merged = mergeGeometries(parts);
      parts.forEach((part) => part.dispose());
      if (!merged) return;
      const mesh = new THREE.Mesh(keep(merged), material);
      mesh.castShadow = shadows && !material.transparent;
      mesh.receiveShadow = shadows;
      context.scene.add(mesh);
    });
    batches.clear();
  };

  const instances = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    list: Array<{ p: [number, number, number]; s: [number, number, number]; r?: [number, number, number]; c?: THREE.Color }>,
    shadows = false,
  ) => {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((item, index) => {
      dummy.position.set(...item.p);
      dummy.scale.set(...item.s);
      dummy.rotation.set(...(item.r ?? [0, 0, 0]));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      if (item.c) mesh.setColorAt(index, item.c);
    });
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.frustumCulled = false;
    context.scene.add(mesh);
    context.resources.push(mesh);
    return mesh;
  };

  /** Repeating painted texture. `paint` draws on a square canvas. */
  const texture = (size: number, paint: (g: CanvasRenderingContext2D, size: number) => void, repeat: [number, number] = [1, 1]) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    if (g) paint(g, size);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(...repeat);
    map.anisotropy = Math.min(8, context.renderer.capabilities.getMaxAnisotropy());
    return keep(map);
  };

  const glowMap = () => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    if (g) {
      const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.18, 'rgba(255,255,255,0.55)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gradient;
      g.fillRect(0, 0, size, size);
    }
    return keep(new THREE.CanvasTexture(canvas));
  };

  /** A cloud of leaf blades, shaded as if it were a soft ball. */
  const leafCluster = (blades: number, blade: number) => {
    const points: number[] = [];
    const normals: number[] = [];
    const centre = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let index = 0; index < blades; index += 1) {
      centre.set(between(-1, 1), between(-1, 1), between(-1, 1)).normalize().multiplyScalar(between(0.5, 1.05));
      a.set(between(-1, 1), between(-1, 1), between(-1, 1)).normalize().multiplyScalar(blade);
      b.set(between(-1, 1), between(-1, 1), between(-1, 1)).cross(a).normalize().multiplyScalar(blade * 0.55);
      const normal = centre.clone().normalize().add(new THREE.Vector3(0, 0.55, 0)).normalize();
      const q = [centre.clone().add(a), centre.clone().add(b), centre.clone().sub(a), centre.clone().sub(b)];
      for (const point of [q[0], q[1], q[2], q[0], q[2], q[3]]) {
        points.push(point.x, point.y, point.z);
        normals.push(normal.x, normal.y, normal.z);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return keep(geometry);
  };
  const leafMaterial = (color: string, emissive = 0.12) => {
    const material = keep(new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(emissive), side: THREE.DoubleSide }));
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', 'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
    };
    material.customProgramCacheKey = () => 'campus-leaf';
    return material;
  };

  return { random, between, keep, put, strut, flush, instances, texture, glowMap, leafCluster, leafMaterial };
}

export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise21(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += noise21(p) * a; p = p * 2.03 + 11.7; a *= 0.5; } return v; }
`;

export type SkyOptions = {
  zenith: string;
  middle: string;
  horizon: string;
  cloudLight: string;
  cloudShade: string;
  /** 0 clear, 1 overcast. */
  cover: number;
  /** Larger values make puffier, more clearly bounded clouds. */
  puff: number;
  sunDirection: THREE.Vector3;
  sunColor: string;
  sunStrength: number;
  stars: number;
};

export function addSky(context: GroundContext, options: SkyOptions, radius: number) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uZenith: { value: context.tone(options.zenith, 1) },
      uMiddle: { value: context.tone(options.middle, 0.5) },
      uHorizon: { value: context.tone(options.horizon, 0) },
      uLight: { value: context.tone(options.cloudLight, 0.15) },
      uShade: { value: context.tone(options.cloudShade, 0.4) },
      uCover: { value: options.cover },
      uPuff: { value: options.puff },
      uSun: { value: options.sunDirection.clone().normalize() },
      uSunColor: { value: new THREE.Color(options.sunColor) },
      uSunStrength: { value: options.sunStrength },
      uStars: { value: options.stars },
    },
    vertexShader: 'varying vec3 vDirection; void main(){ vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime, uCover, uPuff, uSunStrength, uStars;
      uniform vec3 uZenith, uMiddle, uHorizon, uLight, uShade, uSun, uSunColor;
      varying vec3 vDirection;
      ${NOISE_GLSL}
      float cloudAt(vec2 p) { return fbm(p) * 0.72 + fbm(p * 3.1 + 7.0) * 0.28; }
      void main() {
        vec3 d = normalize(vDirection);
        float up = max(d.y, 0.0);
        vec3 color = mix(uHorizon, uMiddle, smoothstep(0.0, 0.24, up));
        color = mix(color, uZenith, smoothstep(0.18, 0.8, up));
        vec2 plane = d.xz / (up * 1.5 + 0.28) * 1.55 + vec2(uTime * 0.004, 0.0);
        float body = cloudAt(plane);
        float edge = mix(0.22, 0.07, uPuff);
        float start = mix(0.72, 0.36, uCover);
        float cloud = smoothstep(start, start + edge, body);
        // Sample toward the sun to light the cloud tops and shade the undersides.
        float toward = cloudAt(plane + uSun.xz * 0.14 + vec2(0.0, -0.06));
        float lit = clamp(0.62 + (body - toward) * 4.0, 0.0, 1.0);
        float sun = max(dot(d, uSun), 0.0);
        vec3 cloudColor = mix(uShade, uLight, lit) + uSunColor * pow(sun, 6.0) * 0.45 * uSunStrength;
        color = mix(color, cloudColor, cloud * smoothstep(-0.01, 0.09, d.y));
        color += uSunColor * (pow(sun, 7.0) * 0.28 + pow(sun, 90.0) * 0.7 + smoothstep(0.9992, 0.9996, sun) * 4.0 * (1.0 - cloud)) * uSunStrength;
        vec2 cell = floor(d.xz / (abs(d.y) + 0.35) * 460.0);
        color += vec3(step(0.9972, hash21(cell))) * hash21(cell + 5.0) * uStars * (1.0 - cloud) * smoothstep(0.08, 0.4, d.y);
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  const geometry = new THREE.SphereGeometry(radius, 48, 32);
  const sky = new THREE.Mesh(geometry, material);
  sky.renderOrder = -10;
  context.scene.add(sky);
  context.resources.push(geometry, material);
  return { update: (time: number) => { material.uniforms.uTime.value = time; } };
}

/** A sun with soft shadows over a square region, rendered once for static scenes. */
export function addSun(context: GroundContext, color: string, intensity: number, direction: THREE.Vector3, centre: [number, number, number], extent: number) {
  const light = new THREE.DirectionalLight(color, intensity);
  const target = new THREE.Vector3(...centre);
  light.position.copy(direction).normalize().multiplyScalar(extent * 2.4).add(target);
  light.target.position.copy(target);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  const camera = light.shadow.camera;
  camera.left = camera.bottom = -extent;
  camera.right = camera.top = extent;
  camera.near = 1;
  camera.far = extent * 6;
  light.shadow.bias = -0.0006;
  light.shadow.normalBias = 0.06;
  context.scene.add(light, light.target);
  context.resources.push(light);
  context.renderer.shadowMap.enabled = true;
  context.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  context.renderer.shadowMap.autoUpdate = false;
  context.renderer.shadowMap.needsUpdate = true;
  return light;
}

/** Gives metals something to reflect: a small gradient room turned into an environment map. */
export function addEnvironment(context: GroundContext, sky: string, ground: string, lamps: Array<{ color: string; position: [number, number, number]; size: number }>) {
  const room = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(50, 24, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uSky: { value: context.tone(sky, 0.7) }, uGround: { value: new THREE.Color(ground) } },
    vertexShader: 'varying vec3 v; void main(){ v = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uSky, uGround; varying vec3 v; void main(){ float h = normalize(v).y; gl_FragColor = vec4(mix(uGround, uSky, smoothstep(-0.35, 0.45, h)), 1.0); }',
  });
  room.add(new THREE.Mesh(geometry, material));
  const ball = new THREE.SphereGeometry(1, 8, 6);
  const extras: Disposable[] = [geometry, material, ball];
  for (const lamp of lamps) {
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(lamp.color).multiplyScalar(6) });
    const mesh = new THREE.Mesh(ball, glow);
    mesh.position.set(...lamp.position);
    mesh.scale.setScalar(lamp.size);
    room.add(mesh);
    extras.push(glow);
  }
  const generator = new THREE.PMREMGenerator(context.renderer);
  const target = generator.fromScene(room, 0.03);
  context.scene.environment = target.texture;
  context.resources.push(target);
  generator.dispose();
  extras.forEach((item) => item.dispose());
}
