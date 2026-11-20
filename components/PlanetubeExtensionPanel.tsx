'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, ExternalLink, Puzzle, RefreshCw, ShieldCheck } from 'lucide-react';

type ExtensionBridgeMessage = {
  source?: string;
  type?: string;
  ok?: boolean;
  message?: string;
};

const PACKAGE_URL = '/downloads/youtubeseal-extension-1.2.1.zip';

export default function PlanetubeExtensionPanel() {
  const [installed, setInstalled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [opening, setOpening] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    const receive = (event: MessageEvent<ExtensionBridgeMessage>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.source !== 'youtube-seal-extension') return;
      if (event.data.type === 'READY' && mounted) {
        setInstalled(true);
        setChecking(false);
      }
      if (event.data.type === 'OPEN_RESULT' && mounted) {
        setOpening(false);
        setStatusMessage(
          event.data.ok
            ? 'YouTube封印タイマーを開きました。'
            : event.data.message || '拡張機能を開けませんでした。右上の拡張機能メニューから開いてください。'
        );
      }
    };

    window.addEventListener('message', receive);
    const discover = () => window.postMessage(
      { source: 'campussync', type: 'PLANETUBE_DISCOVER' },
      window.location.origin
    );
    discover();
    const retry = window.setInterval(discover, 700);
    const timeout = window.setTimeout(() => {
      if (mounted) setChecking(false);
      window.clearInterval(retry);
    }, 4200);

    return () => {
      mounted = false;
      window.removeEventListener('message', receive);
      window.clearInterval(retry);
      window.clearTimeout(timeout);
    };
  }, []);

  const openExtension = useCallback(() => {
    setOpening(true);
    setStatusMessage('');
    const requestId = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    window.postMessage(
      { source: 'campussync', type: 'PLANETUBE_OPEN', requestId },
      window.location.origin
    );
    window.setTimeout(() => {
      setOpening(current => {
        if (current) setStatusMessage('応答がありません。拡張機能を再読み込みするか、右上の拡張機能メニューから開いてください。');
        return false;
      });
    }, 2500);
  }, []);

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-700 bg-[#08172f] p-4 text-white shadow-2xl sm:p-6">
      <div className="relative overflow-hidden rounded-2xl border border-cyan-100/10 bg-[radial-gradient(ellipse_at_80%_0%,rgba(70,113,219,.26),transparent_48%),linear-gradient(135deg,#172b4b,#0b1c36_65%,#11153a)] p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl"/>
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-300/10 text-cyan-100">
              <Puzzle size={25}/>
            </div>
            <div>
              <p className="text-[9px] font-black tracking-[.22em] text-cyan-200">PLANETUBE EXTENSION</p>
              <h2 className="mt-1 text-lg font-black sm:text-xl">YouTube封印タイマー</h2>
              <p className="mt-1 text-[10px] text-slate-300">拡張機能をCampusSyncから起動・インストール</p>
            </div>
          </div>
          <div className={'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold ' + (
            installed
              ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200'
              : checking
                ? 'border-slate-400/20 bg-slate-300/10 text-slate-300'
                : 'border-amber-200/20 bg-amber-200/10 text-amber-100'
          )}>
            <span className={'h-1.5 w-1.5 rounded-full ' + (installed ? 'bg-emerald-300' : checking ? 'animate-pulse bg-slate-300' : 'bg-amber-300')}/>
            {installed ? 'インストール済み' : checking ? '確認中' : '未検出'}
          </div>
        </div>
        <p className="relative mt-4 max-w-2xl text-xs leading-6 text-slate-300">
          PlanetubeのYouTube封印タイマーをChromeに追加すると、YouTubeへのアクセス制限と封印セッションのクラウド同期を利用できます。CampusSyncから拡張機能のポップアップを直接開けます。
        </p>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openExtension}
            disabled={!installed || opening}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-[#07172e] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {opening ? <RefreshCw size={15} className="animate-spin"/> : <ExternalLink size={15}/>}
            {opening ? '起動しています…' : '拡張機能を開く'}
          </button>
          <a
            href={PACKAGE_URL}
            download="YoutubeSeal-extension-1.2.1.zip"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-black text-white transition hover:bg-white/10"
          >
            <ArrowDownToLine size={15}/> インストールパッケージ
          </a>
          <button
            type="button"
            onClick={() => setShowGuide(value => !value)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-bold text-slate-200 transition hover:bg-white/10"
          >
            {showGuide ? '手順を閉じる' : 'インストール方法'}
          </button>
        </div>
        {statusMessage && <p role="status" className="relative mt-3 rounded-lg border border-cyan-200/15 bg-cyan-200/5 px-3 py-2 text-[10px] leading-5 text-cyan-100">{statusMessage}</p>}
      </div>

      {showGuide && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#102443] p-4">
          <div className="flex items-center gap-2 text-cyan-200">
            <ShieldCheck size={17}/>
            <h3 className="text-sm font-black">Chromeへのインストール</h3>
          </div>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-6 text-slate-300">
            <li>上の「インストールパッケージ」をダウンロードして解凍します。</li>
            <li><code className="rounded bg-black/25 px-1.5 py-0.5 text-cyan-100">chrome://extensions</code> をChromeで開きます。</li>
            <li>右上の「デベロッパーモード」をオンにします。</li>
            <li>「パッケージ化されていない拡張機能を読み込む」を選び、解凍した <code className="rounded bg-black/25 px-1.5 py-0.5 text-cyan-100">YoutubeSeal-main</code> フォルダを指定します。</li>
            <li>拡張機能のアイコンをツールバーに固定すると、次回からも簡単に開けます。</li>
          </ol>
          <p className="mt-3 text-[10px] leading-5 text-amber-100/90">
            すでに旧版を使っている場合は、元のインストール先フォルダを維持したままファイルを更新して「再読み込み」してください。読み込み元フォルダが変わると拡張機能IDが変わり、保存済みの封印状態を引き継げない場合があります。
          </p>
          <p className="mt-3 text-[10px] leading-5 text-slate-400">
            現在の配布パッケージにはChromeウェブストアの公開URLが含まれていないため、上記の手動インストール方式です。ウェブストア公開後は、ここをストアのインストールリンクに切り替えられます。
          </p>
          <a href="chrome://extensions/" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-cyan-100 hover:bg-white/10">
            Chrome拡張機能の管理画面を開く <ExternalLink size={12}/>
          </a>
        </div>
      )}
    </section>
  );
}
