import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('public/planet-world/planet-catalog-v50');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.schema, 'campussync.planet-catalog-assets/1');
assert.equal(manifest.count, 30);
assert.equal(manifest.ids.length, 30);
for (let index = 21; index <= 50; index += 1) {
  const id = 'planet-' + String(index).padStart(3, '0');
  assert.ok(manifest.ids.includes(id), 'missing ' + id);
  const planet = manifest.planets.find((item) => item.id === id);
  assert.ok(planet?.files?.surface, 'missing surface ' + id);
  for (const [role, relativePath] of Object.entries(planet.files)) {
    const path = resolve(root, relativePath);
    assert.ok(existsSync(path), 'missing ' + role + ' ' + id);
    assert.ok(statSync(path).size > 100, 'empty ' + role + ' ' + id);
    const bytes = readFileSync(path);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  }
}
console.log('50惑星テクスチャ検証: PASS (追加30惑星・表面画像30枚)');
