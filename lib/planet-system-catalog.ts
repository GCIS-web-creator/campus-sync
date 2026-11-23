export type StarClass = 'M' | 'K' | 'G' | 'F' | 'A' | 'B' | 'DA';
export type StarProfile = { class: StarClass; label: string; color: string; lightColor: string; radius: number; intensity: number; temperature: string };

export const STAR_PROFILES: Record<StarClass, StarProfile> = {
  M: { class: 'M', label: '赤色矮星', color: '#ff684e', lightColor: '#ff8a69', radius: 0.52, intensity: 1.45, temperature: '約2,400〜3,700 K' },
  K: { class: 'K', label: '橙色矮星', color: '#ffad68', lightColor: '#ffd0a0', radius: 0.62, intensity: 1.7, temperature: '約3,700〜5,200 K' },
  G: { class: 'G', label: '黄色矮星', color: '#ffe3a0', lightColor: '#fff0ce', radius: 0.72, intensity: 2.05, temperature: '約5,200〜6,000 K' },
  F: { class: 'F', label: '黄白色星', color: '#fff0d4', lightColor: '#fff6e8', radius: 0.69, intensity: 2.25, temperature: '約6,000〜7,500 K' },
  A: { class: 'A', label: '白色星', color: '#dce9ff', lightColor: '#eaf2ff', radius: 0.78, intensity: 2.65, temperature: '約7,500〜10,000 K' },
  B: { class: 'B', label: '青色巨星', color: '#85b8ff', lightColor: '#b4d1ff', radius: 1.02, intensity: 3.15, temperature: '約10,000〜30,000 K' },
  DA: { class: 'DA', label: '白色矮星', color: '#d9efff', lightColor: '#e8f5ff', radius: 0.30, intensity: 1.35, temperature: '高温の白色矮星（小型・低光度の演出）' },
};

