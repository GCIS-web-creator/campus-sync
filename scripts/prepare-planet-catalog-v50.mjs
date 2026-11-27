import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const archivePath = resolve(root, 'assets', 'planet-catalog-021-050.tar.gz');
const outputRoot = resolve(root, 'public', 'planet-world', 'planet-catalog-v50');

if (!existsSync(archivePath)) throw new Error('追加惑星カタログのアーカイブが見つかりません。');
const compressed = readFileSync(archivePath);
const tar = gunzipSync(compressed, { maxOutputLength: 4 * 1024 * 1024 });
const filesByPlanet = new Map();
let offset = 0;
let extractedBytes = 0;

rmSync(outputRoot, { recursive: true, force: true });

while (offset + 512 <= tar.length) {
  const header = tar.subarray(offset, offset + 512);
  if (header.every((byte) => byte === 0)) break;

  const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
  const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
  const archiveName = prefix ? prefix + '/' + name : name;
  const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
  const size = Number.parseInt(sizeText || '0', 8);
  const type = header[156];
  const dataStart = offset + 512;
  const dataEnd = dataStart + size;

  if (!Number.isSafeInteger(size) || size < 0 || dataEnd > tar.length) {
    throw new Error('不正な追加惑星アーカイブです: ' + archiveName);
  }

  if ((type === 0 || type === 48) && size > 0) {
    const match = /^planets\/(planet-(02[1-9]|0[3-4][0-9]|050))\/(surface|clouds|emissive|ring)\.webp$/.exec(archiveName);
    if (!match) throw new Error('追加アーカイブに許可されていないファイルがあります: ' + archiveName);
    const [, planetId, , role] = match;
    const data = tar.subarray(dataStart, dataEnd);
    if (data.length < 16 || data.subarray(0, 4).toString('ascii') !== 'RIFF' || data.subarray(8, 12).toString('ascii') !== 'WEBP') {
      throw new Error('WebP画像として読み取れません: ' + archiveName);
    }

    const target = resolve(outputRoot, archiveName);
    const rel = relative(outputRoot, target);
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
      throw new Error('許可されていない追加アセットのパスです: ' + archiveName);
    }
    extractedBytes += size;
    if (extractedBytes > 2 * 1024 * 1024) throw new Error('追加惑星アセットの展開サイズが上限を超えています。');

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    if (!filesByPlanet.has(planetId)) filesByPlanet.set(planetId, []);
    filesByPlanet.get(planetId).push(role);
  }

  offset = dataStart + Math.ceil(size / 512) * 512;
}

const expectedIds = Array.from({ length: 30 }, (_, index) => 'planet-' + String(index + 21).padStart(3, '0'));
for (const id of expectedIds) {
  const roles = filesByPlanet.get(id) || [];
  if (!roles.includes('surface')) throw new Error('表面テクスチャがありません: ' + id);
}
if (filesByPlanet.size !== 30) throw new Error('追加惑星数が不正です: ' + filesByPlanet.size + '/30');

const manifest = {
  schema: 'campussync.planet-catalog-assets/1',
  source: 'campussync-planet-kit-50planets.zip',
  surfaceTextureSize: '512x256',
  auxiliaryTextureSize: '256x128',
  count: 30,
  ids: expectedIds,
  planets: expectedIds.map((id) => ({
    id,
    files: Object.fromEntries((filesByPlanet.get(id) || []).sort().map((role) => [role, `planets/${id}/${role}.webp`])),
  })),
};
writeFileSync(resolve(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('追加惑星カタログを展開しました: 021〜050 / ' + filesByPlanet.size + '惑星 / ' + extractedBytes.toLocaleString('ja-JP') + ' bytes');
