'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';

type LiffSdk = {
  init(config: { liffId: string }): Promise<void>;
  isInClient(): boolean;
  isLoggedIn(): boolean;
  login(config?: { redirectUri?: string }): void;
  getIDToken(): string | null;
};
type PdfViewport = { width: number; height: number };
type PdfPageHandle = {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise: Promise<void> };
};
type PdfDocumentHandle = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageHandle>;
  destroy?(): Promise<void> | void;
};
type PdfJsHandle = {
  getDocument(options: { data: Uint8Array }): { promise: Promise<PdfDocumentHandle> };
};

declare global {
  interface Window { liff?: LiffSdk; csPdfjsLib?: PdfJsHandle; }
}

let pdfJsLoading: Promise<PdfJsHandle> | null = null;

function loadPdfJs(): Promise<PdfJsHandle> {
  if (window.csPdfjsLib) return Promise.resolve(window.csPdfjsLib);
  if (!pdfJsLoading) {
    pdfJsLoading = new Promise<PdfJsHandle>((resolve, reject) => {
      let script = document.querySelector<HTMLScriptElement>('script[data-cs-pdfjs]');
      const onLoad = () => {
        if (window.csPdfjsLib) resolve(window.csPdfjsLib);
        else reject(new Error('PDFビューアーを初期化できませんでした。'));
      };
      const onError = () => reject(new Error('PDFビューアーを読み込めませんでした。通信環境を確認してください。'));
      if (!script) {
        script = document.createElement('script');
        script.type = 'module';
        script.src = '/pdfjs-loader.js';
        script.dataset.csPdfjs = 'true';
        script.addEventListener('load', onLoad, { once: true });
        script.addEventListener('error', onError, { once: true });
        document.head.appendChild(script);
      } else {
        script.addEventListener('load', onLoad, { once: true });
        script.addEventListener('error', onError, { once: true });
      }
    }).catch(error => {
      pdfJsLoading = null;
      throw error;
    });
  }
  return pdfJsLoading;
}

function PdfCanvasViewer({ fileUrl }: { fileUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PdfDocumentHandle | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PdfDocumentHandle | null = null;

    async function openPdf() {
      setLoading(true);
      setError('');
      setPdf(null);
      setPage(1);
      try {
        const library = await loadPdfJs();
        const response = await fetch(fileUrl, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { message?: string } | null;
          throw new Error(payload?.message || 'PDFファイルを取得できませんでした。');
        }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.toLowerCase().includes('application/pdf')) {
          throw new Error('取得したファイルがPDFではありません。管理者にファイル形式を確認してください。');
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length) throw new Error('PDFファイルが空です。');
        const document = await library.getDocument({ data: bytes }).promise;
        if (cancelled) {
          await document.destroy?.();
          return;
        }
        loadedDocument = document;
        setPdf(document);
      } catch (openError) {
        if (!cancelled) setError(openError instanceof Error ? openError.message : 'PDFを開けませんでした。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void openPdf();
    return () => {
      cancelled = true;
      if (loadedDocument) void loadedDocument.destroy?.();
    };
  }, [fileUrl]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    const currentPdf = pdf;
    let cancelled = false;

    async function renderPage() {
      setRendering(true);
      setError('');
      try {
        const pageData = await currentPdf.getPage(page);
        if (cancelled || !canvasRef.current) return;
        const viewport = pageData.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('PDFの描画領域を作成できませんでした。');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await pageData.render({ canvasContext: context, viewport }).promise;
      } catch (renderError) {
        if (!cancelled) setError(renderError instanceof Error ? renderError.message : 'ページを描画できませんでした。');
      } finally {
        if (!cancelled) setRendering(false);
      }
    }

    void renderPage();
    return () => { cancelled = true; };
  }, [pdf, page, scale]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111d2d] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-300">
          {pdf ? `ページ ${page} / ${pdf.numPages}` : 'PDFプレビュー'}
          {rendering ? <span className="ml-2 text-cyan-300">描画中…</span> : null}
        </div>
        {pdf ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setScale(value => Math.max(0.75, Number((value - 0.2).toFixed(2))))} disabled={scale <= 0.75} className="rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-40" aria-label="縮小">−</button>
            <span className="min-w-12 text-center text-xs text-slate-400">{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => setScale(value => Math.min(2.5, Number((value + 0.2).toFixed(2))))} disabled={scale >= 2.5} className="rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-40" aria-label="拡大">＋</button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center text-sm text-slate-300">PDFを読み込んでいます…</div>
      ) : error ? (
        <div className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-4 text-sm leading-6 text-rose-100">
          {error}
          <p className="mt-2 text-xs text-slate-400">上部の「ダウンロード」からファイルを開くこともできます。</p>
        </div>
      ) : (
        <div className="flex min-h-64 justify-center overflow-auto rounded-xl bg-slate-300 p-1">
          <canvas ref={canvasRef} className="h-auto max-w-full bg-white shadow-xl" />
        </div>
      )}

      {pdf ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1 || rendering} className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-slate-200 disabled:opacity-40">← 前のページ</button>
          <span className="text-xs tabular-nums text-slate-400">{page} / {pdf.numPages}</span>
          <button type="button" onClick={() => setPage(value => Math.min(pdf.numPages, value + 1))} disabled={page >= pdf.numPages || rendering} className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-slate-200 disabled:opacity-40">次のページ →</button>
        </div>
      ) : null}
    </div>
  );
}

