'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Check, RefreshCw, Save, X } from 'lucide-react';

type MiniTest = {
  id: string;
  subject: string;
  title: string;
  test_date: string;
  period: number | null;
  start_note: string;
  duration_minutes: number | null;
  scope: string;
  notes: string;
  question_count: number | null;
  full_score: number | null;
  target_class: string;
  status: 'pending' | 'published' | 'rejected' | 'cancelled';
  source: string;
  created_at: string;
  priority?: 'normal' | 'important' | 'urgent';
};

const INITIAL_DRAFT = {
  subject: '',
  title: '',
  test_date: '',
  period: '7',
  start_note: '授業開始直後',
  duration_minutes: '10',
  scope: '',
  notes: '',
  question_count: '',
  full_score: '',
  target_class: 'all',
  priority: 'normal',
};
const SUBJECTS = ['国語演習', '古典探求', '物理', '化学', '生物', '数３', '数C', '公共', '英コミュ', '論表', '情報', '保健', 'その他'];
const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500';
const labelClass = 'block space-y-1 text-xs font-bold text-slate-300';
const dateLabel = (value: string) => new Date(value + 'T00:00:00').toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
const statusLabel = (value: MiniTest['status']) => value === 'pending' ? 'Admin承認待ち' : value === 'published' ? '公開中' : value === 'rejected' ? '却下' : '中止';

