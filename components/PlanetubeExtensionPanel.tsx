'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  ExternalLink,
  FolderOpen,
  Info,
  Laptop,
  Monitor,
  Puzzle,
  Share2,
  ShieldAlert,
  Smartphone,
  Tablet,
} from 'lucide-react';

const REPOSITORY_URL = 'https://github.com/qkiaka/YoutubeSeal';
const DOWNLOAD_URL = 'https://github.com/qkiaka/YoutubeSeal/archive/refs/heads/main.zip';

type DeviceKind = 'phone' | 'tablet' | 'desktop';
type BrowserKind = 'chrome' | 'edge' | 'firefox' | 'safari' | 'other';
type PlatformKind = 'windows' | 'mac' | 'chromeos' | 'linux' | 'other';
type Environment = {
  device: DeviceKind;
  browser: BrowserKind;
  platform: PlatformKind;
};

const browserLabels: Record<BrowserKind, string> = {
  chrome: 'Google Chrome',
  edge: 'Microsoft Edge',
  firefox: 'Firefox',
  safari: 'Safari',
  other: 'その他のブラウザー',
};

const platformLabels: Record<PlatformKind, string> = {
  windows: 'Windows',
  mac: 'macOS',
  chromeos: 'Chromebook',
  linux: 'Linux',
  other: 'パソコン',
};

function detectEnvironment(): Environment {
  const ua = navigator.userAgent;
  const lower = ua.toLowerCase();
  const isIPad = /ipad/.test(lower) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isPhone = /iphone|ipod|android.*mobile|windows phone/.test(lower);
  const isTablet = isIPad || /android(?!.*mobile)/.test(lower);
  const browser: BrowserKind = /edg\//i.test(ua)
    ? 'edge'
    : /firefox\//i.test(ua)
      ? 'firefox'
      : /safari\//i.test(ua) && !/chrome|crios|android/i.test(ua)
        ? 'safari'
        : /chrome|crios/i.test(ua)
          ? 'chrome'
          : 'other';
  const platform: PlatformKind = /cros/i.test(ua)
    ? 'chromeos'
    : /windows/i.test(ua)
      ? 'windows'
      : /macintosh|mac os/i.test(ua)
        ? 'mac'
        : /linux/i.test(ua)
          ? 'linux'
          : 'other';

  return {
    device: isPhone ? 'phone' : isTablet ? 'tablet' : 'desktop',
    browser,
    platform,
  };
}

function getExtractInstruction(platform: PlatformKind): string {
  switch (platform) {
    case 'windows':
      return 'エクスプローラーで「ダウンロード」を開き、ZIPファイルを右クリックして「すべて展開」を選びます。';
    case 'mac':
      return 'Finderで「ダウンロード」を開き、ZIPファイルをダブルクリックして展開します。';
    case 'chromeos':
      return 'Filesアプリで「ダウンロード」を開き、ZIPファイルを右クリックして「展開」を選びます。';
    default:
      return 'ダウンロードしたZIPファイルを、パソコンのファイルアプリで展開します。';
  }
}

const steps = [
  {
    title: '拡張機能のZIPをダウンロード',
    description: '公開元のGitHubから、現在公開されているファイル一式を取得します。',
    detail: 'ダウンロード後、ZIPファイルが保存されていることを確認してください。',
  },
  {
    title: 'ZIPファイルを展開',
    description: 'ZIPを展開して、フォルダーとして開ける状態にします。',
    detail: '展開したフォルダーの中に manifest.json があることを確認します。manifest.json がさらに別のフォルダーの中にある場合は、そのフォルダーを選びます。',
  },
  {
    title: '拡張機能の管理画面を開く',
    description: 'ChromeまたはEdgeの拡張機能管理画面を開きます。',
    detail: 'このページのボタンから管理画面へ移動できます。導入手順を見ながら操作する場合は、先にこのページを別タブで開いておくと便利です。',
  },
  {
    title: 'デベロッパーモードを有効にして読み込む',
    description: '管理画面でデベロッパーモードをオンにし、「パッケージ化されていない拡張機能を読み込む」を選びます。',
    detail: '手順2で展開したフォルダーのうち、manifest.json が直接入っているフォルダーを選択します。ZIPファイルそのものや manifest.json 単体を選ばないでください。',
  },
  {
    title: '追加されたことを確認',
    description: '拡張機能一覧に「YouTube封印タイマー」が表示されていることを確認します。',
    detail: 'ブラウザー上部のパズル型アイコンから拡張機能を固定できます。初回設定画面が開いたら、表示される解除コードを画面を閉じる前に安全な場所へ保管してください。',
  },
];