type Folder = { id: string; name: string; parent_id: string | null; sort_order: number };
type Material = {
  id: string; title: string; description: string | null; subject: string;
  material_type: string; file_name: string; mime_type: string; file_size: number;
  folder_id: string | null;
};
type Payload = {
  success: boolean; message?: string; folders?: Folder[]; materials?: Material[];
  linked?: boolean; verifiedClass?: string | null;
};

function fileSize(bytes: number) {
  if (!bytes) return '';
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

export default function LiffMaterialsClient({ liffId }: { liffId: string }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('LINEの認証を確認しています…');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [linked, setLinked] = useState(false);
  const [verifiedClass, setVerifiedClass] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Material | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadMaterials = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/liff/materials', { cache: 'no-store' });
      const payload = await response.json() as Payload;
      if (!response.ok || !payload.success) throw new Error(payload.message || '資料一覧を取得できませんでした。');
      setFolders(Array.isArray(payload.folders) ? payload.folders : []);
      setMaterials(Array.isArray(payload.materials) ? payload.materials : []);
      setLinked(Boolean(payload.linked));
      setVerifiedClass(typeof payload.verifiedClass === 'string' ? payload.verifiedClass : null);
      setState('ready');
      setMessage('');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : '資料一覧を取得できませんでした。');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const initialize = useCallback(async () => {
    if (!liffId) {
      setState('error');
      setMessage('LIFF IDが未設定です。管理者によるLINE DevelopersとCloudflareの設定が必要です。');
      return;
    }
    const liff = window.liff;
    if (!liff) {
      setState('error');
      setMessage('LINE SDKを読み込めませんでした。通信環境を確認して開き直してください。');
      return;
    }
    try {
      await liff.init({ liffId });
      if (!liff.isInClient() && !liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }
      const idToken = liff.getIDToken();
      if (!idToken) {
        setState('error');
        setMessage('LINE IDトークンを取得できません。LIFFのopenid権限を確認してください。');
        return;
      }
      setMessage('LINEアカウントを安全に確認しています…');
      const response = await fetch('/api/liff/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null) as { success?: boolean; message?: string } | null;
      if (!response.ok || !result?.success) throw new Error(result?.message || 'LINE認証を完了できませんでした。');
      await loadMaterials();
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'LIFFを初期化できませんでした。');
    }
  }, [liffId, loadMaterials]);

  useEffect(() => {
    if (sdkReady) void initialize();
  }, [sdkReady, initialize]);

  const rootId = useMemo(
    () => folders.find(folder => folder.parent_id === null && folder.name === '学校資料')?.id || null,
    [folders],
  );
  const currentId = folderStack.length ? folderStack[folderStack.length - 1] : rootId;
  const folderMap = useMemo(() => new Map(folders.map(folder => [folder.id, folder])), [folders]);
  const breadcrumbs = useMemo(() => {
    const result: Folder[] = [];
    const visited = new Set<string>();
    let cursor = currentId ? folderMap.get(currentId) : undefined;
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      result.unshift(cursor);
      cursor = cursor.parent_id ? folderMap.get(cursor.parent_id) : undefined;
    }
    return result;
  }, [currentId, folderMap]);

  const q = search.trim().toLocaleLowerCase('ja');
  const shownFolders = q ? [] : folders
    .filter(folder => folder.parent_id === currentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ja'));
  const shownMaterials = q
    ? materials.filter(item => [item.title, item.subject, item.material_type, item.file_name, item.description || '']
        .join(' ').toLocaleLowerCase('ja').includes(q))
    : materials.filter(item => item.folder_id === currentId);

  function jumpTo(id: string | null) {
    if (!id || id === rootId) { setFolderStack([]); return; }
    const chain: string[] = [];
    const visited = new Set<string>();
    let cursor = folderMap.get(id);
    while (cursor && cursor.id !== rootId && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      chain.unshift(cursor.id);
      cursor = cursor.parent_id ? folderMap.get(cursor.parent_id) : undefined;
    }
    setFolderStack(chain);
  }

  async function signOut() {
    await fetch('/api/liff/session', { method: 'DELETE' }).catch(() => undefined);
    window.location.reload();
  }

  const fileUrl = selected ? '/api/liff/materials/file?id=' + encodeURIComponent(selected.id) : '';

  return (
    <main className="min-h-screen bg-[#07111f] px-3 py-5 text-slate-100 sm:px-6 sm:py-8">
      <Script
        src="https://static.line-scdn.net/liff/edge/2/sdk.js"
        strategy="afterInteractive"
        onReady={() => setSdkReady(true)}
        onError={() => { setState('error'); setMessage('LINE SDKを読み込めませんでした。'); }}
      />
      <div className="mx-auto max-w-4xl">
        <header className="mb-5 flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-[10px] font-bold tracking-[0.28em] text-cyan-300">CAMPUSSYNC / LIFF</p>
            <h1 className="mt-1 text-xl font-extrabold sm:text-2xl">学校資料エクスプローラー</h1>
            <p className="mt-1 text-xs text-slate-400">移動・検索・PDF表示はこの画面内で完結します</p>
          </div>
          {state === 'ready' ? <button onClick={() => void signOut()} className="rounded-full border border-white/15 px-3 py-2 text-xs text-slate-300">認証を解除</button> : null}
        </header>

        {state !== 'ready' ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            {state === 'loading' ? <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-cyan-300/25 border-t-cyan-300" /> : <div className="mb-4 text-rose-300">!</div>}
            <h2 className="text-lg font-bold">{state === 'loading' ? 'LINE認証中' : '接続できません'}</h2>
            <p className="mt-2 text-sm leading-7 text-slate-300">{message}</p>
            {state === 'error' ? <button onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950">もう一度試す</button> : null}
          </section>
        ) : selected ? (
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
              <button onClick={() => setSelected(null)} className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold">← 資料一覧へ戻る</button>
              <a href={fileUrl + '&download=1'} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950">ダウンロード</a>
            </div>
            <div className="p-4">
              <p className="text-xs font-semibold text-cyan-300">{selected.subject} ・ {selected.material_type}</p>
              <h2 className="mt-1 break-words text-lg font-bold">{selected.title}</h2>
              {selected.description ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selected.description}</p> : null}
              <p className="mt-2 text-xs text-slate-500">{selected.file_name} {fileSize(selected.file_size)}</p>
            </div>
            <div className="border-t border-white/10 bg-[#0b1727] p-2 sm:p-4">
              {selected.mime_type.startsWith('image/')
                ? <div className="flex min-h-[55vh] items-center justify-center"><img src={fileUrl} alt={selected.title} className="max-h-[75vh] max-w-full rounded-xl object-contain" /></div>
                : selected.mime_type === 'application/pdf'
                  ? <PdfCanvasViewer fileUrl={fileUrl} />
                  : <div className="flex min-h-64 items-center justify-center rounded-xl border border-white/10 text-sm text-slate-400">このファイル形式のプレビューには対応していません。ダウンロードして開いてください。</div>}
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/20 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={'rounded-full px-3 py-1.5 text-xs font-bold ' + (linked ? 'bg-emerald-300/10 text-emerald-200' : 'bg-amber-300/10 text-amber-200')}>
                {linked ? (verifiedClass ? '確認済みクラス ' + verifiedClass : 'LINE連携済み・クラス未確認') : 'LINE未連携'}
              </span>
              <span className="text-xs text-slate-500">表示資料 {materials.length} 件</span>
              <button disabled={refreshing} onClick={() => void loadMaterials()} className="ml-auto rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50">
                {refreshing ? '更新中…' : '一覧を更新'}
              </button>
            </div>

            {!linked || !verifiedClass ? (
              <div className="mb-4 rounded-2xl border border-amber-200/15 bg-amber-200/[0.06] px-4 py-3 text-xs leading-6 text-amber-100/90">
                {linked ? '管理者によるクラス確認が完了するまでは、全校公開資料のみ表示されます。' : 'LINEアカウントがCampusSyncと未連携のため、全校公開資料のみ表示されます。クラス限定資料にはLINE連携と管理者確認が必要です。'}
              </div>
            ) : null}

            <label className="mb-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1727] px-4 py-3">
              <span className="text-slate-400">⌕</span>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="資料名・教科・ファイル名で検索" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
              {search ? <button type="button" onClick={() => setSearch('')} className="text-xs text-slate-400">消去</button> : null}
            </label>

            <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-400" aria-label="フォルダーパス">
              <button onClick={() => jumpTo(null)} className="font-semibold text-cyan-200">学校資料</button>
              {breadcrumbs.filter(folder => folder.id !== rootId).map(folder => (
                <span key={folder.id} className="flex items-center gap-2">
                  <span className="text-slate-600">/</span>
                  <button onClick={() => jumpTo(folder.id)}>{folder.name}</button>
                </span>
              ))}
            </nav>

            {folderStack.length > 0 && !q ? (
              <button onClick={() => setFolderStack(old => old.slice(0, -1))} className="mb-3 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300">← 上のフォルダーへ</button>
            ) : null}

            <div className="grid gap-2">
              {shownFolders.map(folder => {
                const count = folders.filter(item => item.parent_id === folder.id).length + materials.filter(item => item.folder_id === folder.id).length;
                return (
                  <button key={folder.id} onClick={() => { setFolderStack(old => [...old, folder.id]); setSearch(''); }} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1727] px-4 py-3 text-left transition hover:border-cyan-200/40 hover:bg-[#102238]">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-lg">📁</span>
                    <span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold">{folder.name}</span><span className="mt-1 block text-[11px] text-slate-500">フォルダー ・ {count} 項目</span></span>
                    <span className="text-lg text-slate-500">›</span>
                  </button>
                );
              })}
              {shownMaterials.map(item => (
                <button key={item.id} onClick={() => setSelected(item)} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1727] px-4 py-3 text-left transition hover:border-cyan-200/40 hover:bg-[#102238]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-300/10 text-[10px] font-black text-indigo-200">{item.mime_type === 'application/pdf' ? 'PDF' : 'IMG'}</span>
                  <span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold">{item.title}</span><span className="mt-1 block text-[11px] text-slate-500">{item.subject} ・ {item.material_type} ・ {fileSize(item.file_size)}</span></span>
                  <span className="text-lg text-slate-500">›</span>
                </button>
              ))}
              {shownFolders.length === 0 && shownMaterials.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 px-4 py-12 text-center">
                  <div className="text-3xl">📂</div>
                  <p className="mt-3 text-sm font-semibold text-slate-300">{q ? '一致する資料がありません' : 'この場所に資料はありません'}</p>
                  <p className="mt-1 text-xs text-slate-500">{q ? '別のキーワードで検索してください。' : '別のフォルダーを開くか、一覧を更新してください。'}</p>
                </div>
              ) : null}
            </div>
            <p className="mt-5 border-t border-white/10 pt-4 text-center text-[10px] tracking-[0.18em] text-slate-600">CAMPUSSYNC ・ SCHOOL MATERIALS</p>
          </section>
        )}
      </div>
    </main>
  );
}
