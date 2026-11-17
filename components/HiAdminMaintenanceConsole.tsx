'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, PauseCircle, RefreshCw, Save, Settings2, ShieldAlert, Wrench } from 'lucide-react';
import FeatureState from '@/components/FeatureState';
import { fetchWithRetry } from '@/lib/fetch-with-retry';

type MaintenanceMode = {
  system_key: string;
  label: string;
  mode: 'normal' | 'notice' | 'maintenance';
  notice_title: string;
  notice_message: string;
  updated_at: string;
};
type Draft = { mode: MaintenanceMode['mode']; notice_title: string; notice_message: string };

const dateText = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
};

export default function HiAdminMaintenanceConsole({ token, password2, password3 }: { token: string; password2: string; password3: string }) {
  const [rows, setRows] = useState<MaintenanceMode[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const headers = useMemo(() => ({
    Authorization: 'Bearer ' + token,
    'X-HiAdmin-Password-2': password2,
    'X-HiAdmin-Password-3': password3,
    'Cache-Control': 'no-store',
  }), [token, password2, password3]);

  const request = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetchWithRetry(url, {
      ...init,
      headers: { ...headers, ...(init?.headers || {}) },
    }, { attempts: 2, baseDelayMs: 300 });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) throw new Error(result?.message || '処理に失敗しました（HTTP ' + response.status + '）。');
    return result;
  }, [headers]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await request('/api/hiadmin?view=maintenance-modes');
      const next = (result.modes || []) as MaintenanceMode[];
      setRows(next);
      setDrafts(Object.fromEntries(next.map((row) => [row.system_key, {
        mode: row.mode,
        notice_title: row.notice_title || '',
        notice_message: row.notice_message || '',
      }])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'メンテナンス設定を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  const save = async (row: MaintenanceMode) => {
    const draft = drafts[row.system_key];
    if (!draft || savingKey) return;
    setSavingKey(row.system_key);
    setError('');
    setStatus('');
    try {
      await request('/api/hiadmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'maintenance-update',
          systemKey: row.system_key,
          mode: draft.mode,
          title: draft.notice_title,
          message: draft.notice_message,
        }),
      });
      setStatus(row.label + 'の設定を保存しました。反映には最大30秒ほどかかる場合があります。');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '設定を保存できませんでした。');
    } finally {
      setSavingKey('');
    }
  };

  const blocked = rows.filter((row) => (drafts[row.system_key]?.mode || row.mode) === 'maintenance').length;
  const notice = rows.filter((row) => (drafts[row.system_key]?.mode || row.mode) === 'notice').length;

  if (loading && !rows.length) return <FeatureState state="loading" title="メンテナンス設定を読み込んでいます"/>;
  if (error && !rows.length) return <FeatureState state="error" title="設定を読み込めません" description={error} onRetry={() => void load()}/>;

  return (
    <section className="space-y-5 text-slate-100">
      <header className="rounded-2xl border border-amber-300/15 bg-gradient-to-br from-amber-950/50 via-slate-950 to-slate-900 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-200"><Wrench size={22}/></div>
            <div><p className="font-mono text-[10px] tracking-[0.2em] text-amber-200">HIADMIN / SERVICE CONTROL</p><h2 className="mt-1 text-xl font-black">システム別メンテナンス管理</h2></div>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>再取得</button>
        </div>
        <p className="mt-3 text-xs leading-6 text-slate-300">CampusSync全体を停止せず、対象システムだけを制限します。Admin・HighAdminはメンテナンス中も入室できます。</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-white/5 bg-black/20 p-3"><p className="text-[10px] text-slate-500">管理対象</p><p className="mt-1 text-2xl font-black tabular-nums">{rows.length}</p></div>
          <div className="rounded-xl border border-white/5 bg-black/20 p-3"><p className="text-[10px] text-slate-500">機能停止中</p><p className="mt-1 text-2xl font-black tabular-nums text-rose-200">{blocked}</p></div>
          <div className="col-span-2 rounded-xl border border-white/5 bg-black/20 p-3 sm:col-span-1"><p className="text-[10px] text-slate-500">お知らせ表示中</p><p className="mt-1 text-2xl font-black tabular-nums text-amber-200">{notice}</p></div>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-xs text-rose-100">{error}</p>}
      {status && <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-xs text-emerald-100">{status}</p>}

      <div className="grid gap-3 xl:grid-cols-2">
        {rows.map((row) => {
          const draft = drafts[row.system_key] || { mode: row.mode, notice_title: row.notice_title, notice_message: row.notice_message };
          const isSaving = savingKey === row.system_key;
          return (
            <article key={row.system_key} className={'rounded-2xl border p-4 ' + (row.system_key === 'global' ? 'border-amber-300/30 bg-amber-300/[0.04] xl:col-span-2' : 'border-white/10 bg-slate-950')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className={'flex h-9 w-9 items-center justify-center rounded-xl ' + (draft.mode === 'maintenance' ? 'bg-rose-300/10 text-rose-200' : draft.mode === 'notice' ? 'bg-amber-300/10 text-amber-200' : 'bg-emerald-300/10 text-emerald-200')}>
                    {draft.mode === 'maintenance' ? <PauseCircle size={18}/> : draft.mode === 'notice' ? <BellRing size={18}/> : <CheckCircle2 size={18}/>}
                  </div>
                  <div><h3 className="text-sm font-black">{row.label}</h3><p className="font-mono text-[9px] text-slate-500">{row.system_key}</p></div>
                </div>
                <select value={draft.mode} onChange={(event) => setDrafts((old) => ({ ...old, [row.system_key]: { ...draft, mode: event.target.value as Draft['mode'] } }))} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200">
                  <option value="normal">通常稼働</option>
                  <option value="notice">お知らせのみ表示（機能は利用可）</option>
                  <option value="maintenance">この機能だけ停止</option>
                </select>
              </div>
              <div className="mt-3 grid gap-3">
                <label className="block text-[10px] font-bold text-slate-400">停止・案内画面のタイトル
                  <input maxLength={100} value={draft.notice_title} onChange={(event) => setDrafts((old) => ({ ...old, [row.system_key]: { ...draft, notice_title: event.target.value } }))} placeholder="例：メンテナンス中です" className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-xs text-white"/>
                </label>
                <label className="block text-[10px] font-bold text-slate-400">利用者に表示する説明
                  <textarea maxLength={500} rows={2} value={draft.notice_message} onChange={(event) => setDrafts((old) => ({ ...old, [row.system_key]: { ...draft, notice_message: event.target.value } }))} placeholder="例：データ更新のため、一時的に利用できません。" className="mt-1.5 w-full resize-y rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-xs text-white"/>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[9px] text-slate-500">最終更新：{row.updated_at ? dateText(row.updated_at) : '記録なし'}</p>
                <button type="button" onClick={() => void save(row)} disabled={isSaving || savingKey !== ''} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-40"><Save size={13}/>{isSaving ? '保存中…' : 'この設定を保存'}</button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-[11px] leading-5 text-slate-400">
        <div className="flex items-center gap-2 font-bold text-slate-200"><ShieldAlert size={15}/>運用上の注意</div>
        <p className="mt-2">「機能停止」は学生向け画面で対象モジュールをブロックします。「お知らせのみ表示」は機能を止めずに注意文だけを表示します。全APIの直接呼び出しを一括遮断する設定ではありません。書き込みAPIの停止も必要な場合は対象API側のメンテナンス判定を追加してください。</p>
      </div>
    </section>
  );
}
