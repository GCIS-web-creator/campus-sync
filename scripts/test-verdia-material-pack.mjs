import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const assetRoot = resolve(process.cwd(), 'public/planet-world/planet-006/verdia-material-pack-v1');
const manifestPath = resolve(assetRoot, 'atlas-manifest.json');
const atlasPath = resolve(assetRoot, 'material-atlas.webp');
const masksPath = resolve(assetRoot, 'geography-masks-atlas.webp');

test('ヴェルディアPBRアトラスと実地理マスクがビルド対象に存在し、形式とハッシュが正しい', () => {
  assert.ok(existsSync(manifestPath), 'atlas manifest is missing');
  assert.ok(existsSync(atlasPath), 'material atlas is missing');
  assert.ok(existsSync(masksPath), 'geography mask atlas is missing');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.planetId, 'planet-006');
  assert.deepEqual(manifest.dimensions, [576, 672]);
  assert.equal(manifest.tileSize, 96);
  assert.equal(manifest.layout.rows.length, 7);
  assert.deepEqual(manifest.layout.columns, ['baseColor', 'normal', 'roughness', 'ao', 'height', 'emissive']);
  assert.deepEqual(manifest.geographyMasks.dimensions, [256, 256]);
  assert.equal(manifest.geographyMasks.cellSize, 128);
  assert.deepEqual(manifest.geographyMasks.sourceCrop, { x: 1664, y: 576, width: 384, height: 384, sourceDimensions: [2048, 1024] });

  const materialBytes = readFileSync(atlasPath);
  assert.ok(statSync(atlasPath).size > 30_000, 'material atlas is unexpectedly small');
  assert.ok(materialBytes.subarray(0, 4).equals(Buffer.from('RIFF')));
  assert.ok(materialBytes.subarray(8, 12).equals(Buffer.from('WEBP')));

  const masksBytes = readFileSync(masksPath);
  assert.equal(statSync(masksPath).size, 9902, 'geography mask atlas size changed');
  assert.ok(masksBytes.subarray(0, 4).equals(Buffer.from('RIFF')));
  assert.ok(masksBytes.subarray(8, 12).equals(Buffer.from('WEBP')));
  assert.equal(
    createHash('sha256').update(masksBytes).digest('hex'),
    'e0f80805b1b7a4703650475196bbdb6dd3cbeb9028ff231b4e6b7b1d7a1f3b75',
    'geography mask atlas checksum mismatch',
  );
});
