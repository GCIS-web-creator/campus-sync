'use client';

import Image from 'next/image';

export type ContributionRankId =
  | 'bronze' | 'silver' | 'gold' | 'sapphire' | 'diamond'
  | 'amethyst' | 'aquamarine' | 'citrine' | 'emerald' | 'peridot'
  | 'rose-quartz' | 'ruby' | 'topaz' | 'onyx' | 'rainbow';

export type ContributionRank = {
  id: ContributionRankId;
  name: string;
  minPoints: number;
  description: string;
};

// 仮のランク境界です。運用に合わせて minPoints を調整できます。
export const CONTRIBUTION_RANKS: readonly ContributionRank[] = [
  { id: 'bronze', name: 'ブロンズ', minPoints: 0, description: 'はじめの一歩' },
  { id: 'silver', name: 'シルバー', minPoints: 100, description: '活動を継続中' },
  { id: 'gold', name: 'ゴールド', minPoints: 250, description: '着実な貢献' },
  { id: 'sapphire', name: 'サファイア', minPoints: 500, description: '頼れるメンバー' },
  { id: 'diamond', name: 'ダイヤモンド', minPoints: 1000, description: '大きな貢献' },
  { id: 'amethyst', name: 'アメジスト', minPoints: 1500, description: '個性ある活躍' },
  { id: 'aquamarine', name: 'アクアマリン', minPoints: 2000, description: '周囲を支える' },
  { id: 'citrine', name: 'シトリン', minPoints: 2500, description: '明るい貢献' },
  { id: 'emerald', name: 'エメラルド', minPoints: 3000, description: '信頼される存在' },
  { id: 'peridot', name: 'ペリドット', minPoints: 3500, description: '成長を継続' },
  { id: 'rose-quartz', name: 'ローズクォーツ', minPoints: 4000, description: '仲間を大切に' },
  { id: 'ruby', name: 'ルビー', minPoints: 4500, description: '目立つ活躍' },
  { id: 'topaz', name: 'トパーズ', minPoints: 5000, description: '高い貢献' },
  { id: 'onyx', name: 'オニキス', minPoints: 6000, description: '卓越した継続力' },
  { id: 'rainbow', name: 'レインボー', minPoints: 8000, description: '特別ランク' },
];

export function getContributionRank(points: number): ContributionRank {
  const safePoints = Number.isFinite(points) ? Math.max(0, points) : 0;
  let current = CONTRIBUTION_RANKS[0];
  for (const rank of CONTRIBUTION_RANKS) {
    if (safePoints >= rank.minPoints) current = rank;
    else break;
  }
  return current;
}

function RankImage({ rank, size = 42 }: { rank: ContributionRank; size?: number }) {
  return <Image src={`/rank-icons/${rank.id}.svg`} width={size} height={size} alt={`${rank.name}の剣ランクアイコン`} unoptimized className="block max-w-full shrink-0 object-contain" />;
}

export function ContributionRankBadge({ points, compact = false }: { points: number; compact?: boolean }) {
  const rank = getContributionRank(Number(points) || 0);
  const safePoints = Math.max(0, Number(points) || 0);
  if (compact) {
    return <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/90 px-2 py-1 text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100"><RankImage rank={rank} size={32} /><span className="text-left leading-tight"><span className="block text-xs opacity-70">貢献度ランク</span><span className="block text-sm font-bold">{rank.name}</span></span></span>;
  }
  return <div className="flex items-center gap-3"><RankImage rank={rank} size={56} /><div className="min-w-0"><div className="text-xs text-slate-500 dark:text-slate-400">現在の貢献度ランク</div><div className="text-lg font-bold text-slate-900 dark:text-white">{rank.name}</div><div className="text-sm text-slate-600 dark:text-slate-300">{safePoints.toLocaleString()} pt</div></div></div>;
}

function RankGrid({ points, showStatus = true }: { points: number; showStatus?: boolean }) {
  const safePoints = Math.max(0, Number(points) || 0);
  const activeRank = getContributionRank(safePoints);
  const nextRank = CONTRIBUTION_RANKS.find((rank) => rank.minPoints > safePoints);
  return <div className="mt-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"><span>全15ランク</span><span>{showStatus ? (nextRank ? `次は${nextRank.name}（あと${nextRank.minPoints - safePoints} pt）` : '最高ランク到達！') : 'ポイント条件一覧'}</span></div><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{CONTRIBUTION_RANKS.map((rank) => { const reached = showStatus && safePoints >= rank.minPoints; const current = showStatus && activeRank.id === rank.id; return <div key={rank.id} aria-current={current ? 'true' : undefined} className={`flex min-w-0 flex-col items-center rounded-xl border p-2 text-center ${current ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 dark:bg-blue-950/50 dark:ring-blue-900' : reached ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900' : 'border-dashed border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950'}`}><RankImage rank={rank} size={42} /><span className="mt-1 w-full truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{rank.name}</span><span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{rank.minPoints.toLocaleString()} pt〜</span>{current && <span className="mt-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">現在</span>}{reached && !current && <span className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">到達済み</span>}</div>; })}</div>{showStatus && <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">次の剣ランクを目指して、校内での活動に参加しよう。</p>}</div>;
}

export function ContributionRankWidget({ points }: { points: number }) {
  return <div className="mt-4 w-full min-w-0 max-w-full"><details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-2 [&::-webkit-details-marker]:hidden"><ContributionRankBadge points={points} compact /><span className="pr-2 text-xs font-semibold text-slate-600 group-open:hidden dark:text-slate-300">剣ランク図鑑 ▴</span><span className="hidden pr-2 text-xs font-semibold text-slate-600 group-open:inline dark:text-slate-300">閉じる ▾</span></summary><div className="max-h-[65vh] overflow-y-auto border-t border-slate-200 p-3 dark:border-slate-700"><RankGrid points={points} /></div></details></div>;
}

export function ContributionRankAdminGuide() {
  return <div className="w-full min-w-0 max-w-3xl"><details className="group overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/95 text-white shadow-xl backdrop-blur"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2 text-sm font-bold"><RankImage rank={CONTRIBUTION_RANKS[14]} size={32} />貢献度剣ランク一覧（15段階）</span><span className="text-xs text-slate-300">開く ▴</span></summary><div className="max-h-[65vh] overflow-y-auto border-t border-slate-700 p-3"><RankGrid points={0} showStatus={false} /></div></details></div>;
}
