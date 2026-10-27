'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Props = {
  body: string;
  attachmentPath?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
};

function renderFormattedText(body: string) {
  const token = /(\*\*[^*\n]+\*\*|(?<!\*)\*[^*\n]+\*(?!\*)|\[color=\#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\][\s\S]*?\[\/color\])/g;
  return body.split(token).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    const colorMatch = part.match(/^\[color=(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})\]([\s\S]*)\[\/color\]$/);
    if (colorMatch) return <span key={index} style={{ color: colorMatch[1] }}>{colorMatch[2]}</span>;
    return <span key={index}>{part}</span>;
  });
}

export function ChatFormattingToolbar({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  function wrapSelection(before: string, after = before) {
    const input = inputRef.current;
    if (!input) {
      onChange(value + before + after);
      return;
    }
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + (selected || 'テキスト') + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, start + before.length + (selected || 'テキスト').length);
    });
  }
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="文字装飾">
      <button type="button" title="選択した文字を太字" onClick={() => wrapSelection('**')} className="rounded-lg border px-2.5 py-1.5 text-xs font-black">B</button>
      <button type="button" title="選択した文字をイタリック" onClick={() => wrapSelection('*')} className="rounded-lg border px-2.5 py-1.5 text-xs italic">I</button>
      <label className="flex items-center gap-2 rounded-lg border px-2 py-1 text-xs">
        <span>文字色</span>
        <input aria-label="文字色" type="color" defaultValue="#ef4444" onChange={event => {
          const color = event.target.value;
          wrapSelection('[color=' + color + ']', '[/color]');
        }} className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" />
      </label>
      <span className="text-[10px] text-slate-500">文字を選択してからボタンを押してください</span>
    </div>
  );
}

export default function ChatMessageContent({ body, attachmentPath, attachmentName, attachmentMime }: Props) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState(false);
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    let active = true;
    setUrl('');
    setUrlError('');
    if (attachmentPath) {
      void supabase.storage.from('chat-attachments').createSignedUrl(attachmentPath, 300).then(({ data, error }) => {
        if (!active) return;
        if (error) setUrlError('添付ファイルを開けません。閲覧権限とPhase 4 SQLを確認してください。');
        else setUrl(data.signedUrl);
      });
    }
    return () => { active = false; };
  }, [attachmentPath]);

  return (
    <div className="space-y-2">
      {body && <div className="whitespace-pre-wrap break-words">{renderFormattedText(body)}</div>}
      {attachmentPath && (
        <div className="rounded-xl border border-current/15 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 break-all text-xs font-semibold">📎 {attachmentName || '添付ファイル'}</span>
            {url && <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border px-2.5 py-1 text-xs font-bold">開く / 保存</a>}
            {url && attachmentMime === 'application/pdf' && <button type="button" onClick={() => setPreview(v => !v)} className="rounded-lg border px-2.5 py-1 text-xs font-bold">{preview ? 'プレビューを閉じる' : 'PDFをプレビュー'}</button>}
          </div>
          {urlError && <p role="alert" className="mt-2 text-xs text-rose-600">{urlError}</p>}
          {preview && url && attachmentMime === 'application/pdf' && <iframe title={attachmentName || 'PDFプレビュー'} src={url} className="mt-3 h-[420px] w-full rounded-lg border bg-white" />}
          {url && attachmentMime?.startsWith('image/') && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={attachmentName || '添付画像'} loading="lazy" className="mt-2 max-h-64 max-w-full rounded-lg object-contain" /></a>}
        </div>
      )}
    </div>
  );
}
