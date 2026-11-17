'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function HiAdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-white">
    <section className="w-full max-w-lg rounded-3xl border border-rose-300/15 bg-slate-900 p-8 text-center">
      <AlertTriangle className="mx-auto text-rose-200" size={30}/>
      <h1 className="mt-5 text-xl font-black">HighAdminの処理を完了できませんでした</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">認証状態と監査ログを確認したうえで、もう一度お試しください。秘密情報は画面に表示しません。</p>
      <button onClick={reset} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950"><RefreshCw size={15}/>再試行</button>
    </section>
  </main>;
}
