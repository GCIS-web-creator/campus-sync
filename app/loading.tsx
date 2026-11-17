import React from 'react';
import { LoaderCircle } from 'lucide-react';

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
      <section role="status" aria-live="polite" className="flex w-full max-w-sm flex-col items-center rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-200">
          <LoaderCircle className="animate-spin" size={28}/>
        </div>
        <p className="text-xs font-black tracking-[0.25em] text-cyan-200">CAMPUSSYNC</p>
        <h1 className="mt-3 text-lg font-black">画面を準備しています</h1>
        <p className="mt-2 text-xs leading-6 text-slate-400">必要なデータを確認しています。画面が切り替わるまでそのままお待ちください。</p>
      </section>
    </main>
  );
}