export type PlanetSystemSpec = { id: string; name: string; starClasses: StarClass[]; moonCount: number; atmosphereColor: string; hasRings?: boolean; rogue?: boolean };
const entries: Array<Omit<PlanetSystemSpec, 'id' | 'moonCount'> & { id: number }> = [
  { id: 1, name: 'アスタリア', starClasses: ['G'], atmosphereColor: '#8fc9ff' },
  { id: 2, name: 'オケアナ', starClasses: ['K'], atmosphereColor: '#63c8e8' },
  { id: 3, name: 'カルサ', starClasses: ['G'], atmosphereColor: '#e8b978' },
  { id: 4, name: 'グラシエル', starClasses: ['M'], atmosphereColor: '#a8dfff' },
  { id: 5, name: 'エンベリア', starClasses: ['B'], atmosphereColor: '#ff875d' },
  { id: 6, name: 'ヴェルディア', starClasses: ['K'], atmosphereColor: '#7dd4a0' },
  { id: 7, name: 'アウレオン', starClasses: ['F'], atmosphereColor: '#f7d58d' },
  { id: 8, name: 'セルリア', starClasses: ['A'], atmosphereColor: '#80baff' },
  { id: 9, name: 'ルミナ・クリスタ', starClasses: ['A'], atmosphereColor: '#c5b6ff' },
  { id: 10, name: 'ペトラ', starClasses: ['K'], atmosphereColor: '#d99a76' },
  { id: 11, name: 'セレスタ', starClasses: ['M'], atmosphereColor: '#ffb47e' },
  { id: 12, name: 'カルボニア', starClasses: ['K'], atmosphereColor: '#a6a8b0' },
  { id: 13, name: 'メタネア', starClasses: ['K'], atmosphereColor: '#e4a15d' },
  { id: 14, name: 'アンモニア', starClasses: ['M'], atmosphereColor: '#c8e9ff' },
  { id: 15, name: 'フェルミオン', starClasses: ['F'], atmosphereColor: '#c8cbd3' },
  { id: 16, name: 'グラヴィア', starClasses: ['G'], atmosphereColor: '#c7a98c' },
  { id: 17, name: 'パフィリア', starClasses: ['F'], atmosphereColor: '#e0d9ff' },
  { id: 18, name: 'コランダム', starClasses: ['B'], atmosphereColor: '#a6a5ff' },
  { id: 19, name: 'マグマリア', starClasses: ['B'], atmosphereColor: '#ff684b' },
  { id: 20, name: 'スルフラ', starClasses: ['K'], atmosphereColor: '#e1d46c' },
  { id: 21, name: 'ヴェイポラ', starClasses: ['A'], atmosphereColor: '#e8f4ff' },
  { id: 22, name: 'ニヴェウス', starClasses: ['A'], atmosphereColor: '#dcecff' },
  { id: 23, name: 'テクトラ', starClasses: ['G'], atmosphereColor: '#c6a681' },
  { id: 24, name: 'サリネア', starClasses: ['F'], atmosphereColor: '#f2e6c8' },
  { id: 25, name: 'クリオネア', starClasses: ['M'], atmosphereColor: '#8bd9ff' },
  { id: 26, name: 'オーロリア', starClasses: ['A'], atmosphereColor: '#81ffdd' },
  { id: 27, name: 'セゾナ', starClasses: ['F'], atmosphereColor: '#d9b8ff' },
  { id: 28, name: 'アルキペラ', starClasses: ['G'], atmosphereColor: '#67cbb4' },
  { id: 29, name: 'メタンティス', starClasses: ['M'], atmosphereColor: '#74d9d2' },
  { id: 30, name: 'ネブリス', starClasses: ['K'], atmosphereColor: '#a9b2df' },
  { id: 31, name: 'ヴィトリア', starClasses: ['F'], atmosphereColor: '#c5e8ff' },
  { id: 32, name: 'バサルティア', starClasses: ['B'], atmosphereColor: '#f38d69' },
  { id: 33, name: 'リーフィア', starClasses: ['K'], atmosphereColor: '#62dfb1' },
  { id: 34, name: 'リングレア', starClasses: ['G'], atmosphereColor: '#b2c7e8', hasRings: true },
  { id: 35, name: 'ネプティア', starClasses: ['A'], atmosphereColor: '#77aaff' },
  { id: 36, name: 'ヘリオス', starClasses: ['B'], atmosphereColor: '#bcaaff', hasRings: true },
  { id: 37, name: 'リフトリア', starClasses: ['G'], atmosphereColor: '#c79a80' },
  { id: 38, name: 'ルミノス', starClasses: ['M'], atmosphereColor: '#70f5d1' },
  { id: 39, name: 'カルボネア', starClasses: ['M'], atmosphereColor: '#a9d9ff' },
  { id: 40, name: 'フラクティス', starClasses: ['F'], atmosphereColor: '#c5b6a4' },
  { id: 41, name: 'エクアトリア', starClasses: ['F'], atmosphereColor: '#e8d3a0' },
  { id: 42, name: 'ルブラ', starClasses: ['M'], atmosphereColor: '#ff765f' },
  { id: 43, name: 'ノクターナ', starClasses: [], atmosphereColor: '#8d8acb', rogue: true },
  { id: 44, name: 'バイセリア', starClasses: ['B', 'K'], atmosphereColor: '#d5b8ff' },
  { id: 45, name: 'アエロリア', starClasses: ['F'], atmosphereColor: '#a6d9ff' },
  { id: 46, name: 'オービタ', starClasses: ['G'], atmosphereColor: '#c6aaff' },
  { id: 47, name: 'ニヴァリス', starClasses: ['DA'], atmosphereColor: '#b7e8ff' },
  { id: 48, name: 'インパクタ', starClasses: ['B'], atmosphereColor: '#ff9a76' },
  { id: 49, name: 'アクアベル', starClasses: ['G'], atmosphereColor: '#67bfff' },
  { id: 50, name: 'テラノヴァ', starClasses: ['G'], atmosphereColor: '#8bd6a7' },
];

export const PLANET_SYSTEM_CATALOG: Record<string, PlanetSystemSpec> = Object.fromEntries(
  entries.map(({ id, ...entry }) => {
    const key = 'planet-' + String(id).padStart(3, '0');
    return [key, { ...entry, id: key, moonCount: (id % 3) + 1 }];
  }),
);

const fallback: PlanetSystemSpec = { id: 'planet-001', name: 'アスタリア', starClasses: ['G'], moonCount: 2, atmosphereColor: '#8fc9ff' };
export function getPlanetSystemSpec(planetAssetId?: string | null): PlanetSystemSpec {
  if (planetAssetId && PLANET_SYSTEM_CATALOG[planetAssetId]) return PLANET_SYSTEM_CATALOG[planetAssetId];
  return fallback;
}
