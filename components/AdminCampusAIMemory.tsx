"use client";

import { useState } from "react";

type Props = {
  adminPassword: string;
  kind: "notice" | "assignment";
  question: string;
  title: string;
  body: string;
  draftReady: boolean;
};

type Knowledge = {
  id: string;
  title: string;
  content: string;
  category: string;
};

type Example = {
  id: string;
  kind: "notice" | "assignment";
  request_text: string;
  approved_title: string;
  approved_body: string;
};

export default function AdminCampusAIMemory({
  adminPassword, kind, question, title, body, draftReady,
}: Props) {
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [category, setCategory] = useState("general");
  const [search, setSearch] = useState("");
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [examples, setExamples] = useState<Example[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function api(path: string, options: RequestInit = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
        ...options.headers,
      },
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.message || `処理に失敗しました（HTTP ${response.status}）。`);
    }
    return result;
  }

  async function loadMemory(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!adminPassword.trim()) {
      setStatus("管理用パスワードを入力してください。");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const result = await api(
        `/api/admin/campus-ai/memory?q=${encodeURIComponent(search.trim())}`,
        { method: "GET" },
      );
      setKnowledge(Array.isArray(result.knowledge) ? result.knowledge : []);
      setExamples(Array.isArray(result.examples) ? result.examples : []);
      setStatus("記憶を読み込みました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "記憶の取得に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function saveKnowledge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminPassword.trim()) {
      setStatus("管理用パスワードを入力してください。");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await api("/api/admin/campus-ai/memory", {
        method: "POST",
        body: JSON.stringify({
          type: "knowledge",
          title: knowledgeTitle,
          content: knowledgeContent,
          category,
        }),
      });
      setKnowledgeTitle("");
      setKnowledgeContent("");
      setStatus("知識をCampusSync AIの記憶に保存しました。");
      await loadMemory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "知識を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function saveExample() {
    if (!adminPassword.trim() || !question.trim() || !title.trim() || !body.trim()) {
      setStatus("管理用パスワードと、依頼・タイトル・本文を確認してください。");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await api("/api/admin/campus-ai/memory", {
        method: "POST",
        body: JSON.stringify({
          type: "example",
          kind,
          requestText: question,
          title,
          body,
        }),
      });
      setStatus("修正済みのお手本を記憶に保存しました。");
      await loadMemory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "お手本を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-violet-500/30 bg-slate-950 p-5">
      <div>
        <h3 className="text-xl font-black">CampusSync AIの記憶</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          学校のルールや文章のお手本を登録できます。登録した内容はSupabaseに保存されます。
          これはモデル自体の再訓練ではなく、知識と事例を蓄える機能です。
        </p>
      </div>

      <form onSubmit={saveKnowledge} className="space-y-3 rounded-xl border border-slate-800 p-4">
        <h4 className="font-bold">新しい知識を教える</h4>
        <input
          value={knowledgeTitle}
          onChange={e => setKnowledgeTitle(e.target.value)}
          required
          maxLength={200}
          placeholder="タイトル（例：課題を作成するときのルール）"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
        >
          <option value="general">一般</option>
          <option value="assignment">課題作成</option>
          <option value="notice">お知らせ</option>
          <option value="school_rules">学校のルール</option>
        </select>
        <textarea
          value={knowledgeContent}
          onChange={e => setKnowledgeContent(e.target.value)}
          required
          maxLength={10000}
          rows={4}
          placeholder="CampusSync AIに覚えてほしいことを具体的に記入"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white"
        />
        <button
          disabled={busy}
          className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          知識を記憶させる
        </button>
      </form>

      <div className="space-y-3 rounded-xl border border-slate-800 p-4">
        <h4 className="font-bold">修正した下書きをお手本として覚えさせる</h4>
        <p className="text-sm leading-6 text-slate-400">
          下書きを作成し、タイトルと本文を確認・修正したあとに保存してね。
          保存するのは依頼文と、現在のタイトル・本文だよ。
        </p>
        <button
          type="button"
          onClick={() => void saveExample()}
          disabled={busy || !draftReady || !question.trim() || !title.trim() || !body.trim()}
          className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          この下書きをお手本として記憶する
        </button>
      </div>

      <form onSubmit={loadMemory} className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="記憶を検索"
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
        />
        <button
          disabled={busy}
          className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-200 disabled:opacity-50"
        >
          {busy ? "処理中…" : "記憶を検索・更新"}
        </button>
      </form>

      {status && (
        <p role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
          {status}
        </p>
      )}

      <div className="space-y-3">
        <h4 className="font-bold">登録した知識（{knowledge.length}件）</h4>
        {knowledge.length === 0 && (
          <p className="text-sm text-slate-500">まだ表示できる知識がありません。「記憶を検索・更新」を押して読み込んでね。</p>
        )}
        {knowledge.map(item => (
          <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-violet-300">{item.category}</p>
            <h5 className="mt-1 font-bold">{item.title}</h5>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{item.content}</p>
          </article>
        ))}
      </div>

      <div className="space-y-3">
        <h4 className="font-bold">保存したお手本（{examples.length}件）</h4>
        {examples.length === 0 && (
          <p className="text-sm text-slate-500">まだ表示できるお手本がありません。</p>
        )}
        {examples.map(item => (
          <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-emerald-300">{item.kind === "assignment" ? "課題" : "お知らせ"}</p>
            <h5 className="mt-1 font-bold">{item.approved_title}</h5>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{item.approved_body}</p>
            <p className="mt-3 text-xs text-slate-500">元の依頼：{item.request_text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
