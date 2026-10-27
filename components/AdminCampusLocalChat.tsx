'use client';

import { useState } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

function makeSimpleReply(text: string): string {
  const value = text.trim().toLowerCase();

  if (/^(こんにちは|こんちは|やあ|やっほ|おはよう|こんばんは|hello|hi)[！!。\s]*$/i.test(value)) {
    return 'こんにちは！ 今日あったことを教えてくれる？';
  }
  if (/(ありがとう|ありがと|thanks|thank you)/i.test(value)) {
    return 'どういたしまして！ ほかにも話したいことはある？';
  }
  if (/(疲れた|つかれた|しんどい|大変だった)/u.test(value)) {
    return 'おつかれさま。無理しすぎないでね。何があったの？';
  }
  if (/(悲しい|かなしい|不安|心配|落ち込)/u.test(value)) {
    return 'そうなんだね。話してくれてありがとう。よかったら、話せる範囲でもう少し聞かせてね。';
  }
  if (/(うれしい|嬉しい|楽しかった|最高|やった)/u.test(value)) {
    return 'それはよかったね！ 何がいちばん楽しかった？';
  }
  if (/(名前|誰なの|だれなの|何者)/u.test(value)) {
    return 'ぼくはCampusSync AIだよ。よろしくね！';
  }
  if (/(好きな食べ物|何が好き|好きなもの|趣味)/u.test(value)) {
    return 'ぼくには人間みたいな好みはないけれど、いろいろなお話を聞いていきたいな。きみは何が好き？';
  }
  if (/(勉強|宿題|課題|数学|英語|理科|社会)/u.test(value)) {
    return '勉強のことだね。いっしょに整理しよう。どの部分で困っているか教えてくれる？';
  }
  if (/(どうしたら|どうすれば|困って|相談したい)/u.test(value)) {
    return 'いっしょに考えよう。今いちばん気になっていることは何かな？';
  }
  if (/(こんにちは|やあ|おはよう|こんばんは)/u.test(value)) {
    return 'こんにちは！ 今日はどんな一日だった？';
  }
  return 'そうなんだね。もう少し詳しく聞かせてくれる？';
}

export default function AdminCampusLocalChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'こんにちは！ CampusSync AIだよ。今日は何を話そうか？',
    },
  ]);
  const [input, setInput] = useState('');

  function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim().slice(0, 300);
    if (!text) return;

    const next: Message[] = [
      ...messages,
      { role: 'user', content: text },
      { role: 'assistant', content: makeSimpleReply(text) },
    ].slice(-12);

    setMessages(next);
    setInput('');
  }

  return (
    <section className="space-y-4 rounded-2xl border border-cyan-500/30 bg-slate-950 p-5">
      <div>
        <h3 className="text-xl font-black">CampusSync AI｜省メモリ会話</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          この端末でクラッシュしないよう、モデルのダウンロードやGPU処理を停止しています。
          外部APIを使わず、短いルール応答で会話します。
        </p>
      </div>

      <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-sm leading-6 text-amber-100" role="status">
        省メモリモード：大きなAIモデルは読み込みません。現在の返事は簡易ルールによるもので、本格的な生成AIの回答ではありません。
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMessages([
            { role: 'assistant', content: 'こんにちは！ またお話ししよう。' },
          ])}
          className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200"
        >
          会話をリセット
        </button>
      </div>

      <div className="max-h-[320px] space-y-3 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-3">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 ${
              message.role === 'user'
                ? 'bg-blue-700 text-white'
                : 'bg-slate-800 text-slate-100'
            }`}>
              <p className="mb-1 text-xs opacity-70">
                {message.role === 'user' ? 'あなた' : 'CampusSync AI'}
              </p>
              {message.content}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={sendMessage} className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={event => setInput(event.target.value)}
          maxLength={300}
          rows={2}
          placeholder="AIに話しかけてみよう…"
          className="min-w-0 flex-1 resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          送信
        </button>
      </form>

      <p className="text-xs leading-5 text-slate-500">
        会話は画面内だけに保持され、学習データとして保存されません。個人情報や秘密の情報は入力しないでください。
      </p>
    </section>
  );
}
