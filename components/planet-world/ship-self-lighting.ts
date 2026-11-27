import * as THREE from 'three';

type Resources = Array<{ dispose: () => void }>;

export type ShipSelfLight = {
  fill?: number;
  key?: number;
  rim?: string;
  rimStrength?: number;
};

// Light carried by the vessel itself. It is evaluated in view space inside the
// hull material, so the ship stays readable on the night side or far from any
// star without adding scene lights that would also brighten planets and moons.
export function applyShipSelfLight(material: THREE.MeshStandardMaterial, options: ShipSelfLight = {}) {
  const { fill = 0.22, key = 0.7, rim = '#6fa8ff', rimStrength = 0.32 } = options;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSelfFill = { value: fill };
    shader.uniforms.uSelfKey = { value: key };
    shader.uniforms.uSelfRim = { value: new THREE.Color(rim).multiplyScalar(rimStrength) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform float uSelfFill;',
        'uniform float uSelfKey;',
        'uniform vec3 uSelfRim;',
      ].join('\n'))
      .replace('#include <opaque_fragment>', [
        'vec3 selfNormal = normalize(normal);',
        'float selfFacing = clamp(dot(selfNormal, normalize(vViewPosition)), 0.0, 1.0);',
        'float selfKeyLight = max(dot(selfNormal, normalize(vec3(-0.45, 0.7, 0.55))), 0.0);',
        'outgoingLight += diffuseColor.rgb * (uSelfFill + uSelfKey * selfKeyLight);',
        'outgoingLight += uSelfRim * pow(1.0 - selfFacing, 3.0);',
        '#include <opaque_fragment>',
      ].join('\n'));
  };
  material.customProgramCacheKey = () => 'campus-sync-ship-self-light';
}

// Soft round halo used around running lights and drive nozzles.
export function makeGlowFactory(resources: Resources) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const alpha = Math.pow(Math.max(0, 1 - distance), 2.2);
      data.set([255, 255, 255, Math.round(alpha * 255)], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  resources.push(texture);

  return (color: string, diameter: number, opacity: number) => {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color,
      opacity,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    resources.push(material);
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(diameter);
    return sprite;
  };
}
