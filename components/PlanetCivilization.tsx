'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { RefreshCw, Sparkles, Orbit, BookOpen, Users, Brain, Leaf, ArrowUpRight } from 'lucide-react';

type Planet = {
  id: string;
  planet_name: string;
  civilization_stage: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};
type Growth = {
  learning_xp: number;
  contribution_xp: number;
  knowledge_xp: number;
  nature_growth: number;
  technical_level: number;
  social_level: number;
  research_level: number;
  nature_level: number;
  civilization_score: number;
  recalculated_at: string | null;
  updated_at: string;
};
type LedgerEntry = {
  id: string;
  xp_type: 'learning' | 'contribution' | 'knowledge';
  amount: number;
  entry_kind: 'award' | 'reversal' | 'adjustment';
  adjustment_direction: 'increase' | 'decrease' | null;
  rule_version: number;
  source_type: string;
  source_date: string;
  reason: string;
  created_at: string;
};
type ApiPayload = {
  success: boolean;
  message?: string;
  planet?: Planet;
  growth?: Growth;
  recentLedger?: LedgerEntry[];
};
type Props = { isDarkMode?: boolean };

const STAGES = [
  { name: '原始惑星', description: 'まだ文明のない静かな惑星', required: 0 },
  { name: '集落時代', description: '最初の暮らしの灯りが生まれる', required: 100 },
  { name: '都市形成期', description: '小さな街や道路が広がり始める', required: 500 },
  { name: '産業・研究時代', description: '研究施設や交通網が発展する', required: 1200 },
  { name: '高度文明', description: '大都市と先端施設が共存する', required: 2500 },
  { name: '惑星文明', description: '惑星全体に文明の光が広がる', required: 5000 },
] as const;

function formatNumber(value: number) {
  return Math.max(0, Number(value) || 0).toLocaleString('ja-JP');
}

