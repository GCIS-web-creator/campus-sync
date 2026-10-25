'use client';

import { useState } from 'react';
import AdminCampusLocalChat from './AdminCampusLocalChat';
import AdminCampusAIMemory from './AdminCampusAIMemory';

type Props = {
  adminPassword: string;
  onAdminPasswordChange: (value: string) => void;
  onUseDraft: (title: string, body: string) => void;
  onUseAssignmentDraft: (title: string, details: string, dueAt?: string | null) => void;
};

type DraftResult = {
  success?: boolean;
  mode?: 'model' | 'template';
  title?: string;
  body?: string;
  dueAt?: string | null;
  message?: string;
};

const NOTICE_EXAMPLES = [
  '文化祭のお知らせを作って。日時など不明な情報は確認用の欄にして。',
  '明日の電車運行について、生徒に注意を呼びかける文章を作って。',
  '課題の提出期限を確認するよう、生徒向けのお知らせを作って。',
];
const ASSIGNMENT_EXAMPLES = [
  '数学の練習課題を作って。問題内容は確認欄にして。',
  '物理基礎の実験レポート課題を作って。',
  '文化祭の参加希望アンケートを課題として作って。',
];

export default function AdminCampusAI({
  adminPassword,
  onAdminPasswordChange,
  onUseDraft,
  onUseAssignmentDraft,
}: Props) {
  const [kind, setKind] = useState<'notice' | 'assignment'>('notice');
  const [question, setQuestion] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [mode, setMode] = useState<'model' | 'template' | null>(null);
  const [report, setReport] = useState('');
  const [reportWarnings, setReportWarnings] = useState<string[]>([]);
  const [reportStatus, setReportStatus] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportGeneratedAt, setReportGeneratedAt] = useState('');

  function changeKind(next: 'notice' | 'assignment') {
    setKind(next);
    setQuestion('');
    setTitle('');
    setBody('');
    setDueAt('');
    setDraftReady(false);
    setMode(null);
    setStatus('');
  }

  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (!adminPassword.trim()) {
      setStatus('管理用パスワードを入力してください。');
      return;
    }
    if (!question.trim()) {
      setStatus('作成したいお知らせの内容を入力してください。');
      return;
    }

    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/admin/campus-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword,
        },
        body: JSON.stringify({ question, kind }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({})) as DraftResult;

      if (!response.ok || !result.success || !result.title || !result.body) {
        throw new Error(result.message || `下書きを作成できませんでした（HTTP ${response.status}）。`);
      }

      setTitle(result.title);
      setBody(result.body);
      setDueAt(typeof result.dueAt === 'string' ? result.dueAt : '');
      setMode(result.mode || 'template');
      setDraftReady(true);
      setStatus(result.message || '下書きを作成しました。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '下書きの作成に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  async function loadReport() {
    if (reportLoading) return;
    if (!adminPassword.trim()) {
      setReportStatus('管理用パスワードを入力してください。');
      return;
    }

    setReportLoading(true);
    setReportStatus('');
    try {
      const response = await fetch('/api/admin/campus-ai/report', {
        method: 'POST',
        headers: { 'x-admin-password': adminPassword },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.message || `レポートの取得に失敗しました（HTTP ${response.status}）。`);
      }

      setReport(typeof result.answer === 'string' ? result.answer : '');
      setReportWarnings(Array.isArray(result.warnings) ? result.warnings : []);
      setReportGeneratedAt(typeof result.generatedAt === 'string' ? result.generatedAt : '');
      setReportStatus('管理状況を取得しました。表示内容は取得時点の情報です。');
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : '管理状況を取得できませんでした。');
      setReport('');
      setReportWarnings([]);
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-black">CampusSync 管理者AI</h2>
        <p className="mt-2 text-sm text-slate-400">
          お知らせや課題の下書きを作成し、確認してから既存の管理フォームへ反映できます。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => changeKind('notice')} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${kind === 'notice' ? 'bg-blue-600 text-white' : 'border border-slate-700 text-slate-300'}`}>お知らせを作成</button>
        <button type="button" onClick={() => changeKind('assignment')} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${kind === 'assignment' ? 'bg-blue-600 text-white' : 'border border-slate-700 text-slate-300'}`}>課題を作成</button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4">
        <label className="block text-sm font-bold text-slate-300">
          管理用パスワード
          <input
            type="password"
            autoComplete="current-password"
            value={adminPassword}
            onChange={event => onAdminPasswordChange(event.target.value)}
            placeholder="CAMPUS_SYNC_ADMIN_PASSWORD の値"
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
          />
        </label>

        <form onSubmit={createDraft} className="space-y-4">
          <label className="block text-sm font-bold text-slate-300">
            {kind === 'notice' ? 'どんなお知らせを作りますか？' : 'どんな課題を作りますか？'}
            <textarea
              value={question}
              onChange={event => setQuestion(event.target.value)}
              maxLength={1500}
              rows={4}
              placeholder={kind === "notice" ? "例：文化祭について、全校生徒向けのお知らせを作って。" : "例：数学の課題を作って。内容や提出方法が不明な部分は確認欄にして。"}
              className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {(kind === 'notice' ? NOTICE_EXAMPLES : ASSIGNMENT_EXAMPLES).map(example => (
              <button
                key={example}
                type="button"
                onClick={() => setQuestion(example)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800"
              >
                {example}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? '下書きを作成中…' : kind === 'notice' ? 'お知らせの下書きを作成' : '課題の下書きを作成'}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4">
        <div>
          <h3 className="text-lg font-black">管理状況レポート</h3>
          <p className="mt-1 text-sm text-slate-400">
            課題の期限、LINE配信履歴、蔵書、落とし物、キャリアセンター、学食のお知らせ設定を読み取ります。データの変更や送信は行いません。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadReport()}
          disabled={reportLoading}
          className="rounded-xl border border-blue-500/40 bg-blue-600/10 px-4 py-3 text-sm font-bold text-blue-200 hover:bg-blue-600/20 disabled:opacity-50"
        >
          {reportLoading ? '管理状況を取得中…' : '管理状況を確認'}
        </button>

        {reportStatus && (
          <p role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
            {reportStatus}
          </p>
        )}

        {report && (
          <div className="space-y-3">
            <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm leading-7 text-slate-200 font-sans">
              {report}
            </pre>
            {reportGeneratedAt && (
              <p className="text-xs text-slate-500">
                取得日時：{new Date(reportGeneratedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
              </p>
            )}
            {reportWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-200">
                <p className="font-bold">一部のデータを取得できませんでした</p>
                {reportWarnings.map((warning, index) => (
                  <p key={`${warning}-${index}`}>{warning}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {status && (
        <p role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
          {status}
        </p>
      )}

      {draftReady && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-black">{kind === 'notice' ? 'お知らせの下書き' : '課題の下書き'}</h3>
            <span className={`rounded-full px-3 py-1 text-xs ${mode === 'model' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
              {mode === 'model' ? 'AI生成' : 'テンプレート'}
            </span>
          </div>

          <label className="block text-sm font-bold text-slate-300">
            タイトル
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              maxLength={100}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
            />
          </label>

          <label className="block text-sm font-bold text-slate-300">
            本文
            <textarea
              value={body}
              onChange={event => setBody(event.target.value)}
              maxLength={4900}
              rows={9}
              className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white"
            />
          </label>

          {kind === 'assignment' && (
            <p className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
              AIが読み取った提出期限：
              {dueAt
                ? new Date(dueAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
                : '読み取れませんでした。課題登録フォームで設定してください。'}
            </p>
          )}

          <p className="text-xs leading-relaxed text-amber-300">
            これは下書きです。内容を確認してください。ここから自動で公開・送信・保存は行いません。
          </p>

          <button
            type="button"
            onClick={() => kind === 'notice' ? onUseDraft(title.trim(), body.trim()) : onUseAssignmentDraft(title.trim(), body.trim(), dueAt || null)}
            disabled={!title.trim() || !body.trim()}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {kind === 'notice' ? 'LINE配信フォームに反映' : '課      <AdminCampusAIMemory
        adminPassword={adminPassword}
        kind={kind}
        question={question}
        title={title}
        body={body}
        draftReady={draftReady}
      />

題登録フォームに反映'}
          </button>
        </div>
      )}
      <AdminCampusLocalChat />

    </section>
  );
}
