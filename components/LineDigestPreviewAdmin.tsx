'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, RefreshCw, AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';

type AssignmentPreview = {
  id: string;
  title: string;
  subject: string | null;
  details: string | null;
  due_at: string | null;
  priority: 'normal' | 'important' | 'urgent';
  target_class: string | null;
  subject_option: string | null;
};
type ScheduleChange = {
  id: string;
  entity_type: 'assignment' | 'exam' | 'mini_test';
  action: string;
  title: string;
  subject: string | null;
  priority: string;
  summary: string;
  previous_value: Record<string, unknown> | null;
  next_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
  digest_sent_at: string | null;
};
type PreviewResult = {
  currentAssignments: AssignmentPreview[];
  overdueAssignments: AssignmentPreview[];
  pendingChanges: ScheduleChange[];
  recentlySentChanges: ScheduleChange[];
  generatedAt: string;
  note: string;
};

const dateTime = (value: string | null) => {
  if (!value) return '期限未設定';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '日時不明' : new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(parsed);
};
const priorityText = (priority: string) => priority === 'urgent' ? '緊急' : priority === 'important' ? '重要' : '通常';
const changeTypeText = (type: string) => type === 'assignment' ? '課題' : type === 'exam' ? '定期考査' : '小テスト';
const actionText = (action: string) => action === 'created' ? '新規登録' : action === 'published' ? '公開' : action === 'cancelled' ? '中止・非公開' : '変更';

export default function LineDigestPreviewAdmin() {
  const [data, setData] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/line-digest-preview', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'LINE配信プレビューを取得できませんでした。');
      setData(result as PreviewResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'LINE配信プレビューを取得できませんでした。');
      setData(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const assignmentCard = (row: AssignmentPreview, overdue: boolean) => (
    <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-cyan-950 px-2 py-1 text-[10px] font-black text-cyan-200">{row.subject || 'その他'}</span>
        <span className={'rounded-lg px-2 py-1 text-[10px] font-bold ' + (row.priority === 'urgent' ? 'bg-rose-950 text-rose-200' : row.priority === 'important' ? 'bg-amber-950 text-amber-200' : 'bg-slate-800 text-slate-300')}>{priorityText(row.priority)}</span>
      </div>
      <h4 className="mt-2 text-sm font-black text-white">{row.title}</h4>
      <p className={'mt-1 text-xs font-bold ' + (overdue ? 'text-rose-300' : 'text-blue-300')}>{dateTime(row.due_at)}{overdue ? ' ・期限超過' : ''}</p>
    </article>
  );

  const changeCard = (row: ScheduleChange, sent: boolean) => (
    <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-blue-950 px-2 py-1 text-[10px] font-bold text-blue-200">{changeTypeText(row.entity_type)}</span>
        <span className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">{actionText(row.action)}</span>
        <span className={'rounded-lg px-2 py-1 text-[10px] font-bold ' + (row.priority === 'urgent' ? 'bg-rose-950 text-rose-200' : row.priority === 'important' ? 'bg-amber-950 text-amber-200' : 'bg-slate-800 text-slate-300')}>{priorityText(row.priority)}</span>
      </div>
      <h4 className="mt-2 text-sm font-black text-white">{row.title}{row.subject ? ' ・ ' + row.subject : ''}</h4>
      <p className="mt-1 text-xs leading-5 text-slate-300">{row.summary}</p>
      {row.reason && <p className="mt-1 text-xs text-slate-500">理由：{row.reason}</p>}
      <p className="mt-2 text-[10px] text-slate-500">{sent ? '配信済み：' + dateTime(row.digest_sent_at) : '配信待ち：' + dateTime(row.created_at)}</p>
    </article>
  );

  return (
    <section className="rounded-2xl border border-blue-900/50 bg-slate-950 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-black text-white"><CalendarClock size={18} className="text-blue-300"/>次回LINE定期配信プレビュー</h3>
          <p className="mt-1 text-xs text-slate-400">課題・期限超過・日程変更が、次回の既存配信にどう掲載されるか確認できます。</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40"><RefreshCw size={13}/>{loading ? '更新中…' : 'プレビューを更新'}</button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</p>}
      {!data && loading && <p className="text-xs text-slate-500">配信内容を確認しています…</p>}
      {data && <>
        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-xs leading-5 text-emerald-100">
          <p className="flex items-center gap-2 font-black"><CheckCircle2 size={14}/>追加の個別配信は行いません</p>
          <p className="mt-1 text-emerald-100/80">{data.note}</p>
          <p className="mt-1 text-[10px] text-emerald-100/60">生成：{dateTime(data.generatedAt)}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <h4 className="flex items-center gap-2 text-sm font-black text-emerald-200"><CheckCircle2 size={15}/>期限内・期限未設定 ({data.currentAssignments.length})</h4>
            {data.currentAssignments.length ? data.currentAssignments.map(row => assignmentCard(row, false)) : <p className="text-xs text-slate-500">掲載する課題はありません。</p>}
          </div>
          <div className="space-y-2">
            <h4 className="flex items-center gap-2 text-sm font-black text-rose-200"><AlertTriangle size={15}/>期限超過・確認用 ({data.overdueAssignments.length})</h4>
            {data.overdueAssignments.length ? data.overdueAssignments.map(row => assignmentCard(row, true)) : <p className="text-xs text-slate-500">期限超過の課題はありません。</p>}
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-black text-blue-200"><Clock3 size={15}/>定期配信待ちの変更 ({data.pendingChanges.length})</h4>
          {data.pendingChanges.length ? data.pendingChanges.map(row => changeCard(row, false)) : <p className="text-xs text-slate-500">配信待ちの変更はありません。</p>}
        </div>
        {data.recentlySentChanges.length > 0 && <details className="rounded-xl border border-slate-800 bg-slate-900 p-3">
          <summary className="cursor-pointer text-xs font-bold text-slate-300">最近配信した変更（14日以内・{data.recentlySentChanges.length}件）</summary>
          <div className="mt-3 space-y-2">{data.recentlySentChanges.map(row => changeCard(row, true))}</div>
        </details>}
      </>}
    </section>
  );
}
