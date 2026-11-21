'use client';

import Link from 'next/link';
import KnowledgeQuestionAdmin from '@/components/KnowledgeQuestionAdmin';

export default function AdminKnowledgeQuestionsPage() {
  return <main className="min-h-screen bg-[#070d18] px-3 py-5 text-white sm:px-6 sm:py-8">
    <div className="mx-auto max-w-6xl">
      <Link href="/admin" className="mb-5 inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:border-cyan-500 hover:text-white">← Adminパネルへ戻る</Link>
      <KnowledgeQuestionAdmin/>
    </div>
  </main>;
}
