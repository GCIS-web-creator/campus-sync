// 学校貢献度(0〜100)からランクを決めるヘルパー。
// page.tsx の score は Math.max(0, Math.min(prev + delta, 100)) で 0〜100 に収まります。
// 境目(min)は好みに合わせて変えてください。初期スコア65は「ゴールド」になります。
export type RankId = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface Rank {
  id: RankId;
  label: string;
  min: number; // このスコア以上でこのランク
  src: string; // public/rank-badges/ に置いた場合のパス
}

export const RANKS: readonly Rank[] = [
  { id: 'bronze',   label: 'ブロンズ',     min: 0,  src: '/rank-badges/rank-bronze.svg' },
  { id: 'silver',   label: 'シルバー',     min: 30, src: '/rank-badges/rank-silver.svg' },
  { id: 'gold',     label: 'ゴールド',     min: 50, src: '/rank-badges/rank-gold.svg' },
  { id: 'platinum', label: 'プラチナ',     min: 70, src: '/rank-badges/rank-platinum.svg' },
  { id: 'diamond',  label: 'ダイヤモンド', min: 90, src: '/rank-badges/rank-diamond.svg' },
];

/** スコアに対応するランク */
export function getRank(score: number): Rank {
  const s = Math.max(0, Math.min(100, score));
  let current = RANKS[0];
  for (const r of RANKS) if (s >= r.min) current = r;
  return current;
}

/** 次のランクまでの情報(最高ランクなら null) */
export function getNextRank(score: number): { rank: Rank; remaining: number } | null {
  const s = Math.max(0, Math.min(100, score));
  const next = RANKS.find((r) => r.min > s);
  return next ? { rank: next, remaining: next.min - s } : null;
}
