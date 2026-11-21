'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, RotateCcw, XCircle } from 'lucide-react';

type ReviewEvent = {
  id: string; event_type: string; to_status: string; xp_amount: number | null;
  reason: string; actor_label: string; created_at: string;
};
type Submission = {
  id: string; user_id: string; activity_title: string; activity_date: string; description: string;
  status: 'pending' | 'approved' | 'rejected' | 'returned' | 'withdrawn';
  xp_amount: number | null; review_reason: string | null; created_at: string;
  profile: { student_id: string; student_name: string; user_class: string } | null;
  events: ReviewEvent[];
};
type Props = { adminPassword: string };

function formatDate(value: string) {
  const date = new Date(value + 'T00:00:00');
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ja-JP');
}
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP');
}

export default function ContributionApprovalAdmin({ adminPassword }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [xpValues, setXpValues] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const pending = useMemo(() => submissions.filter((item) => item.status === 'pending'), [submissions]);
  const counts = useMemo(() => ({
    approved: submissions.filter((item) => item.status === 'approved').length,
    returned: submissions.filter((item) => item.status === 'returned').length,
    rejected: submissions.filter((item) => item.status === 'rejected').length,
  }), [submissions]);

  const load = useCallback(async () => {
    if (!adminPassword.trim()) {
      setSubmissions([]);
      setError('Admin認証を入力すると審査一覧を表示できます。');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/contributions', {
        headers: { 'x-admin-password': adminPassword },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean; message?: string; submissions?: Submission[];
      } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.message || '申請一覧を読み込めませんでした。');
      setSubmissions(payload.submissions || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '申請一覧を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [adminPassword]);

  useEffect(() => { void load(); }, [load]);

  const review = async (item: Submission, decision: 'approve' | 'reject' | 'return') => {
    if (savingId) return;
    const reviewReason = (reasons[item.id] || '').trim();
    if (decision !== 'approve' && reviewReason.length < 5) {
      setError('却下・差し戻しには5文字以上の理由を入力してください。');
      return;
    }
    setSavingId(item.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({
          submission_id: item.id,
          decision,
          xp_amount: decision === 'approve' ? (xpValues[item.id] || 25) : null,
          review_reason: reviewReason,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean; message?: string; result?: { xp_amount?: number };
      } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.message || '審査を確定できませんでした。');
      setMessage(decision === 'approve'
        ? '承認しました。学校貢献XP +' + String(payload.result?.xp_amount || 0) + ' を惑星に反映しました。'
        : decision === 'return' ? '申請を差し戻しました。' : '申請を却下しました。');
      setReasons((current) => ({ ...current, [item.id]: '' }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '審査を確定できませんでした。');
    } finally {
      setSavingId(null);
    }
  };

  return <section className="space-y-4 rounded-2xl border border-cyan-900/60 bg-slate-950 p-5 text-white">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black tracking-[.2em] text-cyan-400">PLANET CIVILIZATION / PHASE 3</p>
        <h2 className="mt-1 text-xl font-black">学校貢献活動の審査</h2>
        <p className="mt-1 text-xs leading-5 text-slate-400">承認した申請だけに10 / 25 / 50 XPを付与します。既存の貢献ポイント・剣ランクには触れません。</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-50"><RefreshCw size={14} />{loading ? '更新中…' : '更新'}</button>
    </header>

    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-xl border border-amber-900/50 bg-amber-950/40 p-3"><p className="text-[10px] text-amber-200">審査待ち</p><p className="mt-1 text-2xl font-black text-amber-300">{pending.length}</p></div>
      <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/40 p-3"><p className="text-[10px] text-emerald-200">承認済み</p><p className="mt-1 text-2xl font-black text-emerald-300">{counts.approved}</p></div>
      <div className="rounded-xl border border-orange-900/50 bg-orange-950/40 p-3"><p className="text-[10px] text-orange-200">差し戻し</p><p className="mt-1 text-2xl font-black text-orange-300">{counts.returned}</p></div>
      <div className="rounded-xl border border-rose-900/50 bg-rose-950/40 p-3"><p className="text-[10px] text-rose-200">却下</p><p className="mt-1 text-2xl font-black text-rose-300">{counts.rejected}</p></div>
    </div>

    {error && <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/60 p-3 text-xs text-rose-200">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/60 p-3 text-xs text-emerald-200">{message}</p>}
    {!adminPassword.trim() && <p className="text-xs text-slate-400">Admin画面で認証すると申請一覧を読み込めます。</p>}
    {adminPassword.trim() && pending.length === 0 && !loading && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">現在、審査待ちの申請はありません。</p>}

    {pending.map((item) => <article key={item.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-black">{item.activity_title}</h3>
          <p className="mt-1 text-[10px] text-slate-400">{item.profile?.student_name || '生徒'} ・ {item.profile?.user_class || 'クラス未登録'} ・ {item.profile?.student_id || ''}</p>
          <p className="mt-1 text-[10px] text-slate-500">活動日 {formatDate(item.activity_date)} ・ 申請 {formatTime(item.created_at)}</p>
        </div>
        <span className="rounded-full border border-amber-700 bg-amber-950/50 px-2.5 py-1 text-[10px] font-black text-amber-200">審査待ち</span>
      </div>
      <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-200">{item.description}</p>
      <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
        <label className="text-[10px] font-bold text-slate-300">承認XP
          <select value={xpValues[item.id] || 25} onChange={(event) => setXpValues((current) => ({ ...current, [item.id]: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
            <option value={10}>小規模な貢献・10 XP</option>
            <option value={25}>通常の貢献・25 XP</option>
            <option value={50}>大きな貢献・50 XP</option>
          </select>
        </label>
        <label className="text-[10px] font-bold text-slate-300">審査理由・コメント
          <textarea value={reasons[item.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} rows={2} maxLength={500} placeholder="却下・差し戻しの場合は理由を5文字以上入力" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500" />
        </label>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-3">
        <button type="button" onClick={() => void review(item, 'return')} disabled={savingId === item.id || !reasons[item.id]?.trim()} className="inline-flex items-center gap-1 rounded-lg border border-orange-700 px-3 py-2 text-xs font-bold text-orange-200 disabled:opacity-40"><RotateCcw size={13} />差し戻し</button>
        <button type="button" onClick={() => void review(item, 'reject')} disabled={savingId === item.id || !reasons[item.id]?.trim()} className="inline-flex items-center gap-1 rounded-lg border border-rose-700 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-40"><XCircle size={13} />却下</button>
        <button type="button" onClick={() => void review(item, 'approve')} disabled={savingId === item.id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><CheckCircle2 size={13} />{savingId === item.id ? '処理中…' : '承認してXP付与'}</button>
      </div>
      {item.events.length > 1 && <details className="border-t border-slate-800 pt-2"><summary className="cursor-pointer text-[10px] font-bold text-slate-400">申請・審査履歴（{item.events.length}件）</summary><ol className="mt-2 space-y-1">{item.events.map((event) => <li key={event.id} className="text-[10px] text-slate-400">{event.actor_label} ・ {event.to_status} ・ {formatTime(event.created_at)}{event.reason ? ' ・ ' + event.reason : ''}</li>)}</ol></details>}
    </article>)}
  </section>;
}
