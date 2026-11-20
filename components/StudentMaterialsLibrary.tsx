'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Search, FileText, FileImage, Download, Eye, RefreshCw, BookOpen, X,
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
                      <span class={'block mt-1 text-[10px] ' + muted}>フォルダーを開く</span>
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
