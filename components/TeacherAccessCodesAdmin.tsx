'use client';

import React, { useEffect, useState } from 'react';
import { CalendarDays, Copy, KeyRound, Plus, RefreshCw, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';

type TeacherAccessCode = {
  id: string;
  display_name: string;
  starts_on: string;
  ends_on: string;
  is_active: boolean;
  use_count: number;
  created_at: string;
  last_used_at: string | null;
};

function tokyoToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function oneYearLater(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year + 1, month - 1, day));
  return next.toISOString().slice(0, 10);
}

export default function TeacherAccessCodesAdmin() {
  const today = tokyoToday();
  const [codes, setCodes] = useState<TeacherAccessCode[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(oneYearLater(today));
  const [issuedCode, setIssuedCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadCodes = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/teacher-access-codes', { cache: 'no-store', credentials: 'same-origin' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '一覧を読み込めませんでした。');
      setCodes(result.codes || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '一覧を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCodes(); }, []);

  const createCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!displayName.trim() || !startsOn || !endsOn || startsOn > endsOn) {
      setMessage('氏名と利用開始日・終了日を正しく入力してください。');
      return;
    }
    setSaving(true);
    setMessage('');
    setIssuedCode('');
    try {
      const response = await fetch('/api/admin/teacher-access-codes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName.trim(), starts_on: startsOn, ends_on: endsOn }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'コードを発行できませんでした。');
      setIssuedCode(result.code || '');
      setCodes(current => [result.item, ...current]);
      setDisplayName('');
      setMessage('アクセスコードを発行しました。コードはこの画面を閉じると再表示できません。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'コードを発行できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const updateCode = async (row: TeacherAccessCode, changes: Partial<TeacherAccessCode>) => {
    setBusyId(row.id);
    setMessage('');
    try {
      const response = await fetch('/api/admin/teacher-access-codes', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, ...changes }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '保存できませんでした。');
      setCodes(current => current.map(item => item.id === row.id ? result.item : item));
      if (changes.is_active === false) setMessage('コードを停止し、ログイン中の先生セッションも無効にしました。');
      else setMessage('変更を保存しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setBusyId(null);
    }
  };

  const rotateCode = async (row: TeacherAccessCode) => {
    if (!window.confirm(`${row.display_name} さんのコードを再発行します。以前のコードとログイン中のセッションはすべて無効になります。よろしいですか？`)) return;
    setBusyId(row.id);
    setIssuedCode('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/teacher-access-codes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rotate', id: row.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '再発行できませんでした。');
      setIssuedCode(result.code || '');
      setMessage(result.message || '新しいコードを発行しました。');
      await loadCodes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '再発行できませんでした。');
    } finally {
      setBusyId(null);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(issuedCode);
      setMessage('アクセスコードをコピーしました。');
    } catch {
      setMessage('自動コピーできませんでした。コードを選択してコピーしてください。');
    }
  };

  const statusFor = (row: TeacherAccessCode) => {
    if (!row.is_active) return { label: '停止中', className: 'border-slate-700 bg-slate-800 text-slate-400' };
    if (today < row.starts_on) return { label: '開始前', className: 'border-sky-800 bg-sky-950/50 text-sky-300' };
    if (today > row.ends_on) return { label: '期間終了', className: 'border-rose-900 bg-rose-950/40 text-rose-300' };
    return { label: '利用可能', className: 'border-emerald-800 bg-emerald-950/40 text-emerald-300' };
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black text-white"><KeyRound className="text-cyan-400" /> 先生用アクセスコード管理</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">先生は学校メールや学籍番号を使わず、ここで発行したコードだけで生徒用CampusSyncにログインできます。コードはハッシュ化して保存し、平文は発行時にだけ表示します。</p>
        </div>
        <button type="button" onClick={() => void loadCodes()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 更新</button>
      </div>

      <form onSubmit={createCode} className="space-y-4 rounded-2xl border border-cyan-900/60 bg-slate-950 p-5 sm:p-6">
        <div className="flex items-center gap-2"><Plus className="text-cyan-300" size={18} /><h3 className="font-black text-white">新しい先生用コードを発行</h3></div>
        <label className="block text-xs font-bold text-slate-300">先生の氏名・表示名
          <input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} required placeholder="例：山田先生" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold text-slate-300"><span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> 利用開始日</span>
            <input type="date" value={startsOn} onChange={event => setStartsOn(event.target.value)} required className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500 [color-scheme:dark]" />
          </label>
          <label className="block text-xs font-bold text-slate-300"><span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> 利用終了日</span>
            <input type="date" value={endsOn} min={startsOn} onChange={event => setEndsOn(event.target.value)} required className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500 [color-scheme:dark]" />
          </label>
        </div>
        <p className="text-[11px] leading-5 text-slate-500">開始日・終了日は日本時間で判定し、終了日当日いっぱいまで利用できます。利用期間外になると、ログイン済みでもアクセスが停止します。</p>
        <button type="submit" disabled={saving || !displayName.trim() || !startsOn || !endsOn || startsOn > endsOn} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">{saving ? '発行中…' : 'アクセスコードを発行'}</button>
      </form>

      {issuedCode && (
        <section className="space-y-3 rounded-2xl border border-emerald-800/70 bg-emerald-950/30 p-5">
          <div className="flex items-center gap-2 text-sm font-black text-emerald-200"><ShieldCheck size={18} /> 発行したコード（この画面でのみ表示）</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input readOnly value={issuedCode} aria-label="発行した先生用アクセスコード" onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1 rounded-xl border border-emerald-800 bg-slate-950 px-4 py-3 text-center font-mono text-lg font-black tracking-wider text-white" />
            <button type="button" onClick={() => void copyCode()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-emerald-400"><Copy size={16} /> コピー</button>
          </div>
          <p className="text-xs leading-5 text-emerald-100/80">先生本人に安全な方法で共有してください。コードを再確認できなくなった場合は「再発行」で新しいコードに切り替えられます。</p>
        </section>
      )}

      {message && <p role="status" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs leading-5 text-slate-200">{message}</p>}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h3 className="text-base font-black text-white">発行済みコード</h3><span className="text-xs text-slate-500">{codes.length}件</span></div>
        {loading ? <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">読み込み中…</div> : codes.length === 0 ? <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">まだコードは発行されていません。</div> : (
          <div className="space-y-3">
            {codes.map(row => {
              const status = statusFor(row);
              return (
                <article key={row.id} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0"><h4 className="font-black text-white">{row.display_name}</h4><p className="mt-1 text-[11px] text-slate-500">発行：{new Date(row.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p></div>
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-black ${status.className}`}>{status.label}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-bold text-slate-300">利用開始日
                      <input type="date" value={row.starts_on} onChange={event => setCodes(current => current.map(item => item.id === row.id ? { ...item, starts_on: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white [color-scheme:dark]" />
                    </label>
                    <label className="block text-xs font-bold text-slate-300">利用終了日
                      <input type="date" min={row.starts_on} value={row.ends_on} onChange={event => setCodes(current => current.map(item => item.id === row.id ? { ...item, ends_on: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white [color-scheme:dark]" />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><span>ログイン回数：{row.use_count}回</span><span>最終利用：{row.last_used_at ? new Date(row.last_used_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未使用'}</span></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void updateCode(row, { starts_on: row.starts_on, ends_on: row.ends_on })} disabled={busyId === row.id || !row.starts_on || !row.ends_on || row.starts_on > row.ends_on} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-black text-white hover:bg-cyan-500 disabled:opacity-50">期間を保存</button>
                    <button type="button" onClick={() => void updateCode(row, { is_active: !row.is_active })} disabled={busyId === row.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50">{row.is_active ? <><ShieldOff size={13} /> 停止</> : <><ShieldCheck size={13} /> 再開</>}</button>
                    <button type="button" onClick={() => void rotateCode(row)} disabled={busyId === row.id} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-800/70 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-950/40 disabled:opacity-50"><RefreshCw size={13} /> コード再発行</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
