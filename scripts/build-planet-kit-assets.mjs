import { brotliDecompressSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const partDir = resolve(root, 'assets/planet-kit-source');
const partNames = ['00.b64', '01.b64', '01-tail.b64', '02.b64', '03.b64', '04.b64'];
const parts = await Promise.all(partNames.map((name) => readFile(resolve(partDir, name), 'utf8')));
if (parts.some((part) => !/^[A-Za-z0-9+/=]+$/.test(part.trim()))) {
  throw new Error('惑星キットのソースパッケージが不正です');
}
const archive = brotliDecompressSync(Buffer.from(parts.join('').trim(), 'base64'));
if (archive.length > 2 * 1024 * 1024) throw new Error('惑星キットのソースアーカイブが上限を超えています');

const sourceRoot = resolve(root, 'lib/planet-kit');
await rm(sourceRoot, { recursive: true, force: true });
let offset = 0;
let extracted = 0;
let extractedBytes = 0;
const readTarString = (value) => {
  const end = value.indexOf(0);
  return value.subarray(0, end < 0 ? value.length : end).toString('utf8');
};

while (offset + 512 <= archive.length) {
  const header = archive.subarray(offset, offset + 512);
  if (header.every((byte) => byte === 0)) break;
  const name = readTarString(header.subarray(0, 100));
  const prefix = readTarString(header.subarray(345, 500));
  const archiveName = (prefix ? prefix + '/' + name : name).replace(/^\.\//, '');
  const sizeText = readTarString(header.subarray(124, 136)).trim();
  const size = Number.parseInt(sizeText || '0', 8);
  const type = header[156];
  const dataStart = offset + 512;
  const dataEnd = dataStart + size;

  if (!Number.isSafeInteger(size) || size < 0 || dataEnd > archive.length) {
    throw new Error('惑星キットtarが不正です: ' + archiveName);
  }

  if ((type === 0 || type === 48) && size > 0) {
    if (!archiveName.startsWith('src/') && !archiveName.startsWith('tools/generate/')) {
      throw new Error('許可されていないキットファイル: ' + archiveName);
    }
    const target = resolve(sourceRoot, archiveName);
    const rel = relative(sourceRoot, target);
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
      throw new Error('不正なアセットパス: ' + archiveName);
    }
    extractedBytes += size;
    if (extractedBytes > 1024 * 1024) throw new Error('惑星キットのソースサイズが上限を超えています');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, archive.subarray(dataStart, dataEnd));
    extracted++;
  }
  offset = dataStart + Math.ceil(size / 512) * 512;
}

if (!extracted) throw new Error('惑星キットのソースが展開されませんでした');

const require = createRequire(import.meta.url);
const ts = require('typescript');
const generatorSource = resolve(sourceRoot, 'tools/generate');
const generatorBuild = resolve(root, 'node_modules/.cache/campus-planet-kit-generator');
await rm(generatorBuild, { recursive: true, force: true });

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path));
    else if (entry.isFile() && path.endsWith('.ts')) found.push(path);
  }
  return found;
}

for (const file of await walk(generatorSource)) {
  const rel = relative(generatorSource, file).replace(/\.ts$/, '.js');
  const target = resolve(generatorBuild, rel);
  await mkdir(dirname(target), { recursive: true });
  let source = await readFile(file, 'utf8');

  if (rel === 'build.js') {
    source = source.replace(/\.ts\$\/\.test\(f\)/g, '.js$/.test(f)');
    source = source.replace(/main\(\);\s*$/, 'await main();');
  }

  source = source.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (match, start, specifier, end) => {
    const normalized = specifier.endsWith('.ts') ? specifier.slice(0, -3) + '.js' : specifier;
    return /\.[a-z0-9]+$/i.test(normalized) ? start + normalized + end : start + normalized + '.js' + end;
  });
  source = source.replace(/(import\s*\(['"])(\.{1,2}\/[^'"]+\.ts)(['"]\s*\))/g,
    (match, start, specifier, end) => start + specifier.replace(/\.ts$/, '.js') + end);

  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: false,
    },
  }).outputText;
  await writeFile(target, output);
}
await writeFile(resolve(generatorBuild, 'package.json'), JSON.stringify({ type: 'module' }));
process.env.OUT_DIR = resolve(root, 'public/planet-assets');
await import(pathToFileURL(resolve(generatorBuild, 'build.js')).href);

const manifestPath = resolve(root, 'public/planet-assets/manifest.json');
const planetsPath = resolve(root, 'public/planet-assets/planets.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const planets = JSON.parse(await readFile(planetsPath, 'utf8'));
const expected = Array.from({ length: 50 }, (_, i) => 'planet-' + String(i + 1).padStart(3, '0'));
if (manifest.collections?.planets?.count !== 50 ||
    JSON.stringify(manifest.collections.planets.ids) !== JSON.stringify(expected)) {
  throw new Error('惑星マニフェストが50種ではありません');
}
if (planets.planets?.length !== 50 || new Set(planets.planets.map((planet) => planet.id)).size !== 50) {
  throw new Error('惑星カタログの件数またはIDが不正です');
}
for (const id of expected) {
  const surface = resolve(root, 'public/planet-assets/planets', id, 'surface.svg');
  const rel = relative(resolve(root, 'public/planet-assets'), surface);
  if (rel.startsWith('..' + sep) || !rel) throw new Error('生成された惑星素材のパスが不正です: ' + id);
  const svg = await readFile(surface, 'utf8');
  if (!svg.startsWith('<svg') || !svg.includes('viewBox="0 0 2048 1024"')) {
    throw new Error('惑星表面SVGが不正です: ' + id);
  }
}
console.log('Planet Kit integrated: ' + extracted + ' source files; verified 50/50 planet SVG assets.');
