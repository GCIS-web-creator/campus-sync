'use client';

import React, { useState } from 'react';
import { ArrowDownToLine, ExternalLink, Puzzle, ShieldCheck } from 'lucide-react';

const REPOSITORY_URL = 'https://github.com/qkiaka/YoutubeSeal';
const DOWNLOAD_URL = 'https://github.com/qkiaka/YoutubeSeal/archive/refs/heads/main.zip';

export default function PlanetubeExtensionPanel() {
  const [showGuide, setShowGuide] = useState(true);

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-700 bg-[#08172f] p-4 text-white shadow-2xl sm:p-6">
      <div className="relative overflow-hidden rounded-2xl border border-cyan-100/10 bg-[radial-gradient(ellipse_at_80%_0%,rgba(70,113,219,.26),transparent_48%),linear-gradient(135deg,#172b4b,#0b1c36_65%,#11153a)] p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl"/>
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-300/10 text-cyan-100">
            <Puzzle size={25}/>
          </div>
          <div>
            <p className="text-[9px] font-black tracking-[.22em] text-cyan-200">PLANETUBE EXTENSION</p>
            <h2 className="mt-1 text-lg font-black sm:text-xl">YouTube封印タイマー</h2>
            <p className="mt-1 text-[10px] text-slate-300">Chrome拡張機能をインストール・起動</p>
          </div>
        </div>
        <p className="relative mt-4 max-w-2xl text-xs leading-6 text-slate-300">
          PlanetubeのYouTube封印タイマーをChromeに追加して、封印タイマーを利用できます。Planetube本体は変更せず、ここから公式ソースとインストール手順へ案内します。
        </p>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <a
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-[#07172e] transition hover:bg-cyan-100"
          >
            <ArrowDownToLine size={15}/> 拡張機能をダウンロード
          </a>
          <a
            href="chrome://extensions/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-black text-white transition hover:bg-white/10"
          >
            <ExternalLink size={15}/> インストール済みの拡張機能を開く
          </a>
          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-bold text-slate-200 transition hover:bg-white/10"
          >
            <ExternalLink size={14}/> 配布元を確認
          </a>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#102443] p-4">
        <button
          type="button"
          onClick={() => setShowGuide(value => !value)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={showGuide}
        >
          <span className="flex items-center gap-2 text-cyan-200">
            <ShieldCheck size={17}/>
            <span className="text-sm font-black">Chromeへのインストール方法</span>
          </span>
          <span className="text-xs font-bold text-slate-400">{showGuide ? '閉じる −' : '表示 ＋'}</span>
        </button>
        {showGuide && (
          <>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-6 text-slate-300">
              <li>「拡張機能をダウンロード」からZIPを取得して解凍します。</li>
              <li><code className="rounded bg-black/25 px-1.5 py-0.5 text-cyan-100">chrome://extensions</code> をChromeで開きます。</li>
              <li>右上の「デベロッパーモード」をオンにします。</li>
              <li>「パッケージ化されていない拡張機能を読み込む」を選び、解凍した <code className="rounded bg-black/25 px-1.5 py-0.5 text-cyan-100">YoutubeSeal-main</code> フォルダを指定します。</li>
              <li>インストール後は、Chrome右上の拡張機能アイコンから「YouTube封印タイマー」を開けます。よく使う場合はツールバーに固定してください。</li>
            </ol>
            <p className="mt-3 text-[10px] leading-5 text-amber-100/90">
              すでにインストール済みなら、削除して入れ直す必要はありません。Chrome右上の拡張機能アイコンから開いてください。更新時は同じインストール元フォルダを維持して「再読み込み」してください。
            </p>
            <p className="mt-3 text-[10px] leading-5 text-slate-400">
              現在、Chromeウェブストアの公開ページは確認できていないため、GitHubの配布ZIPを使う手動インストール方式です。ブラウザの制限によりWebページから拡張機能のポップアップを直接強制表示することはできないため、インストール済みの場合はChromeの拡張機能メニューから起動します。
            </p>
          </>
        )}
      </div>
    </section>
  );
}
