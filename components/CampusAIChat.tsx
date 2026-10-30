'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Send, Sparkles, Plus, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type TablePayload = { headers: string[]; rows: string[][] };
type QuickReply = { label: string; status: 'empty' | 'normal' | 'crowded' };
type Msg = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  table?: TablePayload;
  quickReplies?: QuickReply[];
  queueMenuId?: string;
};
type SavedConversation = { id: string; title: string; updatedAt: number; messages: Msg[] };

const SUGGESTIONS = ['今日のメニューは?', '次の電車は?', '課題ある?', '教室の状況は?'];
const GREETING = 'こんにちは！学食・電車・課題・教室・部活ノート・蔵書・落とし物・口コミ・キャリアセンターなどについて聞いてください。';

async function getSessionHeaders(): Promise<{ headers: Record<string, string>; studentId: string }> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const email = session?.user.email ?? '';
  const studentId = /^([0-9]{6})@tokyo\.soka\.ed\.jp$/i.exec(email)?.[1] ?? '';
  return {
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    studentId,
  };
}

function getOrCreateVoteId(studentId: string): string {
  const key = `campus-sync-voter-id:${studentId || 'anonymous'}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const newId = typeof window.crypto?.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `vote-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, newId);
  return newId;
}

type PageAction =
  | { type: 'set-theme'; theme: string }
  | { type: 'set-favorite-room'; room: string }
  | { type: 'get-favorite-room' }
  | { type: 'test-push' };

type PageActionResult = { success: boolean; message: string };

