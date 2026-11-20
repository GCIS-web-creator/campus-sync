'use client';

import React, { useMemo, useState } from 'react';
import {
  Award, BookOpenCheck, CalendarDays, Check, Compass, Globe2,
  GraduationCap, LockKeyhole, Orbit, Rocket, ShieldCheck, Sparkles,
  Star, Timer, Trophy, Zap,
} from 'lucide-react';

type AchievementIcon = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
type StudyStats = {
  focusSeconds: number;
  sessionCount: number;
  studyDays: number;
  subjectCount: number;
  reviewedRanges: number;
};
type Props = {
  onClose: () => void;
  planetLevel: number | null;
  growthPoints: number;
  completedSeals: number;
  sealRecords: number;
  studyStats: StudyStats;
};
type Category = 'seal' | 'planet' | 'learning';
type Achievement = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: Category;
  value: number;
  target: number;
  unit: string;
  icon: AchievementIcon;
  accent: 'cyan' | 'violet' | 'gold' | 'emerald';
};

const ACCENTS = {
  cyan: {
    icon: 'text-cyan-100',
    border: 'border-cyan-200/35',
    glow: 'from-cyan-300/35 to-blue-500/10',
    bar: 'from-cyan-300 to-blue-400',
  },
  violet: {
    icon: 'text-violet-100',
    border: 'border-violet-200/35',
    glow: 'from-violet-300/35 to-indigo-500/10',
    bar: 'from-violet-300 to-fuchsia-400',
  },
  gold: {
    icon: 'text-amber-100',
    border: 'border-amber-200/35',
    glow: 'from-amber-200/35 to-orange-500/10',
    bar: 'from-lime-300 to-amber-400',
  },
  emerald: {
    icon: 'text-emerald-100',
    border: 'border-emerald-200/35',
    glow: 'from-emerald-200/35 to-teal-500/10',
    bar: 'from-emerald-300 to-cyan-400',
  },
} as const;

