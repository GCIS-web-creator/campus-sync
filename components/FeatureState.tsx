'use client';

import React from 'react';
import { AlertTriangle, Inbox, LoaderCircle, RefreshCw } from 'lucide-react';

type FeatureStateProps = {
  state: 'loading' | 'empty' | 'error';
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  dark?: boolean;
};

export default function FeatureState({
  state,
  title,
  description,
  onRetry,
  retryLabel = 'もう一度読み込む',
  compact = false,
  dark = false,
}: FeatureStateProps) {
  const icon = state === 'loading' ? <LoaderCircle className="animate-spin" size={compact ? 18 : 26}/> :
    state === 'empty' ? <Inbox size={compact ? 18 : 26}/> : <AlertTriangle size={compact ? 18 : 26}/>;
  const defaults = {
    loading: ['読み込み中です', 'データを確認しています。'],
    empty: ['データがありません', '現在表示できる情報はありません。'],
    error: ['読み込みに失敗しました', '通信状態を確認して、もう一度お試しください。'],
  } as const;
  const [defaultTitle, defaultDescription] = defaults[state];
  return (
    <section role={state === 'error' ? 'alert' : 'status'} aria-live="polite"
      className={'flex flex-col items-center justify-center text-center ' +
        (compact ? 'gap-2 rounded-xl border p-5 ' + (dark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700') : 'gap-3 rounded-2xl border p-8 shadow-sm ' + (dark ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-700'))}>
      <span className={state === 'error' ? 'text-rose-500' : state === 'empty' ? 'text-slate-400' : 'text-cyan-600'}>{icon}</span>
      <h3 className="text-sm font-black">{title || defaultTitle}</h3>
      <p className={'max-w-xl text-xs leading-6 ' + (dark ? 'text-slate-400' : 'text-slate-500')}>{description || defaultDescription}</p>
      {state === 'error' && onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">
          <RefreshCw size={13}/>{retryLabel}
        </button>
      )}
    </section>
  );
}