export default function MiniTestScheduleAdmin() {
  const [rows, setRows] = useState<MiniTest[]>([]);
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [editingId, setEditingId] = useState('');
  const [editingDraft, setEditingDraft] = useState(INITIAL_DRAFT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/mini-tests', { cache: 'no-store', credentials: 'same-origin' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '小テスト予定を取得できませんでした。');
      setRows(Array.isArray(result.events) ? result.events : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '小テスト予定を取得できませんでした。');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/admin/mini-tests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          period: Number(draft.period),
          duration_minutes: Number(draft.duration_minutes),
          question_count: Number(draft.question_count),
          full_score: Number(draft.full_score),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '小テストを登録できませんでした。');
      setMessage('小テストを公開しました。日程情報は次回の定期LINEまとめにも反映されます。');
      setDraft(INITIAL_DRAFT);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '小テストを登録できませんでした。');
    } finally { setSaving(false); }
  };

  const beginEdit = (row: MiniTest) => {
    setEditingId(row.id);
    setEditingDraft({
      subject: row.subject || '',
      title: row.title || '',
      test_date: row.test_date || '',
      period: String(row.period ?? ''),
      start_note: row.start_note || '',
      duration_minutes: String(row.duration_minutes ?? ''),
      scope: row.scope || '',
      notes: row.notes || '',
      question_count: String(row.question_count ?? ''),
      full_score: String(row.full_score ?? ''),
      target_class: row.target_class || 'all',
      priority: row.priority || 'normal',
    });
    setMessage('');
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) return;
    setBusyId(editingId); setMessage('');
    try {
      const response = await fetch('/api/admin/mini-tests', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editingDraft,
          id: editingId,
          action: 'update',
          period: Number(editingDraft.period),
          duration_minutes: Number(editingDraft.duration_minutes),
          question_count: Number(editingDraft.question_count),
          full_score: Number(editingDraft.full_score),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '小テストを更新できませんでした。');
      setEditingId('');
      setMessage('小テストを更新しました。変更内容は次回の定期LINEまとめに掲載されます。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '小テストを更新できませんでした。');
    } finally { setBusyId(''); }
  };

  const act = async (row: MiniTest, action: 'approve' | 'reject' | 'cancel') => {
    const text = action === 'approve' ? '公開' : action === 'reject' ? '却下' : '中止';
    if (!window.confirm('「' + row.title + '」を' + text + 'しますか？')) return;
    setBusyId(row.id); setMessage('');
    try {
      const response = await fetch('/api/admin/mini-tests', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '状態を更新できませんでした。');
      setMessage(action === 'approve' ? '小テストを公開しました。' : action === 'reject' ? '提案を却下しました。' : '小テストを中止しました。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '状態を更新できませんでした。');
    } finally { setBusyId(''); }
  };

  const eventCard = (row: MiniTest) => <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-lg bg-cyan-950 px-2.5 py-1 text-[10px] font-black text-cyan-200">{row.subject}</span>
      <span className={'rounded-lg px-2.5 py-1 text-[10px] font-bold ' + (row.status === 'pending' ? 'bg-amber-950 text-amber-200' : 'bg-emerald-950 text-emerald-200')}>{statusLabel(row.status)}</span>
      <span className="text-[10px] text-slate-500">{row.source === 'line' ? 'LINEからの提案' : 'Admin登録'}</span>
      <span className={'rounded-lg px-2.5 py-1 text-[10px] font-bold ' + ((row.priority||'normal')==='urgent'?'bg-rose-950 text-rose-200':(row.priority||'normal')==='important'?'bg-amber-950 text-amber-200':'bg-slate-800 text-slate-300')}>{(row.priority||'normal')==='urgent'?'緊急':(row.priority||'normal')==='important'?'重要':'通常'}</span>
    </div>
    <h4 className="mt-2 text-base font-black text-white">{row.title}</h4>
    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-cyan-200"><CalendarDays size={14}/>{dateLabel(row.test_date)} ・ {row.period ? row.period + '限' : '時限未設定'} ・ {row.start_note} ・ {row.duration_minutes ? row.duration_minutes + '分間' : '時間未設定'}</p>
    <p className="mt-2 text-xs text-slate-300">対象：{row.target_class === 'all' ? '全生徒' : row.target_class} ・ {row.question_count ?? '—'}問／{row.full_score ?? '—'}点満点</p>
    <div className="mt-3 rounded-lg bg-slate-950 p-3"><p className="mb-1 text-[10px] font-black text-slate-500">試験範囲</p><p className="whitespace-pre-wrap text-xs leading-5 text-slate-200">{row.scope}</p></div>
    {row.notes && <div className="mt-3"><p className="mb-1 text-[10px] font-black text-slate-500">出題内容・形式</p><p className="whitespace-pre-wrap text-xs leading-5 text-slate-300">{row.notes}</p></div>}
    <div className="mt-3 flex flex-wrap justify-end gap-2">
      {(row.status === 'pending' || row.status === 'published') && <button type="button" onClick={() => editingId===row.id?setEditingId(''):beginEdit(row)} disabled={!!busyId} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-40">{editingId===row.id?'編集を閉じる':'編集'}</button>}
      {row.status === 'pending' && <>
        <button type="button" onClick={() => void act(row, 'reject')} disabled={!!busyId} className="rounded-lg border border-rose-900 px-3 py-2 text-xs font-bold text-rose-300 disabled:opacity-40"><X size={13} className="mr-1 inline"/>却下</button>
        <button type="button" onClick={() => void act(row, 'approve')} disabled={!!busyId} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><Check size={13} className="mr-1 inline"/>承認して公開</button>
      </>}
      {row.status === 'published' && <button type="button" onClick={() => void act(row, 'cancel')} disabled={!!busyId} className="rounded-lg border border-rose-900 px-3 py-2 text-xs font-bold text-rose-300 disabled:opacity-40">中止する</button>}
    </div>
    {editingId===row.id&&<form onSubmit={saveEdit} className="mt-4 space-y-3 rounded-xl border border-cyan-900 bg-slate-950 p-4">
      <h5 className="text-sm font-black text-cyan-200">小テストの変更</h5>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>教科<select className={inputClass} value={editingDraft.subject} onChange={e=>setEditingDraft(current=>({...current,subject:e.target.value}))} required>{SUBJECTS.map(subject=><option key={subject}>{subject}</option>)}</select></label>
        <label className={labelClass}>小テスト名<input className={inputClass} value={editingDraft.title} onChange={e=>setEditingDraft(current=>({...current,title:e.target.value}))} maxLength={160} required/></label>
        <label className={labelClass}>実施日<input className={inputClass} type="date" value={editingDraft.test_date} onChange={e=>setEditingDraft(current=>({...current,test_date:e.target.value}))} required/></label>
        <label className={labelClass}>時限<input className={inputClass} type="number" min="1" max="12" value={editingDraft.period} onChange={e=>setEditingDraft(current=>({...current,period:e.target.value}))} required/></label>
        <label className={labelClass}>開始タイミング<input className={inputClass} value={editingDraft.start_note} onChange={e=>setEditingDraft(current=>({...current,start_note:e.target.value}))} maxLength={120} required/></label>
        <label className={labelClass}>所要時間（分）<input className={inputClass} type="number" min="1" max="180" value={editingDraft.duration_minutes} onChange={e=>setEditingDraft(current=>({...current,duration_minutes:e.target.value}))} required/></label>
        <label className={labelClass}>問題数<input className={inputClass} type="number" min="1" max="500" value={editingDraft.question_count} onChange={e=>setEditingDraft(current=>({...current,question_count:e.target.value}))} required/></label>
        <label className={labelClass}>満点<input className={inputClass} type="number" min="1" max="1000" value={editingDraft.full_score} onChange={e=>setEditingDraft(current=>({...current,full_score:e.target.value}))} required/></label>
        <label className={labelClass}>重要度<select className={inputClass} value={editingDraft.priority} onChange={e=>setEditingDraft(current=>({...current,priority:e.target.value}))}><option value="normal">通常</option><option value="important">重要</option><option value="urgent">緊急</option></select></label>
        <label className={labelClass}>対象<input className={inputClass} value={editingDraft.target_class} onChange={e=>setEditingDraft(current=>({...current,target_class:e.target.value}))} maxLength={80} required/></label>
      </div>
      <label className={labelClass}>試験範囲<textarea className={inputClass} rows={4} value={editingDraft.scope} onChange={e=>setEditingDraft(current=>({...current,scope:e.target.value}))} maxLength={1200} required/></label>
      <label className={labelClass}>出題内容・形式<textarea className={inputClass} rows={3} value={editingDraft.notes} onChange={e=>setEditingDraft(current=>({...current,notes:e.target.value}))} maxLength={1200}/></label>
      <div className="flex justify-end gap-2"><button type="button" onClick={()=>setEditingId('')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300">キャンセル</button><button type="submit" disabled={busyId===row.id} className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">{busyId===row.id?'保存中…':'変更を保存'}</button></div>
    </form>}
  </article>;

  const pending = rows.filter(row => row.status === 'pending');
  const published = rows.filter(row => row.status === 'published');
  const other = rows.filter(row => row.status === 'rejected' || row.status === 'cancelled');

  return <div className="max-w-5xl space-y-6">
    <header>
      <h2 className="flex items-center gap-2 text-2xl font-black text-white"><CalendarDays className="text-cyan-400"/>小テスト管理</h2>
      <p className="mt-2 text-sm text-slate-400">実施日時・試験範囲・出題形式を登録し、生徒の「学習・テスト対策」に公開します。LINEからの登録提案は承認後に公開されます。</p>
    </header>
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5">
      <h3 className="text-base font-black text-white">新しい小テストを登録</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>教科<select className={inputClass} value={draft.subject} onChange={e=>setDraft(current=>({...current,subject:e.target.value}))} required><option value="">教科を選択</option>{SUBJECTS.map(subject=><option key={subject}>{subject}</option>)}</select></label>
        <label className={labelClass}>小テスト名<input className={inputClass} value={draft.title} onChange={e=>setDraft(current=>({...current,title:e.target.value}))} placeholder="例：漢字・現代文単語 小テスト" maxLength={160} required/></label>
        <label className={labelClass}>実施日<input className={inputClass} type="date" value={draft.test_date} onChange={e=>setDraft(current=>({...current,test_date:e.target.value}))} required/></label>
        <label className={labelClass}>時限<input className={inputClass} type="number" min="1" max="12" value={draft.period} onChange={e=>setDraft(current=>({...current,period:e.target.value}))} required/></label>
        <label className={labelClass}>開始タイミング<input className={inputClass} value={draft.start_note} onChange={e=>setDraft(current=>({...current,start_note:e.target.value}))} maxLength={120} required/></label>
        <label className={labelClass}>所要時間（分）<input className={inputClass} type="number" min="1" max="180" value={draft.duration_minutes} onChange={e=>setDraft(current=>({...current,duration_minutes:e.target.value}))} required/></label>
        <label className={labelClass}>問題数<input className={inputClass} type="number" min="1" max="500" value={draft.question_count} onChange={e=>setDraft(current=>({...current,question_count:e.target.value}))} required/></label>
        <label className={labelClass}>満点<input className={inputClass} type="number" min="1" max="1000" value={draft.full_score} onChange={e=>setDraft(current=>({...current,full_score:e.target.value}))} required/></label>
        <label className={labelClass}>重要度<select className={inputClass} value={draft.priority} onChange={e=>setDraft(current=>({...current,priority:e.target.value}))}><option value="normal">通常</option><option value="important">重要</option><option value="urgent">緊急</option></select></label>
        <label className={labelClass + ' sm:col-span-2'}>対象<input className={inputClass} value={draft.target_class} onChange={e=>setDraft(current=>({...current,target_class:e.target.value}))} placeholder="全生徒は all、クラス指定は 1-1 の形式" maxLength={80} required/></label>
      </div>
      <label className={labelClass}>試験範囲<textarea className={inputClass} rows={5} value={draft.scope} onChange={e=>setDraft(current=>({...current,scope:e.target.value}))} maxLength={1200} placeholder="教材名、ページ、単元など" required/></label>
      <label className={labelClass}>出題内容・形式<textarea className={inputClass} rows={4} value={draft.notes} onChange={e=>setDraft(current=>({...current,notes:e.target.value}))} maxLength={1200} placeholder="出題数、問題形式、配点内訳など"/></label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] leading-5 text-slate-500">Adminから登録した予定は、そのまま生徒画面へ公開されます。LINEから届いた提案は下の承認待ちに表示されます。</p>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Save size={15}/>{saving?'保存中…':'登録して公開'}</button>
      </div>
    </form>
    {message && <p role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs font-bold text-slate-200">{message}</p>}
    <section className="space-y-3 rounded-2xl border border-amber-900/50 bg-slate-950 p-5">
      <div className="flex items-center justify-between gap-2"><div><h3 className="font-black text-amber-200">LINEからの登録提案</h3><p className="mt-1 text-xs text-slate-400">「CSAI 小テスト登録」で送られた内容です。公開前に確認してください。</p></div><button type="button" onClick={()=>void load()} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300"><RefreshCw size={13} className="mr-1 inline"/>{loading?'更新中…':'更新'}</button></div>
      {pending.length ? pending.map(eventCard) : <p className="text-sm text-slate-500">{loading?'読み込み中…':'承認待ちの小テストはありません。'}</p>}
    </section>
    <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950 p-5">
      <h3 className="font-black text-white">公開中の小テスト</h3>
      {published.length ? published.map(eventCard) : <p className="text-sm text-slate-500">公開中の小テストはありません。</p>}
    </section>
    {other.length > 0 && <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950 p-5"><h3 className="font-black text-slate-300">却下・中止済み</h3>{other.map(eventCard)}</section>}
  </div>;
}
