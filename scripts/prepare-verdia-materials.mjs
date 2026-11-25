import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const partsDir = resolve(root, 'assets/verdia-material-atlas-parts');
const target = resolve(root, 'public/planet-world/planet-006/verdia-material-pack-v1/material-atlas.webp');
const expectedBytes = 43180;
const expectedSha256 = '387c516c468b2d2e43f82288f21c4c0a4e0c062d3e0a8f82b11bc34062a2f218';
const parts = await Promise.all(Array.from({ length: 10 }, async (_, i) =>
  (await readFile(resolve(partsDir, String(i).padStart(2, '0') + '.b64'), 'utf8')).trim()
));
if (parts.some((part, i) => !/^[A-Za-z0-9+/]+={0,2}$/.test(part) || part.length !== (i === 9 ? 3576 : 6000))) {
  throw new Error('ヴェルディア素材アトラスのBase64パーツが不正です');
}
const atlas = Buffer.from(parts.join(''), 'base64');
const sha256 = createHash('sha256').update(atlas).digest('hex');
if (atlas.length !== expectedBytes || sha256 !== expectedSha256 || atlas.toString('ascii', 0, 4) !== 'RIFF' || atlas.toString('ascii', 8, 12) !== 'WEBP') {
  throw new Error('ヴェルディア素材アトラスのサイズ・形式・ハッシュ検証に失敗しました');
}
const width = atlas.readUInt16LE(26) & 0x3fff;
const height = atlas.readUInt16LE(28) & 0x3fff;
if (width !== 576 || height !== 672) throw new Error('素材アトラスの解像度が576×672ではありません');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, atlas);
console.log('ヴェルディアPBRアトラス生成・検証完了: 576×672 / 43,180 bytes / SHA-256 OK');
