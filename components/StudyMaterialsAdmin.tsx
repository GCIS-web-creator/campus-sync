'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, FileImage, UploadCloud, RefreshCw, Eye, Download, Trash2, Globe, Users, GraduationCap, Search, X, CheckCircle2 } from 'lucide-react';

type StudyMaterial = {
  id: string;
  title: string;
  description: string;
  subject: string;
  material_type: string;
  target_scope: 'all' | 'grade' | 'class';
  target_value: string | null;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
};

const SUBJECTS = ['国語演習', '古典探求', '物理', '生物', '数３', '数C', '公共', '英コミュ', '論表', '情報', '保健', 'その他'];
const MATERIAL_TYPES: Array<{ value: string; label: string }> = [
  { value: 'lesson', label: '授業プリント' },
  { value: 'assignment', label: '課題・宿題' },
  { value: 'answer', label: '解答' },
  { value: 'explanation', label: '解説' },
  { value: 'past_exam', label: '過去問・考査資料' },
  { value: 'other', label: 'その他' },
];
const SCHOOL_CLASSES = Array.from({ length: 3 }, (_, grade) =>
  Array.from({ length: 8 }, (_, index) => (grade + 1) + '-' + (index + 1)),
).flat();

function typeLabel(value: string) {
  return MATERIAL_TYPES.find(item => item.value === value)?.label || 'その他';
}
function targetLabel(item: StudyMaterial) {
  if (item.target_scope === 'all') return '全校';
  if (item.target_scope === 'grade') return (item.target_value || '') + '年';
  return item.target_value || 'クラス未設定';
}
function fileSizeLabel(bytes: number) {
  return bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

export default function StudyMaterialsAdmin() {
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('数３');
  const [materialType, setMaterialType] = useState('lesson');
  const [targetScope, setTargetScope] = useState<'all' | 'grade' | 'class'>('all');
  const [targetValue, setTargetValue] = useState('1');
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ item: StudyMaterial; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadMaterials = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/materials', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || '資料一覧を取得できませんでした。');
      setMaterials((result.materials || []) as StudyMaterial[]);
      setMessage('');
    } catch (error) {
      setMaterials([]);
      setMessage(error instanceof Error ? error.message : '資料一覧を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadMaterials(); }, []);

  const handleFileChange = (nextFile: File | null) => {
    setFile(nextFile);
    if (!nextFile) return;
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(nextFile.type) || nextFile.size < 1 || nextFile.size > 20 * 1024 * 1024) {
      setFile(null);
      setMessage('ファイルはPDF・PNG・JPG形式、20MB以下のものを選んでください。');
      return;
    }
    setMessage('');
    if (!title.trim()) setTitle(nextFile.name.replace(/\.[^.]+$/, ''));
  };

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setMessage('登録するPDFまたは画像を選択してください。');
      return;
    }
    if (!title.trim()) {
      setMessage('資料名を入力してください。');
      return;
    }
    setSaving(true);
    setMessage('アップロードの準備中...');
    try {
      const signedResponse = await fetch('/api/admin/materials/upload-url', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size }),
        cache: 'no-store',
      });
      const signedResult = await signedResponse.json().catch(() => null);
      if (!signedResponse.ok || !signedResult?.success || !signedResult.path || !signedResult.token) {
        throw new Error(signedResult?.message || 'アップロードURLを取得できませんでした。');
      }

      setMessage('ファイルをアップロードしています...');
      const { error: uploadError } = await supabase.storage
        .from('study-materials')
        .uploadToSignedUrl(signedResult.path, signedResult.token, file, { contentType: file.type });
      if (uploadError) throw new Error('ファイルのアップロードに失敗しました: ' + uploadError.message);

      setMessage('資料情報を保存しています...');
      const response = await fetch('/api/admin/materials', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          subject,
          material_type: materialType,
          target_scope: targetScope,
          target_value: targetScope === 'all' ? null : targetValue,
          storage_path: signedResult.path,
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
          is_published: publishImmediately,
        }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || '資料情報を保存できませんでした。');

      setTitle('');
      setDescription('');
      setFile(null);
      setPublishImmediately(true);
      const input = document.getElementById('study-material-file') as HTMLInputElement | null;
      if (input) input.value = '';
      setMessage(publishImmediately ? '資料をアップロードして公開しました。' : '資料を下書きとして保存しました。');
      await loadMaterials();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '資料を登録できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (item: StudyMaterial) => {
    setMessage('');
    try {
      const response = await fetch('/api/admin/materials', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, is_published: !item.is_published }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || '公開状態を変更できませんでした。');
      await loadMaterials();
      setMessage(!item.is_published ? '資料を公開しました。' : '資料を下書きに戻しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '公開状態を変更できませんでした。');
    }
  };

  const deleteMaterial = async (item: StudyMaterial) => {
    if (!window.confirm('「' + item.title + '」と保存ファイルを削除します。この操作は取り消せません。')) return;
    setMessage('');
    try {
      const response = await fetch('/api/admin/materials', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || '資料を削除できませんでした。');
      await loadMaterials();
      setMessage('資料とファイルを削除しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '資料を削除できませんでした。');
    }
  };

  const openPreview = async (item: StudyMaterial, download = false) => {
    setPreviewLoading(true);
    try {
      const response = await fetch('/api/admin/materials/file?id=' + encodeURIComponent(item.id) + (download ? '&download=1' : ''), {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success || !result.url) throw new Error(result?.message || 'ファイルを開けませんでした。');
      if (download) {
        window.open(result.url, '_blank', 'noopener,noreferrer');
      } else {
        setPreview({ item, url: result.url });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ファイルを開けませんでした。');
    } finally {
      setPreviewLoading(false);
    }
  };

  const visibleMaterials = materials.filter(item => {
    const matchesSubject = filterSubject === 'all' || item.subject === filterSubject;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [item.title, item.description, item.file_name].some(value => value.toLowerCase().includes(term));
    return matchesSubject && matchesSearch;
  });

  return (
    <div className="max-w-6xl space-y-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black"><FileText className="text-cyan-400" /> プリント・資料管理</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">授業プリント・課題・解答・過去問を一元管理します。ファイルは非公開ストレージに保存し、対象の生徒だけが閲覧できます。</p>
        </div>
        <button type="button" onClick={() => void loadMaterials()} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"><RefreshCw size={14} /> 更新</button>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 sm:p-6">
        <div className="mb-4">
          <h3 className="text-base font-black text-white">新しい資料を登録</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">PDF・PNG・JPG形式、1ファイル20MBまで。公開対象を指定してから登録してください。</p>
        </div>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs font-bold text-slate-300">資料名
              <input value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} placeholder="例：数III 微分演習プリント" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500" />
            </label>
            <label className="block text-xs font-bold text-slate-300">教科
              <select value={subject} onChange={event => setSubject(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500">
                {SUBJECTS.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-300">資料の種類
              <select value={materialType} onChange={event => setMaterialType(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500">
                {MATERIAL_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-300">公開対象
              <select value={targetScope} onChange={event => { const value = event.target.value as 'all' | 'grade' | 'class'; setTargetScope(value); setTargetValue(value === 'class' ? '1-1' : '1'); }} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500">
                <option value="all">全校</option>
                <option value="grade">学年を指定</option>
                <option value="class">クラスを指定</option>
              </select>
            </label>
            {targetScope !== 'all' && (
              <label className="block text-xs font-bold text-slate-300">対象
                <select value={targetValue} onChange={event => setTargetValue(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500">
                  {targetScope === 'grade'
                    ? ['1', '2', '3'].map(value => <option key={value} value={value}>{value}年</option>)
                    : SCHOOL_CLASSES.map(value => <option key={value} value={value}>{value}組</option>)}
                </select>
              </label>
            )}
            <label className="block text-xs font-bold text-slate-300 md:col-span-2">説明・補足（任意）
              <textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={3} placeholder="どの授業で使うか、解く範囲、注意事項など" className="mt-1 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500" />
            </label>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/70 px-4 py-6 text-center hover:border-cyan-500">
            <UploadCloud size={26} className="text-cyan-400" />
            <span className="mt-2 text-sm font-black text-white">{file ? file.name : 'PDF・PNG・JPGを選択'}</span>
            <span className="mt-1 text-[11px] text-slate-500">{file ? fileSizeLabel(file.size) : 'ファイルを選択またはドロップしてください（20MB以下）'}</span>
            <input id="study-material-file" type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" onChange={event => handleFileChange(event.target.files?.[0] || null)} className="sr-only" />
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={publishImmediately} onChange={event => setPublishImmediately(event.target.checked)} className="h-4 w-4 accent-cyan-500" />
            登録後すぐに公開する
          </label>
          <button type="submit" disabled={saving || !file} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            <UploadCloud size={16} /> {saving ? '登録処理中...' : publishImmediately ? 'アップロードして公開' : '下書きとして登録'}
          </button>
          {message && <p role="status" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-xs leading-5 text-cyan-200">{message}</p>}
        </form>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white">登録済み資料 <span className="ml-1 text-xs text-slate-500">{materials.length}件</span></h3>
            <p className="mt-1 text-xs text-slate-500">公開状態の切替・プレビュー・削除ができます。</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 sm:flex-none">
              <Search size={14} className="text-slate-500" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="資料名を検索" className="min-w-0 bg-transparent text-xs text-white outline-none placeholder:text-slate-500" />
            </label>
            <select value={filterSubject} onChange={event => setFilterSubject(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white">
              <option value="all">すべての教科</option>
              {SUBJECTS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </div>

        {loading ? <p className="py-8 text-center text-xs text-slate-500">資料を読み込み中...</p>
          : visibleMaterials.length === 0 ? <p className="rounded-xl border border-dashed border-slate-800 py-10 text-center text-xs text-slate-500">登録済みの資料はありません。</p>
          : <div className="grid gap-3 xl:grid-cols-2">
            {visibleMaterials.map(item => (
              <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-cyan-300">
                    {item.mime_type === 'application/pdf' ? <FileText size={22} /> : <FileImage size={22} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="break-words text-sm font-black text-white">{item.title}</h4>
                      <span className={'rounded-full px-2 py-0.5 text-[10px] font-bold ' + (item.is_published ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300')}>{item.is_published ? '公開中' : '下書き'}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{item.subject} ・ {typeLabel(item.material_type)} ・ {targetLabel(item)}</p>
                    <p className="mt-1 break-all text-[10px] text-slate-500">{item.file_name} ・ {fileSizeLabel(item.file_size)}</p>
                    {item.description && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-400">{item.description}</p>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                  <button type="button" disabled={previewLoading} onClick={() => void openPreview(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-[11px] font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50"><Eye size={13} /> プレビュー</button>
                  <button type="button" onClick={() => void openPreview(item, true)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-[11px] font-bold text-slate-200 hover:bg-slate-700"><Download size={13} /> ダウンロード</button>
                  <button type="button" onClick={() => void togglePublish(item)} className={'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold ' + (item.is_published ? 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20')}>{item.is_published ? '非公開にする' : '公開する'}</button>
                  <button type="button" onClick={() => void deleteMaterial(item)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-300 hover:bg-rose-500/20"><Trash2 size={13} /> 削除</button>
                </div>
              </article>
            ))}
          </div>}
      </section>

      {preview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="資料プレビュー">
          <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div className="min-w-0"><p className="truncate text-sm font-black text-white">{preview.item.title}</p><p className="text-[10px] text-slate-500">{preview.item.file_name}</p></div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => void openPreview(preview.item, true)} className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200"><Download size={13}/> 保存</button>
                <button type="button" onClick={() => setPreview(null)} aria-label="閉じる" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X size={18}/></button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-slate-900 p-2">
              {preview.item.mime_type === 'application/pdf'
                ? <iframe title={preview.item.title} src={preview.url} className="h-full w-full rounded-lg bg-white" />
                : <div className="flex h-full items-center justify-center overflow-auto"><img src={preview.url} alt={preview.item.title} className="max-h-full max-w-full object-contain" /></div>}
            </div>
          </div>
        </div>
      )}
      <div className="sr-only"><Globe /><Users /><GraduationCap /><CheckCircle2 /></div>
    </div>
  );
}
