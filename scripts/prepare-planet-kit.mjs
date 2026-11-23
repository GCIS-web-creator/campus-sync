import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const archivePath = resolve(root, 'assets', 'planet-kit-bundle.tar.gz');
if (!existsSync(archivePath)) throw new Error('惑星キットのアーカイブが見つかりません。');

const compressed = readFileSync(archivePath);
const tar = gunzipSync(compressed, { maxOutputLength: 32 * 1024 * 1024 });
let offset = 0;
let extracted = 0;
let extractedBytes = 0;
const publicPlanetAssets = resolve(root, 'public', 'planet-assets');
rmSync(publicPlanetAssets, { recursive: true, force: true });

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
    throw new Error('不正な惑星キットアーカイブです: ' + archiveName);
  }

  if ((type === 0 || type === 48) && size > 0) {
    const isManagedRenderer = archiveName === 'components/Planet3DPanel.tsx';
    const target = isManagedRenderer
      ? resolve(root, 'components', 'Planet3DPanel.bundle-backup.tsx')
      : resolve(root, archiveName);
    const rel = relative(root, target);
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
      throw new Error('許可されていないファイルパスです: ' + archiveName);
    }
    extractedBytes += size;
    if (extractedBytes > 32 * 1024 * 1024) throw new Error('惑星キットの展開サイズが上限を超えています。');
    // 追跡管理する新レンダラーを、アーカイブ内の旧コンポーネントで上書きしない。
    if (!isManagedRenderer) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, tar.subarray(dataStart, dataEnd));
      extracted += 1;
    }
  }

  offset = dataStart + Math.ceil(size / 512) * 512;
}

const requiredFiles = [
  resolve(root, 'lib', 'planet-kit', 'react', 'PlanetCanvas.tsx'),
  resolve(root, 'components', 'Planet3DPanel.tsx'),
  resolve(publicPlanetAssets, 'manifest.json'),
  resolve(publicPlanetAssets, 'planets', 'planet-001', 'surface.jpg'),
];
if (requiredFiles.some((path) => !existsSync(path))) throw new Error('惑星キットの展開結果が不完全です。');
console.log('惑星キットを展開しました: ' + extracted + ' ファイル (' + extractedBytes.toLocaleString('ja-JP') + ' bytes)');
