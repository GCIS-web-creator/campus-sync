'use client';

import { useState } from 'react';
import { Atom, BookOpenCheck, ExternalLink, FlaskConical, Layers3, Microscope, Sparkles } from 'lucide-react';
import KnowledgePracticePanel from '@/components/KnowledgePracticePanel';
import ChemistryRedoxPractice from '@/components/ChemistryRedoxPractice';

const COURSES = [
  {
    code: 'chem_theory',
    label: '理論化学',
    title: '理論化学演習',
    description: '原子・結合・物質量・気体・溶液・熱化学・反応速度・化学平衡・酸塩基・酸化還元・電気化学を横断して演習します。',
    icon: Atom,
  },
  {
    code: 'chem_inorganic',
    label: '無機化学',
    title: '無機化学演習',
    description: '非金属元素・典型金属・遷移元素・気体の製法・沈殿・イオンの分離・工業的製法を整理して解きます。',
    icon: FlaskConical,
  },
  {
    code: 'chem_organic',
    label: '有機化学',
    title: '有機化学演習',
    description: '官能基・脂肪族・芳香族・異性体・反応経路・構造決定などを基礎から入試レベルまで練習します。',
    icon: Microscope,
  },
  {
    code: 'chem_polymer',
    label: '高分子化学',
    title: '高分子化学演習',
    description: '単糖・二糖・多糖・アミノ酸・タンパク質・核酸・合成樹脂・合成繊維・ゴムを学びます。',
    icon: Layers3,
  },
  {
    code: 'chem_redox',
    label: '酸化還元',
    title: '酸化還元・半反応式',
    description: '電子の授受・酸化数・酸化剤と還元剤・半反応式・酸性条件のイオン反応式をタイル形式で練習します。',
    icon: Sparkles,
  },
] as const;

export default function ChemistryPracticeHub({ userId, isDarkMode = false }: { userId: string; isDarkMode?: boolean }) {
  const [activeCode, setActiveCode] = useState<(typeof COURSES)[number]['code']>('chem_theory');
  const active = COURSES.find(course => course.code === activeCode) || COURSES[0];
  const dark = isDarkMode;

  return (
    <div className="space-y-5">
      <header className="relative isolate overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-xl sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 size-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black tracking-[.22em] text-emerald-300"><FlaskConical size={13} /> CAMPUSSYNC LEARNING</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">化学演習ラボ</h2>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-300 sm:text-sm">理論・無機・有機・高分子を分野別に学習。回答・解説・正解履歴・知識XPは数学演習と共通の仕組みで記録します。</p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
            <BookOpenCheck size={18} className="text-emerald-300" />
            <div><p className="text-[10px] font-bold text-slate-300">学習形式</p><p className="text-sm font-black">基礎・応用・発展</p></div>
          </div>
        </div>
      </header>

      <nav aria-label="化学演習分野" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {COURSES.map(course => {
          const Icon = course.icon;
          const selected = activeCode === course.code;
          return (
            <button key={course.code} type="button" onClick={() => setActiveCode(course.code)}
              aria-pressed={selected}
              className={'min-h-24 rounded-2xl border p-3 text-left transition ' +
                (selected
                  ? 'border-emerald-500 bg-emerald-600 text-white shadow-lg shadow-emerald-900/10'
                  : dark ? 'border-slate-700 bg-slate-900 text-slate-200 hover:border-emerald-500/60' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-400')}>
              <Icon size={19} className={selected ? 'text-white' : 'text-emerald-600'} />
              <span className="mt-2 block text-sm font-black">{course.label}演習</span>
              <span className={'mt-1 block text-[10px] ' + (selected ? 'text-emerald-50' : dark ? 'text-slate-400' : 'text-slate-500')}>分野を切り替える</span>
            </button>
          );
        })}
      </nav>

      <section aria-live="polite" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black tracking-[.16em] text-emerald-600">SELECTED COURSE</p>
            <h3 className={'mt-1 text-xl font-black ' + (dark ? 'text-white' : 'text-slate-900')}>{active.title}</h3>
            <p className={'mt-1 max-w-3xl text-xs leading-6 ' + (dark ? 'text-slate-400' : 'text-slate-500')}>{active.description}</p>
          </div>
        </div>
        {active.code === 'chem_redox' ? (
          <ChemistryRedoxPractice userId={userId} isDarkMode={isDarkMode} />
        ) : (
          <KnowledgePracticePanel
            key={active.code}
            isDarkMode={isDarkMode}
            subjectGroup="chemistry"
            initialSubject={active.code}
            pageTitle={active.title}
            introText={active.description}
            hideSubjectFilter
          />
        )}
      </section>

      <section className={'rounded-2xl border p-4 ' + (dark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white')}>
        <h3 className={'text-sm font-black ' + (dark ? 'text-slate-100' : 'text-slate-900')}>参考にできる公開教材</h3>
        <p className={'mt-1 text-[11px] leading-5 ' + (dark ? 'text-slate-400' : 'text-slate-500')}>下記は単元確認・自主学習用の参考先です。CampusSync内の収録問題は独自に作成しており、各サイトの問題文を無断転載していません。</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <a href="https://ja.wikibooks.org/wiki/高等学校化学/演習" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-between gap-2 rounded-xl border border-slate-500/15 px-3 py-3 text-xs font-bold transition hover:border-emerald-500/50">
            Wikibooks 化学演習 <ExternalLink size={13} className="shrink-0" />
          </a>
          <a href="https://chemstudy.jp/quiz_setup" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-between gap-2 rounded-xl border border-slate-500/15 px-3 py-3 text-xs font-bold transition hover:border-emerald-500/50">
            ChemStudy 問題クイズ <ExternalLink size={13} className="shrink-0" />
          </a>
          <a href="https://ichigo-drill.jp/kagaku-print" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-between gap-2 rounded-xl border border-slate-500/15 px-3 py-3 text-xs font-bold transition hover:border-emerald-500/50">
            いちごドリル 化学プリント <ExternalLink size={13} className="shrink-0" />
          </a>
        </div>
        <p className={'mt-3 text-[10px] leading-5 ' + (dark ? 'text-slate-500' : 'text-slate-400')}>Wikibooksの再利用コンテンツを将来収録する場合は、ページごとのrevision・著者表示・CC BY-SA 4.0等のライセンス条件を記録し、派生物にも同じライセンスを適用します。</p>
      </section>
    </div>
  );
}
