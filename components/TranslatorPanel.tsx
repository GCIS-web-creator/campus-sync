'use client';

import {
  ArrowLeftRight,
  Check,
  Clock3,
  Copy,
  Globe2,
  Languages,
  LoaderCircle,
  RotateCcw,
  Star,
  Trash2,
  Volume2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type LanguageOption = { code: string; label: string };

const LANGUAGES: LanguageOption[] = [
  { code: 'af', label: 'アフリカーンス語' },
  { code: 'am', label: 'アムハラ語' },
  { code: 'ar', label: 'アラビア語' },
  { code: 'ast', label: 'アストゥリアス語' },
  { code: 'az', label: 'アゼルバイジャン語' },
  { code: 'ba', label: 'バシキール語' },
  { code: 'be', label: 'ベラルーシ語' },
  { code: 'bg', label: 'ブルガリア語' },
  { code: 'bn', label: 'ベンガル語' },
  { code: 'br', label: 'ブルトン語' },
  { code: 'bs', label: 'ボスニア語' },
  { code: 'ca', label: 'カタルーニャ語' },
  { code: 'ceb', label: 'セブアノ語' },
  { code: 'cs', label: 'チェコ語' },
  { code: 'cy', label: 'ウェールズ語' },
  { code: 'da', label: 'デンマーク語' },
  { code: 'de', label: 'ドイツ語' },
  { code: 'el', label: 'ギリシャ語' },
  { code: 'en', label: '英語' },
  { code: 'es', label: 'スペイン語' },
  { code: 'et', label: 'エストニア語' },
  { code: 'fa', label: 'ペルシャ語' },
  { code: 'ff', label: 'フラ語' },
  { code: 'fi', label: 'フィンランド語' },
  { code: 'fr', label: 'フランス語' },
  { code: 'fy', label: '西フリジア語' },
  { code: 'ga', label: 'アイルランド語' },
  { code: 'gd', label: 'スコットランド・ゲール語' },
  { code: 'gl', label: 'ガリシア語' },
  { code: 'gu', label: 'グジャラート語' },
  { code: 'ha', label: 'ハウサ語' },
  { code: 'he', label: 'ヘブライ語' },
  { code: 'hi', label: 'ヒンディー語' },
  { code: 'hr', label: 'クロアチア語' },
  { code: 'ht', label: 'ハイチ語' },
  { code: 'hu', label: 'ハンガリー語' },
  { code: 'hy', label: 'アルメニア語' },
  { code: 'id', label: 'インドネシア語' },
  { code: 'ig', label: 'イボ語' },
  { code: 'ilo', label: 'イロカノ語' },
  { code: 'is', label: 'アイスランド語' },
  { code: 'it', label: 'イタリア語' },
  { code: 'ja', label: '日本語' },
  { code: 'jv', label: 'ジャワ語' },
  { code: 'ka', label: 'ジョージア語' },
  { code: 'kk', label: 'カザフ語' },
  { code: 'km', label: 'クメール語' },
  { code: 'kn', label: 'カンナダ語' },
  { code: 'ko', label: '韓国語' },
  { code: 'lb', label: 'ルクセンブルク語' },
  { code: 'lg', label: 'ガンダ語' },
  { code: 'ln', label: 'リンガラ語' },
  { code: 'lo', label: 'ラオス語' },
  { code: 'lt', label: 'リトアニア語' },
  { code: 'lv', label: 'ラトビア語' },
  { code: 'mg', label: 'マダガスカル語' },
  { code: 'mk', label: 'マケドニア語' },
  { code: 'ml', label: 'マラヤーラム語' },
  { code: 'mn', label: 'モンゴル語' },
  { code: 'mr', label: 'マラーティー語' },
  { code: 'ms', label: 'マレー語' },
  { code: 'my', label: 'ミャンマー語' },
  { code: 'ne', label: 'ネパール語' },
  { code: 'nl', label: 'オランダ語' },
  { code: 'no', label: 'ノルウェー語' },
  { code: 'ns', label: '北ソト語' },
  { code: 'oc', label: 'オック語' },
  { code: 'or', label: 'オリヤー語' },
  { code: 'pa', label: 'パンジャーブ語' },
  { code: 'pl', label: 'ポーランド語' },
  { code: 'ps', label: 'パシュトー語' },
  { code: 'pt', label: 'ポルトガル語' },
  { code: 'ro', label: 'ルーマニア語' },
  { code: 'ru', label: 'ロシア語' },
  { code: 'sd', label: 'シンド語' },
  { code: 'si', label: 'シンハラ語' },
  { code: 'sk', label: 'スロバキア語' },
  { code: 'sl', label: 'スロベニア語' },
  { code: 'so', label: 'ソマリ語' },
  { code: 'sq', label: 'アルバニア語' },
  { code: 'sr', label: 'セルビア語' },
  { code: 'ss', label: 'スワティ語' },
  { code: 'su', label: 'スンダ語' },
  { code: 'sv', label: 'スウェーデン語' },
  { code: 'sw', label: 'スワヒリ語' },
  { code: 'ta', label: 'タミル語' },
  { code: 'th', label: 'タイ語' },
  { code: 'tl', label: 'タガログ語' },
  { code: 'tn', label: 'ツワナ語' },
  { code: 'tr', label: 'トルコ語' },
  { code: 'uk', label: 'ウクライナ語' },
  { code: 'ur', label: 'ウルドゥー語' },
  { code: 'uz', label: 'ウズベク語' },
  { code: 'vi', label: 'ベトナム語' },
  { code: 'wo', label: 'ウォロフ語' },
  { code: 'xh', label: 'コサ語' },
  { code: 'yi', label: 'イディッシュ語' },
  { code: 'yo', label: 'ヨルバ語' },
  { code: 'zh', label: '中国語' },
  { code: 'zu', label: 'ズールー語' },
];

type HistoryItem = {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
  translatedText: string;
  createdAt: string;
  favorite: boolean;
};

const STORAGE_KEY = 'campus-sync-translator-history-v1';
const MAX_HISTORY = 30;

function languageName(code: string): string {
  return LANGUAGES.find(language => language.code === code)?.label || code.toUpperCase();
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function TranslatorPanel({ isDarkMode = false }: { isDarkMode?: boolean }) {
  const [sourceLanguage, setSourceLanguage] = useState('ja');
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [online, setOnline] = useState(true);

  const cardClass = isDarkMode
    ? 'border-slate-700 bg-slate-900 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';
  const mutedClass = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const fieldClass = isDarkMode
    ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400'
    : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-cyan-500';

  const favoriteHistory = useMemo(
    () => history.filter(item => item.favorite),
    [history],
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
          setHistory(parsed.filter((item): item is HistoryItem =>
            Boolean(item)
            && typeof item.id === 'string'
            && typeof item.sourceLanguage === 'string'
            && typeof item.targetLanguage === 'string'
            && typeof item.sourceText === 'string'
            && typeof item.translatedText === 'string'
            && typeof item.createdAt === 'string'
            && typeof item.favorite === 'boolean'
          ).slice(0, MAX_HISTORY));
        }
      }
    } catch {
      // 履歴を読み込めなくても翻訳機能そのものは利用できる。
    } finally {
      setHistoryReady(true);
    }
  }, []);

  useEffect(() => {
    if (!historyReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
    } catch {
      // ストレージ容量制限やプライベートブラウズでは、履歴保存だけを諦める。
    }
  }, [history, historyReady]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const handleTranslate = async () => {
    const text = sourceText.trim();
    if (!text || loading) return;
    if (text.length > 2000) {
      setErrorMessage('文章は2,000文字以内にしてください。');
      return;
    }
    if (!online) {
      setErrorMessage('翻訳にはインターネット接続が必要です。保存済みの履歴はオフラインでも確認できます。');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setCopied(false);
    try {
      const response = await fetch('/api/translator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sourceLanguage,
          targetLanguage,
        }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.translatedText !== 'string') {
        throw new Error(result.error || '翻訳できませんでした。');
      }

      setTranslatedText(result.translatedText);
      setDetectedLanguage(String(result.sourceLanguage || sourceLanguage));
      const entry: HistoryItem = {
        id: makeId(),
        sourceLanguage: String(result.sourceLanguage || sourceLanguage),
        targetLanguage,
        sourceText: text,
        translatedText: result.translatedText,
        createdAt: new Date().toISOString(),
        favorite: false,
      };
      setHistory(current => [entry, ...current].slice(0, MAX_HISTORY));
    } catch (error) {
      setTranslatedText('');
      setDetectedLanguage('');
      setErrorMessage(error instanceof Error ? error.message : '翻訳サーバーが一時的に利用できません。');
    } finally {
      setLoading(false);
    }
  };

  const handleSwapLanguages = () => {
    if (sourceLanguage === 'auto') return;
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
    setDetectedLanguage('');
    setErrorMessage('');
  };

  const handleCopy = async () => {
    if (!translatedText) return;
    try {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setErrorMessage('コピーできませんでした。結果を選択してコピーしてください。');
    }
  };

  const handleSpeak = () => {
    if (!translatedText || !('speechSynthesis' in window)) {
      setErrorMessage('このブラウザーでは読み上げを利用できません。');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(translatedText);
    utterance.lang = targetLanguage;
    const voice = window.speechSynthesis.getVoices().find(item =>
      item.lang.toLowerCase().startsWith(targetLanguage.toLowerCase())
    );
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setSourceLanguage(item.sourceLanguage);
    setTargetLanguage(item.targetLanguage);
    setSourceText(item.sourceText);
    setTranslatedText(item.translatedText);
    setDetectedLanguage(item.sourceLanguage);
    setErrorMessage('');
    setShowFavorites(false);
  };

  const toggleFavorite = (id: string) => {
    setHistory(current => current.map(item =>
      item.id === id ? { ...item, favorite: !item.favorite } : item
    ));
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(current => current.filter(item => item.id !== id));
  };

  const clearHistory = () => {
    setHistory([]);
    setShowFavorites(false);
  };

  const formatTime = (value: string) => new Date(value).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-700 p-5 text-white shadow-lg shadow-cyan-950/10 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black tracking-[0.16em]">
              <Globe2 size={13} />
              CAMPUSSYNC LANGUAGE
            </div>
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">翻訳パネル</h2>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-cyan-50 sm:text-sm">
              100言語以上に対応。文章を入力して、自然な翻訳結果をすばやく確認できます。
            </p>
          </div>
          <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 sm:flex">
            <Languages size={30} />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px] font-bold text-cyan-50">
          <span className="rounded-full bg-white/15 px-3 py-1.5">無料枠内で動作</span>
          <span className="rounded-full bg-white/15 px-3 py-1.5">カード登録不要</span>
          <span className="rounded-full bg-white/15 px-3 py-1.5">履歴はこの端末に保存</span>
        </div>
      </section>

      <section className={'rounded-2xl border p-3 shadow-sm sm:p-4 ' + cardClass}>
        <div className="grid grid-cols-[minmax(0,1fr)_42px_minmax(0,1fr)] items-center gap-2">
          <label className="min-w-0">
            <span className={'mb-1.5 block text-[10px] font-black ' + mutedClass}>翻訳元の言語</span>
            <select
              value={sourceLanguage}
              onChange={event => setSourceLanguage(event.target.value)}
              className={'h-11 w-full min-w-0 rounded-xl border px-2 text-xs font-bold outline-none transition focus:ring-2 focus:ring-cyan-500/20 sm:px-3 ' + fieldClass}
            >
              <option value="auto">自動判定（簡易）</option>
              {LANGUAGES.map(language => (
                <option key={language.code} value={language.code}>{language.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleSwapLanguages}
            disabled={sourceLanguage === 'auto'}
            title="言語を入れ替える"
            aria-label="翻訳元と言語を入れ替える"
            className={'mt-5 flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-30 ' + (isDarkMode ? 'border-slate-700 bg-slate-800 hover:bg-slate-700' : 'border-slate-200 bg-slate-50 hover:bg-cyan-50 hover:text-cyan-700')}
          >
            <ArrowLeftRight size={17} />
          </button>
          <label className="min-w-0">
            <span className={'mb-1.5 block text-[10px] font-black ' + mutedClass}>翻訳先の言語</span>
            <select
              value={targetLanguage}
              onChange={event => setTargetLanguage(event.target.value)}
              className={'h-11 w-full min-w-0 rounded-xl border px-2 text-xs font-bold outline-none transition focus:ring-2 focus:ring-cyan-500/20 sm:px-3 ' + fieldClass}
            >
              {LANGUAGES.map(language => (
                <option key={language.code} value={language.code}>{language.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className={'min-w-0 rounded-2xl border p-4 shadow-sm sm:p-5 ' + cardClass}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500"><Languages size={16} /></span>
              <div>
                <h3 className="text-sm font-black">翻訳する文章</h3>
                <p className={'text-[10px] ' + mutedClass}>{sourceLanguage === 'auto' ? '入力された文章から簡易判定' : languageName(sourceLanguage)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setSourceText(''); setTranslatedText(''); setDetectedLanguage(''); setErrorMessage(''); }}
              disabled={!sourceText && !translatedText}
              className={'rounded-lg p-2 transition disabled:opacity-30 ' + (isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100')}
              aria-label="文章を消去"
              title="消去"
            >
              <RotateCcw size={15} />
            </button>
          </div>
          <textarea
            value={sourceText}
            onChange={event => setSourceText(event.target.value)}
            maxLength={2000}
            rows={9}
            placeholder="ここに翻訳したい文章を入力してください…"
            className={'min-h-[210px] w-full resize-y rounded-xl border p-3.5 text-sm leading-7 outline-none transition focus:ring-2 focus:ring-cyan-500/20 ' + fieldClass}
          />
          <div className={'mt-2 flex items-center justify-between text-[10px] ' + mutedClass}>
            <span>最大2,000文字</span>
            <span className="tabular-nums">{sourceText.length.toLocaleString()} / 2,000</span>
          </div>
          <button
            type="button"
            onClick={() => void handleTranslate()}
            disabled={!sourceText.trim() || loading || !online}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3.5 text-sm font-black text-white shadow-md shadow-cyan-900/10 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? <LoaderCircle size={17} className="animate-spin" /> : <Languages size={17} />}
            {loading ? '翻訳しています…' : '翻訳する'}
          </button>
        </div>

        <div className={'min-w-0 rounded-2xl border p-4 shadow-sm sm:p-5 ' + cardClass}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><Globe2 size={16} /></span>
              <div>
                <h3 className="text-sm font-black">翻訳結果</h3>
                <p className={'text-[10px] ' + mutedClass}>{languageName(targetLanguage)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!translatedText}
                className={'rounded-lg p-2 transition disabled:opacity-30 ' + (isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100')}
                aria-label="翻訳結果をコピー"
                title="コピー"
              >
                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
              </button>
              <button
                type="button"
                onClick={handleSpeak}
                disabled={!translatedText}
                className={'rounded-lg p-2 transition disabled:opacity-30 ' + (isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100')}
                aria-label="翻訳結果を読み上げ"
                title="読み上げ"
              >
                <Volume2 size={16} />
              </button>
            </div>
          </div>
          <div className={'min-h-[210px] whitespace-pre-wrap break-words rounded-xl border p-3.5 text-sm leading-7 ' + (isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-100 bg-slate-50 text-slate-800')}>
            {loading ? (
              <div className={'flex min-h-[175px] flex-col items-center justify-center gap-3 ' + mutedClass}>
                <LoaderCircle size={24} className="animate-spin text-cyan-500" />
                <span className="text-xs font-bold">翻訳モデルが文章を処理しています</span>
              </div>
            ) : translatedText ? translatedText : (
              <div className={'flex min-h-[175px] flex-col items-center justify-center gap-2 text-center ' + mutedClass}>
                <Languages size={25} className="opacity-40" />
                <span className="text-xs">ここに翻訳結果が表示されます</span>
              </div>
            )}
          </div>
          {detectedLanguage && (
            <p className={'mt-2 text-[10px] ' + mutedClass}>
              翻訳元：{languageName(detectedLanguage)}{sourceLanguage === 'auto' ? '（簡易判定）' : ''}
            </p>
          )}
          {copied && <p className="mt-2 text-[10px] font-bold text-emerald-500">コピーしました。</p>}
        </div>
      </section>

      {errorMessage && (
        <div role="alert" className={'rounded-xl border px-4 py-3 text-xs font-semibold leading-6 ' + (isDarkMode ? 'border-amber-900/60 bg-amber-950/40 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800')}>
          {errorMessage}
        </div>
      )}

      {!online && (
        <div className={'rounded-xl border px-4 py-3 text-xs font-semibold ' + (isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600')}>
          オフライン中です。新しい翻訳には通信が必要ですが、保存済みの履歴とお気に入りは確認できます。
        </div>
      )}

      <section className={'overflow-hidden rounded-2xl border shadow-sm ' + cardClass}>
        <div className={'flex flex-wrap items-center justify-between gap-3 border-b p-4 ' + (isDarkMode ? 'border-slate-700' : 'border-slate-100')}>
          <div className="flex items-center gap-2">
            <Clock3 size={17} className="text-cyan-500" />
            <div>
              <h3 className="text-sm font-black">翻訳ライブラリ</h3>
              <p className={'text-[10px] ' + mutedClass}>履歴とお気に入りはこの端末内だけに保存します。</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFavorites(false)}
              className={'rounded-lg px-3 py-2 text-[10px] font-black transition ' + (!showFavorites ? 'bg-cyan-600 text-white' : isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100')}
            >
              すべて（{history.length}）
            </button>
            <button
              type="button"
              onClick={() => setShowFavorites(true)}
              className={'flex items-center gap-1 rounded-lg px-3 py-2 text-[10px] font-black transition ' + (showFavorites ? 'bg-amber-500 text-white' : isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100')}
            >
              <Star size={12} /> お気に入り（{favoriteHistory.length}）
            </button>
            {history.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className={'rounded-lg p-2 transition ' + (isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100')}
                aria-label="翻訳履歴をすべて削除"
                title="履歴を削除"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {(showFavorites ? favoriteHistory : history).length === 0 ? (
            <div className={'px-4 py-10 text-center ' + mutedClass}>
              <Star size={22} className="mx-auto mb-2 opacity-40" />
              <p className="text-xs font-bold">{showFavorites ? 'お気に入りはまだありません。' : '翻訳履歴はまだありません。'}</p>
            </div>
          ) : (
            (showFavorites ? favoriteHistory : history).map(item => (
              <article key={item.id} className={'flex items-start gap-3 p-4 transition ' + (isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50')}>
                <button
                  type="button"
                  onClick={() => loadHistoryItem(item)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className={'mb-1 text-[10px] font-black ' + (isDarkMode ? 'text-cyan-300' : 'text-cyan-700')}>
                    {languageName(item.sourceLanguage)} → {languageName(item.targetLanguage)} ・ {formatTime(item.createdAt)}
                  </p>
                  <p className="line-clamp-2 break-words text-xs font-bold">{item.sourceText}</p>
                  <p className={'mt-1 line-clamp-2 break-words text-xs ' + mutedClass}>{item.translatedText}</p>
                </button>
                <button
                  type="button"
                  onClick={() => toggleFavorite(item.id)}
                  className={'shrink-0 rounded-lg p-2 transition ' + (item.favorite ? 'text-amber-500' : mutedClass)}
                  aria-label={item.favorite ? 'お気に入りを解除' : 'お気に入りに追加'}
                  title={item.favorite ? 'お気に入り解除' : 'お気に入り'}
                >
                  <Star size={15} fill={item.favorite ? 'currentColor' : 'none'} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteHistoryItem(item.id)}
                  className={'shrink-0 rounded-lg p-2 transition ' + (isDarkMode ? 'text-slate-500 hover:bg-slate-700 hover:text-rose-400' : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600')}
                  aria-label="この履歴を削除"
                >
                  <Trash2 size={15} />
                </button>
              </article>
            ))
          )}
        </div>
      </section>

      <p className={'text-[10px] leading-5 ' + mutedClass}>
        翻訳はCloudflareのAIモデルで処理します。自動判定は文字種による簡易判定で、英語以外のラテン文字言語では誤判定することがあります。正確に翻訳するには翻訳元を手動で選択してください。翻訳文の品質は言語や文章によって異なります。
      </p>
    </div>
  );
}
