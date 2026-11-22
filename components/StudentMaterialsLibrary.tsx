'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { compressImageFile } from '@/lib/compress-image-file';
import {
  Search, FileText, FileImage, Download, Eye, RefreshCw, BookOpen, X, UploadCloud,
  Folder, FolderOpen, ChevronRight, ArrowUp,
} from 'lucide-react';

type StudyMaterial = {
  id: string;
  title: string;
  description: string;
  subject: string;
  material_type: string;
  target_scope: string;
  target_value: string | null;
  file_name: string;
  mime_type: string;
  file_size: number;
  folder_id: string | null;
  published_at: string | null;
  created_at: string;
};

type MaterialFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
};
type MaterialSubmission = {
  id: string; title: string; subject: string; material_type: string;
  file_name: string; mime_type: string; file_size: number; status: 'pending' | 'reviewing' | 'approved' | 'rejected';
  review_note: string | null; created_at: string; reviewed_at: string | null;
};

const SUBJECTS = ['国語演習', '古典探求', '物理', '生物', '数３', '数C', '公共', '英コミュ', '論表', '情報', '保健', 'その他'];
const TYPE_LABELS: Record<string, string> = {
  lesson: '授業プリント',
  assignment: '課題・宿題',
  answer: '解答',
  explanation: '解説',
  past_exam: '過去問・考査資料',
  other: 'その他',
};

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
function dateLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function StudentMaterialsLibrary({ isDarkMode = false }: { isDarkMode?: boolean }) {
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [folders, setFolders] = useState<MaterialFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('all');
  const [materialType, setMaterialType] = useState('all');
  const [preview, setPreview] = useState<{ item: StudyMaterial; url: string } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [verifiedClass, setVerifiedClass] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<MaterialSubmission[]>([]);
  const [studentFiles, setStudentFiles] = useState<File[]>([]);
  const [studentUploadSubject, setStudentUploadSubject] = useState('その他');
  const [studentUploadType, setStudentUploadType] = useState('lesson');
  const [studentUploadDescription, setStudentUploadDescription] = useState('');
  const [studentUploading, setStudentUploading] = useState(false);
  const [studentUploadMessage, setStudentUploadMessage] = useState('');

  const rootFolder = folders.find(folder => folder.parent_id === null && folder.name === '学校資料') || null;
  const activeFolderId = currentFolderId || rootFolder?.id || null;
  const folderMap = useMemo(() => new Map(folders.map(folder => [folder.id, folder])), [folders]);

  const loadMaterials = async () => {
    setLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) {
        setMaterials([]);
        setFolders([]);
        setMessage('学校アカウントでログインすると資料を閲覧できます。');
        return;
      }
      const response = await fetch('/api/materials', {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || '資料一覧を取得できませんでした。');
      setMaterials((result.materials || []) as StudyMaterial[]);
      setFolders((result.folders || []) as MaterialFolder[]);
      setSubmissions((result.submissions || []) as MaterialSubmission[]);
      setVerifiedClass(typeof result.verifiedClass === 'string' ? result.verifiedClass : null);
      setMessage('');
    } catch (error) {
      setMaterials([]);
      setFolders([]);
      setMessage(error instanceof Error ? error.message : '資料一覧を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadMaterials(); }, []);

  const openMaterial = async (item: StudyMaterial, download = false) => {
    setOpeningId(item.id);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('ログイン状態を確認できませんでした。');
      const response = await fetch('/api/materials/file?id=' + encodeURIComponent(item.id) + (download ? '&download=1' : ''), {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success || !result.url) throw new Error(result?.message || 'ファイルを開けませんでした。');
      if (download) window.open(result.url, '_blank', 'noopener,noreferrer');
      else setPreview({ item, url: result.url });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ファイルを開けませんでした。');
    } finally {
      setOpeningId(null);
    }
  };

  const handleStudentUpload = async () => {
    if (!studentFiles.length || studentUploading) return;
    if (studentFiles.length > 10) {
      setStudentUploadMessage('一度に登録できるのは10ファイルまでです。');
      return;
    }
    const invalid = studentFiles.find(file =>
      !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      || file.size < 1 || file.size > 20 * 1024 * 1024,
    );
    if (invalid) {
      setStudentUploadMessage('PDF・PNG・JPG形式、1ファイル20MB以下のファイルだけを選択してください。');
      return;
    }
    setStudentUploading(true);
    setStudentUploadMessage('資料を安全にアップロードしています…');
    const failed: File[] = [];
    let succeeded = 0;
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('学校アカウントでログインしてください。');

      for (const file of studentFiles) {
        try {
          const uploadFile = await compressImageFile(file);
          const uploadUrlResponse = await fetch('/api/materials/submissions/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ fileName: file.name, mimeType: uploadFile.type, size: uploadFile.size }),
            cache: 'no-store',
          });
          const uploadUrl = await uploadUrlResponse.json().catch(() => null);
          if (!uploadUrlResponse.ok || !uploadUrl?.success || !uploadUrl.path || !uploadUrl.token) {
            throw new Error(uploadUrl?.message || 'アップロードURLを取得できませんでした。');
          }

          const { error: uploadError } = await supabase.storage.from('study-materials')
            .uploadToSignedUrl(uploadUrl.path, uploadUrl.token, uploadFile, { contentType: uploadFile.type });
          if (uploadError) throw new Error(uploadError.message);

          const baseName = file.name.replace(/\.[^.]+$/, '').trim() || '生徒投稿資料';
          const saveResponse = await fetch('/api/materials/submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({
              title: baseName.slice(0, 160),
              description: studentUploadDescription.trim(),
              subject: studentUploadSubject,
              material_type: studentUploadType,
              storage_path: uploadUrl.path,
              file_name: file.name,
              mime_type: uploadFile.type,
              file_size: uploadFile.size,
            }),
            cache: 'no-store',
          });
          const saved = await saveResponse.json().catch(() => null);
          if (!saveResponse.ok || !saved?.success) throw new Error(saved?.message || '投稿情報を保存できませんでした。');
          succeeded += 1;
        } catch (error) {
          failed.push(file);
          setStudentUploadMessage(error instanceof Error ? error.message : '資料を投稿できませんでした。');
        }
      }

      setStudentFiles(failed);
      if (succeeded > 0) {
        setStudentUploadMessage(succeeded + '件を管理者確認待ちとして投稿しました。' + (failed.length ? ' ' + failed.length + '件は未完了のため選択状態を残しています。' : ''));
        await loadMaterials();
      } else if (!failed.length) {
        setStudentUploadMessage('投稿する資料を選択してください。');
      }
    } catch (error) {
      setStudentUploadMessage(error instanceof Error ? error.message : '資料を投稿できませんでした。');
    } finally {
      setStudentUploading(false);
    }
  };

  const submissionStatusLabel: Record<MaterialSubmission['status'], string> = {
    pending: '確認待ち',
    reviewing: '確認中',
    approved: '公開済み',
    rejected: '差し戻し',
  };

  const folderPath = (folderId: string | null) => {
    if (!folderId || folderId === rootFolder?.id) return '学校資料';
    const names: string[] = [];
    const visited = new Set<string>();
    let cursor = folderMap.get(folderId);
    while (cursor && cursor.id !== rootFolder?.id && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      names.unshift(cursor.name);
      cursor = cursor.parent_id ? folderMap.get(cursor.parent_id) : undefined;
    }
    return ['学校資料', ...names].join(' / ');
  };

  const breadcrumbs = useMemo(() => {
    const chain: MaterialFolder[] = [];
    const visited = new Set<string>();
    let cursor = currentFolderId ? folderMap.get(currentFolderId) : undefined;
    while (cursor && cursor.id !== rootFolder?.id && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      chain.unshift(cursor);
      cursor = cursor.parent_id ? folderMap.get(cursor.parent_id) : undefined;
    }
    return chain;
  }, [currentFolderId, folderMap, rootFolder?.id]);

  const childFolders = folders
    .filter(folder => folder.parent_id === activeFolderId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ja'));

  const filteredMaterials = useMemo(() => {
    const term = search.trim().toLowerCase();
    return materials.filter(item => {
      if (term) {
        return [item.title, item.description, item.file_name, item.subject].some(value => value.toLowerCase().includes(term))
          && (subject === 'all' || item.subject === subject)
          && (materialType === 'all' || item.material_type === materialType);
      }
      return item.folder_id === activeFolderId
        && (subject === 'all' || item.subject === subject)
        && (materialType === 'all' || item.material_type === materialType);
    });
  }, [materials, search, subject, materialType, activeFolderId]);

  const panel = isDarkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-900';
  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const subtlePanel = isDarkMode ? 'border-slate-700 bg-slate-900/70 hover:bg-slate-700' : 'border-slate-200 bg-slate-50 hover:bg-cyan-50';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-[0.2em] text-cyan-600">CAMPUSSYNC / STUDY LIBRARY</p>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-black"><BookOpen className="text-cyan-600" /> 学校資料エクスプローラー</h2>
          <p className={'mt-2 text-sm leading-6 ' + muted}>教科・学期・用途ごとのフォルダーを開いて、PDFや配布資料を確認できます。</p>
        </div>
        <button type="button" onClick={() => void loadMaterials()} disabled={loading} className={'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ' + (isDarkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}><RefreshCw size={14} /> 更新</button>
      </div>

      <div className={'rounded-2xl border p-3 sm:p-4 ' + panel}>
        <label className={'flex items-center gap-2 rounded-xl border px-3 py-3 ' + (isDarkMode ? 'border-slate-600 bg-slate-900' : 'border-slate-200 bg-slate-50')}>
          <Search size={17} className={muted} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="資料名・内容・ファイル名で全フォルダーを検索" className={'min-w-0 flex-1 bg-transparent text-sm outline-none ' + (isDarkMode ? 'text-white placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400')} />
        </label>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select value={subject} onChange={event => setSubject(event.target.value)} className={'rounded-xl border px-3 py-2.5 text-xs font-bold outline-none ' + (isDarkMode ? 'border-slate-600 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700')}>
            <option value="all">すべての教科</option>
            {SUBJECTS.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={materialType} onChange={event => setMaterialType(event.target.value)} className={'rounded-xl border px-3 py-2.5 text-xs font-bold outline-none ' + (isDarkMode ? 'border-slate-600 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700')}>
            <option value="all">すべての資料</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {message && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">{message}</p>}
      {verifiedClass === null && !message && (
        <p className={'rounded-xl border px-4 py-3 text-xs leading-5 ' + (isDarkMode ? 'border-amber-800 bg-amber-950/40 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900')}>
          現在は全校公開資料を表示しています。学年・クラス限定資料は、管理者が所属クラスを確認すると表示されます。
        </p>
      )}

      <section className={'rounded-2xl border p-4 sm:p-5 ' + panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black">資料を投稿する</h3>
            <p className={'mt-1 text-xs leading-5 ' + muted}>授業プリントや解答資料などを複数まとめて提出できます。投稿は管理者の確認後に公開されます。</p>
          </div>
          <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-[10px] font-black text-amber-600">管理者の承認制</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-bold">教科
            <select value={studentUploadSubject} onChange={event => setStudentUploadSubject(event.target.value)} className={'w-full rounded-xl border px-3 py-2.5 ' + (isDarkMode ? 'border-slate-600 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800')}>
              {SUBJECTS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-bold">資料の種類
            <select value={studentUploadType} onChange={event => setStudentUploadType(event.target.value)} className={'w-full rounded-xl border px-3 py-2.5 ' + (isDarkMode ? 'border-slate-600 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800')}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-3 block space-y-1 text-xs font-bold">説明・補足（任意）
          <textarea value={studentUploadDescription} onChange={event => setStudentUploadDescription(event.target.value)} rows={2} maxLength={2000} placeholder="単元、授業日、資料の補足など" className={'w-full rounded-xl border px-3 py-2.5 text-sm ' + (isDarkMode ? 'border-slate-600 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800')} />
        </label>
        <label className={'mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center ' + (isDarkMode ? 'border-slate-600 bg-slate-900/70 hover:border-cyan-500' : 'border-slate-300 bg-slate-50 hover:border-cyan-500')}>
          <UploadCloud size={24} className="text-cyan-600" />
          <span className="mt-2 text-xs font-black">{studentFiles.length ? studentFiles.length + '件のファイルを選択中' : 'PDF・PNG・JPGをまとめて選択'}</span>
          <span className={'mt-1 text-[10px] ' + muted}>最大10ファイル・各20MBまで</span>
          <input type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" onChange={event => {
            const selected = Array.from(event.target.files || []);
            setStudentFiles(selected.slice(0, 10));
            setStudentUploadMessage(selected.length > 10 ? '最初の10ファイルを選択しました。残りは次回投稿してください。' : '');
            event.target.value = '';
          }} className="sr-only" />
        </label>
        {studentFiles.length > 0 && <div className="mt-3 space-y-1.5">
          {studentFiles.map((file, index) => <div key={file.name + ':' + file.size + ':' + index} className={'flex items-center gap-2 rounded-lg px-3 py-2 text-xs ' + (isDarkMode ? 'bg-slate-900' : 'bg-slate-50')}>
            <FileText size={14} className="shrink-0 text-cyan-600" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className={muted}>{sizeLabel(file.size)}</span>
            <button type="button" disabled={studentUploading} onClick={() => setStudentFiles(previous => previous.filter((_, itemIndex) => itemIndex !== index))} aria-label={file.name + 'を選択解除'} className="text-slate-400 hover:text-rose-500"><X size={14} /></button>
          </div>)}
        </div>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className={'text-[10px] ' + muted}>{verifiedClass === null ? '所属クラスの確認後に投稿できます。' : '投稿した資料は確認済みの ' + verifiedClass + ' クラス向けとして審査されます。'}</p>
          <button type="button" disabled={studentUploading || !studentFiles.length || verifiedClass === null} onClick={() => void handleStudentUpload()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
            <UploadCloud size={15} /> {studentUploading ? '投稿中…' : verifiedClass === null ? 'クラス確認後に投稿可能' : '選択した資料を投稿'}
          </button>
        </div>
        {studentUploadMessage && <p role="status" className={'mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ' + (isDarkMode ? 'border-slate-700 bg-slate-900 text-cyan-200' : 'border-slate-200 bg-slate-50 text-slate-700')}>{studentUploadMessage}</p>}
        <div className={'mt-4 border-t pt-3 ' + (isDarkMode ? 'border-slate-700' : 'border-slate-200')}>
          <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-black">自分の投稿履歴</h4><span className={'text-[10px] ' + muted}>{submissions.length}件</span></div>
          {submissions.length === 0 ? <p className={'mt-2 text-xs ' + muted}>まだ投稿はありません。</p> : <div className="mt-2 space-y-2">
            {submissions.map(item => <div key={item.id} className={'flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 ' + (isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50')}>
              <FileText size={15} className="shrink-0 text-cyan-600" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{item.title}</p><p className={'mt-1 text-[10px] ' + muted}>{item.subject}・{dateLabel(item.created_at)}</p></div>
              <span className={'rounded-full px-2.5 py-1 text-[10px] font-black ' + (item.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600' : item.status === 'rejected' ? 'bg-rose-500/10 text-rose-600' : 'bg-amber-500/10 text-amber-600')}>{submissionStatusLabel[item.status]}</span>
              {item.review_note && <p className="basis-full text-[11px] text-rose-500">{item.review_note}</p>}
            </div>)}
          </div>}
        </div>
      </section>

      <div className={'rounded-2xl border p-3 sm:p-4 ' + panel}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => { setSearch(''); setCurrentFolderId(null); }} className="font-black text-cyan-600 hover:underline">学校資料</button>
          {breadcrumbs.map(folder => (
            <React.Fragment key={folder.id}>
              <ChevronRight size={13} className={muted} />
              <button type="button" onClick={() => { setSearch(''); setCurrentFolderId(folder.id); }} className="font-bold hover:text-cyan-600">{folder.name}</button>
            </React.Fragment>
          ))}
          {currentFolderId && (
            <button type="button" onClick={() => { setSearch(''); setCurrentFolderId(folderMap.get(currentFolderId)?.parent_id && folderMap.get(currentFolderId)?.parent_id !== rootFolder?.id ? folderMap.get(currentFolderId)!.parent_id : null); }} className={'ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-bold ' + (isDarkMode ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-50')}>
              <ArrowUp size={13} /> 上の階層
            </button>
          )}
        </div>
        <p className={'mt-2 text-[10px] ' + muted}>現在の場所：{folderPath(currentFolderId)}</p>
      </div>

      {loading ? <div className={'rounded-2xl border p-10 text-center text-sm ' + panel}>資料を読み込み中...</div> : (
        <>
          {!search.trim() && childFolders.length > 0 && (
            <section className="space-y-3">
              <h3 className={'flex items-center gap-2 text-sm font-black ' + (isDarkMode ? 'text-slate-200' : 'text-slate-700')}><FolderOpen size={16} className="text-amber-500" /> フォルダー</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {childFolders.map(folder => (
                  <button key={folder.id} type="button" onClick={() => setCurrentFolderId(folder.id)} className={'flex items-center gap-3 rounded-2xl border p-4 text-left transition ' + subtlePanel}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"><Folder size={23} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-black">{folder.name}</span>
                      <span className={'block mt-1 text-[10px] ' + muted}>フォルダーを開く</span>
                    </span>
                    <ChevronRight size={17} className={muted} />
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className={'flex items-center gap-2 text-sm font-black ' + (isDarkMode ? 'text-slate-200' : 'text-slate-700')}><FileText size={16} className="text-cyan-600" /> {search.trim() ? '検索結果' : 'このフォルダーの資料'}</h3>
              <span className={'text-[10px] ' + muted}>{filteredMaterials.length}件</span>
            </div>
            {filteredMaterials.length === 0 ? (
              <div className={'rounded-2xl border border-dashed p-10 text-center ' + panel}>
                <FolderOpen size={30} className={'mx-auto ' + muted} />
                <p className="mt-3 text-sm font-bold">{search.trim() ? '該当する資料はありません' : 'このフォルダーに資料はありません'}</p>
                <p className={'mt-1 text-xs ' + muted}>別のフォルダーを開くか、検索条件を変更してください。</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredMaterials.map(item => (
                  <article key={item.id} className={'flex flex-col rounded-2xl border p-4 shadow-sm ' + panel}>
                    <div className="flex items-start gap-3">
                      <span className={'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ' + (isDarkMode ? 'bg-slate-700 text-cyan-300' : 'bg-cyan-50 text-cyan-700')}>
                        {item.mime_type === 'application/pdf' ? <FileText size={23} /> : <FileImage size={23} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 data-user-content className="break-words text-sm font-black">{item.title}</h4>
                        <p className={'mt-1 text-[11px] ' + muted}>{item.subject} ・ {TYPE_LABELS[item.material_type] || 'その他'}</p>
                        <p className={'mt-1 text-[10px] ' + muted}>{item.mime_type === 'application/pdf' ? 'PDF' : '画像'} ・ {sizeLabel(item.file_size)}</p>
                        {search.trim() && <p className={'mt-1 truncate text-[10px] ' + muted}>{folderPath(item.folder_id)}</p>}
                      </div>
                    </div>
                    {item.description && <p data-user-content className={'mt-3 whitespace-pre-wrap text-xs leading-5 ' + muted}>{item.description}</p>}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                      <span className={'text-[10px] ' + muted}>{dateLabel(item.published_at || item.created_at)} 公開</span>
                      <div className="flex gap-2">
                        <button type="button" disabled={openingId === item.id} onClick={() => void openMaterial(item)} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-[11px] font-black text-white hover:bg-cyan-500 disabled:opacity-50"><Eye size={13} /> 開く</button>
                        <button type="button" disabled={openingId === item.id} onClick={() => void openMaterial(item, true)} aria-label="ダウンロード" className={'rounded-lg border px-2.5 py-2 ' + (isDarkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}><Download size={14} /></button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {preview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="資料プレビュー">
          <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div className="min-w-0"><p data-user-content className="truncate text-sm font-black text-white">{preview.item.title}</p><p data-user-content className="text-[10px] text-slate-500">{preview.item.file_name}</p></div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => void openMaterial(preview.item, true)} className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200"><Download size={13}/> 保存</button>
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
    </div>
  );
}
