'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, Send, X } from 'lucide-react';
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

export default function CampusAIChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 'greeting', role: 'ai', text: GREETING }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [msgs, open]);
  if (pathname?.startsWith('/admin')) return null;

  async function send(raw: string) {
    const question = raw.trim().slice(0, 100);
    if (!question || busy) return;
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setInput('');
    setMsgs(m => [...m, { id, role: 'user', text: question }]);
    setBusy(true);
    let reply: Msg = { id: `ai-${Date.now()}`, role: 'ai', text: 'AIにつながりませんでした。少し待ってからもう一度試してください。' };
    try {
      const { headers } = await getSessionHeaders();
      const res = await fetch('/api/campus-ai', { method: 'POST', headers, body: JSON.stringify({ question }) });
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
      {open && (
        <div role="dialog" aria-label="CampusSync AI" className="fixed bottom-36 right-4 z-[90] flex h-[30rem] max-h-[70vh] w-[23rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl md:bottom-24">
          <div className="flex items-center justify-between bg-[#2B4FD8] px-4 py-3 text-white">
            <div className="text-sm font-bold">CampusSync AI</div>
            <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="rounded-full p-1 hover:bg-white/20"><X size={18} /></button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {msgs.map(m => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={'max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ' + (m.role === 'user' ? 'whitespace-pre-wrap bg-[#2B4FD8] text-white' : 'border border-slate-200 bg-white text-slate-800')}>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  {m.table && (
                    <div className="mt-3 max-w-full overflow-x-auto rounded-lg border border-slate-200">
                      <table className="min-w-full border-collapse text-left text-xs">
                        <thead className="bg-slate-100">
                          <tr>{m.table.headers.map((h, i) => <th key={`${h}-${i}`} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-semibold">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {m.table.rows.map((row, i) => <tr key={i} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
                            {m.table!.headers.map((_, j) => <td key={j} className="whitespace-nowrap border-b border-slate-100 px-2 py-2">{row[j] ?? '—'}</td>)}
                          </tr>)}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {m.quickReplies?.length && m.queueMenuId && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.quickReplies.map(choice => (
                        <button key={choice.status} type="button" disabled={busy} onClick={() => void voteQueue(m.id, m.queueMenuId!, choice)} className="rounded-full border border-[#2B4FD8]/40 bg-white px-3 py-1.5 text-xs font-medium text-[#2B4FD8] hover:bg-[#2B4FD8]/10 disabled:opacity-50">
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="text-xs text-slate-400">確認中…</div>}
            {msgs.length === 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map(s => <button key={s} type="button" disabled={busy} onClick={() => void send(s)} className="rounded-full border border-[#2B4FD8]/40 bg-white px-3 py-1 text-xs text-[#2B4FD8] hover:bg-[#2B4FD8]/10 disabled:opacity-50">{s}</button>)}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={e => { e.preventDefault(); void send(input); }} className="flex items-center gap-2 border-t border-slate-200 bg-white p-2">
            <input value={input} onChange={e => setInput(e.target.value)} maxLength={100} placeholder="学校のことを質問" className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-base outline-none focus:border-[#2B4FD8]" />
            <button type="submit" disabled={busy || !input.trim()} aria-label="送信" className="rounded-full bg-[#2B4FD8] p-2.5 text-white disabled:opacity-40"><Send size={18} /></button>
          </form>
        </div>
      )}
      <button type="button" onClick={() => setOpen(o => !o)} aria-label={open ? 'AIチャットを閉じる' : 'AIチャットを開く'} className="fixed bottom-20 right-4 z-[90] flex h-12 w-12 items-center justify-center rounded-full bg-[#2B4FD8] text-white shadow-lg transition hover:scale-105 md:bottom-6">
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  );
}