function PlanetArtwork({ stage }: { stage: number }) {
  const stageLevel = Math.max(0, Math.min(5, stage));
  const clipId = 'planet-surface-clip';
  return (
    <div className="relative mx-auto w-full max-w-[720px] overflow-hidden rounded-[26px] border border-cyan-200/15 bg-[#06152b] shadow-[0_25px_70px_rgba(2,12,27,.35)]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(31,116,156,.35),transparent_55%),linear-gradient(145deg,#081b35,#040b1c)]" />
      <svg viewBox="0 0 900 440" role="img" aria-label={STAGES[stageLevel].name + 'の惑星の様子'} className="relative block w-full">
        <defs>
          <radialGradient id="planet-base" cx="35%" cy="28%" r="78%">
            <stop offset="0%" stopColor={stageLevel >= 2 ? '#8bc7b5' : '#c8a77a'} />
            <stop offset="52%" stopColor={stageLevel >= 2 ? '#367e79' : '#956c50'} />
            <stop offset="100%" stopColor={stageLevel >= 2 ? '#142f4e' : '#2e3045'} />
          </radialGradient>
          <linearGradient id="planet-shadow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".18"/>
            <stop offset="55%" stopColor="#061326" stopOpacity=".02"/>
            <stop offset="100%" stopColor="#010511" stopOpacity=".8"/>
          </linearGradient>
          <clipPath id={clipId}><circle cx="450" cy="242" r="162"/></clipPath>
          <filter id="planet-glow"><feGaussianBlur stdDeviation="16"/></filter>
        </defs>

        {Array.from({ length: 46 }, (_, index) => {
          const x = (index * 137 + 29) % 900;
          const y = (index * 83 + 17) % 430;
          const r = index % 7 === 0 ? 2 : index % 3 === 0 ? 1.4 : .8;
          return <circle key={index} cx={x} cy={y} r={r} fill="#d9f5ff" opacity={index % 4 === 0 ? .95 : .45}/>;
        })}
        <ellipse cx="450" cy="248" rx="224" ry="190" fill="#37c4db" opacity=".12" filter="url(#planet-glow)"/>
        <ellipse cx="450" cy="251" rx="177" ry="176" fill="none" stroke="#8ee9ff" strokeOpacity=".48" strokeWidth="2"/>
        <circle cx="450" cy="242" r="162" fill="url(#planet-base)" stroke="#c0f4ff" strokeOpacity=".55" strokeWidth="2"/>
        <g clipPath={`url(#${clipId})`}>
          <path d="M275 206 C340 170 372 210 420 196 S510 154 570 190 S650 209 626 276 C585 314 536 289 486 324 S374 343 319 295Z" fill={stageLevel >= 2 ? '#4a9a67' : '#b68b58'} opacity=".9"/>
          <path d="M305 130 C372 143 408 105 458 139 S535 135 589 113 L633 166 C583 190 538 178 494 208 S390 200 350 218Z" fill={stageLevel >= 2 ? '#2f795b' : '#775b48'} opacity=".75"/>
          {stageLevel >= 1 && <>
            <path d="M350 284 Q397 245 450 270 T560 258" stroke="#a6dd91" strokeWidth="7" fill="none" strokeLinecap="round" opacity=".7"/>
            <path d="M372 302 Q405 276 438 289" stroke="#bce8a0" strokeWidth="4" fill="none" strokeLinecap="round"/>
          </>}
          {stageLevel >= 2 && <>
            <path d="M335 222 L430 260 L545 222" stroke="#d3c7a2" strokeWidth="5" fill="none" opacity=".8"/>
            <path d="M428 259 L415 322" stroke="#d3c7a2" strokeWidth="4" fill="none" opacity=".8"/>
            {Array.from({ length: stageLevel >= 4 ? 22 : stageLevel >= 3 ? 12 : 5 }, (_, index) => {
              const coords = [
                [365,205],[389,214],[420,227],[458,218],[490,238],[525,213],[548,250],[390,278],
                [450,292],[487,286],[515,274],[352,255],[430,187],[477,190],[552,196],[570,280],
                [405,245],[465,252],[500,205],[535,293],[380,300],[460,317],
              ][index];
              const h = stageLevel >= 4 ? 15 + (index % 4) * 9 : stageLevel >= 3 ? 10 + (index % 3) * 6 : 7 + (index % 2) * 4;
              return <g key={index} opacity=".95"><rect x={coords[0]} y={coords[1]-h} width={stageLevel >= 4 ? 9 : 7} height={h} rx="1.5" fill={stageLevel >= 4 ? '#9ad9e8' : '#d2c6a0'}/><rect x={coords[0]+2} y={coords[1]-h+4} width="2" height="2" fill="#ffe69a"/></g>;
            })}
          </>}
          {stageLevel >= 3 && <>
            <path d="M326 176 Q350 154 374 169" stroke="#b8edc2" strokeWidth="3" fill="none"/>
            <circle cx="352" cy="165" r="8" fill="#77bd74"/>
            <circle cx="366" cy="158" r="6" fill="#9ad17e"/>
          </>}
          {stageLevel >= 4 && <>
            <path d="M318 306 Q356 276 387 299 T450 302" stroke="#b6e8e4" strokeWidth="3" fill="none"/>
            <circle cx="552" cy="282" r="9" fill="#a6e6e8" opacity=".8"/>
            <circle cx="571" cy="268" r="7" fill="#a6e6e8" opacity=".7"/>
          </>}
          {stageLevel >= 5 && <>
            <path d="M296 132 L370 104 L438 125 L498 105 L580 135" stroke="#72ddff" strokeWidth="2" fill="none" opacity=".8"/>
            <circle cx="450" cy="242" r="150" fill="none" stroke="#ffe08a" strokeWidth="2" strokeDasharray="5 9" opacity=".8"/>
            <path d="M450 80 L450 64 M612 242 L630 242 M450 404 L450 420 M288 242 L270 242" stroke="#ffe08a" strokeWidth="3"/>
          </>}
          <circle cx="450" cy="242" r="162" fill="url(#planet-shadow)"/>
        </g>
        {stageLevel >= 4 && <>
          <ellipse cx="450" cy="242" rx="218" ry="72" transform="rotate(-18 450 242)" fill="none" stroke="#8dd8ef" strokeOpacity=".55" strokeWidth="3"/>
          <circle cx="633" cy="172" r="5" fill="#d8f3ff"/>
        </>}
      </svg>
      <div className="relative -mt-1 flex items-center justify-between gap-2 border-t border-white/10 bg-[#0a1b33]/90 px-4 py-3">
        <div><p className="text-[9px] font-black tracking-[.2em] text-cyan-200">PLANET SURFACE</p><p className="mt-1 text-sm font-black text-white">{STAGES[stageLevel].name}</p></div>
        <span className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-bold text-cyan-100">Stage {stageLevel}</span>
      </div>
    </div>
  );
}

