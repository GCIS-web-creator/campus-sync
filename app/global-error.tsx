'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch('/api/system/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        digest: error.digest || '',
        message: error.message || 'アプリケーション全体の描画中にエラーが発生しました。',
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error.digest, error.message]);

  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-950 text-white">
        <main className="flex min-h-screen items-center justify-center px-5 py-10">
          <section className="w-full max-w-xl rounded-3xl border border-rose-300/15 bg-white/[0.04] p-7 text-center shadow-2xl sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-300/10 text-rose-200"><AlertTriangle size={30}/></div>
            <h1 className="mt-6 text-xl font-black">CampusSyncを表示できません</h1>
            <p className="mt-3 text-sm leading-7 text-slate-400">アプリケーション全体の読み込みで問題が発生しました。再試行してください。何度も続く場合は管理者にエラー識別番号を伝えてください。</p>
            {error.digest && <p className="mt-4 break-all font-mono text-[10px] text-slate-600">エラー識別番号：{error.digest}</p>}
            <button type="button" onClick={() => reset()} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950"><RefreshCw size={15}/>再試行する</button>
          </section>
        </main>
      </body>
    </html>
  );
}
