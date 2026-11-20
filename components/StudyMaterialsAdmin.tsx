'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, FileImage, UploadCloud, RefreshCw, Eye, Download, Trash2, Globe, Users, GraduationCap, Search, X, CheckCircle2, Folder, FolderOpen, ChevronRight, FolderPlus, Pencil, ArrowUp } from 'lucide-react';

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
  folder_id: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
};

type MaterialFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
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
  const [folders, setFolders] = useState<MaterialFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
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
      setFolders((result.folders || []) as MaterialFolder[]);
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
          folder_id: currentFolderId || folders.find(folder => folder.parent_id === null && folder.name === '学校資料')?.id || null,
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


  const rootFolder = folders.find(folder => folder.parent_id === null && folder.name === '学校資料') || null;
  const activeFolderId = currentFolderId || rootFolder?.id || null;
  const folderMap = new Map(folders.map(folder => [folder.id, folder]));
  const folderPath = (folderId: string | null): string => {
    if (!folderId || folderId === rootFolder?.id) return '学校資料';
    const parts: string[] = [];
    const visited = new Set<string>();
    let cursor = folderMap.get(folderId);
    while (cursor && cursor.id !== rootFolder?.id && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      parts.unshift(cursor.name);
      cursor = cursor.parent_id ? folderMap.get(cursor.parent_id) : undefined;
    }
    return ['学校資料', ...parts].join(' / ');
  };
  const folderOptions = (() => {
    const result: Array<{ id: string; label: string }> = [];
    const visit = (parentId: string | null, depth: number) => {
      folders
        .filter(folder => folder.parent_id === parentId)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ja'))
        .forEach(folder => {
          result.push({ id: folder.id, label: '　'.repeat(depth) + folder.name });
          visit(folder.id, depth + 1);
        });
    };
    visit(null, 0);
    return result;
  })();
  const childFolders = folders
    .filter(folder => folder.parent_id === activeFolderId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ja'));

  const createFolder = async () => {
    const name = window.prompt('作成するフォルダー名を入力してください。');
    if (!name?.trim()) return;
    setMessage('');
    try {
      const response = await fetch('/api/admin/materials/folders', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), parent_id: activeFolderId }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || 'フォルダーを作成できませんでした。');
      await loadMaterials();
      setCurrentFolderId(activeFolderId === rootFolder?.id ? null : activeFolderId);
      setMessage('フォルダーを作成しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'フォルダーを作成できませんでした。');
    }
  };

  const renameFolder = async (folder: MaterialFolder) => {
    const name = window.prompt('新しいフォルダー名を入力してください。', folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    try {
      const response = await fetch('/api/admin/materials/folders', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: folder.id, name: name.trim() }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || 'フォルダー名を変更できませんでした。');
      await loadMaterials();
      setMessage('フォルダー名を変更しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'フォルダー名を変更できませんでした。');
    }
  };

  const deleteFolder = async (folder: MaterialFolder) => {
    if (!window.confirm('「' + folder.name + '」を削除します。空のフォルダーだけ削除できます。')) return;
    try {
      const response = await fetch('/api/admin/materials/folders', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: folder.id }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || 'フォルダーを削除できませんでした。');
      if (currentFolderId === folder.id) setCurrentFolderId(folder.parent_id === rootFolder?.id ? null : folder.parent_id);
      await loadMaterials();
      setMessage('空のフォルダーを削除しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'フォルダーを削除できませんでした。');
    }
  };

  const moveMaterial = async (item: StudyMaterial, folderId: string) => {
    if (!folderId || folderId === item.folder_id) return;
    try {
      const response = await fetch('/api/admin/materials', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, folder_id: folderId }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || '資料を移動できませんでした。');
      await loadMaterials();
      setMessage('資料を「' + folderPath(folderId) + '」へ移動しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '資料を移動できませんでした。');
    }
  };

  const visibleMaterials = materials.filter(item => {
    const matchesSubject = filterSubject === 'all' || item.subject === filterSubject;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [item.title, item.description, item.file_name].some(value => value.toLowerCase().includes(term));
    return item.folder_id === activeFolderId && matchesSubject && matchesSearch;
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
            <h3 className="text-base font-black text-white">学校資料エクスプローラー <span className="ml-1 text-xs text-slate-500">{materials.length}件</span></h3>
            <p className="mt-1 text-xs text-slate-500">フォルダーを開いて資料を整理できます。アップロード先は現在開いているフォルダーです。</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button type="button" onClick={() => void createFolder()} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-300 hover:bg-amber-500/20"><FolderPlus size={14} /> 新規フォルダー</button>
            {currentFolderId && folderMap.get(currentFolderId) && (
              <>
                <button type="button" onClick={() => void renameFolder(folderMap.get(currentFolderId)!)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"><Pencil size={13} /> 名前変更</button>
                <button type="button" onClick={() => void deleteFolder(folderMap.get(currentFolderId)!)} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20"><Trash2 size={13} /> 空フォルダー削除</button>
              </>
            )}
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

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" onClick={() => setCurrentFolderId(null)} className="font-black text-cyan-300 hover:underline">学校資料</button>
            {(() => {
              const chain: MaterialFolder[] = [];
              const visited = new Set<string>();
              let cursor = currentFolderId ? folderMap.get(currentFolderId) : undefined;
              while (cursor && cursor.id !== rootFolder?.id && !visited.has(cursor.id)) {
                visited.add(cursor.id);
                chain.unshift(cursor);
                cursor = cursor.parent_id ? folderMap.get(cursor.parent_id) : undefined;
              }
              return chain.map(folder => <React.Fragment key={folder.id}><ChevronRight size={12} className="text-slate-600" /><button type="button" onClick={() => setCurrentFolderId(folder.id)} className="font-bold text-slate-200 hover:text-cyan-300">{folder.name}</button></React.Fragment>);
            })()}
            {currentFolderId && <button type="button" onClick={() => { const parentId = folderMap.get(currentFolderId)?.parent_id; setCurrentFolderId(parentId && parentId !== rootFolder?.id ? parentId : null); }} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[10px] font-bold text-slate-300"><ArrowUp size={12} /> 上へ</button>}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">現在の場所：{folderPath(currentFolderId)}</p>
          {childFolders.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {childFolders.map(folder => (
                <div key={folder.id} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <Folder size={19} className="shrink-0 text-amber-400" />
                  <button type="button" onClick={() => setCurrentFolderId(folder.id)} className="min-w-0 flex-1 truncate text-left text-xs font-black text-slate-100 hover:text-cyan-300">{folder.name}</button>
                  <button type="button" onClick={() => void renameFolder(folder)} aria-label="フォルダー名を変更" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"><Pencil size={13} /></button>
                  <button type="button" onClick={() => void deleteFolder(folder)} aria-label="空フォルダーを削除" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={13} /></button>
                  <ChevronRight size={14} className="text-slate-600" />
                </div>
              ))}
            </div>
          )}
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
                    <p className="mt-1 truncate text-[10px] text-slate-500">保存場所：{folderPath(item.folder_id)}</p>
                    <p className="mt-1 break-all text-[10px] text-slate-500">{item.file_name} ・ {fileSizeLabel(item.file_size)}</p>
                    {item.description && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-400">{item.description}</p>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
                  <label className="flex min-w-0 items-center gap-2 text-[10px] font-bold text-slate-400">
                    移動先
                    <select value={item.folder_id || ''} onChange={event => void moveMaterial(item, event.target.value)} className="max-w-[190px] rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-[10px] text-white">
                      {folderOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
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
