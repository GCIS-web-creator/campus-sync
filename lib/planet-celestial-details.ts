import type { StarClass } from '@/lib/planet-system-catalog';

export type CelestialDetail = {
  id: string;
  kind: 'star' | 'moon';
  name: string;
  subtitle: string;
  diameter: string;
  orbitalPeriod: string;
  rotationPeriod: string;
  temperature: string;
  habitability: string;
  description: string;
};

const STAR_DIAMETERS: Record<StarClass, string> = {
  M: '太陽の約0.3〜0.6倍（約42万〜84万 km）',
  K: '太陽の約0.6〜0.9倍（約84万〜125万 km）',
  G: '太陽の約1.0倍（約139万 km）',
  F: '太陽の約1.2〜1.5倍（約167万〜209万 km）',
  A: '太陽の約1.5〜2.0倍（約209万〜278万 km）',
  B: '太陽の約3〜10倍（約418万〜1,393万 km）',
  DA: '約1.2万 km（白色矮星モデル）',
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function createStarCelestialDetail(args: {
  id: string;
  systemName: string;
  starClass: StarClass;
  starLabel: string;
  temperature: string;
  planetId: number;
  starIndex: number;
  starCount: number;
}): CelestialDetail {
  const random = seeded(args.planetId * 97 + args.starIndex * 313);
  const rotationDays = 3 + random() * (args.starClass === 'DA' ? 1.5 : 38);
  const binaryRandom = seeded(args.planetId * 97 + 911);
  const binaryDays = 80 + binaryRandom() * 620;
  return {
    id: args.id,
    kind: 'star',
    name: args.starIndex === 0 ? args.systemName + 'の主恒星' : args.systemName + 'の伴星',
    subtitle: args.starLabel + ' · スペクトル型 ' + args.starClass,
    diameter: STAR_DIAMETERS[args.starClass],
    orbitalPeriod: args.starCount > 1 ? '連星の共通重心を約' + binaryDays.toFixed(0) + '日で公転（モデル値）' : '単独恒星モデルのため、恒星同士の公転周期はありません',
    rotationPeriod: '約' + rotationDays.toFixed(1) + '日（モデル推定）',
    temperature: args.temperature,
    habitability: '恒星そのものに人は住めません。周囲に液体の水が存在できる距離（ハビタブルゾーン）が生まれる可能性はあります。',
    description: 'この恒星の光と熱が、' + args.systemName + 'の惑星環境を左右します。恒星の種類・明るさに応じて、生命が存在できる領域は変化します。',
  };
}

export function createMoonCelestialDetail(args: {
  id: string;
  systemName: string;
  moonIndex: number;
  moonRadius: number;
  orbitRadius: number;
}): CelestialDetail {
  const orbitalDays = 1.8 * Math.pow(args.orbitRadius / 6.5, 1.5);
  const diameterKm = Math.round(12_742 * args.moonRadius / 1.52);
  const temperature = args.moonIndex === 1 ? '表面 約−80〜−20 ℃（モデル推定）' : args.moonIndex === 2 ? '表面 約−150〜−70 ℃（モデル推定）' : '表面 約−40〜＋20 ℃（モデル推定）';
  const habitability = args.moonIndex === 1
    ? '地表は厳しい環境ですが、氷の地下に液体の水が存在する可能性を想定できます。人が住むには地下基地などが必要です。'
    : args.moonIndex === 2
      ? '低温で大気も薄い想定です。自然環境での居住は難しく、長期滞在には密閉型の居住施設が必要です。'
      : '地表に液体の水や安定した大気がある証拠は設定されていません。人が住むには人工環境が必要です。';
  return {
    id: args.id,
    kind: 'moon',
    name: args.systemName + 'の第' + (args.moonIndex + 1) + '衛星',
    subtitle: '岩石・氷でできた自然衛星（シミュレーション）',
    diameter: 'モデル換算で約' + diameterKm.toLocaleString('ja-JP') + ' km',
    orbitalPeriod: '約' + orbitalDays.toFixed(1) + '日（惑星の周囲）',
    rotationPeriod: '約' + orbitalDays.toFixed(1) + '日（潮汐固定を想定）',
    temperature,
    habitability,
    description: '惑星から約' + args.orbitRadius.toFixed(1) + 'シーン単位の軌道を回っています。軌道距離と大きさは見やすさを優先したシミュレーション値です。',
  };
}
