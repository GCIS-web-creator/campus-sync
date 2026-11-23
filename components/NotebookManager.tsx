'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BookMarked, Camera, CheckCircle2, ClipboardList,
  Edit3, History, MapPin, Plus, Search, Trash2, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { compressImageFile } from '@/lib/compress-image-file';
import {
  findNotebookDuplicates,
  getNotebookRemainingPages,
  getNotebookRemainingPercent,
  getNotebookStatusLabel,
  NOTEBOOK_SUBJECT_OPTIONS,
  NOTEBOOK_SIZE_OPTIONS,
  NOTEBOOK_STATUS_OPTIONS,
  NOTEBOOK_PURPOSE_OPTIONS,
  type NotebookPurpose,
  type NotebookStatus,
} from '@/lib/notebook-manager';

type NotebookRow = {
  id: string; user_id: string; name: string; subjects: string[];
  purpose: string; custom_purpose: string | null; notebook_size: string;
  total_pages: number; used_pages: number; status: NotebookStatus;
  storage_location: string | null; cover_image_path: string | null;
  started_at: string | null; last_used_at: string | null; notes: string | null;
  created_at: string; updated_at: string; cover_url?: string | null;
};
type UsageLog = {
  id: string; notebook_id: string; used_on: string; page_start: number;
  page_end: number; subject: string | null; content: string | null; created_at: string;
};
type NotebookForm = {
  name: string; subjects: string[]; purpose: NotebookPurpose; custom_purpose: string;
  notebook_size: string; total_pages: string; used_pages: string; status: NotebookStatus;
  storage_location: string; started_at: string; notes: string; cover_image_path: string | null;
};
const createEmptyForm = (preferredSubject = ''): NotebookForm => ({
  name: '', subjects: preferredSubject ? [preferredSubject] : [], purpose: '課題',
  custom_purpose: '', notebook_size: 'B5', total_pages: '60', used_pages: '0',
  status: 'unused', storage_location: '', started_at: '', notes: '', cover_image_path: null,
});

