'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Atom, BookOpen, CheckCircle2, ChevronRight, Cpu, FlaskConical,
  LockKeyhole, RefreshCw, Sparkles, Sprout, Wallet, Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  getPlanetTechnologyBranchNodes,
  getPlanetTechnologyNode,
  getPlanetTechnologyNodeState,
  getPlanetTechnologyNodesForBranch,
  getPlanetTechnologyCatalogCount,
  PLANET_TECHNOLOGY_ROOT_ID,
  PLANET_TECHNOLOGY_BRANCHES,
  type PlanetTechnologyNode,
} from '@/lib/planet-technology-tree';

type MpSummary = {
  balance: number;
  earned_total: number;
  spent_total: number;
  recent_ledger?: Array<{
    id: string;
    amount: number;
    entry_type: string;
    description: string;
    technology_node_id: string | null;
    created_at: string;
  }>;
};

type ApiPayload = {
  success: boolean;
  message?: string;
  civilizationStage?: number;
  mpSummary?: MpSummary;
  purchasedNodeIds?: string[];
};

type Props = { isDarkMode?: boolean };

const BRANCH_ICONS = [Sprout, Wallet, BookOpen, Atom, Zap, ChevronRight, Cpu, Sparkles, FlaskConical, Sprout, Cpu, Sparkles, BookOpen];

function number(value: number) {
  return Math.max(0, Number(value) || 0).toLocaleString('ja-JP');
}

