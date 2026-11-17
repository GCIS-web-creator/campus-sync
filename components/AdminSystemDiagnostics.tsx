'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Command, RefreshCw, Search, ShieldAlert, Terminal } from 'lucide-react';
import FeatureState from '@/components/FeatureState';
import { fetchWithRetry } from '@/lib/fetch-with-retry';

type DiagnosticLog = {
  id: string;
  created_at: string;
  severity: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  source: string;
  system_key: string;
  event_code: string;
  message: string;
  route_path: string | null;
  request_id: string | null;
  status_code: number | null;
  duration_ms: number | null;
  details: Record<string, unknown>;
};
type Diagnostics = {
  checkedAt: string;
  deployment?: { environment: string; branch: string | null; commitSha: string | null; url: string | null };
  migrations?: {
    sourceAvailable: boolean;
    localCount: number;
    appliedCount: number;
    pendingCount: number;
    missingSourceCount: number;
    items: Array<{ version: string; name: string; status: 'applied' | 'pending' | 'source_missing' }>;
  };
  environment: Array<{ key: string; configured: boolean }>;
  summary: {
    logs24h: number; errors24h: number; fatal24h: number; warnings24h: number;
    environmentConfigured: number; environmentTotal: number;
    database: string; maintenanceEnabled: number; noticesEnabled: number;
  };
  logs: DiagnosticLog[];
  maintenanceModes: Array<{ system_key: string; label: string; mode: string; updated_at: string }>;
};

const severityLabel: Record<string, string> = {
  fatal: 'FATAL', error: 'ERROR', warning: 'WARN', info: 'INFO', debug: 'DEBUG',
};
const severityColor: Record<string, string> = {
  fatal: 'text-rose-200 bg-rose-400/15 border-rose-300/25',
  error: 'text-rose-300 bg-rose-400/10 border-rose-300/15',
  warning: 'text-amber-200 bg-amber-400/10 border-amber-300/15',
  info: 'text-cyan-200 bg-cyan-400/10 border-cyan-300/15',
  debug: 'text-slate-300 bg-slate-400/10 border-white/10',
};
const dateText = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
};

