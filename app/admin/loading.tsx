import React from 'react';
import { LoaderCircle } from 'lucide-react';

export default function AdminLoading() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
    <section role="status" className="flex w-full max-w-sm flex-col items-center rounded-3xl border border-white/10 bg-slate-900 p-8 text-center">
      <LoaderCircle size={28} className="animate-spin text-blue-300"/>
      <h1 className="mt-4 text-sm font-black">Adminを準備しています</h1>
      <p className="mt-2 text-xs leading-5 text-slate-500">管理データと認証状態を確認しています。</p>
    </section>
  </main>;
}
