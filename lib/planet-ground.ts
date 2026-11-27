// Ground descriptions for every catalog planet except Verdia (planet-006), which
// has its own hand-authored material pack. Colours follow each orbital texture.

export type GroundKind = 'continental' | 'ocean' | 'desert' | 'ice' | 'volcanic' | 'barren' | 'crystal' | 'gas';
export type GroundLiquid = 'water' | 'lava' | 'hydrocarbon' | null;
export type GroundFlora = 'trees' | 'glow' | null;

export type PlanetGroundTheme = {
  id: string;
  kind: GroundKind;
  /** Lowland, highland and cliff colours. */
  colors: [string, string, string];
  liquid: GroundLiquid;
  liquidColor: string;
  /** Veins or cracks that glow in the ground material. */
  glow: string | null;
  flora: GroundFlora;
  floraColor: string;
  zenith: string;
  horizon: string;
  /** 0 hides the sun (rogue planet). */
  suns: 0 | 1 | 2;
  stars: boolean;
};

type Options = Partial<Omit<PlanetGroundTheme, 'id' | 'kind' | 'colors' | 'zenith' | 'horizon'>>;

function theme(
  number: number, kind: GroundKind, colors: [string, string, string], zenith: string, horizon: string, options: Options = {},
): PlanetGroundTheme {
  return {
    id: 'planet-' + String(number).padStart(3, '0'), kind, colors, zenith, horizon,
    liquid: null, liquidColor: '#2c6f8f', glow: null, flora: null, floraColor: '#4f7f4a', suns: 1, stars: false,
    ...options,
  };
}

const water = (liquidColor: string): Options => ({ liquid: 'water', liquidColor });
const lava: Options = { liquid: 'lava', liquidColor: '#ff5a12', glow: '#ff6a18' };