export default function PlanetubeExtensionPanel() {
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [shareMessage, setShareMessage] = useState('');

  useEffect(() => {
    setEnvironment(detectEnvironment());
  }, []);

  const isMobile = environment?.device !== 'desktop';
  const isSupportedDesktopBrowser = environment?.browser === 'chrome' || environment?.browser === 'edge';
  const settingsUrl = environment?.browser === 'edge' ? 'edge://extensions/' : 'chrome://extensions/';
  const completedCount = completedSteps.length;
  const progress = useMemo(() => Math.round(completedCount / steps.length * 100), [completedCount]);

  const toggleComplete = (index: number) => {
    setCompletedSteps(current => current.includes(index)
      ? current.filter(item => item !== index)
      : [...current, index]);
  };

  const shareSetupPage = async () => {
    const url = window.location.origin + '/planetube';
    setShareMessage('');
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Planetube 導入センター',
          text: 'パソコンでPlanetubeを導入するための手順ページです。',
          url,
        });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareMessage('導入ページのリンクをコピーしました。パソコンで開いてください。');
        return;
      }
      setShareMessage('次のURLをコピーして、パソコンで開いてください：' + url);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setShareMessage('共有を開けませんでした。次のURLをコピーしてパソコンで開いてください：' + url);
    }
  };

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-700 bg-[#07172e] text-white shadow-2xl">
      <div className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(ellipse_at_85%_0%,rgba(34,211,238,.22),transparent_38%),linear-gradient(135deg,#17365c,#0b1d39_58%,#151e49)] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-blue-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-100/20 bg-cyan-200/10 text-cyan-100 shadow-lg shadow-cyan-950/30">
            <Puzzle size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black tracking-[.24em] text-cyan-200">CAMPUSSYNC · EXTENSION CENTER</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Planetube</h1>
            <p className="mt-1 text-xs text-slate-300">YouTube封印タイマー · 導入センター</p>
          </div>
          <span className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-bold text-cyan-100">
            公式ストア外の導入ガイド
          </span>
        </div>
        <p className="relative mt-5 max-w-2xl text-sm leading-7 text-slate-200">
          端末に合った導入方法を案内します。パソコンでは順番に操作するだけ。スマートフォンでは、現在できることと制限を分かりやすく確認できます。
        </p>
        {environment && (
          <div className="relative mt-4 inline-flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[11px] text-slate-200">
            {isMobile ? <Smartphone size={15} /> : <Monitor size={15} />}
            <span>{isMobile ? 'スマートフォン・タブレット' : 'パソコン'}</span>
            <span className="text-slate-500">·</span>
            <span>{browserLabels[environment.browser]}</span>
            <span className="text-slate-500">·</span>
            <span>{platformLabels[environment.platform]}</span>
          </div>
        )}
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        {!environment ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-300">
            この端末に合った導入方法を確認しています…
          </div>
        ) : isMobile ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 shrink-0 text-amber-200" size={21} />
                <div>
                  <h2 className="font-black text-amber-100">このスマートフォンには、現在の拡張機能を直接インストールできません</h2>
                  <p className="mt-2 text-xs leading-6 text-amber-50/85">
                    現在公開されているPlanetubeはChrome向けの拡張機能です。Android版Chromeではパソコン用のChrome拡張機能を追加できず、iPhone・iPad向けのSafari版もまだ用意されていません。
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-200/15 bg-[#102746] p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Share2 className="text-cyan-200" size={19} />
                <h2 className="font-black">パソコンに導入ページを送る</h2>
              </div>
              <p className="mt-2 text-xs leading-6 text-slate-300">
                スマートフォンから導入ページを共有して、パソコンで開いてください。パソコン版の手順に沿って導入できます。
              </p>
              <button
                type="button"
                onClick={() => void shareSetupPage()}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-[#07172e] transition hover:bg-cyan-100"
              >
                <Share2 size={16} /> 導入ページを共有する
              </button>
              {shareMessage && (
                <p role="status" className="mt-3 break-all rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-cyan-100">
                  {shareMessage}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2">
                {environment.device === 'tablet' ? <Tablet size={18} className="text-slate-300" /> : <Smartphone size={18} className="text-slate-300" />}
                <h3 className="text-sm font-black">スマートフォン版について</h3>
              </div>
              {environment.device === 'phone' && /android/i.test(navigator.userAgent) ? (
                <p className="mt-2 text-xs leading-6 text-slate-300">
                  AndroidではFirefoxなど一部ブラウザーが拡張機能に対応していますが、現在のPlanetubeはFirefox向けとして公開・動作確認されていません。対応していると確認できるまでは、スマホで利用できるとは案内しません。
                </p>
              ) : (
                <p className="mt-2 text-xs leading-6 text-slate-300">
                  iPhone・iPadでSafari拡張機能を配布するには、iOS向けアプリに拡張機能を組み込むなど、別の配布準備が必要です。現在のChrome向けファイルをそのまま追加することはできません。
                </p>
              )}
              <p className="mt-3 text-[11px] leading-5 text-slate-400">
                このページをホーム画面に追加しても、追加されるのはCampusSyncへのショートカットです。PlanetubeのYouTube制御機能がスマートフォンに追加されるわけではありません。
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!isSupportedDesktopBrowser && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                <Info className="mt-0.5 shrink-0 text-amber-200" size={19} />
                <div>
                  <p className="text-sm font-black text-amber-100">ChromeまたはMicrosoft Edgeで開いてください</p>
                  <p className="mt-1 text-xs leading-5 text-amber-50/80">
                    現在のブラウザーは、このChrome拡張機能の読み込み対象ではありません。ChromeまたはEdgeでこのページを開き直してください。
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-cyan-200/15 bg-[#102746] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black tracking-[.18em] text-cyan-200">INSTALLATION PROGRESS</p>
                  <h2 className="mt-1 text-lg font-black">導入ガイド</h2>
                  <p className="mt-1 text-xs text-slate-300">5つの手順で設定します</p>
                </div>
                <div className="rounded-2xl border border-cyan-100/15 bg-cyan-300/10 px-4 py-2 text-right">
                  <p className="text-[10px] text-cyan-100/70">手順チェック</p>
                  <p className="text-xl font-black tabular-nums text-cyan-100">{completedCount}<span className="text-xs text-cyan-100/70"> / 5</span></p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-300 transition-all duration-300" style={{ width: progress + '%' }} />
              </div>
            </div>

            <div className="space-y-3">
              {steps.map((step, index) => {
                const isDone = completedSteps.includes(index);
                const isActive = activeStep === index;
                return (
                  <article key={step.title} className={'overflow-hidden rounded-2xl border transition ' + (isActive ? 'border-cyan-300/35 bg-[#102746]' : 'border-white/10 bg-white/[.035]')}>
                    <div className="flex items-center gap-3 p-4">
                      <div className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ' + (isDone ? 'bg-emerald-300/15 text-emerald-200' : isActive ? 'bg-cyan-300 text-[#07172e]' : 'bg-white/10 text-slate-300')}>
                        {isDone ? <Check size={18} /> : String(index + 1).padStart(2, '0')}
                      </div>
                      <button type="button" onClick={() => setActiveStep(index)} className="min-w-0 flex-1 text-left" aria-expanded={isActive}>
                        <p className="text-sm font-black">{step.title}</p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-400">{step.description}</p>
                      </button>
                      <button type="button" onClick={() => toggleComplete(index)} className={'shrink-0 rounded-lg px-2.5 py-2 text-[10px] font-black ' + (isDone ? 'bg-emerald-300/15 text-emerald-200' : 'border border-white/10 text-slate-300')} aria-label={isDone ? '手順チェックを解除' : 'この手順を完了としてチェック'}>
                        {isDone ? '完了' : 'チェック'}
                      </button>
                    </div>
                    {isActive && (
                      <div className="border-t border-white/10 px-4 pb-4 pt-3 pl-16">
                        <p className="text-xs leading-6 text-slate-200">{index === 1 ? getExtractInstruction(environment.platform) + ' ' : ''}{step.detail}</p>
                        {index === 0 && (
                          <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-[#07172e] hover:bg-cyan-100 sm:w-auto">
                            <ArrowDownToLine size={15} /> ZIPをダウンロード
                          </a>
                        )}
                        {index === 2 && isSupportedDesktopBrowser && (
                          <a href={settingsUrl} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-100/20 bg-cyan-300/10 px-4 py-3 text-xs font-black text-cyan-100 hover:bg-cyan-300/15 sm:w-auto">
                            <ExternalLink size={15} /> {environment.browser === 'edge' ? 'Edgeの拡張機能画面を開く' : 'Chromeの拡張機能画面を開く'}
                          </a>
                        )}
                        {index === 2 && !isSupportedDesktopBrowser && (
                          <p className="mt-3 rounded-xl bg-black/20 p-3 text-[11px] leading-5 text-amber-100">ChromeまたはEdgeでこのページを開いた後、もう一度この手順に戻ってください。</p>
                        )}
                        {index === 3 && (
                          <div className="mt-3 rounded-xl border border-amber-200/15 bg-amber-200/5 p-3 text-[11px] leading-5 text-amber-50/90">
                            この操作では、Chrome Web Storeの「追加」確認画面は表示されません。ストア外のため、デベロッパーモードから読み込む方法になります。
                          </div>
                        )}
                        {index === 4 && (
                          <a href={isSupportedDesktopBrowser ? settingsUrl : 'https://support.google.com/chrome/answer/187443?hl=ja'} target={isSupportedDesktopBrowser ? undefined : '_blank'} rel={isSupportedDesktopBrowser ? undefined : 'noopener noreferrer'} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-bold text-slate-200 hover:bg-white/10">
                            <ExternalLink size={14} /> 拡張機能一覧を確認する
                          </a>
                        )}
                        <div className="mt-4 flex flex-wrap justify-between gap-2">
                          <button type="button" onClick={() => setActiveStep(Math.max(0, index - 1))} disabled={index === 0} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[11px] font-bold text-slate-400 disabled:opacity-30">
                            <ArrowLeft size={13} /> 前の手順
                          </button>
                          <button type="button" onClick={() => setActiveStep(Math.min(steps.length - 1, index + 1))} disabled={index === steps.length - 1} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-30">
                            次の手順 <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {completedCount === steps.length && (
              <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200/20 bg-emerald-300/10 p-4">
                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-200" size={20} />
                <div>
                  <p className="text-sm font-black text-emerald-100">導入手順のチェックが完了しました</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-50/80">これは手順の自己チェックです。CampusSyncのWebページから拡張機能のインストール状態を直接読み取っているわけではありません。</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/[.035]">
          <button type="button" onClick={() => setShowDetails(value => !value)} aria-expanded={showDetails} className="flex w-full items-center justify-between gap-3 p-4 text-left">
            <span className="flex items-center gap-2 text-sm font-black"><CircleHelp size={17} className="text-cyan-200" />導入前に確認すること</span>
            <ChevronDown size={17} className={'text-slate-400 transition-transform ' + (showDetails ? 'rotate-180' : '')} />
          </button>
          {showDetails && (
            <div className="space-y-3 border-t border-white/10 px-4 pb-4 pt-3 text-xs leading-6 text-slate-300">
              <p>このページはCampusSyncによる導入案内です。拡張機能本体の開発・更新・配布は公開元リポジトリの管理者が行っており、CampusSyncが開発元や公式ストアであることを意味しません。</p>
              <p>現在公開されている拡張機能は、YouTubeへのアクセス制御と封印記録の同期を行います。storage、webNavigation、tabs、alarms の権限と、Supabaseへの通信許可が設定されています。導入前に公開元と権限を確認してください。</p>
              <p>初回設定時に解除コードが一度だけ表示される仕様です。画面を閉じる前に、本人が安全な場所へ保管してください。</p>
              <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-bold text-cyan-200 underline underline-offset-4">
                <FolderOpen size={14} /> 公開元のGitHubリポジトリを確認 <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <p className="max-w-xl text-[10px] leading-5 text-slate-500">Chrome Web Store外のため、通常の「Chromeに追加」ボタンやネイティブ確認画面は利用できません。Chrome・Edgeの開発者向け読み込み機能を使用します。</p>
          <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-cyan-200 hover:text-white">
            公開元 <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </section>
  );
}
