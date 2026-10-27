'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type UIEvent } from 'react';
import { AlertCircle, Check, Flag, LoaderCircle, MessageCircle, Paperclip, Pencil, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import ChatMessageContent, { ChatFormattingToolbar } from '@/components/ChatMessageContent';
import { supabase } from '@/lib/supabase';
import GradeSchoolChat from '@/components/GradeSchoolChat';

type ChatUser = { id: string; email?: string | null };
type Props = {
  authUser: ChatUser | null;
  studentId: string;
  studentName: string;
  userClass: string;
  unreadCount?: number;
  headerVisible?: boolean;
  onMessagesScroll?: (event: UIEvent<HTMLDivElement>) => void;
};
type ChatMessage = {
  id: string;
  user_id: string;
  student_id: string;
  student_name: string;
  class_name: string;
  body: string;
  created_at: string;
  updated_at: string;
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
};
type ReactionEmoji = '👍' | '❤️' | '😂' | '👀';
type ChatReaction = {
  id: string;
  message_id: string;
  user_id: string;
  student_id: string;
  class_name: string;
  emoji: ReactionEmoji;
  created_at?: string;
};
const REACTION_CHOICES: ReactionEmoji[] = ['👍', '❤️', '😂', '👀'];
const MAX_MESSAGE_LENGTH = 500;
const MAX_MESSAGES = 50;

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
function sortMessages(items: ChatMessage[]) {
  return [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-MAX_MESSAGES);
}

function ClassChatPanel({ authUser, studentId, studentName, userClass, unreadCount = 0, headerVisible = true, onMessagesScroll }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [draft, setDraft] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const profileReady = Boolean(authUser?.id && /^\d{6}$/.test(studentId) && studentName.trim() && /^[1-3]-[1-8]$/.test(userClass));

  const groupedReactions = useMemo(() => {
    const grouped = new Map<string, ChatReaction[]>();
    reactions.forEach(reaction => {
      const list = grouped.get(reaction.message_id) ?? [];
      list.push(reaction);
      grouped.set(reaction.message_id, list);
    });
    return grouped;
  }, [reactions]);

  const loadMessages = useCallback(async (isStillActive?: () => boolean) => {
    if (selectedFile && (selectedFile.size > 10 * 1024 * 1024 || !['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(selectedFile.type))) { setError('添付はPDF・画像・テキスト・Word（10MB以内）に対応しています。'); return; }
    if (!profileReady || !authUser?.id) {
      setLoading(false);
      return;
    }
    setError('');
    const { data, error: queryError } = await supabase
      .from('class_chat_messages')
      .select('id,user_id,student_id,student_name,class_name,body,created_at,updated_at,attachment_path,attachment_name,attachment_mime')
      .eq('class_name', userClass)
      .order('created_at', { ascending: false })
      .limit(MAX_MESSAGES);
    if (isStillActive && !isStillActive()) return;
    if (queryError) {
      setError(queryError.message.includes('class_chat_messages') || queryError.message.includes('schema cache')
        ? 'チャット用テーブルが未設定です。Supabase SQL Editorで supabase/class-chat.sql を実行してください。'
        : 'メッセージを読み込めませんでした: ' + queryError.message);
      setLoading(false);
      return;
    }
    const loaded = sortMessages((data ?? []) as ChatMessage[]);
    setMessages(loaded);
    const ids = loaded.map(item => item.id);
    if (ids.length) {
      const { data: reactionData, error: reactionError } = await supabase
        .from('class_chat_reactions')
        .select('id,message_id,user_id,student_id,class_name,emoji,created_at')
        .in('message_id', ids);
      if (isStillActive && !isStillActive()) return;
      if (reactionError) {
        setNotice('リアクション用テーブルが未設定です。SQLの実行を確認してください。');
      } else {
        setReactions((reactionData ?? []) as ChatReaction[]);
      }
    } else {
      setReactions([]);
    }
    setLoading(false);
  }, [authUser?.id, profileReady, userClass]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadMessages(() => active);
    if (!authUser?.id || !profileReady || !/^[1-3]-[1-8]$/.test(userClass)) {
      return () => { active = false; };
    }
    const channel = supabase
      .channel('class-chat:' + userClass + ':' + authUser.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'class_chat_messages', filter: 'class_name=eq.' + userClass,
      }, payload => {
        if (!active) return;
        if (payload.eventType === 'INSERT') {
          const row = payload.new as ChatMessage;
          if (row.class_name === userClass) setMessages(current => sortMessages([...current.filter(item => item.id !== row.id), row]));
        } else if (payload.eventType === 'UPDATE') {
          const row = payload.new as ChatMessage;
          setMessages(current => sortMessages(current.map(item => item.id === row.id ? row : item)));
        } else if (payload.eventType === 'DELETE') {
          const row = payload.old as Partial<ChatMessage>;
          if (row.id) {
            setMessages(current => current.filter(item => item.id !== row.id));
            setReactions(current => current.filter(item => item.message_id !== row.id));
          }
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'class_chat_reactions', filter: 'class_name=eq.' + userClass,
      }, payload => {
        if (!active) return;
        if (payload.eventType === 'INSERT') {
          const row = payload.new as ChatReaction;
          setReactions(current => current.some(item => item.id === row.id) ? current : [...current, row]);
        } else if (payload.eventType === 'DELETE') {
          const row = payload.old as Partial<ChatReaction>;
          if (row.id) setReactions(current => current.filter(item => item.id !== row.id));
        }
      })
      .subscribe(status => {
        if (!active) return;
        setRealtimeConnected(status === 'SUBSCRIBED');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setNotice('リアルタイム更新に接続できません。手動更新は利用できます。');
      });
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [authUser?.id, profileReady, userClass, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const body = draft.trim();
    if (!body) { setError('本文を入力してください。'); return; }
    if (body.length > MAX_MESSAGE_LENGTH) {
      setError('メッセージは' + MAX_MESSAGE_LENGTH + '文字以内にしてください。');
      return;
    }
    if (!profileReady || !authUser?.id) {
      setError('プロフィールの氏名・クラス情報を読み込めません。プロフィール設定を確認してください。');
      return;
    }
    setSending(true);
    setError('');
    setNotice('');
    try {
      if (editingId) {
        const { data, error: updateError } = await supabase
          .from('class_chat_messages')
          .update({ body, updated_at: new Date().toISOString() })
          .eq('id', editingId)
          .eq('user_id', authUser.id)
          .select('id,user_id,student_id,student_name,class_name,body,created_at,updated_at,attachment_path,attachment_name,attachment_mime')
          .single();
        if (updateError) throw updateError;
        setMessages(current => sortMessages(current.map(item => item.id === editingId ? data as ChatMessage : item)));
        setEditingId(null);
        setNotice('メッセージを編集しました。');
      } else {
        let uploadedPath: string | null = null;
        let attachmentFields: { attachment_path: string | null; attachment_name: string | null; attachment_mime: string | null } = { attachment_path: null, attachment_name: null, attachment_mime: null };
        if (selectedFile) {
          const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'attachment';
          const path = authUser.id + '/' + crypto.randomUUID() + '-' + safeName;
          const upload = await supabase.storage.from('chat-attachments').upload(path, selectedFile, { contentType: selectedFile.type, upsert: false });
          if (upload.error) throw upload.error;
          uploadedPath = path;
          attachmentFields = { attachment_path: path, attachment_name: selectedFile.name, attachment_mime: selectedFile.type };
        }
        const { data, error: insertError } = await supabase.from('class_chat_messages').insert({ user_id: authUser.id, student_id: studentId, student_name: studentName.trim(), class_name: userClass, body, ...attachmentFields }).select('id,user_id,student_id,student_name,class_name,body,created_at,updated_at,attachment_path,attachment_name,attachment_mime').single();
        if (insertError) { if (uploadedPath) await supabase.storage.from('chat-attachments').remove([uploadedPath]); throw insertError; }
        setMessages(current => sortMessages([...current.filter(item => item.id !== data.id), data as ChatMessage]));
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      setDraft('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String((caught as { message?: string })?.message ?? caught);
      setError(message.includes('class_chat_messages') || message.includes('schema cache')
        ? 'Supabaseのチャット用設定がまだ完了していません。supabase/class-chat.sql をSQL Editorで実行してください。'
        : '送信できませんでした: ' + message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function startEdit(message: ChatMessage) {
    setEditingId(message.id);
    setDraft(message.body);
    setError('');
    setNotice('');
    inputRef.current?.focus();
  }

  async function deleteMessage(message: ChatMessage) {
    if (!authUser?.id || message.user_id !== authUser.id) return;
    if (!window.confirm('このメッセージを削除しますか？')) return;
    const { error: deleteError } = await supabase.from('class_chat_messages').delete().eq('id', message.id).eq('user_id', authUser.id);
    if (deleteError) {
      setError('削除できませんでした: ' + deleteError.message);
      return;
    }
    setMessages(current => current.filter(item => item.id !== message.id));
    setReactions(current => current.filter(item => item.message_id !== message.id));
  }

  async function reportMessage(messageId: string) {
    if (!authUser?.id) return;
    const reason = window.prompt('通報理由を入力してください：いじめ・嫌がらせ / 個人情報 / 迷惑投稿・連投 / 不適切な内容 / その他');
    if (!reason) return;
    const allowed = ['いじめ・嫌がらせ', '個人情報', '迷惑投稿・連投', '不適切な内容', 'その他'];
    if (!allowed.includes(reason.trim())) { setError('表示された通報理由のいずれかを入力してください。'); return; }
    const { error: reportError } = await supabase.from('chat_message_reports').insert({
      reporter_user_id: authUser.id, message_id: messageId, message_table: 'class_chat_messages', reason: reason.trim()
    });
    if (reportError) setError(reportError.code === '23505' ? 'このメッセージは通報済みです。' : '通報できませんでした。SQLの実行状況を確認してください。');
    else setNotice('通報を受け付けました。管理者が確認します。');
  }

  async function toggleReaction(message: ChatMessage, emoji: ReactionEmoji) {
    if (!authUser?.id || !profileReady) return;
    const existing = (groupedReactions.get(message.id) ?? []).find(item => item.user_id === authUser.id && item.emoji === emoji);
    setError('');
    setNotice('');
    if (existing) {
      const { error: deleteError } = await supabase.from('class_chat_reactions').delete().eq('id', existing.id).eq('user_id', authUser.id);
      if (deleteError) setError('リアクションを取り消せませんでした: ' + deleteError.message);
      else setReactions(current => current.filter(item => item.id !== existing.id));
      return;
    }
    const { data, error: insertError } = await supabase
      .from('class_chat_reactions')
      .insert({ message_id: message.id, user_id: authUser.id, student_id: studentId, class_name: userClass, emoji })
      .select('id,message_id,user_id,student_id,class_name,emoji,created_at')
      .single();
    if (insertError) setError('リアクションを送信できませんでした: ' + insertError.message);
    else setReactions(current => current.some(item => item.id === data.id) ? current : [...current, data as ChatReaction]);
  }

  const statusText = realtimeConnected ? 'リアルタイム接続中' : '接続状態を確認中';
  return (
    <section className="mx-auto flex flex-1 min-h-0 w-full max-w-3xl flex-col gap-2 animate-in fade-in duration-200">
      <header className={'campus-chat-panel-header ' + (headerVisible ? 'campus-chat-panel-header--visible' : 'campus-chat-panel-header--hidden') + ' flex flex-wrap items-center justify-between gap-3'}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"><MessageCircle size={24} /></div>
          <div className="min-w-0">
            <h2 className="text-xl font-black text-slate-900 dark:text-white">クラスチャット</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{userClass}組のみ参加できるチャット</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && <span className="rounded-full bg-rose-600 px-2 py-1 text-[10px] font-black text-white">未読 {unreadCount}</span>}
          <span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ' + (realtimeConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600') + ' dark:bg-slate-800 dark:text-slate-200'}>
            <span className={'h-1.5 w-1.5 rounded-full ' + (realtimeConnected ? 'bg-emerald-500' : 'bg-slate-400')} />{statusText}
          </span>
          <button type="button" onClick={() => void loadMessages()} disabled={loading} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            {loading ? <LoaderCircle size={14} className="animate-spin" /> : '更新'}
          </button>
        </div>
      </header>

      {!profileReady && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertCircle size={20} className="shrink-0" /><p>クラスチャットを使うには、学校プロフィールに氏名とクラス（例：1-1）が登録されている必要があります。</p>
        </div>
      )}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-semibold text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">{notice}</div>}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className={'campus-chat-panel-title ' + (headerVisible ? 'campus-chat-panel-title--visible' : 'campus-chat-panel-title--hidden') + ' flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800'}>
          <div><p className="text-sm font-black text-slate-800 dark:text-slate-100">{userClass}組の会話</p><p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">最新50件 · 最大500文字</p></div>
          <ShieldCheck size={18} className="text-emerald-600" aria-label="クラス単位で保護" />
        </div>
        <div onScroll={onMessagesScroll} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" />メッセージを読み込んでいます…</div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <MessageCircle size={28} className="text-slate-300" />
              <p className="text-sm font-black text-slate-700 dark:text-slate-200">まだメッセージがありません</p>
              <p className="max-w-xs text-xs leading-relaxed text-slate-500 dark:text-slate-400">クラスのみんなに最初のメッセージを送ってみよう。</p>
            </div>
          ) : messages.map(message => {
            const mine = message.user_id === authUser?.id;
            const messageReactions = groupedReactions.get(message.id) ?? [];
            return (
              <article key={message.id} className={'group flex gap-2.5 ' + (mine ? 'flex-row-reverse' : 'flex-row')}>
                <div className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ' + (mine ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200')} aria-hidden="true">{message.student_name.trim().slice(0, 1) || '生'}</div>
                <div className={'min-w-0 max-w-[88%] space-y-1.5 ' + (mine ? 'items-end' : 'items-start')}>
                  <div className={'flex flex-wrap items-baseline gap-2 ' + (mine ? 'justify-end' : 'justify-start')}>
                    <span className="text-xs font-black text-slate-700 dark:text-slate-200">{mine ? 'あなた' : message.student_name}</span>
                    <time className="text-[10px] text-slate-400" dateTime={message.created_at}>{formatTime(message.created_at)}</time>
                    {message.updated_at !== message.created_at && <span className="text-[9px] text-slate-400">編集済み</span>}
                  </div>
                  <div className={'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-6 ' + (mine ? 'rounded-tr-md bg-blue-600 text-white' : 'rounded-tl-md bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100')}><ChatMessageContent body={message.body} attachmentPath={message.attachment_path} attachmentName={message.attachment_name} attachmentMime={message.attachment_mime} /></div>
                  <div className={'flex flex-wrap items-center gap-1.5 ' + (mine ? 'justify-end' : 'justify-start')}>
                    {REACTION_CHOICES.map(emoji => {
                      const matching = messageReactions.filter(item => item.emoji === emoji);
                      const selected = matching.some(item => item.user_id === authUser?.id);
                      return (
                        <button key={emoji} type="button" onClick={() => void toggleReaction(message, emoji)} disabled={!profileReady} aria-label={'リアクション ' + emoji + ' ' + matching.length + '件'} className={'rounded-full border px-2 py-1 text-[11px] disabled:opacity-50 ' + (selected ? 'border-blue-300 bg-blue-50 dark:bg-blue-950' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900')}>
                          {emoji}{matching.length > 0 ? ' ' + matching.length : ''}
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => void reportMessage(message.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-amber-600 hover:bg-amber-50"><Flag size={11} />通報</button>
                    {mine && <>
                      <button type="button" onClick={() => { setEditingId(message.id); setDraft(message.body); setError(''); setNotice(''); inputRef.current?.focus(); }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil size={11} />編集</button>
                      <button type="button" onClick={() => void deleteMessage(message)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 size={11} />削除</button>
                    </>}
                  </div>
                </div>
              </article>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={sendMessage} className="border-t border-slate-100 p-3 dark:border-slate-800 sm:p-4">
          {editingId && <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100"><span>自分のメッセージを編集中</span><button type="button" onClick={() => { setEditingId(null); setDraft(''); }} className="inline-flex items-center gap-1"><X size={13} />キャンセル</button></div>}
          {!editingId && <ChatFormattingToolbar value={draft} onChange={setDraft} inputRef={inputRef} />}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {!editingId && <><input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx" className="hidden" onChange={event => setSelectedFile(event.target.files?.[0] ?? null)} /><button type="button" onClick={() => fileInputRef.current?.click()} disabled={!profileReady || sending} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-50 dark:border-slate-700"><Paperclip size={14}/>ファイル添付</button>{selectedFile && <span className="max-w-[70%] truncate text-xs text-slate-500">{selectedFile.name}<button type="button" onClick={() => { setSelectedFile(null); if(fileInputRef.current) fileInputRef.current.value = ""; }} className="ml-2 font-bold text-rose-600">×</button></span>}</>}
          </div>
          <div className="flex items-end gap-2">
            <textarea ref={inputRef} value={draft} onChange={event => setDraft(event.target.value)} maxLength={MAX_MESSAGE_LENGTH} rows={2} disabled={!profileReady || sending} placeholder={profileReady ? 'クラスのみんなにメッセージ…' : '氏名・クラスの登録が必要です'} className="min-h-[44px] min-w-0 flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (draft.trim() && !sending) event.currentTarget.form?.requestSubmit(); } }} />
            <button type="submit" disabled={!profileReady || !draft.trim() || sending} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {sending ? <LoaderCircle size={16} className="animate-spin" /> : editingId ? <Check size={16} /> : <Send size={16} />}<span className="hidden sm:inline">{sending ? '送信中' : editingId ? '保存' : '送信'}</span>
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400"><span>学校メール認証済みの同じクラスだけが参加できます。</span><span>{draft.length}/{MAX_MESSAGE_LENGTH}</span></div>
        </form>
      </div>
    </section>
  );
}

export default function ClassChat(props: Props) {
 const [scope,setScope]=useState<'class'|'grade'|'school'>('class');
 const [headerVisible,setHeaderVisible]=useState(true);
 const lastScrollTop=useRef(0);
 const userScrollIntent=useRef(false);
 function handleMessagesScroll(event:UIEvent<HTMLDivElement>) {
   const next=event.currentTarget.scrollTop;
   const previous=lastScrollTop.current;
   if (!userScrollIntent.current) { lastScrollTop.current=next; return; }
   userScrollIntent.current=false;
   if (next <= 8 || next < previous - 2) setHeaderVisible(true);
   else if (next > previous + 2) setHeaderVisible(false);
   lastScrollTop.current=next;
 }
 function changeScope(next:'class'|'grade'|'school') {
   setScope(next);
   setHeaderVisible(true);
   lastScrollTop.current=0;
   userScrollIntent.current=false;
 }
 return <section onWheel={() => { userScrollIntent.current=true; }} onTouchMove={() => { userScrollIntent.current=true; }} className="relative mx-auto flex flex-1 min-h-0 w-full max-w-3xl flex-col gap-2">
 <nav aria-label="チャット範囲" className={'campus-chat-scope-nav ' + (headerVisible ? 'campus-chat-scope-nav--visible' : 'campus-chat-scope-nav--hidden') + ' grid shrink-0 grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900'}>
 {[{id:'class',label:'クラス',detail:props.userClass+'組'},{id:'grade',label:'学年',detail:props.userClass.slice(0,1)+'年生'},{id:'school',label:'全校',detail:'全生徒'}].map(item=><button key={item.id} type="button" aria-pressed={scope===item.id} onClick={()=>changeScope(item.id as 'class'|'grade'|'school')} className={'rounded-xl px-2 py-2 text-center '+(scope===item.id?'bg-blue-600 text-white':'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}><span className="block text-sm font-black">{item.label}</span><span className="mt-0.5 block text-[10px]">{item.detail}</span></button>)}
 </nav>
 <button type="button" aria-hidden={headerVisible} tabIndex={headerVisible ? -1 : 0} onClick={()=>{setHeaderVisible(true);userScrollIntent.current=false;}} className={'campus-chat-show-header absolute left-1/2 top-1 z-20 -translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[10px] font-bold text-slate-600 shadow-md backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 ' + (headerVisible ? 'campus-chat-show-header--hidden' : 'campus-chat-show-header--visible')}>⌃ 上部を表示</button>
 {scope==='class'?<ClassChatPanel {...props} headerVisible={headerVisible} onMessagesScroll={handleMessagesScroll}/>:<GradeSchoolChat {...props} scope={scope} headerVisible={headerVisible} onMessagesScroll={handleMessagesScroll}/>}
 </section>;
}
