'use client';

import React, { useEffect, useState } from 'react';
import { Check, ClipboardList, RefreshCw, X } from 'lucide-react';

type PendingMiniTest = { id: string; subject: string; title: string; test_date: string; scope: string; notes: string; created_at: string };
export default function MiniTestApprovalsAdmin() {
  const [items, setItems] = useState<PendingMiniTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/mini-tests', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || '申請を取得できませんでした。');
      setItems(result.pending || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : '申請を取得できませんでした。'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const decide = async (id: string, action: 'approve' | 'reject') => {
    if (busyId) return;
    if (action === 'approve' && !window.confirm('この小テストを学校全体の週間予定表とLINE週間配信に公開しますか？')) return;
    if (action === 'reject' && !window.confirm('この小テスト申請を却下しますか？')) return;
    setBusyId(id); setMessage('');
    try {
      const response = await fetch('/api/admin/mini-tests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }), cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '処理に失敗しました。');
      setItems(current => current.filter(item => item.id !== id));
      setMessage(action === 'approve' ? '小テストを学校予定表へ公開しました。' : '申請を却下しました。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '処理に失敗しました。'); }
    finally { setBusyId(''); }
  };
  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-lg font-black text-white"><ClipboardList className="text-amber-300" /> LINE小テスト登録の承認</h3><p className="mt-1 text-xs text-slate-400">生徒がLINEから送信した予定です。承認すると学校全体に公開されます。</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-900"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {message && <p role="status" className="rounded-lg bg-slate-900 p-3 text-xs text-slate-300">{message}</p>}
      {loading ? <p className="text-sm text-slate-400">読み込み中...</p> : items.length === 0 ? <p className="rounded-xl bg-slate-900 p-4 text-sm text-slate-400">承認待ちの小テストはありません。</p> : items.map(item => (
        <article key={item.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-black text-amber-300">{item.subject}</span><span className="text-xs text-slate-400">{item.test_date}</span></div>
          <h4 className="text-sm font-black text-white">{item.title}</h4>
          {item.scope && <p className="whitespace-pre-wrap text-xs leading-5 text-slate-300">範囲：{item.scope}</p>}
          {item.notes && <p className="whitespace-pre-wrap text-xs leading-5 text-slate-400">備考：{item.notes}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(busyId)} onClick={() => void decide(item.id, 'approve')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><Check size={14} /> 承認して公開</button>
            <button type="button" disabled={Boolean(busyId)} onClick={() => void decide(item.id, 'reject')} className="inline-flex items-center gap-1 rounded-lg border border-rose-900 px-3 py-2 text-xs font-black text-rose-300 disabled:opacity-50"><X size={14} /> 却下</button>
          </div>
        </article>
      ))}
    </section>
  );
}
