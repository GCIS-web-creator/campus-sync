import type { Metadata } from 'next';
import Link from 'next/link';
import PlanetubeExtensionPanel from '@/components/PlanetubeExtensionPanel';

export const metadata: Metadata = {
  title: 'Planetube 導入センター | CampusSync',
  description: '端末に合わせてYouTube封印タイマーの導入方法を案内します。',
  robots: {
    index: true,
    follow: true,
  },
};

export default function PlanetubeInstallPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-3 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10">
            <span aria-hidden="true">←</span> CampusSyncに戻る
          </Link>
          <span className="text-[10px] font-black tracking-[.2em] text-slate-500">PUBLIC INSTALL GUIDE</span>
        </header>
        <PlanetubeExtensionPanel />
        <p className="mx-auto mt-5 max-w-2xl text-center text-[10px] leading-5 text-slate-500">
          CampusSyncは導入手順を案内しています。拡張機能本体の提供・更新・互換性は公開元の管理者に帰属します。
        </p>
      </div>
    </main>
  );
}