function detectPageAction(question: string): PageAction | null {
  const q = question.normalize('NFKC').replace(/[「」『』"'"]/g, '').trim();

  // お気に入りの確認は、変更操作と区別する。
  if (
    /お気に入り/.test(q) &&
    !/(?:変更|変えて|変える|設定|にして|にする|にしたい|に変える|へ変更)/.test(q)
  ) {
    return { type: 'get-favorite-room' };
  }

  // 「お気に入りをCallにしたい」など、教室という単語がない形にも対応。
  const favorite = /お気に入り(?:の)?(?:教室)?を(.+?)(?:に変更(?:して)?|にして|に変えて|に設定(?:して)?|にする|にしたい|に変える|へ変更|へ設定|に)(?:ください|お願いします)?[。！!？?]*$/.exec(q);
  if (favorite?.[1]?.trim()) {
    return { type: 'set-favorite-room', room: favorite[1].trim() };
  }

  // テーマプリセット・自由色コード・色名をAIチャットから設定する。
  const themeIntent =
    /テーマカラー|テーマ色|テーマ|画面(?:の)?色|サイト(?:の)?色|背景色|アクセントカラー|カラーコード|色を|カラーを|画面を|サイトを|デザイン/.test(q);
  const themeCommand =
    /(?:変え|変更|設定|切り替え|にして|にする|にしたい|適用|使って|お願い|に[。！!？?]*$)/.test(q);
  const hasHexColor = /#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/i.test(q);
  const englishWords = q.match(/\b[a-z][a-z-]{2,24}\b/gi) ?? [];
  const ignoredWords = new Set(['theme', 'color', 'colour', 'site', 'website', 'background', 'screen', 'design', 'change', 'changed', 'set', 'make', 'use', 'apply', 'please', 'with', 'and', 'the', 'for', 'into', 'from']);
  const cssColorName = englishWords.find(name =>
    !ignoredWords.has(name.toLowerCase()) &&
    typeof CSS !== 'undefined' &&
    CSS.supports('color', name)
  );
  const hasNamedColor = /ネオン|サイバー|メルヘン|フェアリー|自由設定|カスタムテーマ|neon|cyber|fairytale|pastel|custom|パープル|ブルー|グリーン|オレンジ|インディゴ|ピンク|青藍|群青色|青緑|ドジャーブルー|スカイブルー|ターコイズ|ラベンダー|マゼンタ|チョコレート|サーモン|春緑|ゴールド|ホットピンク|ディープピンク|コーラル|トマト|水色|シアン|ライム|朱色|桜色|さくら色|藤色|ネイビー|灰色|グレー|茶色|赤|青|緑|黄|金|藍|紫|白|黒/.test(q) || Boolean(cssColorName);

  if ((themeIntent || hasHexColor || hasNamedColor) && themeCommand) {
    // 固定テーマ名を最優先。
    if (/ネオン|neon/i.test(q)) return { type: 'set-theme', theme: 'neon' };
    if (/サイバー|cyber|console/i.test(q)) return { type: 'set-theme', theme: 'cyber' };
    if (/メルヘン|フェアリー|fairytale|pastel/i.test(q)) return { type: 'set-theme', theme: 'fairytale' };
    if (/自由設定|カスタムテーマ|customテーマ/i.test(q)) return { type: 'set-theme', theme: 'custom' };

    // HEXコードを直接渡す。色名の一部に含まれる「青」「ピンク」より先に処理する。
    const hex = q.match(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/i);
    if (hex) return { type: 'set-theme', theme: hex[0] };

    // 色名は長いものを先に選び、「ドジャーブルー」を普通の「ブルー」と誤認しない。
    const colorNames = [
      'ディープピンク', 'ホットピンク', 'ドジャーブルー', 'スカイブルー',
      'チョコレート', 'ターコイズ', 'ラベンダー', 'マゼンタ', 'コーラル',
      '群青色', '青藍', '青緑', 'トマト', '春緑', 'ゴールド', 'サーモン',
      'さくら色', '桜色', '藤色', 'ネイビー', '灰色', 'グレー', '茶色',
      'シアン', 'ライム', '水色', '朱色', 'ラベンダー', 'ディープピンク',
      'ピンク', 'パープル', 'ブルー', 'グリーン', 'オレンジ', 'インディゴ',
      'あか', 'みどり', 'むらさき', 'しろ', 'くろ', '赤', '青', '緑', '黄',
      '金', '藍', '紫', '白', '黒',
      'coral', 'tomato', 'deeppink', 'hotpink', 'dodgerblue', 'skyblue',
      'lavender', 'magenta', 'violet', 'turquoise', 'chocolate', 'salmon',
      'springgreen', 'gold', 'deepskyblue', 'cyan', 'lime', 'teal', 'navy',
      'crimson', 'yellow', 'olive', 'aqua', 'fuchsia', 'sienna', 'tan',
      'rebeccapurple', 'darkcyan', 'darkblue', 'lightblue', 'lightpink',
      'red', 'blue', 'green', 'purple', 'orange', 'pink', 'indigo', 'black', 'white',
    ];
    const colorName = colorNames
      .sort((a, b) => b.length - a.length)
      .find(name => name.toLowerCase() === name
        ? new RegExp('\\b' + name + '\\b', 'i').test(q)
        : q.includes(name)
      );
    if (colorName) return { type: 'set-theme', theme: colorName };
    if (cssColorName) return { type: 'set-theme', theme: cssColorName };

    // 一般的な呼び方を既存プリセットへ関連付ける。
    if (/紫|パープル/.test(q)) return { type: 'set-theme', theme: 'purple' };
    if (/ピンク/.test(q)) return { type: 'set-theme', theme: 'pink' };
    if (/青|ブルー/.test(q)) return { type: 'set-theme', theme: 'blue' };
    if (/緑|グリーン/.test(q)) return { type: 'set-theme', theme: 'emerald' };
    if (/オレンジ/.test(q)) return { type: 'set-theme', theme: 'orange' };
    if (/藍色|インディゴ/.test(q)) return { type: 'set-theme', theme: 'indigo' };
  }

  if (/リマインダー.*テスト通知|テスト通知.*(?:送って|送信|して)|通知.*テストして/.test(q)) {
    return { type: 'test-push' };
  }

  return null;
}
function requestPageAction(action: PageAction): Promise<PageActionResult> {
  return new Promise(resolve => {
    let settled = false;
    let timeoutId: number | undefined;

    const finish = (result: PageActionResult) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      resolve(result);
    };

    timeoutId = window.setTimeout(() => {
      finish({
        success: false,
        message: '画面側の操作を確認できませんでした。ページを再読み込みして、もう一度試してください。'
      });
    }, 5000);

    window.dispatchEvent(new CustomEvent('campus-sync-ai-action', {
      detail: { action, resolve: finish }
    }));
  });
}

