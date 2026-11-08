import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';

export default function LegalPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-cyan-700">
            <ArrowLeft size={16} /> CampusSyncへ戻る
          </Link>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <FileText size={15} /> CampusSync Legal
          </div>
        </div>

        <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-6 sm:p-9">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-800">
              <ShieldCheck size={13} /> 公開前確認用ドラフト
            </div>
            <p className="text-xs font-black tracking-[0.16em] text-cyan-700">CAMPUSSYNC</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{description}</p>
            <p className="mt-4 text-[11px] font-medium text-slate-500">草案作成日：2026年11月8日</p>
          </div>

          <div className="border-b border-amber-200 bg-amber-50 px-5 py-4 text-xs leading-6 text-amber-950 sm:px-9">
            このページは現在のCampusSyncの機能と設定をもとにした草案です。正式公開前に、運営者の正式名称・住所・問い合わせ先、学校との承認関係、外部サービスとの契約および海外での個人情報取扱いを確認してください。
          </div>

          <div className="p-5 sm:p-9">
            <article className="legal-document space-y-7 text-sm leading-7 text-slate-700">
              {children}
            </article>
          </div>
        </header>

        <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-bold text-slate-500">
          <Link href="/privacy" className="hover:text-cyan-700">プライバシーポリシー</Link>
          <Link href="/terms" className="hover:text-cyan-700">利用規約</Link>
          <Link href="/" className="hover:text-cyan-700">CampusSyncトップ</Link>
        </footer>
      </div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="border-b border-slate-200 pb-2 text-lg font-black text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export function LegalSubheading({ children }: { children: ReactNode }) {
  return <h3 className="pt-1 font-black text-slate-800">{children}</h3>;
}
