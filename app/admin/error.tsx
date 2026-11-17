'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-white">
    <section className="w-full max-w-lg rounded-3xl border border-rose-300/15 bg-slate-900 p-8 text-center">
      <AlertTriangle className="mx-auto text-rose-200" size={30}/>
      <h1 className="mt-5 text-xl font-black">Adminの表示で問題が発生しました</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">操作内容は保存されていない可能性があります。再読み込みして状態を確認してください。</p>
      <button onClick={reset} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"><RefreshCw size={15}/>再試行</button>
    </section>
  </main>;
}
