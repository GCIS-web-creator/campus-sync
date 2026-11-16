'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CampusSyncLogo } from '@/components/CampusSyncLogo';
import { LockKeyhole, ShieldCheck, CalendarDays, KeyRound } from 'lucide-react';

type LoginMethod = 'password' | 'date_code';

export default function AdminLoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<LoginMethod>('password');
  const [password, setPassword] = useState('');
  const [date, setDate] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (method === 'password' && !password) return;
    if (method === 'date_code' && (!/^\d{8}$/.test(date) || !/^\d{6}$/.test(confirmationCode))) return;

    setBusy(true);
    setMessage('');
    try {
      const payload = method === 'password'
        ? { method, password }
        : { method, date, code: confirmationCode };
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'ログインできませんでした。');
      }
      setPassword('');
      setDate('');
      setConfirmationCode('');
      router.replace('/admin');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ログインできませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const changeMethod = (next: LoginMethod) => {
    setMethod(next);
    setMessage('');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <div className="flex items-center justify-between">
          <CampusSyncLogo variant="wordmark" height={30} theme="dark" />
          <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">ADMIN</span>
        </div>

        <div className="space-y-2">
          <div className="inline-flex rounded-2xl bg-cyan-500/10 p-3 text-cyan-300"><ShieldCheck size={25} /></div>
          <h1 className="text-2xl font-black">管理者ログイン</h1>
          <p className="text-sm leading-6 text-slate-400">
            既存のAdminパスワード、または日本時間の日付と確認コードでログインできます。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-1">
          <button
            type="button"
            aria-pressed={method === 'password'}
            onClick={() => changeMethod('password')}
            className={`rounded-lg px-3 py-2.5 text-xs font-bold transition ${method === 'password' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Adminパスワード
          </button>
          <button
            type="button"
            aria-pressed={method === 'date_code'}
            onClick={() => changeMethod('date_code')}
            className={`rounded-lg px-3 py-2.5 text-xs font-bold transition ${method === 'date_code' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            日付＋確認コード
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {method === 'password' ? (
            <label className="block text-sm font-bold text-slate-200">
              Adminパスワード
              <span className="relative mt-2 block">
                <LockKeyhole size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-500"
                  placeholder="Adminパスワードを入力"
                />
              </span>
            </label>
          ) : (
            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-200">
                今日の日付（日本時間・8桁）
                <span className="relative mt-2 block">
                  <CalendarDays size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    minLength={8}
                    maxLength={8}
                    pattern="[0-9]{8}"
                    value={date}
                    onChange={(event) => setDate(event.target.value.replace(/\D/g, '').slice(0, 8))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-500"
                    placeholder="YYYYMMDD"
                  />
                </span>
              </label>
              <label className="block text-sm font-bold text-slate-200">
                確認コード（6桁）
                <span className="relative mt-2 block">
                  <KeyRound size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    minLength={6}
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={confirmationCode}
                    onChange={(event) => setConfirmationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-500"
                    placeholder="6桁の確認コード"
                  />
                </span>
              </label>
              <p className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-xs leading-5 text-slate-400">
                確認コードは管理者がVercelの環境変数に設定する6桁の秘密値です。日付とコードの両方が一致した場合にログインできます。
              </p>
            </div>
          )}

          {message && (
            <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/50 p-3 text-sm text-rose-200">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || (method === 'password' ? !password : !/^\d{8}$/.test(date) || !/^\d{6}$/.test(confirmationCode))}
            className="w-full rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '認証中...' : 'ログイン'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500">
          連続5回失敗すると15分間ロックされます。認証セッションは8時間で期限切れになります。
        </p>
      </div>
    </main>
  );
}
