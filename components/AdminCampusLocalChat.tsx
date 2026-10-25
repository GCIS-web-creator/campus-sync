'use client';

import { useRef, useState } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type Generator = (messages: any[], options: any) => Promise<any[]>;

const MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';

const SYSTEM_PROMPT = `
あなたはCampusSync AIです。
日本語で、やさしく自然に会話してください。
短くわかりやすい文を使い、一度に質問しすぎないでください。
相手の話を受け止め、必要なら自然な質問を一つ返してください。
知らないことは、知らないとはっきり伝えてください。
事実を勝手に作らないでください。
学校や生徒について、個人情報を尋ねないでください。
`;

export default function AdminCampusLocalChat() {
  const generatorRef = useRef<Generator | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'こんにちは！ CampusSync AIだよ。今日は何を話そうか？',
    },
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('モデルはまだ読み込まれていません。');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadModel() {
    if (generatorRef.current || loading) return;

    setLoading(true);
    setStatus('モデルを読み込んでいます。初回はダウンロードに時間がかかります。');

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

      try {
        generatorRef.current = await createPipeline(
          'text-generation',
          MODEL,
          { ...options, device: 'webgpu' },
        );
      } catch {
        setStatus('WebGPUが利用できないため、CPU実行を試しています…');
        generatorRef.current = await createPipeline(
          'text-generation',
          MODEL,
          { ...options, device: 'wasm' },
        );
      }

      setStatus('準備完了！ 会話できるよ。');
    } catch (error) {
      console.error('CampusSync local model failed to load:', error);
      setStatus('モデルを読み込めませんでした。ブラウザーの対応状況や通信を確認して、もう一度試してください。');
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
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput('');
    setBusy(true);

    try {
      if (!generatorRef.current) {
        await loadModel();
      }

      const generator = generatorRef.current;
      if (!generator) {
        throw new Error('モデルを読み込めませんでした。');
      }

      const history = nextMessages.slice(-8);
      const result = await generator(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history,
        ],
        {
          max_new_tokens: 160,
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

      setMessages(current => [
        ...current,
        { role: 'assistant', content: answer },
      ]);
      setStatus('会話中：ブラウザー内のモデルで生成しています。');
    } catch (error) {
      console.error('CampusSync local chat failed:', error);
      setMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: 'ごめんね、今はうまく返事を作れなかったよ。モデルの読み込み状態を確認してみてね。',
        },
      ]);
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
          外部AIのAPIキーは使わず、ブラウザー内で会話を生成します。
          初回はモデルのダウンロードが必要です。
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
          {loading ? '読み込み中…' : generatorRef.current ? 'モデル読み込み済み' : '会話モデルを読み込む'}
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
        会話は今のところ画面内だけに保持され、学習データとしては保存されません。
        個人情報や秘密の情報は入力しないでください。
      </p>
    </section>
  );
}
