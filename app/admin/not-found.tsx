import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

export default function AdminNotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-white">
    <section className="w-full max-w-lg rounded-3xl border border-blue-300/15 bg-slate-900 p-8 text-center">
      <ShieldAlert className="mx-auto text-blue-200" size={32}/>
      <p className="mt-5 font-mono text-5xl font-black text-blue-200">404</p>
      <h1 className="mt-3 text-xl font-black">Adminのページが見つかりません</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">管理画面のURLを確認してください。</p>
      <Link href="/admin" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"><ArrowLeft size={15}/>Adminへ戻る</Link>
    </section>
  </main>;
}
