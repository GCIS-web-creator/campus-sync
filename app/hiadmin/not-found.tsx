import React from 'react';
import Link from 'next/link';
import { ArrowLeft, LockKeyhole } from 'lucide-react';

export default function HiAdminNotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-white">
    <section className="w-full max-w-lg rounded-3xl border border-cyan-300/15 bg-slate-900 p-8 text-center">
      <LockKeyhole className="mx-auto text-cyan-200" size={32}/>
      <p className="mt-5 font-mono text-5xl font-black text-cyan-200">404</p>
      <h1 className="mt-3 text-xl font-black">最高管理者ページが見つかりません</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">指定されたHighAdminのページは存在しないか、公開されていません。</p>
      <Link href="/hiadmin" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950"><ArrowLeft size={15}/>HighAdminへ戻る</Link>
    </section>
  </main>;
}