const THEMES: PlanetGroundTheme[] = [
  theme(1, 'continental', ['#5f8a45', '#a8945c', '#6f675a'], '#2f70c4', '#bcd9ee', { ...water('#1d5f86'), flora: 'trees' }),
  theme(2, 'ocean', ['#d9ce9c', '#5c9a58', '#7d7766'], '#1f6fc0', '#b6e2ee', { ...water('#1488a8'), flora: 'trees' }),
  theme(3, 'desert', ['#c88a47', '#e2c084', '#8a5233'], '#9a7a66', '#ecc99a'),
  theme(4, 'ice', ['#e4f0f8', '#bcd6ea', '#527b9c'], '#3d6f9e', '#d6ecf8', water('#20506e')),
  theme(5, 'volcanic', ['#2b2220', '#44312a', '#171211'], '#24100c', '#8a3a1e', lava),
  theme(7, 'gas', ['#e6cfa6', '#c89468', '#a8643c'], '#7a6a72', '#efdab4'),
  theme(8, 'gas', ['#9fe0ea', '#66bcdc', '#3a7fb8'], '#1f4f94', '#bcebf2'),
  theme(9, 'crystal', ['#6a48b4', '#9a74e0', '#3a2670'], '#241a52', '#b69ae8', { glow: '#7ff3ff' }),
  theme(10, 'barren', ['#8c867a', '#aaa497', '#504c48'], '#02030a', '#14161f', { stars: true }),
  theme(11, 'continental', ['#4f7a48', '#a85f3c', '#d8e2e0'], '#5a3a50', '#eaa884', { ...water('#2c5f62'), flora: 'trees', floraColor: '#3f6a40' }),
  theme(12, 'barren', ['#202428', '#363e46', '#101214'], '#151a22', '#59646e', { glow: '#9fd4ee' }),
  theme(13, 'desert', ['#b07a38', '#d49a50', '#4a2f18'], '#7a4a20', '#d9964c', { liquid: 'hydrocarbon', liquidColor: '#1c1208' }),
  theme(14, 'ice', ['#e2ece2', '#c0d6cc', '#5a7a74'], '#5a8aa4', '#e0f0ea', water('#1f4a50')),
  theme(15, 'barren', ['#7a5a48', '#a89a8c', '#46342c'], '#4a5260', '#bcbfc6'),
  theme(16, 'barren', ['#8a745c', '#a8947a', '#4c4036'], '#5a5050', '#c4ac94'),
  theme(17, 'gas', ['#e6d8f4', '#c4a8e4', '#a488cc'], '#6a58a0', '#f0e4fa'),
  theme(18, 'crystal', ['#a83a5c', '#4a78c8', '#46204a'], '#2a2266', '#a6a0e8', { glow: '#ff9ac0' }),
  theme(19, 'volcanic', ['#5a2410', '#8a3a14', '#2a120a'], '#38100a', '#d05424', lava),
  theme(20, 'volcanic', ['#d8be42', '#f0dc7a', '#702a14'], '#6a5a20', '#e8d070', { liquid: 'lava', liquidColor: '#d8641a' }),
  theme(21, 'ocean', ['#8c7458', '#5c8478', '#5a4a3a'], '#6a9ab4', '#e6f2f6', water('#14666c')),
  theme(22, 'gas', ['#f2f4f6', '#cdd6e2', '#a4b0c4'], '#5a7aa8', '#eef4fa'),
  theme(23, 'desert', ['#a87c50', '#d6b07c', '#59402c'], '#6a7a8c', '#dcc4a4', water('#1f6a6c')),
  theme(24, 'desert', ['#ece2cc', '#d8c4a4', '#a88a78'], '#4a86b4', '#f2ead8', water('#3aa098')),
  theme(25, 'ice', ['#eef8fc', '#c4e0ec', '#9a8470'], '#2f7ab8', '#d8f2fc', water('#3a7a9a')),
  theme(26, 'ocean', ['#3a4260', '#5a5a74', '#242a42'], '#040a1e', '#1f5a66', { ...water('#0c1c48'), glow: '#5affc8', stars: true }),
  theme(27, 'continental', ['#6a9448', '#b45a30', '#c8d0c4'], '#6a62a8', '#e0ccf0', { ...water('#2a6a8a'), flora: 'trees', floraColor: '#b0782c' }),
  theme(28, 'ocean', ['#c87850', '#3a9a8c', '#7a3a54'], '#2a7a9c', '#b8e8dc', { ...water('#106a6a'), flora: 'trees', floraColor: '#2f8a62' }),
  theme(29, 'gas', ['#a8dcd4', '#4aa89e', '#1f6a6a'], '#125058', '#bce8e0'),
  theme(30, 'continental', ['#4a7264', '#8a6a4a', '#3a4a48'], '#4a5478', '#b4bcdc', { ...water('#27545a'), flora: 'trees', floraColor: '#3a6a5c' }),
  theme(31, 'ice', ['#d8f0ee', '#88c4c4', '#1f3a40'], '#4a8ac0', '#dcf4fa', water('#12525e')),
  theme(32, 'volcanic', ['#303238', '#4a4a52', '#18191d'], '#3a2420', '#a86a50', { liquid: 'lava', liquidColor: '#ff4a10' }),
  theme(33, 'ocean', ['#d8d4a4', '#4aa05c', '#4a7a70'], '#1a78a8', '#b4f0dc', { ...water('#0f8a90'), flora: 'trees', floraColor: '#2f9a6a' }),
  theme(34, 'barren', ['#a08a6c', '#c4ac88', '#54443a'], '#1c2640', '#8a9abc', { stars: true }),
  theme(35, 'gas', ['#7aa8f0', '#4a74d4', '#2a48a0'], '#10245c', '#a8c8fa'),
  theme(36, 'gas', ['#d4c4f4', '#a48cd8', '#6a54a8'], '#2c1c60', '#e0d0fa'),
  theme(37, 'desert', ['#9a5f34', '#c88c54', '#4a2c1c'], '#5a6a80', '#d0ac90', water('#1f7078')),
  theme(38, 'barren', ['#1c2226', '#2c363a', '#0e1214'], '#030a10', '#10302c', { glow: '#3affb4', flora: 'glow', floraColor: '#4affc0', stars: true }),
  theme(39, 'ice', ['#e8eaf0', '#b8c0cc', '#262a34'], '#27395c', '#b4d4ee'),
  theme(40, 'desert', ['#a8903c', '#6a6a30', '#6a3a1e'], '#7a6a54', '#dccca8'),
  theme(41, 'continental', ['#7a9450', '#dcd4b8', '#7a6a50'], '#3a7ac4', '#f0e4c0', { ...water('#175470'), flora: 'trees' }),
  theme(42, 'barren', ['#46122c', '#6a2048', '#220a18'], '#2a0812', '#b04040', { glow: '#ff58b8' }),
  theme(43, 'ice', ['#38486c', '#566a94', '#141c34'], '#010208', '#161a3a', { ...water('#08102a'), glow: '#8d8aff', suns: 0, stars: true }),
  theme(44, 'continental', ['#4a8a6c', '#7a9a70', '#4a5a6a'], '#4a4a9c', '#d8c4f0', { ...water('#17487a'), flora: 'trees', floraColor: '#2f7a58', suns: 2 }),
  theme(45, 'gas', ['#e8d8a4', '#b89864', '#5a4634'], '#3a78b4', '#ecdcb4'),
  theme(46, 'crystal', ['#34307a', '#a8487c', '#1c1a48'], '#140f3c', '#9a78d0', { glow: '#ffd27a', stars: true }),
  theme(47, 'ice', ['#f0f8ff', '#a8d0f4', '#2f78c0'], '#0c1c48', '#a8d4f8', { ...water('#1a5aa8'), stars: true }),
  theme(48, 'barren', ['#b09470', '#d4bc94', '#5a3c2c'], '#4a3034', '#d89a78'),
  theme(49, 'ocean', ['#a8481f', '#d8c8a0', '#5a2412'], '#1c5ab4', '#a8d8f4', water('#0c3c88')),
  theme(50, 'continental', ['#4c9054', '#a8a468', '#5a6458'], '#2a74bc', '#c0e8d4', { ...water('#135a74'), flora: 'trees', floraColor: '#347a46' }),
];

