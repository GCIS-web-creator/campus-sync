'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-center shadow-2xl sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-200"><SearchX size={31}/></div>
        <p className="mt-6 font-mono text-6xl font-black tracking-tight text-cyan-200">404</p>
        <h1 className="mt-3 text-xl font-black">ページが見つかりません</h1>
        <p className="mt-3 text-sm leading-7 text-slate-400">URLが変更されたか、ページが削除された可能性があります。入力したアドレスをご確認ください。</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950"><ArrowLeft size={15}/>CampusSyncへ戻る</Link>
          <button type="button" onClick={() => window.history.back()} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-slate-200">前のページへ</button>
        </div>
        <p className="mt-8 font-mono text-[10px] tracking-widest text-slate-600">CAMPUSSYNC / NOT FOUND</p>
      </section>
    </main>
  );
}
