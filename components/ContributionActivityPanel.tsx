'use client';

import React, { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, HandHeart, RefreshCw, Send, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Submission = {
  id: string;
  activity_title: string;
  activity_date: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'returned' | 'withdrawn';
  xp_amount: number | null;
  review_reason: string | null;
  created_at: string;
};
type ReviewEvent = {
  id: string;
  submission_id: string;
  to_status: string;
  xp_amount: number | null;
  reason: string;
  actor_label: string;
  created_at: string;
};
type Props = { userId: string; isDarkMode?: boolean };

const STATUS: Record<Submission['status'], { label: string; style: string }> = {
  pending: { label: '審査待ち', style: 'border-amber-300 bg-amber-50 text-amber-900' },
  approved: { label: '承認済み', style: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  rejected: { label: '却下', style: 'border-rose-300 bg-rose-50 text-rose-900' },
  returned: { label: '差し戻し', style: 'border-orange-300 bg-orange-50 text-orange-900' },
  withdrawn: { label: '取り下げ', style: 'border-slate-300 bg-slate-100 text-slate-700' },
};

function localDateValue() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}
function formatDate(value: string) {
  const date = new Date(value + 'T00:00:00');
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ja-JP');
}
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP');
}

export default function ContributionActivityPanel({ userId, isDarkMode = false }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [activityTitle, setActivityTitle] = useState('');
  const [activityDate, setActivityDate] = useState(localDateValue);
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const dark = isDarkMode;
  const panel = dark
    ? 'rounded-2xl border border-slate-700 bg-slate-900 p-4 text-white'
    : 'rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const input = dark
    ? 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500'
    : 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-600';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: authError } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (authError || !token) throw new Error('ログイン状態を確認できません。');
      const response = await fetch('/api/contributions', {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean; message?: string; submissions?: Submission[]; events?: ReviewEvent[];
      } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.message || '申請履歴を取得できませんでした。');
      setSubmissions(payload.submissions || []);
      setEvents(payload.events || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '申請履歴を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, userId]);

  const pendingCount = useMemo(
    () => submissions.filter((item) => item.status === 'pending').length,
    [submissions],
  );

  const resetForm = () => {
    setActivityTitle('');
    setActivityDate(localDateValue());
    setDescription('');
    setEditingId(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data, error: authError } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (authError || !token) throw new Error('ログイン状態を確認できません。');
      const response = await fetch('/api/contributions', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          action: editingId ? 'resubmit' : undefined,
          submission_id: editingId || undefined,
          activity_title: activityTitle,
          activity_date: activityDate,
          description,
        }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; message?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.message || '申請を保存できませんでした。');
      setMessage(editingId ? '修正した申請を再提出しました。' : '貢献活動を申請しました。Adminの審査をお待ちください。');
      resetForm();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '申請を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async (submissionId: string) => {
    if (busyId) return;
    setBusyId(submissionId);
    setError('');
    setMessage('');
    try {
      const { data, error: authError } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (authError || !token) throw new Error('ログイン状態を確認できません。');
      const response = await fetch('/api/contributions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'withdraw', submission_id: submissionId }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; message?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.message || '申請を取り下げできませんでした。');
      setMessage('申請を取り下げました。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '申請を取り下げできませんでした。');
    } finally {
      setBusyId(null);
    }
  };

  const startResubmit = (item: Submission) => {
    setEditingId(item.id);
    setActivityTitle(item.activity_title);
    setActivityDate(item.activity_date);
    setDescription(item.description);
    setMessage('内容を修正して、再提出できます。');
    setError('');
  };

  return <div className="space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-black tracking-[.2em] text-cyan-600">CAMPUSSYNC CONTRIBUTION</p>
        <h2 className={'mt-1 text-xl font-black ' + (dark ? 'text-white' : 'text-slate-900')}>学校への貢献活動</h2>
        <p className={'mt-1 text-xs ' + muted}>活動を申請するとAdminが確認します。承認された場合だけ惑星の社会文明にXPが加算されます。</p>
      </div>
      <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-cyan-950">
        <p className="text-[10px] font-bold">審査待ち</p>
        <p className="text-xl font-black">{pendingCount}件</p>
      </div>
    </header>

    <section className={panel}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-black"><HandHeart size={18} className="text-cyan-600" />{editingId ? '申請内容の修正' : '貢献活動を申請'}</h3>
        {editingId && <button type="button" onClick={resetForm} className={'text-xs font-bold ' + muted}>修正をやめる</button>}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className={'block text-xs font-bold ' + muted}>活動名
          <input className={input} value={activityTitle} onChange={(event) => setActivityTitle(event.target.value)} maxLength={120} minLength={3} placeholder="例：文化祭の準備・委員会活動" required />
        </label>
        <label className={'block text-xs font-bold ' + muted}>活動日
          <input className={input} type="date" value={activityDate} onChange={(event) => setActivityDate(event.target.value)} required />
        </label>
        <label className={'block text-xs font-bold ' + muted}>活動内容・自分が担当したこと
          <textarea className={input} value={description} onChange={(event) => setDescription(event.target.value)} minLength={10} maxLength={2000} rows={4} placeholder="どんな活動を行い、どのような役割や貢献をしたかを書いてください。" required />
        </label>
        <p className={'text-[11px] leading-5 ' + muted}>申請だけでXPは増えません。Adminが確認して、10 / 25 / 50 XPのいずれかを承認時に付与します。</p>
        <div className="flex flex-wrap justify-end gap-2">
          {editingId && <button type="button" onClick={resetForm} className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold">キャンセル</button>}
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
            <Send size={14} />{saving ? '送信中…' : editingId ? '修正して再提出' : '申請する'}
          </button>
        </div>
      </form>
    </section>

    {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">{message}</p>}

    <section className={panel}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-black"><Clock3 size={18} className="text-cyan-600" />申請履歴</h3>
        <button type="button" onClick={() => void load()} disabled={loading} className={'inline-flex items-center gap-1 text-xs font-bold ' + muted}><RefreshCw size={13} />更新</button>
      </div>
      {loading ? <p className={'py-6 text-center text-xs ' + muted}>申請を読み込んでいます…</p>
        : submissions.length ? <div className="space-y-3">{submissions.map((item) => {
          const status = STATUS[item.status];
          const itemEvents = events.filter((event) => event.submission_id === item.id);
          return <article key={item.id} className={'rounded-xl border p-3 ' + (dark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50')}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="break-words text-sm font-black">{item.activity_title}</h4>
                <p className={'mt-1 text-[10px] ' + muted}><CalendarDays size={12} className="mr-1 inline" />{formatDate(item.activity_date)} ・ 申請 {formatTime(item.created_at)}</p>
              </div>
              <span className={'rounded-full border px-2.5 py-1 text-[10px] font-black ' + status.style}>{status.label}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5">{item.description}</p>
            {item.status === 'approved' && <p className="mt-2 text-sm font-black text-emerald-600">学校貢献XP +{item.xp_amount || 0}</p>}
            {item.review_reason && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-950">Adminからのコメント：{item.review_reason}</p>}
            {item.status === 'pending' && <div className="mt-3 flex justify-end"><button type="button" onClick={() => void withdraw(item.id)} disabled={busyId === item.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-[10px] font-bold disabled:opacity-50"><XCircle size={13} />{busyId === item.id ? '処理中…' : '申請を取り下げる'}</button></div>}
            {item.status === 'returned' && <div className="mt-3 flex justify-end"><button type="button" onClick={() => startResubmit(item)} className="rounded-lg bg-orange-600 px-3 py-1.5 text-[10px] font-black text-white">内容を修正して再提出</button></div>}
            {itemEvents.length > 0 && <details className="mt-3 border-t border-slate-200/60 pt-2"><summary className={'cursor-pointer text-[10px] font-bold ' + muted}>審査・申請履歴（{itemEvents.length}件）</summary><ol className="mt-2 space-y-2">{itemEvents.map((event) => <li key={event.id} className="text-[10px] leading-4"><span className="font-bold">{event.actor_label} ・ {event.to_status}</span><span className={'ml-2 ' + muted}>{formatTime(event.created_at)}</span>{event.reason && <p className={muted}>{event.reason}</p>}</li>)}</ol></details>}
          </article>;
        })}</div> : <p className={'rounded-xl border border-dashed p-6 text-center text-xs ' + muted}>まだ申請はありません。活動内容を入力して申請できます。</p>}
    </section>
  </div>;
}