export default function CampusAIChat({ mode = 'floating' }: { mode?: 'floating' | 'full' }) {
  const pathname = usePathname();
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 'greeting', role: 'ai', text: GREETING }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [dedicatedTabActive, setDedicatedTabActive] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const historyStorageKey = 'campus-sync-ai-conversations-v1';
  const activeHistoryStorageKey = 'campus-sync-ai-active-conversation-v1';

  useEffect(() => {
    if (mode !== 'floating') return;
    const syncDedicatedRoute = () => {
      setDedicatedTabActive(window.location.hash.toLowerCase() === '#ai');
    };
    syncDedicatedRoute();
    window.addEventListener('hashchange', syncDedicatedRoute);
    window.addEventListener('campus-sync-ai-route', syncDedicatedRoute);
    return () => {
      window.removeEventListener('hashchange', syncDedicatedRoute);
      window.removeEventListener('campus-sync-ai-route', syncDedicatedRoute);
    };
  }, [mode]);

  // 専用タブでは複数の会話を、このブラウザータブ内に一時保存する。
  useEffect(() => {
    if (mode !== 'full') return;
    try {
      const raw = window.sessionStorage.getItem(historyStorageKey);
      const parsed = raw ? JSON.parse(raw) as unknown : [];
      const restored: SavedConversation[] = Array.isArray(parsed)
        ? parsed.filter((item): item is SavedConversation =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof (item as SavedConversation).id === 'string' &&
            typeof (item as SavedConversation).title === 'string' &&
            Number.isFinite((item as SavedConversation).updatedAt) &&
            Array.isArray((item as SavedConversation).messages)
          ).map(item => ({
            ...item,
            messages: item.messages.filter((message): message is Msg =>
              Boolean(message) &&
              typeof message === 'object' &&
              typeof (message as Msg).id === 'string' &&
              ((message as Msg).role === 'user' || (message as Msg).role === 'ai') &&
              typeof (message as Msg).text === 'string'
            ).slice(-40),
          })).slice(0, 20)
        : [];
      const preferredId = window.sessionStorage.getItem(activeHistoryStorageKey) || '';
      const active = restored.find(item => item.id === preferredId) || restored[0];

      if (restored.length) {
        setConversations(restored);
        setActiveConversationId(active.id);
        setMsgs([{ id: 'greeting', role: 'ai', text: GREETING }, ...active.messages]);
      } else {
        const id = 'chat-' + Date.now();
        setConversations([{ id, title: '新しい会話', updatedAt: Date.now(), messages: [] }]);
        setActiveConversationId(id);
      }
    } catch (error) {
      console.warn('CampusSync AIの会話履歴を復元できませんでした。', error);
      const id = 'chat-' + Date.now();
      setConversations([{ id, title: '新しい会話', updatedAt: Date.now(), messages: [] }]);
      setActiveConversationId(id);
    } finally {
      setHistoryReady(true);
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'full' || !historyReady || !activeConversationId) return;
    const savedMessages = msgs.filter(message => message.id !== 'greeting').slice(-40);
    const firstQuestion = savedMessages.find(message => message.role === 'user')?.text || '';
    setConversations(current => {
      const existing = current.find(item => item.id === activeConversationId);
      const updated: SavedConversation = {
        id: activeConversationId,
        title: existing?.title === '新しい会話' && firstQuestion
          ? firstQuestion.slice(0, 32)
          : existing?.title || firstQuestion.slice(0, 32) || '新しい会話',
        updatedAt: Date.now(),
        messages: savedMessages,
      };
      return [updated, ...current.filter(item => item.id !== activeConversationId)].slice(0, 20);
    });
  }, [mode, msgs, historyReady, activeConversationId]);

  useEffect(() => {
    if (mode !== 'full' || !historyReady) return;
    try {
      window.sessionStorage.setItem(historyStorageKey, JSON.stringify(conversations));
      if (activeConversationId) window.sessionStorage.setItem(activeHistoryStorageKey, activeConversationId);
    } catch (error) {
      console.warn('CampusSync AIの会話履歴を一時保存できませんでした。', error);
    }
  }, [mode, conversations, activeConversationId, historyReady]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [msgs]);

  if (pathname?.startsWith('/admin')) return null;
  if (mode === 'floating' && dedicatedTabActive) return null;

  const startNewChat = () => {
    if (busy || mode !== 'full') return;
    const id = 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    setConversations(current => [
      { id, title: '新しい会話', updatedAt: Date.now(), messages: [] },
      ...current,
    ].slice(0, 20));
    setActiveConversationId(id);
    setMsgs([{ id: 'greeting', role: 'ai', text: GREETING }]);
    setInput('');
  };

  const openConversation = (conversation: SavedConversation) => {
    if (busy) return;
    setActiveConversationId(conversation.id);
    setMsgs([{ id: 'greeting', role: 'ai', text: GREETING }, ...conversation.messages]);
    setInput('');
  };

  const renameConversation = (conversation: SavedConversation) => {
    const title = window.prompt('会話のタイトルを入力してください。', conversation.title);
    if (!title?.trim()) return;
    setConversations(current => current.map(item =>
      item.id === conversation.id ? { ...item, title: title.trim().slice(0, 32) } : item
    ));
  };

  const deleteConversation = (conversation: SavedConversation) => {
    if (!window.confirm('「' + conversation.title + '」を削除しますか？')) return;
    const remaining = conversations.filter(item => item.id !== conversation.id);
    if (conversation.id === activeConversationId) {
      if (remaining.length) {
        openConversation(remaining[0]);
      } else {
        startNewChat();
      }
    }
    setConversations(remaining);
  };

  async function send(raw: string) {
    const question = raw.trim().slice(0, 100);
    if (!question || busy) return;
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setInput('');
    setMsgs(m => [...m, { id, role: 'user', text: question }]);
    setBusy(true);
    const pageAction = detectPageAction(question);
    if (pageAction) {
      let actionReply: Msg;
      try {
        const result = await requestPageAction(pageAction);
        actionReply = {
          id: `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role: 'ai',
          text: result.message,
        };
      } catch {
        actionReply = {
          id: `ai-${Date.now()}`,
          role: 'ai',
          text: '画面操作に失敗しました。設定画面から操作を確認してください。',
        };
      }
      setMsgs(m => [...m, actionReply]);
      setBusy(false);
      return;
    }

    let reply: Msg = { id: `ai-${Date.now()}`, role: 'ai', text: 'AIにつながりませんでした。少し待ってからもう一度試してください。' };
    try {
      const { headers, studentId } = await getSessionHeaders();
      const history = msgs.filter(m => m.id !== 'greeting').slice(-10).map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.text,
        ...(m.queueMenuId ? { queueMenuId: m.queueMenuId } : {}),
        ...(m.quickReplies ? { quickReplies: m.quickReplies } : {}),
      }));
      const res = await fetch('/api/campus-ai', { method: 'POST', headers, body: JSON.stringify({ question, history, voterId: getOrCreateVoteId(studentId) }) });
      const data = await res.json().catch(() => null) as {
        answer?: string; error?: string; table?: TablePayload;
        quickReplies?: QuickReply[]; queueMenuId?: string;
      } | null;
      reply = {
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'ai',
        text: data?.answer ?? data?.error ?? reply.text,
        ...(data?.table ? { table: data.table } : {}),
        ...(data?.quickReplies?.length && data.queueMenuId ? { quickReplies: data.quickReplies, queueMenuId: data.queueMenuId } : {}),
      };
    } catch {
      // reply fallback message remains in place
    }
    setMsgs(m => [...m, reply]);
    setBusy(false);
  }

  async function voteQueue(messageId: string, menuId: string, choice: QuickReply) {
    if (busy) return;
    setBusy(true);
    try {
      const { headers, studentId } = await getSessionHeaders();
      const voterId = getOrCreateVoteId(studentId);
      const res = await fetch('/api/campus-ai/queue-vote', {
        method: 'POST', headers,
        body: JSON.stringify({ menuId, status: choice.status, voterId }),
      });
      const data = await res.json().catch(() => null) as { answer?: string } | null;
      const resultText = data?.answer ?? '投票結果を確認できませんでした。';
      setMsgs(m => m.map(msg => msg.id === messageId
        ? { ...msg, text: `${msg.text}\n${resultText}`, quickReplies: res.ok ? undefined : msg.quickReplies }
        : msg));
    } catch {
      setMsgs(m => m.map(msg => msg.id === messageId
        ? { ...msg, text: `${msg.text}\n通信エラーで投票できませんでした。もう一度試してください。` }
        : msg));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {mode === 'full' ? (
        <section
          role="region"
          aria-label="CampusSync AI 全画面チャット"
          className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:rounded-3xl"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 bg-[#111B35] px-4 py-3.5 text-white sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-violet-200">
                <Sparkles size={22} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-black tracking-tight sm:text-lg">CampusSync AI</h2>
                <p className="text-[9px] font-bold tracking-[0.16em] text-violet-200 sm:text-[10px]">SCHOOL LIFE INTELLIGENCE</p>
              </div>
            </div>
            <button
              type="button"
              onClick={startNewChat}
              disabled={busy || !historyReady}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">新しい会話</span>
              <span className="sm:hidden">新規</span>
            </button>
          </header>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950 md:flex">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[10px] font-black tracking-wider text-slate-500 dark:text-slate-400">会話履歴</p>
                <span className="text-[10px] text-slate-400">{conversations.length}/20</span>
              </div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {conversations.map(conversation => (
                  <div key={conversation.id} className={'group rounded-xl border p-2 ' + (activeConversationId === conversation.id ? 'border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40' : 'border-transparent hover:border-slate-200 hover:bg-white dark:hover:border-slate-700 dark:hover:bg-slate-900')}>
                    <button type="button" disabled={busy} onClick={() => openConversation(conversation)} className="w-full min-w-0 text-left disabled:opacity-50">
                      <span className={'block truncate text-xs font-bold ' + (activeConversationId === conversation.id ? 'text-violet-800 dark:text-violet-200' : 'text-slate-700 dark:text-slate-200')}>{conversation.title}</span>
                      <span className="mt-1 block text-[9px] text-slate-400">{conversation.messages.length ? new Date(conversation.updatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '新規会話'}</span>
                    </button>
                    <div className="mt-1 flex justify-end gap-1 opacity-70 transition group-hover:opacity-100">
                      <button type="button" onClick={() => renameConversation(conversation)} aria-label="会話名を変更" title="名前を変更" className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-violet-700 dark:hover:bg-slate-800"><Pencil size={12} /></button>
                      <button type="button" onClick={() => deleteConversation(conversation)} aria-label="会話を削除" title="削除" className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-rose-600 dark:hover:bg-slate-800"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 md:hidden">
                <select
                  aria-label="会話履歴"
                  value={activeConversationId}
                  onChange={event => {
                    const selected = conversations.find(item => item.id === event.target.value);
                    if (selected) openConversation(selected);
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {conversations.map(conversation => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}
                </select>
                <button type="button" onClick={() => {
                  const current = conversations.find(item => item.id === activeConversationId);
                  if (current) renameConversation(current);
                }} aria-label="会話名を変更" className="rounded-lg border border-slate-200 p-2 text-slate-500 dark:border-slate-700"><Pencil size={14} /></button>
                <button type="button" onClick={() => {
                  const current = conversations.find(item => item.id === activeConversationId);
                  if (current) deleteConversation(current);
                }} aria-label="会話を削除" className="rounded-lg border border-slate-200 p-2 text-slate-500 dark:border-slate-700"><Trash2 size={14} /></button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50 to-white p-3 dark:from-slate-950 dark:to-slate-900 sm:p-6">
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:gap-5">
                  {msgs.map(m => (
                    <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                      <div className={
                        m.role === 'user'
                          ? 'max-w-[92%] rounded-2xl rounded-br-md bg-[#2B4FD8] px-4 py-3 text-sm leading-7 text-white shadow-sm sm:max-w-[82%]'
                          : 'w-full max-w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-800 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:px-5'
                      }>
                        {m.role === 'ai' && (
                          <div className="mb-2 flex items-center gap-2 text-[10px] font-black tracking-wide text-violet-700 dark:text-violet-300">
                            <Sparkles size={13} />
                            CAMPUSSYNC AI
                          </div>
                        )}
                        <div className="whitespace-pre-wrap break-words">{m.text}</div>
                        {m.table && (
                          <div className="mt-4 max-w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-600">
                            <table className="min-w-full border-collapse text-left text-xs">
                              <thead className="bg-slate-100 dark:bg-slate-700">
                                <tr>{m.table.headers.map((h, i) => <th key={h + '-' + i} className="whitespace-nowrap border-b border-slate-200 px-3 py-2.5 font-black dark:border-slate-600">{h}</th>)}</tr>
                              </thead>
                              <tbody>
                                {m.table.rows.map((row, i) => (
                                  <tr key={i} className={i % 2 ? 'bg-slate-50 dark:bg-slate-800' : 'bg-white dark:bg-slate-900'}>
                                    {m.table!.headers.map((_, j) => <td key={j} className="border-b border-slate-100 px-3 py-2.5 align-top dark:border-slate-700">{row[j] ?? '—'}</td>)}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {m.quickReplies?.length && m.queueMenuId && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {m.quickReplies.map(choice => (
                              <button key={choice.status} type="button" disabled={busy} onClick={() => void voteQueue(m.id, m.queueMenuId!, choice)} className="rounded-full border border-[#2B4FD8]/40 bg-white px-4 py-2 text-xs font-bold text-[#2B4FD8] hover:bg-[#2B4FD8]/10 disabled:opacity-50">
                                {choice.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {busy && (
                    <div className="flex items-center gap-2 px-2 text-xs font-medium text-slate-400">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-violet-500" />
                      CampusSync AIが確認しています…
                    </div>
                  )}
                  {msgs.length === 1 && (
                    <div className="pt-1">
                      <p className="mb-2 text-xs font-black text-slate-500 dark:text-slate-400">よく使う質問</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {SUGGESTIONS.map(s => (
                          <button key={s} type="button" disabled={busy} onClick={() => void send(s)} className="flex items-center justify-between rounded-xl border border-violet-200 bg-white px-3.5 py-3 text-left text-xs font-bold text-slate-700 transition hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                            {s}
                            <span className="text-violet-500">→</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={e => { e.preventDefault(); void send(input); }} className="shrink-0 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-700 dark:bg-slate-900 sm:px-6 sm:py-4">
            <div className="mx-auto flex w-full max-w-5xl items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-xs focus-within:border-violet-400 dark:border-slate-700 dark:bg-slate-800">
              <input value={input} onChange={e => setInput(e.target.value)} maxLength={100} placeholder="学校のことを質問してください…" className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-slate-400 dark:text-white" />
              <button type="submit" disabled={busy || !input.trim()} aria-label="送信" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6D28D9] text-white transition hover:bg-violet-800 disabled:opacity-40">
                <Send size={18} />
              </button>
            </div>
            <p className="mx-auto mt-2 max-w-5xl text-[10px] text-slate-400">回答には登録情報が必要です。重要な内容は学校からの正式な連絡も確認してください。</p>
          </form>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (window.location.hash.toLowerCase() !== '#ai') window.location.hash = 'ai';
          }}
          aria-label="CampusSync AI専用画面を開く"
          title="CampusSync AIを開く"
          className="fixed bottom-20 right-4 z-[90] flex h-12 w-12 items-center justify-center rounded-full bg-[#6D28D9] text-white shadow-lg transition hover:scale-105 md:bottom-6"
        >
          <Sparkles size={22} />
        </button>
      )}
    </>
  );
}
