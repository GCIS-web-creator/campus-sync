'use client';

import { useRef, useState } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type Generator = (messages: any[], options: any) => Promise<any[]>;

const MODEL = 'onnx-community/SmolLM2-135M-Instruct-ONNX-MHA';

const SYSTEM_PROMPT = `
あなたはCampusSync AIです。
日本語で、やさしく自然に会話してください。
短くわかりやすい文を使い、一度に質問しすぎないでください。
相手の話を受け止め、必要なら自然な質問を一つ返してください。
知らないことは、知らないとはっきり伝えてください。
事実を勝手に作らないでください。
学校や生徒について、個人情報を尋ねないでください。
`;

function makeSimpleReply(text: string): string {
  if (/こんにちは|おはよう|こんばんは|やあ|やっほ/u.test(text)) {
    return 'こんにちは！ 今日あったことを教えてくれる？';
  }
  if (/ありがとう|ありがと/u.test(text)) {
    return 'どういたしまして！ ほかにも話したいことはある？';
  }
  if (/疲れ|つかれ|しんどい|大変/u.test(text)) {
    return 'おつかれさま。無理しすぎないでね。何があったの？';
  }
  if (/悲しい|かなしい|不安|心配/u.test(text)) {
    return 'そうなんだね。話してくれてありがとう。よかったら、もう少し聞かせてね。';
  }
  if (/名前/u.test(text)) {
    return 'ぼくはCampusSync AIだよ。よろしくね！';
  }
  if (/好き|すき/u.test(text)) {
    return 'いいね！ どういうところが好きなの？';
  }
  return 'うん、そうなんだね。もう少し教えてくれる？';
}

export default function AdminCampusLocalChat() {
  const generatorRef = useRef<Generator | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'こんにちは！ CampusSync AIだよ。今日は何を話そうか？',
    },
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('省メモリモードです。モデル未読み込み中は簡易応答で会話します。');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadModel() {
    if (generatorRef.current || loading) return;

    setLoading(true);
    if ('deviceMemory' in navigator && typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
      && (navigator as Navigator & { deviceMemory?: number }).deviceMemory! <= 4) {
      const proceed = window.confirm(
        'この端末はメモリが少ない可能性があります。小型モデルでも動作が重くなることがあります。読み込みを試しますか？'
      );
      if (!proceed) {
        setStatus('モデルの読み込みを中止しました。簡易モードのまま利用できます。');
        return;
      }
    }
    setStatus('小型モデルを準備中です。初回は約140MBのモデルをダウンロードします。重くなったらページを閉じてください。');

    try {
      const transformers = await import('@huggingface/transformers');
      const createPipeline = transformers.pipeline as any;
      const options = {
        dtype: 'q4',
        progress_callback: (progress: any) => {
          if (progress?.status === 'progress' && typeof progress.progress === 'number') {
            setStatus(`モデルをダウンロード中… ${Math.round(progress.progress)}%`);
          } else if (progress?.status === 'initiate') {
            setStatus('モデルのファイルを準備しています…');
          }
        },
      };

      generatorRef.current = await createPipeline(
        'text-generation',
        MODEL,
        { ...options, device: 'wasm' },
      );

      setStatus('準備完了！ 会話できるよ。');
    } catch (error) {
      console.error('CampusSync local model failed to load:', error);
      setStatus('モデルを読み込めませんでした。メモリ不足またはWebGPU非対応の可能性があります。ほかのタブを閉じて、ページを再読み込みしてから再試行してください。');
      generatorRef.current = null;
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const userMessage: Message = { role: 'user', content: text };
    const nextMessages = [...messages, userMessage].slice(-12);

    setInput('');

    if (!generatorRef.current) {
      setMessages([...nextMessages, {
        role: 'assistant',
        content: makeSimpleReply(text),
      }].slice(-12));
      setStatus('省メモリの簡易モードです。小型モデルを試すときだけ「小型会話モデルを手動で読み込む」を押してください。');
      return;
    }

    setMessages(nextMessages);
    setBusy(true);

    try {
      const generator = generatorRef.current;

      const history = nextMessages.slice(-2);
      const result = await generator(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history,
        ],
        {
          max_new_tokens: 32,
          do_sample: true,
          temperature: 0.7,
          top_p: 0.9,
        },
      );

      const generated = result?.[0]?.generated_text;
      let answer = '';

      if (Array.isArray(generated)) {
        const lastAssistant = [...generated]
          .reverse()
          .find((item: any) => item?.role === 'assistant');
        answer = typeof lastAssistant?.content === 'string'
          ? lastAssistant.content.trim()
          : '';
      } else if (typeof generated === 'string') {
        answer = generated.trim();
      }

      if (!answer) {
        answer = 'うまく答えを作れなかったよ。もう一度聞いてみてね。';
      }

      setMessages(current => [...current, { role: 'assistant', content: answer }].slice(-12));
      setStatus('会話中：ブラウザー内のモデルで生成しています。');
    } catch (error) {
      console.error('CampusSync local chat failed:', error);
      setMessages(current => [...current,
        {
          role: 'assistant',
          content: 'ごめんね、今はうまく返事を作れなかったよ。モデルの読み込み状態を確認してみてね。',
        },
      ].slice(-12));
      setStatus('会話に失敗しました。もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-cyan-500/30 bg-slate-950 p-5">
      <div>
        <h3 className="text-xl font-black">CampusSync AI｜ローカル会話</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          モデル未読み込み時はダウンロード不要の簡易応答で動きます。必要なときだけ約140MBの小型モデルを手動で読み込めます。外部AI APIキーは不要です。
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300" role="status">
        {status}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void loadModel()}
          disabled={loading || busy || !!generatorRef.current}
          className="rounded-xl bg-cyan-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {loading ? '読み込み中…' : generatorRef.current ? 'モデル読み込み済み' : '小型会話モデルを手動で読み込む'}
        </button>
        <button
          type="button"
          onClick={() => setMessages([
            { role: 'assistant', content: 'こんにちは！ またお話ししよう。' },
          ])}
          disabled={busy}
          className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 disabled:opacity-50"
        >
          会話をリセット
        </button>
      </div>

      <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-3">
        {messages.map((message, index) => (
          <div
            key={`${index}-${message.role}`}
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
          maxLength={1000}
          rows={2}
          placeholder="AIに話しかけてみよう…"
          className="min-w-0 flex-1 resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? '考え中…' : '送信'}
        </button>
      </form>

      <p className="text-xs leading-5 text-slate-500">
        モデル未読み込み時は軽量なルール応答を使います。小型モデルは必要なときだけ手動で読み込めます。会話は画面内のみで、学習データとして保存されません。個人情報や秘密の情報は入力しないでください。
      </p>
    </section>
  );
}