export default function AdminSystemDiagnostics() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [severity, setSeverity] = useState('all');
  const [system, setSystem] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ severity, system, limit: '150' });
      const response = await fetchWithRetry('/api/admin/system/diagnostics?' + params.toString(), {}, { attempts: 2, baseDelayMs: 350 });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || '診断情報を読み込めませんでした。');
      }
      setData(result as Diagnostics);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '診断情報を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }, [severity, system]);

  useEffect(() => { void load(); }, [load]);

  const systems = useMemo(() => (data?.maintenanceModes || []).map((row) => row.system_key).sort(), [data]);
  const filteredLogs = useMemo(() => (data?.logs || []).filter((row) => {
    const term = searchTerm.trim().toLocaleLowerCase();
    if (!term) return true;
    return [row.event_code, row.message, row.route_path || '', row.request_id || '', row.system_key, row.source]
      .join(' ').toLocaleLowerCase().includes(term);
  }), [data, searchTerm]);
  const terminalLines = useMemo(() => filteredLogs.slice(0, 10).map((row) =>
    '[' + dateText(row.created_at) + '] [' + severityLabel[row.severity] + '] [' + row.system_key + '] ' + row.event_code + ' — ' + row.message
  ), [filteredLogs]);

  return (
    <section className="space-y-5 text-slate-100">
      <header className="rounded-2xl border border-emerald-300/15 bg-black p-5 shadow-xl sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200"><Terminal size={22}/></div>
            <div>
              <p className="font-mono text-[10px] tracking-[0.25em] text-emerald-300">CAMPUSSYNC / SYSTEM DIAGNOSTICS</p>
              <h2 className="mt-1 text-xl font-black">システム診断コンソール</h2>
            </div>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-300/10 disabled:opacity-40">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>再取得
          </button>
        </div>
        <div className="mt-5 rounded-xl border border-emerald-300/15 bg-slate-950 p-4 font-mono text-[11px] leading-6">
          <p className="text-emerald-300">$ campussync diag --summary --tail=10</p>
          {loading && !data ? <p className="text-slate-400">[RUNNING] collecting diagnostics…</p> : error ? <p className="text-rose-300">[ERROR] {error}</p> : <>
            <p className="text-emerald-100">[OK] database: {data?.summary.database}</p>
            <p className="text-emerald-100">[OK] environment: {data?.summary.environmentConfigured}/{data?.summary.environmentTotal} keys configured (presence only)</p>
            <p className="text-emerald-100">[DEPLOY] {data?.deployment?.environment || 'unknown'} / {data?.deployment?.branch || 'branch unknown'} / {data?.deployment?.commitSha?.slice(0, 12) || 'SHA unavailable'}</p>
            <p className={data?.migrations?.pendingCount || data?.migrations?.missingSourceCount ? 'text-amber-200' : 'text-emerald-100'}>[DB MIGRATIONS] applied: {data?.migrations?.appliedCount ?? '—'} / local: {data?.migrations?.localCount ?? '—'} / pending: {data?.migrations?.pendingCount ?? '—'} / source missing: {data?.migrations?.missingSourceCount ?? '—'}</p>
            <p className={data?.summary.errors24h ? 'text-rose-300' : 'text-emerald-100'}>[{data?.summary.errors24h ? 'WARN' : 'OK'}] errors / 24h: {data?.summary.errors24h}</p>
            <p className={data?.summary.fatal24h ? 'text-rose-300' : 'text-emerald-100'}>[{data?.summary.fatal24h ? 'WARN' : 'OK'}] fatal / 24h: {data?.summary.fatal24h}</p>
            <p className="text-emerald-100">[INFO] maintenance modules: {data?.summary.maintenanceEnabled} blocked, {data?.summary.noticesEnabled} notice</p>
            <div className="mt-2 border-t border-emerald-300/10 pt-2">
              {terminalLines.length ? terminalLines.map((line, index) => <p key={index} className="break-words text-slate-400"><span className="mr-2 text-emerald-500">&gt;</span>{line}</p>) : <p className="text-slate-500">&gt; log buffer empty — no diagnostic events captured yet</p>}
            </div>
            {data?.checkedAt && <p className="mt-2 text-slate-600">last_check: {dateText(data.checkedAt)}</p>}
          </>}
          <span className="mt-2 inline-block h-3 w-2 animate-pulse bg-emerald-300 align-middle"/>
        </div>
      </header>

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ['直近24時間のログ', data.summary.logs24h, Activity],
              ['エラー', data.summary.errors24h, AlertTriangle],
              ['警告', data.summary.warnings24h, AlertTriangle],
              ['致命的エラー', data.summary.fatal24h, ShieldAlert],
              ['設定済み環境変数', data.summary.environmentConfigured + '/' + data.summary.environmentTotal, CheckCircle2],
              ['未適用マイグレーション', data.migrations?.pendingCount ?? '—', Clock3],
              ['適用済み・ソース欠損', data.migrations?.missingSourceCount ?? '—', AlertTriangle],
            ].map(([label, value, Icon]) => {
              const Graphic = Icon as typeof Activity;
              return <article key={String(label)} className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-400"><span>{String(label)}</span><Graphic size={17} className="text-emerald-300"/></div>
                <p className="mt-3 text-2xl font-black tabular-nums">{String(value)}</p>
              </article>;
            })}
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2"><Command size={17} className="text-cyan-200"/><h3 className="font-black">環境設定チェック</h3></div>
            <p className="mb-3 text-[11px] leading-5 text-slate-500">値そのものや秘密情報は取得せず、サーバーに設定が存在するかだけ確認します。</p>
            <div className="grid gap-2 md:grid-cols-2">
              {data.environment.map((item) => <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2.5">
                <code className="break-all text-[10px] text-slate-300">{item.key}</code>
                <span className={'shrink-0 rounded-md border px-2 py-1 text-[9px] font-black ' + (item.configured ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' : 'border-amber-300/20 bg-amber-300/10 text-amber-200')}>
                  {item.configured ? 'SET' : 'MISSING'}
                </span>
              </div>)}
            </div>

          </div>            <p className="mt-3 text-[10px] text-slate-500">※値は取得していません。この一覧は実行中のVercel環境に渡されたキーの有無であり、Vercelの全環境設定や認証情報の有効性までは判定しません。</p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black">DBマイグレーション台帳</h3>
                <p className="mt-1 text-[10px] text-slate-500">リポジトリ内のSQLファイルとSupabase本番DBの適用履歴を照合します。</p>
              </div>
              <span className="rounded-lg border border-white/10 px-3 py-2 font-mono text-[10px] text-slate-400">SOURCE: GIT / REMOTE: SUPABASE</span>
            </div>
            {data.migrations ? <>
              <div className="mb-4 grid gap-2 sm:grid-cols-4">
                {[
                  ['ローカルSQL', data.migrations.localCount],
                  ['DB適用済み', data.migrations.appliedCount],
                  ['未適用', data.migrations.pendingCount],
                  ['SQLソース欠損', data.migrations.missingSourceCount],
                ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                  <p className="text-[10px] text-slate-500">{String(label)}</p>
                  <p className="mt-1 text-xl font-black tabular-nums">{String(value)}</p>
                </div>)}
              </div>
              {!data.migrations.sourceAvailable && <p className="mb-3 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-[10px] text-amber-100">このデプロイにはSQLファイル一覧を読み込めませんでした。Gitのファイル同梱設定を確認してください。</p>}
              <div className="max-h-[440px] space-y-1 overflow-y-auto">
                {data.migrations.items.map((item) => <div key={item.version} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <code className="w-28 shrink-0 text-[10px] text-slate-400">{item.version}</code>
                  <span className="min-w-0 flex-1 break-all text-[10px] text-slate-200">{item.name}</span>
                  <span className={'shrink-0 rounded-md border px-2 py-1 text-[9px] font-black ' + (item.status === 'applied' ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' : item.status === 'pending' ? 'border-amber-300/20 bg-amber-300/10 text-amber-200' : 'border-rose-300/20 bg-rose-300/10 text-rose-200')}>
                    {item.status === 'applied' ? 'APPLIED' : item.status === 'pending' ? 'PENDING' : 'SOURCE MISSING'}
                  </span>
                </div>)}
                {!data.migrations.items.length && <FeatureState state="empty" compact title="マイグレーションはありません"/>}
              </div>
            </> : <FeatureState state="error" compact title="マイグレーション台帳を取得できません" description="診断APIを更新したデプロイで再取得してください。"/>}
            <p className="mt-3 text-[10px] leading-5 text-slate-500">照合はマイグレーションのバージョン番号とファイルの有無で行います。SQL本文のハッシュやスキーマの完全一致を保証するものではありません。</p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-black">実行ログ</h3><p className="mt-1 text-[10px] text-slate-500">最大150件。{filteredLogs.length}件表示中。イベント・本文・ルート・識別番号を検索できます。</p></div>
              <div className="flex flex-wrap gap-2">
                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="イベント・内容・ルートを検索" className="min-w-[180px] rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"/>
                <label className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-2 text-[10px] text-slate-400"><Search size={13}/>
                  <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="bg-transparent text-xs text-slate-200 outline-none">
                    <option value="all">全レベル</option><option value="fatal">FATAL</option><option value="error">ERROR</option><option value="warning">WARN</option><option value="info">INFO</option><option value="debug">DEBUG</option>
                  </select>
                </label>
                <select value={system} onChange={(e) => setSystem(e.target.value)} className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-xs text-slate-200">
                  <option value="all">全システム</option>
                  {systems.map((key) => <option key={key} value={key}>{key}</option>)}
                </select>
              </div>
            </div>

            {loading && !data ? <FeatureState state="loading" compact title="ログを読み込んでいます"/> :
              error ? <FeatureState state="error" compact title="診断ログを読み込めません" description={error} onRetry={() => void load()}/> :
              !filteredLogs.length ? <FeatureState state="empty" compact title="該当するログはありません" description="この条件に一致する診断イベントは記録されていません。"/> :
              <div className="space-y-2">
                {filteredLogs.map((row) => <details key={row.id} className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-3 hover:bg-white/[0.035]">
                    <span className={'rounded-md border px-2 py-1 font-mono text-[9px] font-black ' + (severityColor[row.severity] || severityColor.info)}>{severityLabel[row.severity] || row.severity}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-emerald-200">{row.event_code}</span>
                    <span className="text-[9px] text-slate-500">{row.system_key}</span>
                    <time className="text-[9px] text-slate-500">{dateText(row.created_at)}</time>
                  </summary>
                  <div className="space-y-2 border-t border-white/5 px-3 py-3 font-mono text-[10px] leading-5">
                    <p className="break-words text-slate-200">{row.message}</p>
                    <p className="break-all text-slate-500">route: {row.route_path || '—'}</p>
                    <p className="break-all text-slate-500">request_id: {row.request_id || '—'}</p>
                    <p className="text-slate-500">source: {row.source} · status: {row.status_code ?? '—'} · duration: {row.duration_ms ?? '—'} ms</p>
                    {Object.keys(row.details || {}).length > 0 && <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-slate-500">{JSON.stringify(row.details, null, 2)}</pre>}
                  </div>
                </details>)}
              </div>}
          </div>

          <div className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-4 text-[11px] leading-5 text-amber-100/80">
            ログには個人情報や認証トークンを保存しない設計です。現時点の自動収集対象はNext.jsが捕捉したサーバー例外と、アプリの描画エラーです。個別APIが内部で捕捉して処理を続けるエラーは、各APIへの記録処理を追加した範囲で表示されます。
          </div>
        </>
      )}
    </section>
  );
}
