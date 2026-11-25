import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const assetRoot = resolve(process.cwd(), 'public/planet-world/planet-006/verdia-material-pack-v1');
const manifestPath = resolve(assetRoot, 'atlas-manifest.json');
const atlasPath = resolve(assetRoot, 'material-atlas.webp');

test('ヴェルディア地上PBRアトラスがビルド対象に存在する', () => {
  assert.ok(existsSync(manifestPath), 'atlas manifest is missing');
  assert.ok(existsSync(atlasPath), 'material atlas is missing');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.planetId, 'planet-006');
  assert.deepEqual(manifest.dimensions, [576, 672]);
  assert.equal(manifest.tileSize, 96);
  assert.equal(manifest.layout.rows.length, 7);
  assert.deepEqual(manifest.layout.columns, ['baseColor', 'normal', 'roughness', 'ao', 'height', 'emissive']);
  const bytes = readFileSync(atlasPath);
  assert.ok(statSync(atlasPath).size > 30_000, 'material atlas is unexpectedly small');
  assert.ok(bytes.subarray(0, 4).equals(Buffer.from('RIFF')));
  assert.ok(bytes.subarray(8, 12).equals(Buffer.from('WEBP')));
});
