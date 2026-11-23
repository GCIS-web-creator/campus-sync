'use client';

import React, { useEffect, useState } from 'react';
import { BookOpenCheck, FlaskConical, Languages } from 'lucide-react';
import MathPracticeHub from '@/components/MathPracticeHub';
import ChemistryPracticeHub from '@/components/ChemistryPracticeHub';
import EikenVocabAccessPanel from '@/components/EikenVocabAccessPanel';

export type LearningPracticeSection = 'math' | 'chemistry' | 'english';

type LearningPracticeHubProps = {
  userId: string;
  isDarkMode?: boolean;
  activeSection: LearningPracticeSection;
  onSectionChange: (section: LearningPracticeSection) => void;
};

const SECTIONS: {
  id: LearningPracticeSection;
  label: string;
  description: string;
  icon: typeof BookOpenCheck;
}[] = [
  { id: 'math', label: '数学', description: '数学I・A・II・B・III・C', icon: BookOpenCheck },
  { id: 'chemistry', label: '化学', description: '理論・無機・有機・高分子', icon: FlaskConical },
  { id: 'english', label: '英語', description: '英検単語・語彙トレーニング', icon: Languages },
];

export default function LearningPracticeHub({
  userId,
  isDarkMode = false,
  activeSection,
  onSectionChange,
}: LearningPracticeHubProps) {
  const [visited, setVisited] = useState<LearningPracticeSection[]>([activeSection]);
  const dark = isDarkMode;

  useEffect(() => {
    setVisited(current => current.includes(activeSection) ? current : [...current, activeSection]);
  }, [activeSection]);

  const selectSection = (section: LearningPracticeSection) => {
    setVisited(current => current.includes(section) ? current : [...current, section]);
    onSectionChange(section);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header className={'overflow-hidden rounded-3xl border p-4 shadow-sm sm:p-5 ' +
        (dark ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black tracking-[.2em] text-cyan-600">CAMPUSSYNC · LEARNING</p>
            <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">学習演習ラボ</h2>
            <p className={'mt-1 text-xs leading-5 sm:text-sm ' + (dark ? 'text-slate-400' : 'text-slate-500')}>
              数学・化学・英語の演習を、ひとつのタブから切り替えて利用できます。
            </p>
          </div>
          <span className={'rounded-full border px-3 py-1.5 text-[10px] font-bold ' +
            (dark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600')}>
            3 SUBJECTS
          </span>
        </div>
      </header>

      <nav
        aria-label="学習演習の科目"
        role="tablist"
        className="grid grid-cols-3 gap-2"
      >
        {SECTIONS.map(section => {
          const Icon = section.icon;
          const selected = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              id={`learning-practice-tab-${section.id}`}
              aria-controls={`learning-practice-panel-${section.id}`}
              aria-selected={selected}
              onClick={() => selectSection(section.id)}
              className={'flex min-h-[76px] min-w-0 items-center gap-2 rounded-2xl border p-2.5 text-left transition sm:min-h-[88px] sm:gap-3 sm:p-4 ' +
                (selected
                  ? 'border-cyan-600 bg-cyan-700 text-white shadow-lg shadow-cyan-900/10'
                  : dark
                    ? 'border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-500/70'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-400')}>
              <span className={'flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-11 ' +
                (selected ? 'bg-white/15 text-white' : dark ? 'bg-slate-800 text-cyan-300' : 'bg-cyan-50 text-cyan-700')}>
                <Icon size={20} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black sm:text-base">{section.label}</span>
                <span className={'mt-0.5 block text-[9px] leading-4 sm:text-[10px] ' +
                  (selected ? 'text-cyan-50' : dark ? 'text-slate-400' : 'text-slate-500')}>
                  {section.description}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0">
        {visited.includes('math') && (
          <section
            id="learning-practice-panel-math"
            role="tabpanel"
            aria-labelledby="learning-practice-tab-math"
            hidden={activeSection !== 'math'}
          >
            <MathPracticeHub userId={userId} isDarkMode={isDarkMode} />
          </section>
        )}
        {visited.includes('chemistry') && (
          <section
            id="learning-practice-panel-chemistry"
            role="tabpanel"
            aria-labelledby="learning-practice-tab-chemistry"
            hidden={activeSection !== 'chemistry'}
          >
            <ChemistryPracticeHub isDarkMode={isDarkMode} />
          </section>
        )}
        {visited.includes('english') && (
          <section
            id="learning-practice-panel-english"
            role="tabpanel"
            aria-labelledby="learning-practice-tab-english"
            hidden={activeSection !== 'english'}
          >
            <EikenVocabAccessPanel isDarkMode={isDarkMode} />
          </section>
        )}
      </div>
    </div>
  );
}