export default function NotebookManager({ userId, isDarkMode = false }: { userId: string; isDarkMode?: boolean }) {
  const [notebooks, setNotebooks] = useState<NotebookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NotebookForm>(() => createEmptyForm());
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [preferredScienceSubject, setPreferredScienceSubject] = useState('');
  const [recordingNotebook, setRecordingNotebook] = useState<NotebookRow | null>(null);
  const [recordStart, setRecordStart] = useState('1');
  const [recordEnd, setRecordEnd] = useState('1');
  const [recordSubject, setRecordSubject] = useState('');
  const [recordContent, setRecordContent] = useState('');
  const [recording, setRecording] = useState(false);
  const [historyNotebookId, setHistoryNotebookId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<UsageLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NotebookRow | null>(null);

  const dark = isDarkMode;
  const panel = dark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const input = 'w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 ' +
    (dark ? 'border-slate-700 bg-slate-950 text-white placeholder:text-slate-600' : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400');
  const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-xs font-black text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50';
  const secondary = 'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ' +
    (dark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase.from('student_notebooks')
      .select('*').eq('user_id', userId).order('updated_at', { ascending: false });
    if (queryError) {
      setError('ノート一覧を読み込めませんでした。' + queryError.message);
      setNotebooks([]);
      setLoading(false);
      return;
    }
    const rows = (data || []) as NotebookRow[];
    const enriched = await Promise.all(rows.map(async notebook => {
      if (!notebook.cover_image_path) return { ...notebook, cover_url: null };
      const { data: signed, error: signedError } = await supabase.storage
        .from('student-notebook-covers').createSignedUrl(notebook.cover_image_path, 3600);
      return { ...notebook, cover_url: signedError ? null : signed?.signedUrl || null };
    }));
    setNotebooks(enriched);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let active = true;
    void supabase.from('student_learning_preferences').select('science_track')
      .eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (data?.science_track === 'physics') setPreferredScienceSubject('物理');
        if (data?.science_track === 'biology') setPreferredScienceSubject('生物');
      });
    return () => { active = false; };
  }, [userId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return notebooks.filter(notebook => {
      const matchesQuery = !normalized || [
        notebook.name, notebook.purpose, notebook.custom_purpose || '',
        notebook.subjects.join(' '), notebook.storage_location || '', notebook.notes || '',
      ].join(' ').toLocaleLowerCase().includes(normalized);
      return matchesQuery && (subjectFilter === 'all' || notebook.subjects.includes(subjectFilter))
        && (statusFilter === 'all' || notebook.status === statusFilter);
    });
  }, [notebooks, query, subjectFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: notebooks.length,
    unused: notebooks.filter(item => item.status === 'unused').length,
    inUse: notebooks.filter(item => item.status === 'in_use').length,
    low: notebooks.filter(item => item.status !== 'finished'
      && getNotebookRemainingPercent(item.total_pages, item.used_pages) <= 10
      && getNotebookRemainingPages(item.total_pages, item.used_pages) > 0).length,
    remaining: notebooks.reduce((sum, item) => sum + getNotebookRemainingPages(item.total_pages, item.used_pages), 0),
  }), [notebooks]);

  const duplicateNotebooks = useMemo(() => findNotebookDuplicates(
    notebooks,
    form.subjects,
    form.purpose === 'その他' ? form.custom_purpose.trim() || form.purpose : form.purpose,
    editingId,
  ), [notebooks, form.subjects, form.purpose, form.custom_purpose, editingId]);

  const openNew = () => {
    setEditingId(null);
    setForm(createEmptyForm(preferredScienceSubject));
    setCoverFile(null);
    setCoverPreview('');
    setError('');
    setMessage('');
    setShowEditor(true);
  };

  const openEdit = (notebook: NotebookRow) => {
    setEditingId(notebook.id);
    setForm({
      name: notebook.name,
      subjects: notebook.subjects || [],
      purpose: (NOTEBOOK_PURPOSE_OPTIONS.includes(notebook.purpose as NotebookPurpose) ? notebook.purpose : 'その他') as NotebookPurpose,
      custom_purpose: notebook.custom_purpose || (NOTEBOOK_PURPOSE_OPTIONS.includes(notebook.purpose as NotebookPurpose) ? '' : notebook.purpose),
      notebook_size: notebook.notebook_size,
      total_pages: String(notebook.total_pages),
      used_pages: String(notebook.used_pages),
      status: notebook.status,
      storage_location: notebook.storage_location || '',
      started_at: notebook.started_at || '',
      notes: notebook.notes || '',
      cover_image_path: notebook.cover_image_path,
    });
    setCoverFile(null);
    setCoverPreview(notebook.cover_url || '');
    setError('');
    setMessage('');
    setShowEditor(true);
  };

  const chooseCover = async (file: File | null) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('表紙写真はJPG・PNG・WebP画像を選択してください。');
      return;
    }
    const compressed = await compressImageFile(file, 1600, 0.8);
    if (compressed.size > 5 * 1024 * 1024) {
      setError('圧縮後の画像は5MB以下にしてください。');
      return;
    }
    setCoverFile(compressed);
    setCoverPreview(URL.createObjectURL(compressed));
    setError('');
  };

  const saveNotebook = async () => {
    const name = form.name.trim();
    const totalPages = Number(form.total_pages);
    const usedPages = Number(form.used_pages);
    if (!name) { setError('ノート名を入力してください。'); return; }
    if (!form.subjects.length) { setError('教科を1つ以上選択してください。'); return; }
    if (!Number.isInteger(totalPages) || totalPages < 1 || totalPages > 2000) { setError('総ページ数は1〜2000の整数で入力してください。'); return; }
    if (!Number.isInteger(usedPages) || usedPages < 0 || usedPages > totalPages) { setError('使用済みページは0〜総ページ数の範囲で入力してください。'); return; }
    if (form.purpose === 'その他' && !form.custom_purpose.trim()) { setError('その他の用途を入力してください。'); return; }

    setSaving(true);
    setError('');
    let uploadedPath: string | null = null;
    const previous = notebooks.find(item => item.id === editingId);
    try {
      let coverPath = form.cover_image_path;
      if (coverFile) {
        const extension = coverFile.type === 'image/webp' ? 'webp' : coverFile.type === 'image/png' ? 'png' : 'jpg';
        uploadedPath = userId + '/' + crypto.randomUUID() + '.' + extension;
        const { error: uploadError } = await supabase.storage.from('student-notebook-covers')
          .upload(uploadedPath, coverFile, { contentType: coverFile.type, upsert: false });
        if (uploadError) throw uploadError;
        coverPath = uploadedPath;
      }
      const purpose = form.purpose === 'その他' ? form.custom_purpose.trim() : form.purpose;
      const payload = {
        user_id: userId, name, subjects: form.subjects, purpose,
        custom_purpose: form.purpose === 'その他' ? form.custom_purpose.trim() : null,
        notebook_size: form.notebook_size, total_pages: totalPages, used_pages: usedPages,
        status: usedPages >= totalPages ? 'finished' : form.status,
        storage_location: form.storage_location.trim() || null,
        cover_image_path: coverPath, started_at: form.started_at || null,
        notes: form.notes.trim() || null, updated_at: new Date().toISOString(),
      };
      const result = editingId
        ? await supabase.from('student_notebooks').update(payload).eq('id', editingId).eq('user_id', userId).select('*').single()
        : await supabase.from('student_notebooks').insert(payload).select('*').single();
      if (result.error) throw result.error;
      if (previous?.cover_image_path && previous.cover_image_path !== coverPath) {
        await supabase.storage.from('student-notebook-covers').remove([previous.cover_image_path]);
      }
      setMessage(editingId ? 'ノート情報を更新しました。' : 'ノートを登録しました。');
      setShowEditor(false);
      setCoverFile(null);
      setCoverPreview('');
      await refresh();
    } catch (caught) {
      if (uploadedPath) await supabase.storage.from('student-notebook-covers').remove([uploadedPath]);
      setError(caught instanceof Error ? caught.message : 'ノートを保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const target = deleteTarget;
    const { error: deleteError } = await supabase.from('student_notebooks').delete()
      .eq('id', target.id).eq('user_id', userId);
    if (deleteError) {
      setError('ノートを削除できませんでした。' + deleteError.message);
    } else {
      if (target.cover_image_path) {
        const { error: storageError } = await supabase.storage.from('student-notebook-covers').remove([target.cover_image_path]);
        if (storageError) console.warn('ノート写真の削除に失敗しました。', storageError);
      }
      setMessage('「' + target.name + '」を削除しました。');
      setDeleteTarget(null);
      await refresh();
    }
    setSaving(false);
  };

  const startUsageRecord = (notebook: NotebookRow) => {
    const nextPage = Math.min(notebook.total_pages, Math.max(1, notebook.used_pages + 1));
    setRecordingNotebook(notebook);
    setRecordStart(String(nextPage));
    setRecordEnd(String(nextPage));
    setRecordSubject(notebook.subjects[0] || '');
    setRecordContent('');
    setError('');
  };

  const saveUsageRecord = async () => {
    if (!recordingNotebook) return;
    const start = Number(recordStart), end = Number(recordEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > recordingNotebook.total_pages) {
      setError('ページ範囲を確認してください。');
      return;
    }
    setRecording(true);
    const { error: logError } = await supabase.rpc('record_student_notebook_usage', {
      p_notebook_id: recordingNotebook.id, p_page_start: start, p_page_end: end,
      p_subject: recordSubject || null, p_content: recordContent.trim() || null,
    });
    if (logError) {
      setError('使用履歴を保存できませんでした。' + logError.message);
    } else {
      setMessage('ページ使用履歴を記録しました。');
      setRecordingNotebook(null);
      await refresh();
      if (historyNotebookId === recordingNotebook.id) await loadHistory(recordingNotebook.id);
    }
    setRecording(false);
  };

  async function loadHistory(notebookId: string) {
    setHistoryLoading(true);
    setHistoryNotebookId(notebookId);
    const { data, error: historyError } = await supabase.from('student_notebook_usage_logs')
      .select('*').eq('notebook_id', notebookId).eq('user_id', userId)
      .order('used_on', { ascending: false }).order('created_at', { ascending: false }).limit(50);
    if (historyError) {
      setError('使用履歴を読み込めませんでした。' + historyError.message);
      setHistoryItems([]);
    } else setHistoryItems((data || []) as UsageLog[]);
    setHistoryLoading(false);
  }

  const closeEditor = () => {
    setShowEditor(false);
    setCoverFile(null);
    setCoverPreview('');
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-600">CampusSync / Notebook Manager</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl"><BookMarked className="h-7 w-7 text-cyan-600"/>ノート管理</h1>
          <p className={'mt-2 max-w-2xl text-xs leading-5 '+muted}>持っているノート・残りページ・使った教科や用途をひとまとめに管理します。新しいノートを使う前に、同じ用途のノートが残っていないか確認できます。</p>
        </div>
        <button type="button" onClick={openNew} className={primary}><Plus size={16}/>ノートを登録</button>
      </header>

      {message && <div className={'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold '+(dark?'border-emerald-900 bg-emerald-950/40 text-emerald-300':'border-emerald-200 bg-emerald-50 text-emerald-800')}><CheckCircle2 size={16}/>{message}<button type="button" className="ml-auto" onClick={()=>setMessage('')} aria-label="メッセージを閉じる"><X size={14}/></button></div>}
      {error && <div className={'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold '+(dark?'border-rose-900 bg-rose-950/40 text-rose-300':'border-rose-200 bg-rose-50 text-rose-800')}><AlertTriangle size={16} className="shrink-0"/><span>{error}</span><button type="button" className="ml-auto" onClick={()=>setError('')} aria-label="エラーを閉じる"><X size={14}/></button></div>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {label:'所持ノート',value:stats.total,hint:'登録済み',color:'text-cyan-600'},
          {label:'未使用',value:stats.unused,hint:'まだ使っていない',color:'text-emerald-600'},
          {label:'使用中',value:stats.inUse,hint:'現在使っている',color:'text-blue-600'},
          {label:'残り10%以下',value:stats.low,hint:'そろそろ交換',color:'text-amber-600'},
        ].map(item=><div key={item.label} className={'rounded-2xl border p-3 sm:p-4 '+panel}><p className={'text-[10px] font-bold '+muted}>{item.label}</p><p className={'mt-1 text-2xl font-black tabular-nums '+item.color}>{item.value}<span className="ml-1 text-xs font-bold">冊</span></p><p className={'mt-1 text-[9px] '+muted}>{item.hint}</p></div>)}
      </div>

      <div className={'flex flex-wrap items-center gap-2 rounded-2xl border p-3 '+panel}>
        <div className="relative min-w-[180px] flex-1"><Search size={15} className={'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 '+muted}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="ノート名・教科・用途・保管場所で検索" className={input+' pl-9'}/></div>
        <select className={input+' w-full sm:w-40'} value={subjectFilter} onChange={event=>setSubjectFilter(event.target.value)}><option value="all">すべての教科</option>{NOTEBOOK_SUBJECT_OPTIONS.map(subject=><option key={subject} value={subject}>{subject}</option>)}</select>
        <select className={input+' w-full sm:w-40'} value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="all">すべての状態</option>{NOTEBOOK_STATUS_OPTIONS.map(status=><option key={status.value} value={status.value}>{status.label}</option>)}</select>
      </div>

      {showEditor && <section className={'space-y-4 rounded-2xl border p-4 sm:p-5 '+panel}>
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-black">{editingId?'ノート情報を編集':'新しいノートを登録'}</h2><p className={'mt-1 text-[10px] '+muted}>あとから教科・用途・残りページを変更できます。</p></div><button type="button" className={secondary} onClick={closeEditor}><X size={15}/>閉じる</button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-bold sm:col-span-2">ノート名<input className={input} value={form.name} onChange={event=>setForm(current=>({...current,name:event.target.value}))} maxLength={120} placeholder="例：物理・課題ノート①"/></label>
          <div className="space-y-2 sm:col-span-2"><p className="text-xs font-bold">使用する教科（複数選択可）</p><div className="flex flex-wrap gap-2">{NOTEBOOK_SUBJECT_OPTIONS.map(subject=>{const checked=form.subjects.includes(subject);return <label key={subject} className={'cursor-pointer rounded-full border px-3 py-2 text-[11px] font-bold transition '+(checked?'border-cyan-600 bg-cyan-600 text-white':dark?'border-slate-700 bg-slate-950 text-slate-300':'border-slate-200 bg-white text-slate-600')}><input type="checkbox" className="sr-only" checked={checked} onChange={event=>setForm(current=>({...current,subjects:event.target.checked?[...current.subjects,subject]:current.subjects.filter(item=>item!==subject)}))}/>{subject}</label>;})}</div></div>
          <label className="space-y-1 text-xs font-bold">用途<select className={input} value={form.purpose} onChange={event=>setForm(current=>({...current,purpose:event.target.value as NotebookPurpose}))}>{NOTEBOOK_PURPOSE_OPTIONS.map(purpose=><option key={purpose} value={purpose}>{purpose}</option>)}</select></label>
          {form.purpose==='その他' && <label className="space-y-1 text-xs font-bold">用途の詳細<input className={input} value={form.custom_purpose} onChange={event=>setForm(current=>({...current,custom_purpose:event.target.value}))} placeholder="例：提出用レポート"/></label>}
          <label className="space-y-1 text-xs font-bold">サイズ<select className={input} value={form.notebook_size} onChange={event=>setForm(current=>({...current,notebook_size:event.target.value}))}>{NOTEBOOK_SIZE_OPTIONS.map(size=><option key={size}>{size}</option>)}</select></label>
          <label className="space-y-1 text-xs font-bold">総ページ数<input className={input} type="number" min={1} max={2000} value={form.total_pages} onChange={event=>setForm(current=>({...current,total_pages:event.target.value}))}/></label>
          <label className="space-y-1 text-xs font-bold">使用済みページ<input className={input} type="number" min={0} max={2000} value={form.used_pages} onChange={event=>setForm(current=>({...current,used_pages:event.target.value}))}/></label>
          <label className="space-y-1 text-xs font-bold">状態<select className={input} value={form.status} onChange={event=>setForm(current=>({...current,status:event.target.value as NotebookStatus}))}>{NOTEBOOK_STATUS_OPTIONS.map(status=><option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          <label className="space-y-1 text-xs font-bold">保管場所（任意）<input className={input} value={form.storage_location} onChange={event=>setForm(current=>({...current,storage_location:event.target.value}))} placeholder="例：自宅の机・学校ロッカー"/></label>
          <label className="space-y-1 text-xs font-bold">使い始めた日（任意）<input className={input} type="date" value={form.started_at} onChange={event=>setForm(current=>({...current,started_at:event.target.value}))}/></label>
          <div className="space-y-2 sm:col-span-2">
            <label className="block text-xs font-bold">表紙写真（任意）</label>
            <div className="flex flex-wrap items-center gap-3">
              {coverPreview?<img src={coverPreview} alt="ノート表紙プレビュー" className="h-28 w-20 rounded-xl border border-slate-300 bg-white object-cover"/>:<div className={'flex h-28 w-20 flex-col items-center justify-center rounded-xl border border-dashed '+(dark?'border-slate-700 bg-slate-950':'border-slate-300 bg-slate-50')}><Camera size={22} className={muted}/><span className={'mt-1 text-[9px] '+muted}>写真なし</span></div>}
              <div className="flex flex-col gap-2"><label className={secondary+' cursor-pointer'}><Camera size={14}/>写真を撮影・選択<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={event=>void chooseCover(event.target.files?.[0]||null)}/></label>{coverPreview&&<button type="button" className={secondary} onClick={()=>{setCoverFile(null);setCoverPreview('');setForm(current=>({...current,cover_image_path:null}));}}><Trash2 size={14}/>写真を外す</button>}<p className={'max-w-md text-[10px] leading-5 '+muted}>写真はアップロード前にWebP圧縮し、あなた専用の非公開ストレージに保存します。</p></div>
            </div>
          </div>
          <label className="space-y-1 text-xs font-bold sm:col-span-2">メモ（任意）<textarea className={input+' min-h-20 resize-y'} value={form.notes} onChange={event=>setForm(current=>({...current,notes:event.target.value}))} maxLength={1000} placeholder="どの課題に使っているか、どこまで進んだかなど"/></label>
        </div>
        {duplicateNotebooks.length>0 && <div className={'rounded-xl border p-3 '+(dark?'border-amber-900 bg-amber-950/30':'border-amber-200 bg-amber-50')}>
          <div className="flex items-center gap-2 text-xs font-black text-amber-700"><AlertTriangle size={16}/>同じ教科・用途のノートがすでにあります</div>
          <p className={'mt-1 text-[10px] leading-5 '+(dark?'text-amber-200':'text-amber-900')}>新しいノートを登録する前に、次のノートの残りページを確認してみてください。新規登録を止めるものではありません。</p>
          <div className="mt-2 space-y-2">{duplicateNotebooks.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 p-2 text-xs dark:bg-slate-900/60"><span className="font-bold">{item.name}</span><span className="font-black text-emerald-700">残り{getNotebookRemainingPages(item.total_pages,item.used_pages)}ページ</span></div>)}</div>
        </div>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className={secondary} onClick={closeEditor}>キャンセル</button><button type="button" className={primary} onClick={()=>void saveNotebook()} disabled={saving}><CheckCircle2 size={15}/>{saving?'保存中…':editingId?'変更を保存':'ノートを登録'}</button></div>
      </section>}

      {loading?<div className={'rounded-2xl border p-8 text-center text-sm '+panel}>ノート一覧を読み込んでいます…</div>
      :notebooks.length===0?<div className={'rounded-2xl border border-dashed p-9 text-center '+panel}><BookMarked size={34} className="mx-auto text-cyan-600"/><h2 className="mt-3 font-black">まだノートが登録されていません</h2><p className={'mt-2 text-xs '+muted}>今持っているノートを登録しておくと、同じ用途のノートを重複して使い始めるのを防げます。</p><button type="button" className={primary+' mt-4'} onClick={openNew}><Plus size={15}/>最初のノートを登録</button></div>
      :filtered.length===0?<div className={'rounded-2xl border p-8 text-center text-xs '+panel}>条件に一致するノートがありません。</div>
      :<div className="grid gap-3 md:grid-cols-2">{filtered.map(notebook=>{
        const remaining=getNotebookRemainingPages(notebook.total_pages,notebook.used_pages);
        const percent=getNotebookRemainingPercent(notebook.total_pages,notebook.used_pages);
        return <article key={notebook.id} className={'overflow-hidden rounded-2xl border p-3 sm:p-4 '+panel}>
          <div className="flex gap-3">
            {notebook.cover_url?<img src={notebook.cover_url} alt={notebook.name+'の表紙'} className="h-28 w-20 shrink-0 rounded-xl border border-slate-200 bg-white object-cover"/>:<div className={'flex h-28 w-20 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed '+(dark?'border-slate-700 bg-slate-950':'border-slate-200 bg-slate-50')}><BookMarked size={24} className="text-cyan-600"/><span className={'mt-1 px-1 text-center text-[8px] '+muted}>NO COVER</span></div>}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-black">{notebook.name}</h3><span className={'shrink-0 rounded-full px-2 py-1 text-[9px] font-black '+(notebook.status==='unused'?'bg-emerald-100 text-emerald-800':notebook.status==='finished'?'bg-slate-200 text-slate-600':notebook.status==='stored'?'bg-violet-100 text-violet-800':'bg-cyan-100 text-cyan-800')}>{getNotebookStatusLabel(notebook.status)}</span></div>
              <p className={'mt-1 text-[10px] '+muted}>{notebook.subjects.join(' ・ ')} / {notebook.custom_purpose||notebook.purpose}</p>
              <p className={'mt-1 text-[10px] '+muted}>{notebook.notebook_size} ・ {notebook.total_pages}ページ</p>
              <div className="mt-3 flex items-end justify-between gap-2"><div><p className="text-xl font-black tabular-nums">{remaining}<span className={'ml-1 text-[10px] '+muted}>ページ残り</span></p><p className={'text-[9px] '+muted}>使用済み {notebook.used_pages}/{notebook.total_pages}ページ</p></div><span className={'text-sm font-black tabular-nums '+(percent<=10?'text-amber-600':'text-cyan-600')}>{percent}%</span></div>
              <div className={'mt-2 h-2 overflow-hidden rounded-full '+(dark?'bg-slate-800':'bg-slate-100')}><div className={'h-full rounded-full '+(percent<=10?'bg-amber-500':'bg-cyan-600')} style={{width:percent+'%'}}/></div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">{notebook.storage_location&&<span className={'inline-flex items-center gap-1 text-[10px] '+muted}><MapPin size={11}/>{notebook.storage_location}</span>}<span className={'ml-auto text-[9px] '+muted}>{notebook.last_used_at?'最終使用 '+notebook.last_used_at:'使用履歴なし'}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" className={secondary} disabled={notebook.status==='finished'} onClick={()=>startUsageRecord(notebook)}><ClipboardList size={13}/>ページ記録</button>
            <button type="button" className={secondary} onClick={()=>historyNotebookId===notebook.id?setHistoryNotebookId(null):void loadHistory(notebook.id)}><History size={13}/>使用履歴</button>
            <button type="button" className={secondary} onClick={()=>openEdit(notebook)}><Edit3 size={13}/>編集</button>
            <button type="button" className={secondary} onClick={()=>setDeleteTarget(notebook)}><Trash2 size={13}/>削除</button>
          </div>
          {recordingNotebook?.id===notebook.id&&<div className={'mt-3 space-y-3 rounded-xl border p-3 '+(dark?'border-slate-700 bg-slate-950':'border-slate-200 bg-slate-50')}>
            <div className="flex items-center justify-between"><p className="text-xs font-black">ページ使用を記録</p><button type="button" onClick={()=>setRecordingNotebook(null)} aria-label="閉じる"><X size={14}/></button></div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[10px] font-bold">開始ページ<input type="number" min={1} max={notebook.total_pages} className={input} value={recordStart} onChange={event=>setRecordStart(event.target.value)}/></label>
              <label className="space-y-1 text-[10px] font-bold">終了ページ<input type="number" min={1} max={notebook.total_pages} className={input} value={recordEnd} onChange={event=>setRecordEnd(event.target.value)}/></label>
              <label className="space-y-1 text-[10px] font-bold col-span-2">教科<select className={input} value={recordSubject} onChange={event=>setRecordSubject(event.target.value)}><option value="">指定なし</option>{notebook.subjects.map(subject=><option key={subject}>{subject}</option>)}</select></label>
              <label className="space-y-1 text-[10px] font-bold col-span-2">勉強内容<input className={input} value={recordContent} onChange={event=>setRecordContent(event.target.value)} maxLength={300} placeholder="例：力学の課題・問1〜5"/></label>
            </div>
            <p className={'text-[9px] '+muted}>記録すると使用済みページと残りページが自動更新されます。</p>
            <button type="button" className={primary+' w-full'} disabled={recording} onClick={()=>void saveUsageRecord()}>{recording?'記録中…':'使用履歴を保存'}</button>
          </div>}
          {historyNotebookId===notebook.id&&<div className={'mt-3 rounded-xl border p-3 '+(dark?'border-slate-700 bg-slate-950':'border-slate-200 bg-slate-50')}>
            <div className="flex items-center justify-between"><p className="text-xs font-black">使用履歴</p><button type="button" onClick={()=>setHistoryNotebookId(null)} aria-label="閉じる"><X size={14}/></button></div>
            {historyLoading?<p className={'mt-2 text-xs '+muted}>読み込み中…</p>:historyItems.length===0?<p className={'mt-2 text-xs '+muted}>まだ使用履歴はありません。</p>:<div className="mt-2 space-y-2">{historyItems.map(log=><div key={log.id} className="rounded-lg border border-slate-200/70 p-2 text-xs dark:border-slate-700"><div className="flex justify-between gap-2"><span className="font-black">{log.used_on}</span><span className="font-black text-cyan-600">P.{log.page_start}–{log.page_end}</span></div><p className={'mt-1 text-[10px] '+muted}>{[log.subject,log.content].filter(Boolean).join(' ・ ')||'内容の記録なし'}</p></div>)}</div>}
          </div>}
        </article>;
      })}</div>}

      <div className={'rounded-2xl border p-3 text-[10px] leading-5 '+panel}><p className="font-black">ノートの管理について</p><p className={'mt-1 '+muted}>「未使用」「使用中」「保管中」「使用終了」を使い分けられます。教科と用途が一致し、未終了でページが残っているノートは、新しいノートの登録時に候補として表示されます。登録自体を禁止することはありません。</p><p className={'mt-1 '+muted}>残りページ合計：{stats.remaining.toLocaleString('ja-JP')}ページ</p></div>

      {deleteTarget&&<div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/60 p-4"><div className={'w-full max-w-sm rounded-2xl border p-4 shadow-2xl '+panel}><h2 className="font-black">ノートを削除しますか？</h2><p className={'mt-2 text-xs leading-5 '+muted}>「{deleteTarget.name}」と、その使用履歴を削除します。この操作は取り消せません。</p><div className="mt-4 flex justify-end gap-2"><button className={secondary} type="button" onClick={()=>setDeleteTarget(null)}>キャンセル</button><button className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50" type="button" disabled={saving} onClick={()=>void confirmDelete()}>{saving?'削除中…':'削除する'}</button></div></div></div>}
    </div>
  );
}
