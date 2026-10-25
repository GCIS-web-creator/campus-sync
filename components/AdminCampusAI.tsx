'use client';

import { useState } from 'react';

type Props = {
  adminPassword: string;
  onAdminPasswordChange: (value: string) => void;
  onUseDraft: (title: string, body: string) => void;
};

type DraftResult = {
  success?: boolean;
  mode?: 'model' | 'template';
  title?: string;
  body?: string;
  message?: string;
};

const EXAMPLES = [
  '文化祭のお知らせを作って。日時など不明な情報は確認用の欄にして。',
  '明日の電車運行について、生徒に注意を呼びかける文章を作って。',
  '課題の提出期限を確認するよう、生徒向けのお知らせを作って。',
];

export default function AdminCampusAI({
  adminPassword,
  onAdminPasswordChange,
  onUseDraft,
}: Props) {
  const [question, setQuestion] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [mode, setMode] = useState<'model' | 'template' | null>(null);

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
        body: JSON.stringify({ question }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({})) as DraftResult;

      if (!response.ok || !result.success || !result.title || !result.body) {
        throw new Error(result.message || `下書きを作成できませんでした（HTTP ${response.status}）。`);
      }

      setTitle(result.title);
      setBody(result.body);
      setMode(result.mode || 'template');
      setDraftReady(true);
      setStatus(result.message || '下書きを作成しました。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '下書きの作成に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-black">CampusSync 管理者AI</h2>
        <p className="mt-2 text-sm text-slate-400">
          お知らせ文の作成を支援します。生成した文章は編集でき、既存のLINE配信フォームに反映できます。
        </p>
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
            どんなお知らせを作りますか？
            <textarea
              value={question}
              onChange={event => setQuestion(event.target.value)}
              maxLength={1500}
              rows={4}
              placeholder="例：文化祭について、全校生徒向けのお知らせを作って。日時が不明な部分は確認欄にして。"
              className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map(example => (
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
            {busy ? '下書きを作成中…' : 'お知らせの下書きを作成'}
          </button>
        </form>
      </div>

      {status && (
        <p role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
          {status}
        </p>
      )}

      {draftReady && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-black">お知らせの下書き</h3>
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

          <p className="text-xs leading-relaxed text-amber-300">
            これは下書きです。日時・対象・内容の正確さを確認してください。この画面から公開やLINE送信は行いません。
          </p>

          <button
            type="button"
            onClick={() => onUseDraft(title.trim(), body.trim())}
            disabled={!title.trim() || !body.trim()}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            LINE配信フォームに反映
          </button>
        </div>
      )}
    </section>
  );
}
