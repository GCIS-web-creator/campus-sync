import React from 'react';
import { LoaderCircle, LockKeyhole } from 'lucide-react';

export default function HiAdminLoading() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
    <section role="status" className="flex w-full max-w-sm flex-col items-center rounded-3xl border border-cyan-300/15 bg-slate-900 p-8 text-center">
      <div className="relative"><LockKeyhole size={28} className="text-cyan-200"/><LoaderCircle size={14} className="absolute -bottom-2 -right-3 animate-spin text-cyan-300"/></div>
      <h1 className="mt-4 text-sm font-black">HighAdminを準備しています</h1>
      <p className="mt-2 text-xs leading-5 text-slate-500">認証状態と保護された管理機能を確認しています。</p>
    </section>
  </main>;
}