const BY_ID = new Map(THEMES.map((entry) => [entry.id, entry]));
export const PLANET_GROUND_THEMES: readonly PlanetGroundTheme[] = THEMES;
export function getPlanetGroundTheme(planetAssetId: string): PlanetGroundTheme {
  return BY_ID.get(planetAssetId) ?? THEMES[0];
}

export const GROUND_LOCATIONS = [
  { id: 'aurora', name: 'Aurora Reach', detail: '北西の高台を望む居住区', x: -150, z: 90 },
  { id: 'glassfield', name: 'Glassfield', detail: '西側の平原に広がる研究都市', x: -70, z: 20 },
  { id: 'ember', name: 'Ember Haven', detail: '起伏に富んだ中央の丘陵都市', x: 20, z: -110 },
  { id: 'tidal', name: 'Tidal Arc', detail: '東寄りの低地に沿って続く街', x: 120, z: 30 },
  { id: 'nova', name: 'Nova Suburb', detail: '南東に計画された住宅地区', x: 90, z: 150 },
] as const;

/** Height of seas and lava lakes; planets without liquid ignore it. */
export const GROUND_LIQUID_LEVEL = 0;
const PAD_HEIGHT = 5;
/** Gas giants have no surface: their districts float above the highest cloud tops. */
export const GROUND_FLOATING_HEIGHT = 36;

export function groundSiteHeight(ground: PlanetGroundTheme, site: { x: number; z: number }) {
  return ground.kind === 'gas' ? GROUND_FLOATING_HEIGHT : groundHeightAt(ground, site.x, site.z);
}

function hash(x: number, y: number, seed: number) {
  let value = Math.imul(x, 374_761_393) ^ Math.imul(y, 668_265_263) ^ Math.imul(seed, 1_442_695_041);
  value = Math.imul(value ^ (value >>> 13), 1_274_126_177);
  return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise in 0..1. A positive period makes it repeat, for seamless tiles. */
export function valueNoise(x: number, y: number, seed: number, period = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const wrap = (v: number) => (period > 0 ? ((v % period) + period) % period : v);
  const tx = smooth(x - x0), ty = smooth(y - y0);
  const a = hash(wrap(x0), wrap(y0), seed), b = hash(wrap(x0 + 1), wrap(y0), seed);
  const c = hash(wrap(x0), wrap(y0 + 1), seed), d = hash(wrap(x0 + 1), wrap(y0 + 1), seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

export function fractalNoise(x: number, y: number, seed: number, octaves: number, period = 0) {
  let total = 0, amplitude = 0.5, scale = 1, weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(x * scale, y * scale, seed + octave * 101, period * scale) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    scale *= 2;
  }
  return total / weight;
}

export function groundHeightAt(ground: PlanetGroundTheme, x: number, z: number) {
  const seed = Number(ground.id.slice(-3)) * 7_919;
  const broad = fractalNoise(x / 420, z / 420, seed, 5) - 0.5;
  const detail = fractalNoise(x / 46, z / 46, seed + 31, 4) - 0.5;
  const ridge = 1 - Math.abs(fractalNoise(x / 700, z / 700, seed + 63, 5) * 2 - 1);
  const far = smooth(Math.max(0, Math.min(1, (Math.hypot(x, z) - 330) / 900)));
  let height: number;
  if (ground.kind === 'gas') {
    // Rolling cloud tops.
    height = broad * 60 + (fractalNoise(x / 90, z / 90, seed + 9, 5) - 0.5) * 22 - 6;
  } else {
    height = 6 + broad * 52 + detail * 6;
    if (ground.kind === 'ocean') height = broad * 74 + detail * 4 - 1;
    if (ground.kind === 'desert') {
      const warp = fractalNoise(x / 160, z / 160, seed + 5, 3) * 9;
      height += Math.pow(Math.abs(Math.sin(x / 31 + z / 77 + warp)), 0.6) * 7;
    }
    if (ground.kind === 'barren') {
      // Shallow impact craters on a jittered grid.
      const cell = 190, cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      const dx = x - (cx + 0.3 + hash(cx, cz, seed) * 0.4) * cell;
      const dz = z - (cz + 0.3 + hash(cz, cx, seed + 1) * 0.4) * cell;
      const radius = 24 + hash(cx, cz, seed + 2) * 42;
      const r = Math.hypot(dx, dz) / radius;
      if (r < 1.45) height += r < 1 ? (r * r - 0.72) * radius * 0.28 : (1.45 - r) / 0.45 * radius * 0.078;
    }
    if (ground.kind === 'crystal') height += Math.floor(detail * 9) * 1.4;
    height += Math.pow(ridge, 3) * 330 * far;
  }
  // Level building pads around every landing zone.
  for (const site of ground.kind === 'gas' ? [] : GROUND_LOCATIONS) {
    const distance = Math.hypot(x - site.x, z - site.z);
    if (distance >= 62) continue;
    const blend = smooth(Math.max(0, Math.min(1, (62 - distance) / 34)));
    height += (PAD_HEIGHT - height) * blend;
  }
  return height;
}
