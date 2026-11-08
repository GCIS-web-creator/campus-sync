'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

const SUBJECTS = [
  '国語演習', '古典探求', '物理', '生物', '数３', '数C',
  '公共', '英コミュ', '論表', '情報', '保健', 'その他',
] as const;

type AssignmentType = 'paper' | 'classroom' | 'other';

export default function LineAssignmentFormPage() {
  const [token, setToken] = useState('');
  const [tokenReady, setTokenReady] = useState(false);
  const [subject, setSubject] = useState<(typeof SUBJECTS)[number]>('国語演習');
  const [targetClass, setTargetClass] = useState<'all' | 'science'>('all');
  const [subjectOption, setSubjectOption] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [type, setType] = useState<AssignmentType>('paper');
  const [dueAt, setDueAt] = useState('');
  const [noDeadline, setNoDeadline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token') || '';
    setToken(value);
    setTokenReady(true);
  }, []);

  const optionChoices = useMemo(() => {
    if (targetClass !== 'science') return [];
    if (subject === '数３') return ['アドバンスト', 'スタンダード'];
    if (subject === '英コミュ') return ['Intensive', 'Standard'];
    if (subject === '物理') return ['物理選択者'];
    if (subject === '生物') return ['生物選択者'];
    return [];
  }, [subject, targetClass]);

  useEffect(() => {
    if (optionChoices.length === 1) setSubjectOption(optionChoices[0]);
    else if (!optionChoices.includes(subjectOption)) setSubjectOption('');
  }, [optionChoices, subjectOption]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!tokenReady || !/^[a-f0-9]{64}$/i.test(token)) {
      setError('フォームのURLが無効です。LINE公式アカウントから開き直してください。');
      return;
    }
    if (!title.trim()) {
      setError('課題名を入力してください。');
      return;
    }
    if (!noDeadline && !dueAt) {
      setError('提出期限を指定するか、「期限なし」を選択してください。');
      return;
    }
    if (targetClass === 'science' && ['数３', '英コミュ'].includes(subject) && !subjectOption) {
      setError('選択区分を指定してください。');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/line-assignment-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          subject,
          targetClass,
          subjectOption,
          title,
          details,
          type,
          dueAt,
          noDeadline,
        }),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error || '送信に失敗しました。フォームを開き直して再度お試しください。');
        return;
      }
      setSuccess(payload.message || '課題提案を受け付けました。');
    } catch {
      setError('通信に失敗しました。接続を確認して再度お試しください。');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-900">
        <section className="mx-auto max-w-xl rounded-3xl bg-white p-7 shadow-2xl sm:p-9">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
          <p className="mt-5 text-center text-xs font-black tracking-[0.18em] text-emerald-700">CAMPUSSYNC  /  SUBMITTED</p>
          <h1 className="mt-2 text-center text-2xl font-black">課題を受け付けました</h1>
          <p className="mt-4 text-center text-sm leading-7 text-slate-600">{success}</p>
          <p className="mt-6 rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-500">この時点ではまだ正式公開されていません。管理者の確認・承認後にCampusSyncへ反映されます。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-7 text-slate-900 sm:py-10">
      <section className="mx-auto max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="bg-gradient-to-r from-slate-900 to-teal-900 px-6 py-7 text-white sm:px-8">
          <p className="text-[11px] font-black tracking-[0.2em] text-teal-200">CAMPUSSYNC  /  LINE ASSIGNMENT</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">課題登録フォーム</h1>
          <p className="mt-2 text-sm leading-6 text-slate-200">教科や対象を選び、課題名・内容・提出期限を入力してください。</p>
          <p className="mt-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-teal-100">LINE公式アカウントから開いた専用フォーム</p>
        </header>

        {!tokenReady ? (
          <div className="p-8 text-center text-sm text-slate-500">フォームを確認しています…</div>
        ) : !/^[a-f0-9]{64}$/i.test(token) ? (
          <div className="p-6 sm:p-8">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">フォームURLが無効です。LINE公式アカウントで「CSAI 課題追加」と送信し、新しいフォームを開いてください。</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 p-6 sm:p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-bold text-slate-700">
                教科
                <select value={subject} onChange={event => setSubject(event.target.value as (typeof SUBJECTS)[number])} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base font-medium outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100">
                  {SUBJECTS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="block text-sm font-bold text-slate-700">
                対象
                <select value={targetClass} onChange={event => setTargetClass(event.target.value as 'all' | 'science')} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base font-medium outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100">
                  <option value="all">全クラス</option>
                  <option value="science">理系クラス</option>
                </select>
              </label>
            </div>

            {optionChoices.length > 0 && (
              <label className="block text-sm font-bold text-slate-700">
                選択区分
                <select value={subjectOption} onChange={event => setSubjectOption(event.target.value)} disabled={optionChoices.length === 1} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base font-medium outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100">
                  <option value="">選択してください</option>
                  {optionChoices.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            )}

            <label className="block text-sm font-bold text-slate-700">
              課題名
              <input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required placeholder="例：数学演習プリント P20〜21" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base font-medium outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100" />
              <span className="mt-1 block text-right text-[11px] font-medium text-slate-400">{title.length}/200</span>
            </label>

            <label className="block text-sm font-bold text-slate-700">
              課題の内容・指示事項
              <textarea value={details} onChange={event => setDetails(event.target.value)} maxLength={5000} rows={5} placeholder="提出方法、範囲、注意事項など" className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3 py-3 text-sm font-medium leading-6 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100" />
              <span className="mt-1 block text-right text-[11px] font-medium text-slate-400">{details.length}/5000</span>
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <label className="block text-sm font-bold text-slate-700">
                提出期限
                <input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} disabled={noDeadline} required={!noDeadline} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base font-medium outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100" />
              </label>
              <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm font-bold text-slate-700">
                <input type="checkbox" checked={noDeadline} onChange={event => setNoDeadline(event.target.checked)} className="h-5 w-5 accent-teal-700" />
                期限を設定しない
              </label>
              <p className="mt-2 text-xs leading-5 text-slate-500">日時は日本時間として登録されます。</p>
            </div>

            <label className="block text-sm font-bold text-slate-700">
              課題の種類
              <select value={type} onChange={event => setType(event.target.value as AssignmentType)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base font-medium outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100">
                <option value="paper">紙プリント・ノート</option>
                <option value="classroom">Google Classroom</option>
                <option value="other">その他・連絡</option>
              </select>
            </label>

            {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">{error}</div>}

            <button type="submit" disabled={submitting || !tokenReady} className="w-full rounded-xl bg-teal-800 px-5 py-4 text-base font-black text-white shadow-lg transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? '送信しています…' : '課題を提案する'}
            </button>
            <p className="text-center text-xs leading-5 text-slate-500">送信後は管理者の承認待ちになります。誤登録を防ぐため、内容を確認してから送信してください。</p>
          </form>
        )}
      </section>
    </main>
  );
}