export default function PlanetubeAchievementBoard({
  onClose, planetLevel, growthPoints, completedSeals, sealRecords, studyStats,
}: Props) {
  const [category, setCategory] = useState<'all' | Category>('all');

  const achievements = useMemo<Achievement[]>(() => [
    { id: 'first-seal', title: 'First Seal', subtitle: '最初の封印', description: '封印セッションを初めて完了する', category: 'seal', value: completedSeals, target: 1, unit: '回', icon: ShieldCheck, accent: 'cyan' },
    { id: 'quest-explorer', title: 'Quest Explorer', subtitle: 'クエスト探索者', description: '封印を5回完了して、習慣の第一歩を記録する', category: 'seal', value: completedSeals, target: 5, unit: '回', icon: Compass, accent: 'cyan' },
    { id: 'quest-adventurer', title: 'Quest Adventurer', subtitle: 'クエスト冒険者', description: '封印を50回完了する', category: 'seal', value: completedSeals, target: 50, unit: '回', icon: Rocket, accent: 'gold' },
    { id: 'seal-archivist', title: 'Seal Archivist', subtitle: '封印の記録者', description: 'TESTを除く封印記録を20件残す', category: 'seal', value: sealRecords, target: 20, unit: '件', icon: CalendarDays, accent: 'violet' },
    { id: 'planet-awakening', title: 'Planet Awakening', subtitle: '惑星の目覚め', description: '惑星レベル2に到達する', category: 'planet', value: planetLevel ?? 0, target: 2, unit: 'Lv', icon: Globe2, accent: 'emerald' },
    { id: 'planet-voyager', title: 'Planet Voyager', subtitle: '惑星の旅人', description: '惑星レベル5に到達する', category: 'planet', value: planetLevel ?? 0, target: 5, unit: 'Lv', icon: Orbit, accent: 'violet' },
    { id: 'stardust-collector', title: 'Stardust Collector', subtitle: '星屑コレクター', description: '惑星の成長ポイントを100獲得する', category: 'planet', value: growthPoints, target: 100, unit: 'pt', icon: Sparkles, accent: 'gold' },
    { id: 'nebula-keeper', title: 'Nebula Keeper', subtitle: '星雲の守り人', description: '惑星の成長ポイントを1,000獲得する', category: 'planet', value: growthPoints, target: 1000, unit: 'pt', icon: Star, accent: 'violet' },
    { id: 'focus-initiate', title: 'Focus Initiate', subtitle: '集中のはじまり', description: 'CampusSyncで合計60分の学習を記録する', category: 'learning', value: Math.floor(studyStats.focusSeconds / 60), target: 60, unit: '分', icon: Timer, accent: 'cyan' },
    { id: 'focus-explorer', title: 'Focus Explorer', subtitle: '集中の探究者', description: 'CampusSyncで合計300分の学習を記録する', category: 'learning', value: Math.floor(studyStats.focusSeconds / 60), target: 300, unit: '分', icon: Zap, accent: 'gold' },
    { id: 'study-explorer', title: 'Study Explorer', subtitle: '学びの探検家', description: 'CampusSyncで3つ以上の教科を記録する', category: 'learning', value: studyStats.subjectCount, target: 3, unit: '教科', icon: GraduationCap, accent: 'emerald' },
    { id: 'chronicle-keeper', title: 'Chronicle Keeper', subtitle: '学習日誌の守り人', description: 'CampusSyncで5日以上の学習日を記録する', category: 'learning', value: studyStats.studyDays, target: 5, unit: '日', icon: BookOpenCheck, accent: 'violet' },
    { id: 'review-guardian', title: 'Review Guardian', subtitle: '復習の守護者', description: 'テスト範囲を5件「完了」または「復習済み」にする', category: 'learning', value: studyStats.reviewedRanges, target: 5, unit: '件', icon: ShieldCheck, accent: 'gold' },
    { id: 'study-scribe', title: 'Study Scribe', subtitle: '学習の記録者', description: 'CampusSyncで10件の学習記録を残す', category: 'learning', value: studyStats.sessionCount, target: 10, unit: '件', icon: Award, accent: 'cyan' },
  ], [completedSeals, sealRecords, planetLevel, growthPoints, studyStats]);

  const unlockedCount = achievements.filter(item => item.value >= item.target).length;
  const featuredIds = new Set(['quest-explorer', 'quest-adventurer']);
  const featured = achievements.filter(item => featuredIds.has(item.id));
  const filtered = category === 'all' ? achievements : achievements.filter(item => item.category === category);

  const progress = (item: Achievement) => {
    const current = Math.max(0, Math.floor(item.value));
    return Math.min(100, Math.round(current / item.target * 100));
  };

  const renderFeatured = (item: Achievement) => {
    const Icon = item.icon;
    const isUnlocked = item.value >= item.target;
    return (
      <article key={item.id} className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#222b59] to-[#111832] p-4 shadow-[0_12px_34px_rgba(0,0,0,.24)]">
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-violet-400/10 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div
            className={'relative flex h-24 w-24 shrink-0 items-center justify-center border-2 shadow-[0_0_24px_rgba(165,180,252,.18)] ' + ACCENTS[item.accent].border + ' bg-gradient-to-br ' + ACCENTS[item.accent].glow}
            style={{ clipPath: 'polygon(50% 0%, 88% 20%, 100% 50%, 88% 80%, 50% 100%, 12% 80%, 0% 50%, 12% 20%)' }}
          >
            {isUnlocked ? <Icon size={43} strokeWidth={1.7} className={ACCENTS[item.accent].icon} /> : <LockKeyhole size={34} className="text-slate-500" />}
            {isUnlocked && <span className="absolute bottom-1 right-1 rounded-full bg-cyan-200 p-1 text-slate-950"><Check size={12}/></span>}
          </div>
          <div className="relative min-w-0 flex-1">
            <p className="text-[8px] font-black tracking-[.2em] text-violet-200">QUEST MILESTONE</p>
            <h3 className="mt-1 text-base font-black text-white sm:text-lg">{item.title}</h3>
            <p className="text-[10px] font-bold text-violet-100">{item.subtitle}</p>
            <p className="mt-2 text-[10px] leading-4 text-slate-300">{item.description}</p>
          </div>
        </div>
        <div className="relative mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full border border-white/10 bg-[#101633]">
            <div className={'h-full rounded-full bg-gradient-to-r ' + ACCENTS[item.accent].bar} style={{ width: progress(item) + '%' }} />
          </div>
          <span className="min-w-[68px] text-right text-[10px] font-black tabular-nums text-white">{Math.min(Math.max(0, item.value), item.target)} / {item.target}</span>
        </div>
      </article>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#08051a]/85 p-2 backdrop-blur-md sm:p-5" role="dialog" aria-modal="true" aria-label="CampusSync Achievement collection">
      <section
        className="relative flex max-h-[94dvh] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border-2 border-violet-200/80 bg-[#17143b] shadow-[0_0_0_1px_rgba(216,180,254,.18),0_0_42px_rgba(192,132,252,.32)] sm:rounded-3xl"
        style={{ backgroundImage: 'radial-gradient(1px 1px at 8% 12%,rgba(255,255,255,.65) 0,transparent 100%),radial-gradient(1px 1px at 92% 19%,rgba(196,181,253,.85) 0,transparent 100%),radial-gradient(1px 1px at 78% 82%,rgba(255,255,255,.55) 0,transparent 100%),radial-gradient(1px 1px at 22% 76%,rgba(165,243,252,.55) 0,transparent 100%)' }}
      >
        <header className="relative flex shrink-0 items-center justify-between gap-3 border-b border-violet-100/15 bg-gradient-to-r from-[#38295e] to-[#29234f] px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <p className="text-[8px] font-black tracking-[.24em] text-violet-200">CAMPUSSYNC ONLY · YOUR JOURNEY</p>
            <h2 className="bg-gradient-to-r from-white via-violet-100 to-fuchsia-200 bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">Achievements</h2>
            <p className="mt-0.5 text-[9px] text-violet-100/75">達成した記録が、あなたの称号になる。</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[8px] font-bold tracking-widest text-violet-200">UNLOCKED</p>
              <p className="text-lg font-black tabular-nums text-white">{unlockedCount}<span className="text-xs text-violet-200"> / {achievements.length}</span></p>
            </div>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-100/40 bg-violet-300 text-2xl font-black text-[#21143d] shadow-[0_0_18px_rgba(216,180,254,.35)] transition hover:rotate-90 hover:bg-white" aria-label="Achievementを閉じる">×</button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><p className="text-[8px] font-black tracking-[.2em] text-violet-200">NEXT MILESTONES</p><h3 className="mt-1 text-sm font-black text-white">次のクエスト</h3></div>
            <span className="rounded-full border border-violet-100/20 bg-violet-200/10 px-3 py-1 text-[9px] font-bold text-violet-100 sm:hidden">{unlockedCount} / {achievements.length} 獲得</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">{featured.map(renderFeatured)}</div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100/15 pb-3 pt-1">
            <div><p className="text-[8px] font-black tracking-[.2em] text-violet-200">COLLECTION</p><h3 className="mt-1 text-sm font-black text-white">称号コレクション</h3></div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['all', 'すべて'],
                ['seal', '封印'],
                ['planet', '惑星'],
                ['learning', '学習'],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setCategory(value)} className={'rounded-full border px-3 py-1.5 text-[9px] font-black transition ' + (category === value ? 'border-violet-200 bg-violet-200 text-[#241743]' : 'border-white/15 bg-white/5 text-violet-100 hover:bg-white/10')}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-6">
            {filtered.map(item => {
              const Icon = item.icon;
              const isUnlocked = item.value >= item.target;
              return (
                <article key={item.id} className={'flex min-h-[190px] flex-col rounded-xl border p-2.5 shadow-[0_8px_22px_rgba(0,0,0,.16)] transition sm:p-3 ' + (isUnlocked ? 'border-violet-200/30 bg-gradient-to-b from-[#51417c] to-[#34335e]' : 'border-white/5 bg-[#30345e]/80')}>
                  <div className="flex min-h-8 items-start justify-between gap-1">
                    <h4 className={'text-center text-[10px] font-black leading-4 sm:text-[11px] ' + (isUnlocked ? 'text-white' : 'text-slate-300')}>{item.title}</h4>
                    {isUnlocked && <span className="shrink-0 rounded-full bg-cyan-200 p-0.5 text-[#12213c]"><Check size={10}/></span>}
                  </div>
                  <div className="flex flex-1 flex-col items-center justify-center py-2 text-center">
                    <div className={'mb-2 flex h-14 w-14 items-center justify-center rounded-2xl border ' + (isUnlocked ? ACCENTS[item.accent].border + ' bg-gradient-to-br ' + ACCENTS[item.accent].glow + ' shadow-[0_0_22px_rgba(196,181,253,.12)]' : 'border-white/5 bg-[#25284f]')}>
                      {isUnlocked ? <Icon size={31} strokeWidth={1.65} className={ACCENTS[item.accent].icon}/> : <LockKeyhole size={27} className="text-[#171a3e] drop-shadow-[0_1px_1px_rgba(255,255,255,.12)]"/>}
                    </div>
                    <p className={'text-[9px] font-bold leading-4 ' + (isUnlocked ? 'text-violet-50' : 'text-slate-400')}>{item.subtitle}</p>
                    <p className="mt-1 line-clamp-3 text-[9px] leading-4 text-slate-300">{item.description}</p>
                  </div>
                  <div className="mt-auto pt-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-[9px] font-bold">
                      <span className={isUnlocked ? 'text-cyan-100' : 'text-slate-300'}>{isUnlocked ? 'ACHIEVED' : 'PROGRESS'}</span>
                      <span className="tabular-nums text-slate-200">{Math.min(Math.max(0, item.value), item.target).toLocaleString('ja-JP')} / {item.target.toLocaleString('ja-JP')} {item.unit}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-[#151b43]"><div className={'h-full rounded-full bg-gradient-to-r ' + ACCENTS[item.accent].bar} style={{ width: progress(item) + '%' }}/></div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-100/10 bg-black/15 px-3 py-2.5 text-[9px] leading-4 text-violet-100/65">
            <span>Planetubeの称号・ポイント・履歴は変更しません。称号の判定と表示はCampusSync内だけで行います。</span>
            <span>学習指標：直近120日分</span>
          </div>
        </div>
      </section>
    </div>
  );
}
