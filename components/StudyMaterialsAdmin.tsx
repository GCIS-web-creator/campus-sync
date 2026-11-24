'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { compressImageFile } from '@/lib/compress-image-file';
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
  color: string;
};
type MaterialSubmission = {
  id: string; student_id: string; student_name: string; user_class: string;
  title: string; description: string; subject: string; material_type: string;
  file_name: string; mime_type: string; file_size: number; verified_class: string | null;
  status: 'pending' | 'reviewing'; created_at: string;
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
const FOLDER_COLORS = [
  { value: '#f59e0b', label: 'アンバー' },
  { value: '#3b82f6', label: 'ブルー' },
  { value: '#06b6d4', label: 'シアン' },
  { value: '#10b981', label: 'エメラルド' },
  { value: '#8b5cf6', label: 'バイオレット' },
  { value: '#f43f5e', label: 'ローズ' },
  { value: '#f97316', label: 'オレンジ' },
  { value: '#64748b', label: 'スレート' },
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
  const [uploadFolderId, setUploadFolderId] = useState('');
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
  const [files, setFiles] = useState<File[]>([]);
  const [submissions, setSubmissions] = useState<MaterialSubmission[]>([]);
  const [submissionPreview, setSubmissionPreview] = useState<{ id: string; title: string; file_name: string; mime_type: string; url: string } | null>(null);
  const [preview, setPreview] = useState<{ item: StudyMaterial; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const loadMaterials = async () => {
    setLoading(true);
    try {
      const [response, submissionsResponse] = await Promise.all([
        fetch('/api/admin/materials', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/admin/material-submissions', { credentials: 'same-origin', cache: 'no-store' }),
      ]);
      const [result, submissionsResult] = await Promise.all([
        response.json().catch(() => null),
        submissionsResponse.json().catch(() => null),
      ]);
      if (!response.ok || !result?.success) throw new Error(result?.message || '資料一覧を取得できませんでした。');
      if (!submissionsResponse.ok || !submissionsResult?.success) throw new Error(submissionsResult?.message || '生徒からの投稿一覧を取得できませんでした。');
      setMaterials((result.materials || []) as StudyMaterial[]);
      setFolders((result.folders || []) as MaterialFolder[]);
      setSubmissions((submissionsResult.submissions || []) as MaterialSubmission[]);
      setMessage('');
    } catch (error) {
      setMaterials([]);
      setMessage(error instanceof Error ? error.message : '資料一覧を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadMaterials(); }, []);

  const handleFileChange = (nextFiles: File[]) => {
    const selected = nextFiles.slice(0, 20);
    if (nextFiles.length > 20) setMessage('一度に選択できるのは20ファイルまでです。');
    const invalid = selected.find(nextFile =>
      !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(nextFile.type)
      || nextFile.size < 1 || nextFile.size > 20 * 1024 * 1024,
    );
    if (invalid) {
      setFiles([]);
      setMessage('すべてPDF・PNG・JPG形式、1ファイル20MB以下にしてください。');
      return;
    }
    setFiles(selected);
    setMessage('');
    if (!title.trim() && selected.length === 1) setTitle(selected[0].name.replace(/\.[^.]+$/, ''));
  };

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!files.length) {
      setMessage('登録するPDFまたは画像を選択してください。');
      return;
    }
    if (files.length > 1 && title.trim().length > 150) {
      setMessage('複数登録時の共通タイトルは150文字以内にしてください。');
      return;
    }
    if (files.length === 1 && !title.trim()) setTitle(files[0].name.replace(/\.[^.]+$/, ''));
    setSaving(true);
    const remaining: File[] = [];
    let succeeded = 0;
    setMessage('アップロードを開始します…');
    try {
      const folderId = uploadFolderId || currentFolderId || folders.find(folder => folder.parent_id === null && folder.name === '学校資料')?.id || null;
      for (const selectedFile of files) {
        let uploadedPath: string | null = null;
        try {
          setMessage((succeeded + 1) + ' / ' + files.length + ' 件目をアップロードしています…');
          const uploadFile = await compressImageFile(selectedFile);
          const signedResponse = await fetch('/api/admin/materials/upload-url', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: selectedFile.name, mimeType: uploadFile.type, size: uploadFile.size }),
            cache: 'no-store',
          });
          const signedResult = await signedResponse.json().catch(() => null);
          if (!signedResponse.ok || !signedResult?.success || !signedResult.path || !signedResult.token) {
            throw new Error(signedResult?.message || 'アップロードURLを取得できませんでした。');
          }
          uploadedPath = signedResult.path;
          const { error: uploadError } = await supabase.storage.from('study-materials')
            .uploadToSignedUrl(signedResult.path, signedResult.token, uploadFile, { contentType: uploadFile.type });
          if (uploadError) throw new Error('ファイルのアップロードに失敗しました: ' + uploadError.message);

          const baseName = selectedFile.name.replace(/\.[^.]+$/, '').trim() || '学校資料';
          const itemTitle = files.length === 1 && title.trim()
            ? title.trim()
            : (title.trim() ? title.trim() + ' ・ ' : '') + baseName;
          const response = await fetch('/api/admin/materials', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: itemTitle.slice(0, 160),
              description: description.trim(),
              subject,
              material_type: materialType,
              target_scope: targetScope,
              target_value: targetScope === 'all' ? null : targetValue,
              storage_path: signedResult.path,
              file_name: selectedFile.name,
              mime_type: uploadFile.type,
              file_size: uploadFile.size,
              is_published: publishImmediately,
              folder_id: folderId,
            }),
            cache: 'no-store',
          });
          const result = await response.json().catch(() => null);
          if (!response.ok || !result?.success) throw new Error(result?.message || '資料情報を保存できませんでした。');
          succeeded += 1;
        } catch (error) {
          remaining.push(selectedFile);
          if (uploadedPath) await supabase.storage.from('study-materials').remove([uploadedPath]).catch(() => undefined);
          setMessage(error instanceof Error ? error.message : '資料を登録できませんでした。');
        }
      }

      setFiles(remaining);
      if (succeeded === files.length) {
        setTitle('');
        setDescription('');
        setPublishImmediately(true);
        const input = document.getElementById('study-material-files') as HTMLInputElement | null;
        if (input) input.value = '';
      }
      await loadMaterials();
      setMessage(succeeded + ' / ' + files.length + ' 件を' + (publishImmediately ? '公開登録' : '下書き登録') + 'しました。'
        + (remaining.length ? ' 未完了の' + remaining.length + '件は選択状態を保持しています。' : ''));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '資料を登録できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const openSubmissionPreview = async (item: MaterialSubmission) => {
    setPreviewLoading(true);
    try {
      const response = await fetch('/api/admin/material-submissions/file?id=' + encodeURIComponent(item.id), {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success || !result.url) throw new Error(result?.message || '投稿ファイルを開けませんでした。');
      setSubmissionPreview({ id: item.id, title: item.title, file_name: item.file_name, mime_type: item.mime_type, url: result.url });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '投稿ファイルを開けませんでした。');
    } finally {
      setPreviewLoading(false);
    }
  };

  const reviewSubmission = async (item: MaterialSubmission, action: 'approve' | 'reject') => {
    if (reviewingId) return;
    if (action === 'approve' && !item.verified_class) {
      setMessage('投稿者の所属クラスが管理者によって確認されていないため、承認できません。先にプロフィールを確認してください。');
      return;
    }
    if (action === 'approve' && !window.confirm('「' + item.title + '」を承認し、' + item.verified_class + 'クラス向けに公開しますか？')) return;
    const reviewNote = action === 'reject'
      ? (window.prompt('差し戻し理由（任意・生徒に表示されます）', '内容を確認して修正後、再投稿してください。') || '')
      : '';
    setReviewingId(item.id);
    try {
      const response = await fetch('/api/admin/material-submissions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, action, review_note: reviewNote }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || '投稿を処理できませんでした。');
      setSubmissionPreview(null);
      await loadMaterials();
      setMessage(action === 'approve' ? item.user_class + 'クラス向けに公開しました。' : '投稿を差し戻しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '投稿を処理できませんでした。');
    } finally {
      setReviewingId(null);
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

  const changeFolderColor = async (folder: MaterialFolder, color: string) => {
    if (folder.color === color) return;
    try {
      const response = await fetch('/api/admin/materials/folders', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: folder.id, color }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || 'フォルダーの色を変更できませんでした。');
      setFolders(previous => previous.map(item => item.id === folder.id ? { ...item, color } : item));
      setMessage('「' + folder.name + '」の色を変更しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'フォルダーの色を変更できませんでした。');
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
          <p className="mt-1 text-xs leading-5 text-slate-400">PDF・PNG・JPG形式を一度に最大20件まで登録できます。1ファイル20MBまで。登録前に保存先フォルダーを選択できます。</p>
        </div>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs font-bold text-slate-300">資料名（任意）
              <input value={title} onChange={event => setTitle(event.target.value)} maxLength={160} placeholder="空欄なら各ファイル名を資料名に使用" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500" />
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
            <label className="block text-xs font-bold text-slate-300">保存先フォルダー
              <select value={uploadFolderId || activeFolderId || ''} onChange={event => setUploadFolderId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500">
                {folderOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <span className="mt-1 block text-[10px] font-normal text-slate-500">選択した場所へ最初から登録します。登録後に移動する必要はありません。</span>
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
            <span className="mt-2 text-sm font-black text-white">{files.length ? files.length + '件のファイルを選択中' : 'PDF・PNG・JPGをまとめて選択'}</span>
            <span className="mt-1 text-[11px] text-slate-500">最大20件・1ファイル20MBまで</span>
            <input id="study-material-files" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" onChange={event => { handleFileChange(Array.from(event.target.files || [])); event.target.value = ''; }} className="sr-only" />
          </label>
          {files.length > 0 && <div className="max-h-48 space-y-1.5 overflow-y-auto">
            {files.map((selectedFile, index) => <div key={selectedFile.name + ':' + selectedFile.size + ':' + index} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs">
              <FileText size={14} className="shrink-0 text-cyan-400" /><span className="min-w-0 flex-1 truncate text-slate-200">{selectedFile.name}</span><span className="shrink-0 text-slate-500">{fileSizeLabel(selectedFile.size)}</span>
              <button type="button" disabled={saving} onClick={() => setFiles(previous => previous.filter((_, itemIndex) => itemIndex !== index))} aria-label={selectedFile.name + 'を選択解除'} className="text-slate-400 hover:text-rose-300"><X size={14}/></button>
            </div>)}
          </div>}

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={publishImmediately} onChange={event => setPublishImmediately(event.target.checked)} className="h-4 w-4 accent-cyan-500" />
            登録後すぐに公開する
          </label>
          <button type="submit" disabled={saving || !files.length} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            <UploadCloud size={16} /> {saving ? '登録処理中...' : files.length + '件を' + (publishImmediately ? '公開' : '下書き') + '登録'}
          </button>
          {message && <p role="status" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-xs leading-5 text-cyan-200">{message}</p>}
        </form>
      </section>

      <section className="space-y-4 rounded-2xl border border-amber-500/20 bg-slate-950 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-base font-black text-white">生徒からの投稿・承認待ち</h3><p className="mt-1 text-xs text-slate-400">承認すると投稿した生徒のクラスに限定して公開されます。全校公開が必要な場合は、承認後に通常の資料管理から対象を変更してください。</p></div>
          <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-xs font-black text-amber-300">{submissions.length}件待機中</span>
        </div>
        {submissions.length === 0 ? <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500">現在、確認待ちの投稿はありません。</p> : <div className="space-y-2">
          {submissions.map(item => <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300"><FileText size={20}/></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h4 className="break-words text-sm font-black text-white">{item.title}</h4><span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">{item.status === 'reviewing' ? '確認中' : '承認待ち'}</span></div>
                <p className="mt-1 text-[11px] text-slate-400">{item.subject}・{typeLabel(item.material_type)}・登録クラス {item.user_class} / 確認済み {item.verified_class || '未確認'}</p>
                <p className="mt-1 text-[10px] text-slate-500">{item.student_name || item.student_id}（{item.student_id}）・{new Date(item.created_at).toLocaleString('ja-JP')}・{item.file_name}・{fileSizeLabel(item.file_size)}</p>
                {item.description ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-400">{item.description}</p> : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-3">
              <button type="button" disabled={previewLoading || item.status === 'reviewing'} onClick={() => void openSubmissionPreview(item)} className="rounded-lg bg-slate-800 px-3 py-2 text-[11px] font-bold text-slate-200 disabled:opacity-40">{previewLoading ? '読込中…' : 'プレビュー'}</button>
              <button type="button" disabled={!!reviewingId || item.status === 'reviewing'} onClick={() => void reviewSubmission(item, 'reject')} className="rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-300 disabled:opacity-40">差し戻す</button>
              <button type="button" disabled={!!reviewingId || item.status === 'reviewing' || !item.verified_class} onClick={() => void reviewSubmission(item, 'approve')} className="rounded-lg bg-emerald-500 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40">{reviewingId === item.id ? '処理中…' : '承認してクラス公開'}</button>
            </div>
          </article>)}
        </div>}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white">学校資料エクスプローラー <span className="ml-1 text-xs text-slate-500">{materials.length}件</span></h3>
            <p className="mt-1 text-xs text-slate-500">フォルダーを開いて資料を整理できます。登録画面で保存先を自由に指定できます。</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button type="button" onClick={() => void createFolder()} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-300 hover:bg-amber-500/20"><FolderPlus size={14} /> 新規フォルダー</button>
            {currentFolderId && folderMap.get(currentFolderId) && (
              <>
                <select aria-label="現在のフォルダー色" value={folderMap.get(currentFolderId)!.color || '#f59e0b'} onChange={event => void changeFolderColor(folderMap.get(currentFolderId)!, event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200">
                  {FOLDER_COLORS.map(option => <option key={option.value} value={option.value}>色：{option.label}</option>)}
                </select>
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
                  <Folder size={19} className="shrink-0" style={{ color: folder.color || '#f59e0b' }} />
                  <button type="button" onClick={() => setCurrentFolderId(folder.id)} className="min-w-0 flex-1 truncate text-left text-xs font-black text-slate-100 hover:text-cyan-300">{folder.name}</button>
                  <select aria-label={folder.name + 'のフォルダー色'} value={folder.color || '#f59e0b'} onChange={event => void changeFolderColor(folder, event.target.value)} className="max-w-[108px] rounded-lg border border-slate-700 bg-slate-950 px-1.5 py-1.5 text-[10px] text-slate-200">
                    {FOLDER_COLORS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
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

      {submissionPreview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="生徒投稿プレビュー">
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div className="min-w-0"><p className="truncate text-sm font-black text-white">{submissionPreview.title}</p><p className="text-[10px] text-slate-500">{submissionPreview.file_name}</p></div>
              <button type="button" onClick={() => setSubmissionPreview(null)} aria-label="閉じる" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X size={18}/></button>
            </div>
            <div className="min-h-0 flex-1 bg-slate-900 p-2">
              {submissionPreview.mime_type === 'application/pdf'
                ? <iframe title={submissionPreview.title} src={submissionPreview.url} className="h-full w-full rounded-lg bg-white" />
                : <div className="flex h-full items-center justify-center overflow-auto"><img src={submissionPreview.url} alt={submissionPreview.title} className="max-h-full max-w-full object-contain" /></div>}
            </div>
          </div>
        </div>
      )}
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
