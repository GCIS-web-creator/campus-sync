'use client';

import React, { useState } from 'react';
import { Calculator, FlaskConical } from 'lucide-react';
import MathPracticeHub from '@/components/MathPracticeHub';
import ChemistryRedoxPractice from '@/components/ChemistryRedoxPractice';

type PracticeSubject = 'chemistry' | 'math';

export default function PracticeLab({ userId, isDarkMode = false }: { userId: string; isDarkMode?: boolean }) {
  const [subject, setSubject] = useState<PracticeSubject>('chemistry');
  const dark = isDarkMode;
  const tabBase = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black transition';
  const active = dark ? 'border-cyan-400 bg-cyan-950 text-cyan-100' : 'border-cyan-700 bg-cyan-700 text-white shadow-sm';
  const inactive = dark ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className={'text-[10px] font-black tracking-[0.18em] ' + (dark ? 'text-cyan-300' : 'text-cyan-700')}>CAMPUSSYNC / PRACTICE LAB</div>
          <h1 className={'mt-1 text-xl font-black ' + (dark ? 'text-slate-100' : 'text-slate-900')}>演習ラボ</h1>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="演習科目">
          <button type="button" role="tab" aria-selected={subject === 'chemistry'} onClick={() => setSubject('chemistry')} className={tabBase + ' ' + (subject === 'chemistry' ? active : inactive)}><FlaskConical size={17} />化学</button>
          <button type="button" role="tab" aria-selected={subject === 'math'} onClick={() => setSubject('math')} className={tabBase + ' ' + (subject === 'math' ? active : inactive)}><Calculator size={17} />数学</button>
        </div>
      </header>
      {subject === 'chemistry'
        ? <ChemistryRedoxPractice userId={userId} isDarkMode={isDarkMode} />
        : <MathPracticeHub userId={userId} isDarkMode={isDarkMode} />}
    </div>
  );
}