export default function PlanetCivilization({ isDarkMode = false }: Props) {
  const [planet, setPlanet] = useState<Planet | null>(null);
  const [growth, setGrowth] = useState<Growth | null>(null);
  const [recentLedger, setRecentLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('ログイン状態を確認できません。再ログインしてください。');
      }
      const response = await fetch('/api/planet-civilization', {
        method: 'GET',
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        cache: 'no-store',
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.success || !payload.planet || !payload.growth) {
        throw new Error(payload.message || '惑星データを読み込めませんでした。');
      }
      setPlanet(payload.planet);
      setGrowth(payload.growth);
      setRecentLedger(payload.recentLedger || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '惑星データを読み込めませんでした。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalXp = useMemo(() => growth
    ? Number(growth.learning_xp) + Number(growth.contribution_xp) + Number(growth.knowledge_xp)
    : 0, [growth]);
  const civilizationScore = useMemo(() => growth
    ? Number(growth.civilization_score ?? (totalXp + Number(growth.nature_growth) * 5))
    : 0, [growth, totalXp]);
  const stage = Math.max(0, Math.min(5, planet?.civilization_stage ?? 0));
  const nextStage = STAGES[Math.min(5, stage + 1)];
  const previousThreshold = STAGES[stage].required;
  const progress = stage >= 5 ? 100 : Math.max(0, Math.min(100,
    Math.round((civilizationScore - previousThreshold) / Math.max(1, nextStage.required - previousThreshold) * 100)
  ));

  const panel = isDarkMode ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900';
  const subText = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  if (loading) {
    return <div className={`flex min-h-64 items-center justify-center gap-3 rounded-3xl border p-8 ${panel}`}><RefreshCw size={18} className="animate-spin text-cyan-500"/>惑星を準備しています…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[10px] font-black tracking-[.22em] text-cyan-600">CAMPUSSYNC · MY PLANET</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">惑星・文明</h1><p className={`mt-1 text-xs ${subText}`}>CampusSyncで積み重ねた学習と貢献が、ひとつの惑星を育てます。</p></div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${isDarkMode ? 'border-slate-700 bg-slate-800 hover:bg-slate-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''}/>更新</button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}<button type="button" onClick={() => void load()} className="ml-3 font-black underline">再読み込み</button></div>}

      {planet && growth && <>
        <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <PlanetArtwork stage={stage}/>
          <section className={`rounded-[26px] border p-4 sm:p-5 ${panel}`}>
            <div className="flex items-start justify-between gap-3"><div><p className={`text-[9px] font-black tracking-[.2em] ${subText}`}>CIVILIZATION</p><h2 className="mt-1 text-xl font-black">{STAGES[stage].name}</h2><p className={`mt-2 text-xs leading-5 ${subText}`}>{STAGES[stage].description}</p></div><span className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-500"><Orbit size={23}/></span></div>
            <div className="mt-5 rounded-2xl border border-cyan-500/15 bg-cyan-500/5 p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold">文明発展スコア</span><span className="text-xs font-black tabular-nums">{formatNumber(civilizationScore)}</span></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-700" style={{ width: progress + '%' }}/></div><p className={`mt-2 text-[10px] ${subText}`}>{stage >= 5 ? '現在の最終段階に到達しています。' : `次の段階「${nextStage.name}」まであと ${formatNumber(Math.max(0, nextStage.required - civilizationScore))} ポイント`}</p><p className={`mt-1 text-[9px] ${subText}`}>XP合計 {formatNumber(totalXp)} + 自然成長値 {formatNumber(growth.nature_growth)} × 5</p></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-3"><div className="flex items-center gap-2 text-blue-500"><BookOpen size={15}/><span className="text-[10px] font-black">学習XP</span></div><p className="mt-2 text-xl font-black tabular-nums">{formatNumber(growth.learning_xp)}</p><p className={`mt-1 text-[9px] ${subText}`}>集中した学習時間</p></div>
              <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3"><div className="flex items-center gap-2 text-amber-500"><Users size={15}/><span className="text-[10px] font-black">学校貢献XP</span></div><p className="mt-2 text-xl font-black tabular-nums">{formatNumber(growth.contribution_xp)}</p><p className={`mt-1 text-[9px] ${subText}`}>承認された学校への貢献</p></div>
              <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3"><div className="flex items-center gap-2 text-emerald-500"><Brain size={15}/><span className="text-[10px] font-black">知識XP</span></div><p className="mt-2 text-xl font-black tabular-nums">{formatNumber(growth.knowledge_xp)}</p><p className={`mt-1 text-[9px] ${subText}`}>理解度の実績・準備中</p></div>
              <div className="rounded-xl border border-teal-500/15 bg-teal-500/5 p-3"><div className="flex items-center gap-2 text-teal-500"><Leaf size={15}/><span className="text-[10px] font-black">自然成長値</span></div><p className="mt-2 text-xl font-black tabular-nums">{formatNumber(growth.nature_growth)}</p><p className={`mt-1 text-[9px] ${subText}`}>学習の継続実績・設計中</p></div>
            </div>
            <div className={`mt-4 flex items-center gap-2 text-[10px] ${subText}`}><Sparkles size={14} className="text-cyan-500"/>XPは消費されず、積み重ねが惑星に残ります。</div>
          </section>
        </div>

        <section className={`rounded-2xl border p-4 ${panel}`}>
          <div className="mb-3"><h2 className="text-sm font-black">4つの成長軸</h2><p className={`mt-1 text-[10px] ${subText}`}>各分野は対応する実績だけで独立して成長します。</p></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: '技術文明', level: growth.technical_level, value: growth.learning_xp, unit: '学習XP', color: 'text-blue-500' },
              { label: '社会文明', level: growth.social_level, value: growth.contribution_xp, unit: '学校貢献XP', color: 'text-amber-500' },
              { label: '研究・知識', level: growth.research_level, value: growth.knowledge_xp, unit: '知識XP', color: 'text-emerald-500' },
              { label: '自然環境', level: growth.nature_level, value: growth.nature_growth, unit: '自然成長値', color: 'text-teal-500' },
            ].map(axis => (
              <div key={axis.label} className="rounded-xl border border-slate-200/70 p-3 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-black">{axis.label}</p><span className={`text-[10px] font-black ${axis.color}`}>LEVEL {axis.level}</span></div>
                <p className="mt-2 text-lg font-black tabular-nums">{formatNumber(axis.value)}</p>
                <p className={`mt-1 text-[9px] ${subText}`}>{axis.unit}</p>
                <div className="mt-2 flex gap-1">{Array.from({ length: 5 }, (_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index < axis.level ? 'bg-cyan-500' : 'bg-slate-200 dark:bg-slate-700'}`}/>)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={`rounded-2xl border p-4 ${panel}`}>
          <div className="mb-3 flex items-center justify-between gap-2"><div><h2 className="text-sm font-black">文明の成長段階</h2><p className={`mt-1 text-[10px] ${subText}`}>学習と学校への貢献で、惑星の外観が少しずつ変化します。</p></div><span className={`text-[10px] font-bold ${subText}`}>全6段階</span></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{STAGES.map((item, index) => <div key={item.name} className={`rounded-xl border p-3 ${index <= stage ? 'border-cyan-500/35 bg-cyan-500/5' : isDarkMode ? 'border-slate-700 bg-slate-800/50 opacity-60' : 'border-slate-200 bg-slate-50 opacity-60'}`}><p className="text-[9px] font-black text-cyan-600">STAGE {index}</p><p className="mt-1 text-xs font-black">{item.name}</p><p className={`mt-1 text-[9px] leading-4 ${subText}`}>{item.description}</p></div>)}</div>
        </section>

        <section className={`rounded-2xl border p-4 ${panel}`}>
          <div className="mb-3 flex items-center gap-2"><ArrowUpRight size={16} className="text-cyan-500"/><h2 className="text-sm font-black">最近の成長履歴</h2></div>
          {recentLedger.length ? <div className="divide-y divide-slate-200/60 dark:divide-slate-700">{recentLedger.map(entry => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-xs font-bold">{entry.xp_type === 'learning' ? '学習XP' : entry.xp_type === 'contribution' ? '学校貢献XP' : '知識XP'}</p><p className={`mt-1 text-[10px] ${subText}`}>{entry.reason || '惑星の成長'}</p></div><div className="text-right"><p className="text-sm font-black text-cyan-600">+{formatNumber(entry.amount)} XP</p><p className={`mt-1 text-[9px] ${subText}`}>{entry.source_date}</p></div></div>)}</div> : <div className={`rounded-xl border border-dashed p-5 text-center text-xs ${subText}`}>学習記録を保存すると、ここに惑星の成長履歴が表示されます。</div>}
        </section>
      </>}

      <p className={`text-[10px] leading-5 ${subText}`}>この惑星はCampusSync専用です。Planetubeの惑星・XP・封印記録とは独立して管理され、既存のPlanetube機能には影響しません。</p>
    </div>
  );
}
