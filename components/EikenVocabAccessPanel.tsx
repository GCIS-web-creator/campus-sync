'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle, BookOpenCheck, ExternalLink,
  Globe2, LoaderCircle, LockKeyhole, LogOut, ShieldCheck,
} from 'lucide-react';

const EIKEN_VOCAB_URL = 'https://eiken-vocab-vert.vercel.app/';

type AccessState = 'checking' | 'locked' | 'authenticated' | 'unconfigured' | 'error';

export default function EikenVocabAccessPanel({ isDarkMode = false }: { isDarkMode?: boolean }) {
  const [state, setState] = useState<AccessState>('checking');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const dark = isDarkMode;
  const panel = dark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const input = dark
    ? 'border-slate-700 bg-slate-950 text-white placeholder:text-slate-600'
    : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400';

  useEffect(() => {
    let active = true;
    fetch('/api/eiken-vocab/access', { method: 'GET', credentials: 'same-origin', cache: 'no-store' })
      .then(async response => {
        const data = await response.json().catch(() => null);
        if (!active) return;
        if (data?.authenticated) setState('authenticated');
        else if (data?.configured === false) {
          setState('unconfigured');
          setMessage('サーバー側のパスワード設定が必要です。');
        } else if (response.ok) setState('locked');
        else setState('error');
      })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, []);

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || password.length < 8) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/eiken-vocab/access', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setMessage(data?.message || 'ログインできませんでした。');
        if (response.status === 503 && String(data?.message || '').includes('設定')) setState('unconfigured');
        return;
      }
      setPassword('');
      setState('authenticated');
    } catch {
      setMessage('通信に失敗しました。ネットワークを確認して再度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch('/api/eiken-vocab/access', {
        method: 'DELETE',
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } finally {
      setPassword('');
      setMessage('');
      setState('locked');
      setBusy(false);
    }
  };

  if (state === 'checking') {
    return (
      <div className={`flex min-h-[360px] items-center justify-center rounded-3xl border ${panel}`}>
        <div className="flex items-center gap-3 text-sm font-bold"><LoaderCircle size={20} className="animate-spin text-cyan-600" />認証状態を確認しています…</div>
      </div>
    );
  }

  if (state === 'authenticated') {
    return (
      <section className="space-y-4">
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${panel}`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-600 text-white"><BookOpenCheck size={22} /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-600">CAMPUSSYNC / ENGLISH</p>
              <h2 className="truncate text-lg font-black">英検単語学習</h2>
              <p className={`mt-0.5 text-xs ${muted}`}>パスワード認証済み・8時間有効</p>
            </div>
          </div>
          <div className="flex items-center justify-end">
            <button type="button" onClick={signOut} disabled={busy} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition disabled:opacity-50 ${dark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              <LogOut size={15} />ロック
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <iframe
            src={EIKEN_VOCAB_URL}
            title="英検単語学習"
            className="block h-[min(78svh,920px)] min-h-[620px] w-full bg-white"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="clipboard-read; clipboard-write"
          />
        </div>
        <p className={`px-1 text-[11px] leading-5 ${muted}`}>
          CampusSync内では専用パスワードの認証後に表示されます。元の公開URLは独立したサイトのため、URLを直接開いた場合にはCampusSyncのパスワードは適用されません。
        </p>
      </section>
    );
  }

  return (
    <div className={`mx-auto flex min-h-[min(72svh,720px)] max-w-xl items-center justify-center rounded-3xl border p-5 shadow-sm sm:p-8 ${panel}`}>
      <div className="w-full max-w-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-600 text-white shadow-lg shadow-cyan-600/20">
          {state === 'unconfigured' ? <AlertCircle size={30} /> : <LockKeyhole size={30} />}
        </div>
        <p className="mt-5 text-center text-[10px] font-black uppercase tracking-[0.22em] text-cyan-600">CAMPUSSYNC / PRIVATE STUDY</p>
        <h2 className="mt-2 text-center text-2xl font-black tracking-tight">英検単語学習</h2>
        <p className={`mt-2 text-center text-sm leading-6 ${muted}`}>
          この学習機能を利用するには専用パスワードが必要です。
        </p>
        {state === 'unconfigured' ? (
          <div className={`mt-6 rounded-2xl border p-4 text-sm leading-6 ${dark ? 'border-amber-900/60 bg-amber-950/30 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            サーバー側の英検用パスワードがまだ設定されていません。設定が完了するとここからログインできます。
          </div>
        ) : (
          <form onSubmit={signIn} className="mt-6 space-y-3">
            <label htmlFor="eiken-vocab-password" className="block text-xs font-black">専用パスワード</label>
            <input
              id="eiken-vocab-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              minLength={8}
              maxLength={256}
              required
              placeholder="パスワードを入力"
              className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 ${input}`}
            />
            <div className="flex items-center justify-between">
              <span className={`text-[11px] ${muted}`}>8文字以上</span>
              <button type="button" onClick={() => setShowPassword(value => !value)} className={`text-[11px] font-bold ${muted}`}>
                {showPassword ? '隠す' : '表示する'}
              </button>
            </div>
            {message && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-bold leading-5 text-rose-700">{message}</p>}
            <button type="submit" disabled={busy || password.length < 8} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-3 text-sm font-black text-white shadow-lg shadow-cyan-700/15 transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <LoaderCircle size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
              {busy ? '認証しています…' : '認証して利用する'}
            </button>
          </form>
        )}
        {state === 'error' && (
          <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-bold leading-5 text-rose-700">認証サーバーに接続できませんでした。時間をおいて再度お試しください。</p>
        )}
        {message && state === 'unconfigured' && <p role="alert" className="mt-3 text-center text-xs text-amber-700">{message}</p>}
        <div className={`mt-6 flex items-center justify-center gap-2 text-[10px] font-bold ${muted}`}>
          <Globe2 size={13} />英検語彙トレーニング
          <ExternalLink size={12} />
        </div>
      </div>
    </div>
  );
}