export default function PlanetTechnologyTree({ isDarkMode = false }: Props) {
  const [summary, setSummary] = useState<MpSummary>({ balance: 0, earned_total: 0, spent_total: 0 });
  const [stage, setStage] = useState(0);
  const [purchasedIds, setPurchasedIds] = useState<string[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const dark = isDarkMode;
  const panel = dark ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const purchased = useMemo(() => new Set(purchasedIds), [purchasedIds]);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('ログイン状態を確認できません。再ログインしてください。');
      }
      const response = await fetch('/api/planet-technology-tree', {
        headers: { Authorization: 'Bearer ' + sessionData.session.access_token },
        cache: 'no-store',
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.success || !payload.mpSummary) {
        throw new Error(payload.message || '研究ツリーを読み込めませんでした。');
      }
      setSummary(payload.mpSummary);
      setStage(Number(payload.civilizationStage || 0));
      setPurchasedIds(payload.purchasedNodeIds || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '研究ツリーを読み込めませんでした。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const catalogCount = getPlanetTechnologyCatalogCount();
  const rootNode = getPlanetTechnologyNode(PLANET_TECHNOLOGY_ROOT_ID)!;
  const rootState = getPlanetTechnologyNodeState(rootNode, stage, purchased);
  const branchNodes = getPlanetTechnologyBranchNodes();
  const purchasedBranches = branchNodes.filter(node => purchased.has(node.id));
  const visibleBranches = branchNodes;

  useEffect(() => {
    if (selectedBranchId && purchasedBranches.some(node => node.branchId === selectedBranchId)) return;
    if (!selectedBranchId && purchasedBranches.length) {
      setSelectedBranchId(purchasedBranches[0].branchId);
    }
  }, [selectedBranchId, purchasedBranches.map(node => node.branchId).join('|')]);

  const selectedBranch = PLANET_TECHNOLOGY_BRANCHES.find(branch => branch.id === selectedBranchId) || null;
  const selectedBranchNode = selectedBranchId
    ? branchNodes.find(node => node.branchId === selectedBranchId) || null
    : null;

  const purchase = async (node: PlanetTechnologyNode) => {
    if (purchasingId || purchased.has(node.id)) return;
    setPurchasingId(node.id);
    setError('');
    setFeedback('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('ログイン状態を確認できません。');
      }
      const response = await fetch('/api/planet-technology-tree', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + sessionData.session.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ node_id: node.id }),
      });
      const payload = await response.json() as { success: boolean; message?: string; balance?: number };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || '研究を解放できませんでした。');
      }
      setFeedback('「' + node.title + '」を解放しました。残り ' + number(Number(payload.balance || 0)) + ' MP');
      await load(true);
      if (node.nodeType === 'branch') setSelectedBranchId(node.branchId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '研究を解放できませんでした。');
    } finally {
      setPurchasingId(null);
    }
  };

  const renderPurchaseButton = (node: PlanetTechnologyNode) => {
    const state = getPlanetTechnologyNodeState(node, stage, purchased);
    if (state === 'purchased') {
      return <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] font-black text-emerald-600"><CheckCircle2 size={14}/>解放済み</span>;
    }
    if (state === 'parent_locked') {
      return <span className={'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[10px] font-bold ' + muted}><LockKeyhole size={13}/>前提研究が必要</span>;
    }
    if (state === 'stage_locked') {
      return <span className={'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[10px] font-bold ' + muted}><LockKeyhole size={13}/>Stage {node.requiredStage} で公開</span>;
    }
    const insufficient = summary.balance < node.costMp;
    return (
      <button
        type="button"
        onClick={() => void purchase(node)}
        disabled={!!purchasingId || insufficient}
        className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-3 py-2 text-[11px] font-black text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {purchasingId === node.id ? <RefreshCw size={13} className="animate-spin"/> : <Sparkles size={13}/>}
        {insufficient ? 'MP不足' : number(node.costMp) + ' MPで研究'}
      </button>
    );
  };

  if (loading) {
    return <div className={'flex min-h-52 items-center justify-center gap-3 rounded-2xl border p-6 ' + panel}><RefreshCw size={17} className="animate-spin text-cyan-500"/>技術ツリーを準備しています…</div>;
  }

  return (
    <section className={'space-y-4 rounded-2xl border p-4 sm:p-5 ' + panel}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black tracking-[.22em] text-cyan-600">PLANET RESEARCH NETWORK</p>
          <h2 className="mt-1 text-xl font-black">文明研究ツリー</h2>
          <p className={'mt-1 max-w-2xl text-xs leading-5 ' + muted}>
            文明が発展すると研究分野が順番に開きます。公開された研究をMPで解放し、購入した技術は永久に保持されます。
          </p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className={'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ' + (dark ? 'border-slate-700 bg-slate-800 hover:bg-slate-700' : 'border-slate-200 bg-white hover:bg-slate-50')}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''}/>更新
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2 rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 to-blue-500/5 p-4 sm:col-span-1">
          <div className="flex items-center gap-2 text-cyan-600"><Wallet size={16}/><span className="text-[10px] font-black">所持MP</span></div>
          <p className="mt-2 text-2xl font-black tabular-nums">{number(summary.balance)} <span className="text-xs">MP</span></p>
          <p className={'mt-1 text-[9px] ' + muted}>XP獲得と1対1で増加</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-3">
          <p className="text-[10px] font-bold text-emerald-600">累計獲得</p>
          <p className="mt-2 text-xl font-black tabular-nums">{number(summary.earned_total)}</p>
          <p className={'text-[9px] ' + muted}>MP</p>
        </div>
        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-3">
          <p className="text-[10px] font-bold text-amber-600">累計消費</p>
          <p className="mt-2 text-xl font-black tabular-nums">{number(summary.spent_total)}</p>
          <p className={'text-[9px] ' + muted}>MP</p>
        </div>
        <div className="rounded-2xl border border-violet-500/15 bg-violet-500/5 p-3">
          <p className="text-[10px] font-bold text-violet-600">研究カタログ</p>
          <p className="mt-2 text-xl font-black tabular-nums">{number(catalogCount)}</p>
          <p className={'text-[9px] ' + muted}>全ノード</p>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}
      {feedback && <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{feedback}</div>}

      {!purchased.has(rootNode.id) ? (
        <div className="mx-auto max-w-xl rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600"><FlaskConical size={28}/></div>
          <p className="mt-3 text-[9px] font-black tracking-[.2em] text-cyan-600">FIRST RESEARCH</p>
          <h3 className="mt-1 text-lg font-black">{rootNode.title}</h3>
          <p className={'mx-auto mt-2 max-w-md text-xs leading-6 ' + muted}>{rootNode.description}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <span className="rounded-lg border border-cyan-500/20 px-3 py-2 text-xs font-black">{number(rootNode.costMp)} MP</span>
            {renderPurchaseButton(rootNode)}
          </div>
          <p className={'mt-3 text-[10px] ' + muted}>これがすべての研究分野につながる唯一の起点です。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {selectedBranch ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => setSelectedBranchId(null)} className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-bold text-cyan-600 hover:bg-cyan-500/10"><ArrowLeft size={14}/>分野一覧へ</button>
                <span className={'text-[10px] font-bold ' + muted}>文明 Stage {stage}</span>
              </div>
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                <p className="text-[9px] font-black tracking-[.2em] text-cyan-600">RESEARCH FIELD</p>
                <h3 className="mt-1 text-lg font-black">{selectedBranch.title}</h3>
                <p className={'mt-1 text-xs leading-5 ' + muted}>{selectedBranch.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                  <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-600">分野解放済み</span>
                  <span className={muted}>10テーマ・100研究ノード</span>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedBranch.themes.map((theme, themeIndex) => {
                  const nodes = getPlanetTechnologyNodesForBranch(selectedBranch.id)
                    .filter(node => node.themeIndex === themeIndex)
                    .sort((a, b) => (a.level || 0) - (b.level || 0));
                  const purchasedCount = nodes.filter(node => purchased.has(node.id)).length;
                  const nextNode = nodes.find(node => !purchased.has(node.id));
                  const nextState = nextNode ? getPlanetTechnologyNodeState(nextNode, stage, purchased) : 'purchased';
                  const percent = Math.round(purchasedCount / 10 * 100);
                  return (
                    <article key={theme} className={'rounded-xl border p-3 ' + (dark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-slate-50/80')}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-black">{theme}</p>
                          <p className={'mt-1 text-[9px] ' + muted}>{purchasedCount}/10段階 解放済み</p>
                        </div>
                        <span className="shrink-0 rounded-lg bg-cyan-500/10 px-2 py-1 text-[9px] font-black text-cyan-600">{percent}%</span>
                      </div>
                      <div className={'mt-2 h-1.5 overflow-hidden rounded-full ' + (dark ? 'bg-slate-700' : 'bg-slate-200')}>
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400" style={{ width: percent + '%' }}/>
                      </div>
                      {nextNode ? (
                        <div className="mt-3 space-y-2">
                          <div>
                            <p className={'text-[9px] font-bold ' + muted}>次の研究 · Lv.{nextNode.level}</p>
                            <p className="mt-0.5 text-xs font-bold leading-5">{nextNode.title}</p>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={'text-[10px] font-bold ' + muted}>{number(nextNode.costMp)} MP</span>
                            {nextState === 'available'
                              ? renderPurchaseButton(nextNode)
                              : nextState === 'stage_locked'
                                ? <span className={'text-[10px] font-bold ' + muted}>文明 Stage {nextNode.requiredStage} で公開</span>
                                : <span className={'text-[10px] font-bold ' + muted}>前段階の研究が必要</span>}
                          </div>
                        </div>
                      ) : <p className="mt-3 text-xs font-bold text-emerald-600">このテーマは最終段階まで研究済みです。</p>}
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black">研究分野を選択</h3>
                <span className={'text-[10px] ' + muted}>文明 Stage {stage} · {purchasedBranches.length}/13 分野</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {visibleBranches.map((node, index) => {
                  const Icon = BRANCH_ICONS[index % BRANCH_ICONS.length];
                  const state = getPlanetTechnologyNodeState(node, stage, purchased);
                  const isPurchased = state === 'purchased';
                  return (
                    <article key={node.id} className={'rounded-xl border p-3 ' + (isPurchased ? 'border-emerald-500/25 bg-emerald-500/5' : dark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50/70')}>
                      <div className="flex items-start gap-3">
                        <span className={'rounded-xl p-2 ' + (isPurchased ? 'bg-emerald-500/10 text-emerald-600' : 'bg-cyan-500/10 text-cyan-600')}><Icon size={18}/></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black">{node.title}</p>
                          <p className={'mt-1 text-[9px] leading-4 ' + muted}>{node.description}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className={'text-[10px] font-bold ' + muted}>{number(node.costMp)} MP · Stage {node.requiredStage}</span>
                        {isPurchased ? (
                          <button type="button" onClick={() => setSelectedBranchId(node.branchId)} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black text-white hover:bg-emerald-500">研究を進める</button>
                        ) : renderPurchaseButton(node)}
                      </div>
                    </article>
                  );
                })}
              </div>
              <p className={'text-[10px] leading-5 ' + muted}>各分野の中には10テーマがあり、各テーマは10段階に発展します。前の研究を解放すると次の研究が開きます。</p>
            </>
          )}
        </div>
      )}

      <div className={'rounded-xl border p-3 ' + (dark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50')}>
        <h3 className="text-xs font-black">MPの獲得・消費ルール</h3>
        <p className={'mt-1 text-[10px] leading-5 ' + muted}>学習XP・学校貢献XP・知識XPを1獲得するとMPも1獲得します。自然成長値はXPではないためMP付与の対象外です。研究解放に使ったMPだけが消費され、XP自体は減りません。</p>
      </div>
    </section>
  );
}
