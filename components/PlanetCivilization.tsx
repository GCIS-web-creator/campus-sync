'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import PlanetTechnologyTree from '@/components/PlanetTechnologyTree';
import Planet3DPanel from '@/components/Planet3DPanel';
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
  source_session: {
    id: string;
    subject_name: string;
    task_title: string;
    focus_seconds: number;
    break_seconds: number;
    started_at: string;
    finish_kind: 'completed' | 'stopped';
  } | null;
};
type ApiPayload = {
  success: boolean;
  message?: string;
  planet?: Planet;
  growth?: Growth;
  recentLedger?: LedgerEntry[];
};
type Props = { isDarkMode?: boolean };

const TECHNICAL_LEVEL_THRESHOLDS = [1200, 6000, 18000, 30000, 60000] as const;
const DAILY_LEARNING_XP_LIMIT_SECONDS = 12 * 60 * 60;

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

function formatStudyDuration(seconds: number) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes > 0) return minutes + '分' + (remainder ? remainder + '秒' : '');
  return remainder + '秒';
}

export default function PlanetCivilization({ isDarkMode = false }: Props) {
  const [planet, setPlanet] = useState<Planet | null>(null);
  const [growth, setGrowth] = useState<Growth | null>(null);
  const [recentLedger, setRecentLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recalculatingXp, setRecalculatingXp] = useState(false);
  const [xpFeedback, setXpFeedback] = useState('');
  const [activePanel, setActivePanel] = useState<'planet' | 'technology'>('planet');
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

  const recalculateLearningXp = async () => {
    if (recalculatingXp) return;
    setRecalculatingXp(true);
    setError('');
    setXpFeedback('');
    try {
      const { data, error: recalculateError } = await supabase.rpc('campus_recalculate_learning_xp');
      if (recalculateError) throw recalculateError;
      const result = data as { net_xp_change?: number; learning_xp?: number } | null;
      if (!result) throw new Error('再計算結果を取得できませんでした。');

      await load(true);
      const delta = Number(result.net_xp_change || 0);
      const deltaLabel = delta > 0 ? '+' + formatNumber(delta) : delta < 0 ? '−' + formatNumber(Math.abs(delta)) : '±0';
      setXpFeedback(`12時間上限で再計算しました。学習XP ${deltaLabel}（累計 ${formatNumber(Number(result.learning_xp || 0))} XP）`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '学習XPを再計算できませんでした。');
    } finally {
      setRecalculatingXp(false);
    }
  };

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
        <div>
          <p className="text-[10px] font-black tracking-[.22em] text-cyan-600">CAMPUSSYNC · MY PLANET</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">惑星・文明</h1>
          {planet && <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${isDarkMode ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}>{planet.planet_name || 'わたしの惑星'}</span>
            <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${planet.is_public ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : isDarkMode ? 'border-slate-700 bg-slate-800 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{planet.is_public ? '公開中' : '非公開'}</span>
          </div>}
          <p className={`mt-2 text-xs ${subText}`}>CampusSyncで積み重ねた学習と貢献が、ひとつの惑星を育てます。</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${isDarkMode ? 'border-slate-700 bg-slate-800 hover:bg-slate-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''}/>更新</button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}<button type="button" onClick={() => void load()} className="ml-3 font-black underline">再読み込み</button></div>}

      {planet && growth && <>
        <div className={`flex gap-2 rounded-2xl border p-1 ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
          <button type="button" onClick={() => setActivePanel('planet')} className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-black transition ${activePanel === 'planet' ? 'bg-cyan-700 text-white' : subText}`}>惑星の状態</button>
          <button type="button" onClick={() => setActivePanel('technology')} className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-black transition ${activePanel === 'technology' ? 'bg-cyan-700 text-white' : subText}`}>MP・技術ツリー</button>
        </div>
        {activePanel === 'technology' ? <PlanetTechnologyTree isDarkMode={isDarkMode}/> : <>
        <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <Planet3DPanel stage={stage}/>
          <section className={`rounded-[26px] border p-4 sm:p-5 ${panel}`}>
            <div className="flex items-start justify-between gap-3"><div><p className={`text-[9px] font-black tracking-[.2em] ${subText}`}>CIVILIZATION</p><h2 className="mt-1 text-xl font-black">{STAGES[stage].name}</h2><p className={`mt-2 text-xs leading-5 ${subText}`}>{STAGES[stage].description}</p></div><span className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-500"><Orbit size={23}/></span></div>
            <div className="mt-5 rounded-2xl border border-cyan-500/15 bg-cyan-500/5 p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold">文明発展スコア</span><span className="text-xs font-black tabular-nums">{formatNumber(civilizationScore)}</span></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-700" style={{ width: progress + '%' }}/></div><p className={`mt-2 text-[10px] ${subText}`}>{stage >= 5 ? '現在の最終段階に到達しています。' : `次の段階「${nextStage.name}」まであと ${formatNumber(Math.max(0, nextStage.required - civilizationScore))} ポイント`}</p><p className={`mt-1 text-[9px] ${subText}`}>XP合計 {formatNumber(totalXp)} + 自然成長値 {formatNumber(growth.nature_growth)} × 5</p></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-3"><div className="flex items-center gap-2 text-blue-500"><BookOpen size={15}/><span className="text-[10px] font-black">学習XP</span></div><p className="mt-2 text-xl font-black tabular-nums">{formatNumber(growth.learning_xp)}</p><p className={`mt-1 text-[9px] ${subText}`}>集中した学習時間</p></div>
              <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3"><div className="flex items-center gap-2 text-amber-500"><Users size={15}/><span className="text-[10px] font-black">学校貢献XP</span></div><p className="mt-2 text-xl font-black tabular-nums">{formatNumber(growth.contribution_xp)}</p><p className={`mt-1 text-[9px] ${subText}`}>承認された学校への貢献</p></div>
              <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3"><div className="flex items-center gap-2 text-emerald-500"><Brain size={15}/><span className="text-[10px] font-black">知識XP</span></div><p className="mt-2 text-xl font-black tabular-nums">{formatNumber(growth.knowledge_xp)}</p><p className={`mt-1 text-[9px] ${subText}`}>初回正解で獲得した知識XP</p></div>
              <div className="rounded-xl border border-teal-500/15 bg-teal-500/5 p-3"><div className="flex items-center gap-2 text-teal-500"><Leaf size={15}/><span className="text-[10px] font-black">自然成長値</span></div><p className="mt-2 text-xl font-black tabular-nums">{formatNumber(growth.nature_growth)}</p><p className={`mt-1 text-[9px] ${subText}`}>学習の継続実績・設計中</p></div>
            </div>
            <div className={`mt-4 flex items-center gap-2 text-[10px] ${subText}`}><Sparkles size={14} className="text-cyan-500"/>XPは消費されず、積み重ねが惑星に残ります。</div>
          </section>
        </div>

        <section className={`rounded-2xl border p-4 ${panel}`}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">4つの成長軸</h2>
              <p className={`mt-1 text-[10px] ${subText}`}>各分野は対応する実績だけで独立して成長します。</p>
            </div>
            <button
              type="button"
              onClick={() => void recalculateLearningXp()}
              disabled={recalculatingXp || refreshing}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black disabled:opacity-50 ${isDarkMode ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20' : 'border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100'}`}
            >
              <RefreshCw size={13} className={recalculatingXp ? 'animate-spin' : ''}/>
              {recalculatingXp ? '再計算中…' : '12時間上限でXPを再計算'}
            </button>
          </div>
          <p className={`mb-3 rounded-xl px-3 py-2 text-[10px] leading-5 ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
            学習XPは集中1分につき1XP、日本時間の1日につき最大12時間までです。再計算すると過去の学習記録も新ルールで集計し、差額は訂正履歴として残します。
          </p>
          {xpFeedback && <p role="status" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800">{xpFeedback}</p>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: '技術文明', level: growth.technical_level, value: growth.learning_xp, unit: '学習XP', color: 'text-blue-500', nextLevelXp: TECHNICAL_LEVEL_THRESHOLDS[growth.technical_level] ?? null },
              { label: '社会文明', level: growth.social_level, value: growth.contribution_xp, unit: '学校貢献XP', color: 'text-amber-500', nextLevelXp: null },
              { label: '研究・知識', level: growth.research_level, value: growth.knowledge_xp, unit: '知識XP', color: 'text-emerald-500', nextLevelXp: null },
              { label: '自然環境', level: growth.nature_level, value: growth.nature_growth, unit: '自然成長値', color: 'text-teal-500', nextLevelXp: null },
            ].map(axis => (
              <div key={axis.label} className="rounded-xl border border-slate-200/70 p-3 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-black">{axis.label}</p><span className={`text-[10px] font-black ${axis.color}`}>LEVEL {axis.level}</span></div>
                <p className="mt-2 text-lg font-black tabular-nums">{formatNumber(axis.value)}</p>
                <p className={`mt-1 text-[9px] ${subText}`}>{axis.unit}</p>
                {axis.nextLevelXp !== null && <p className={`mt-2 text-[9px] font-bold ${subText}`}>次のLv.{axis.level + 1}まで {formatNumber(Math.max(0, axis.nextLevelXp - axis.value))} XP（累計 {formatNumber(axis.nextLevelXp)} XP）</p>}
                {axis.label === '技術文明' && axis.nextLevelXp === null && <p className={`mt-2 text-[9px] font-bold ${subText}`}>最高レベルに到達</p>}
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
          {recentLedger.length ? <div className="divide-y divide-slate-200/60 dark:divide-slate-700">{recentLedger.map(entry => {
            const isDecrease = entry.entry_kind === 'reversal' || (entry.entry_kind === 'adjustment' && entry.adjustment_direction === 'decrease');
            return <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0 flex-1"><p className="text-xs font-bold">{entry.xp_type === 'learning' ? '学習XP' : entry.xp_type === 'contribution' ? '学校貢献XP' : '知識XP'}{entry.entry_kind !== 'award' ? ' ・訂正' : ''}</p><p className={`mt-1 text-[10px] ${subText}`}>{entry.reason || '惑星の成長'}</p>{entry.source_session && <div className={`mt-2 rounded-lg px-3 py-2 text-[10px] leading-5 ${isDarkMode ? 'bg-slate-800' : 'bg-slate-50'}`}><p className="font-black">根拠となる学習記録</p><p>{entry.source_session.subject_name} ・ {entry.source_session.task_title}</p><p>集中 {formatStudyDuration(entry.source_session.focus_seconds)} ・ 休憩 {formatStudyDuration(entry.source_session.break_seconds)} ・ {entry.source_session.finish_kind === 'stopped' ? '途中終了' : '完了'}</p></div>}</div><div className="text-right"><p className={`text-sm font-black ${isDecrease ? 'text-amber-600' : 'text-cyan-600'}`}>{isDecrease ? '−' : '+'}{formatNumber(entry.amount)} XP</p><p className={`mt-1 text-[9px] ${subText}`}>{entry.source_date}</p></div></div>;
          })}</div> : <div className={`rounded-xl border border-dashed p-5 text-center text-xs ${subText}`}>学習記録を保存すると、ここに惑星の成長履歴が表示されます。</div>}
        </section>
      </>}
        </>}

      <p className={`text-[10px] leading-5 ${subText}`}>この惑星はCampusSync専用です。Planetubeの惑星・XP・封印記録とは独立して管理され、既存のPlanetube機能には影響しません。</p>
    </div>
  );
}
