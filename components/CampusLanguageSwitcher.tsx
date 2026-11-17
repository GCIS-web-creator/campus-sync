'use client';

import { Languages } from 'lucide-react';
import { CAMPUS_LANGUAGES } from '@/lib/campus-i18n';
import { useCampusLanguage } from '@/components/CampusLanguageProvider';

export default function CampusLanguageSwitcher({ compact = false, className = '' }: {
  compact?: boolean;
  className?: string;
}) {
  const { language, setLanguage, translate } = useCampusLanguage();
  return (
    <label className={'inline-flex min-w-0 items-center gap-1.5 ' + className} dir="ltr">
      <Languages size={16} className="shrink-0 text-slate-500" aria-hidden="true" />
      <span className="sr-only">{translate('表示言語')}</span>
      <select
        value={language}
        onChange={event => setLanguage(event.target.value as typeof language)}
        aria-label={translate('表示言語')}
        className={
          (compact ? 'w-[48px] ' : 'w-full min-w-0 flex-1 ') +
          'h-9 rounded-lg border border-slate-200 bg-white px-1.5 text-xs font-extrabold text-slate-700 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100'
        }
      >
        {CAMPUS_LANGUAGES.map(item => (
          <option key={item.code} value={item.code}>{item.code.toUpperCase()}</option>
        ))}
      </select>
    </label>
  );
}
