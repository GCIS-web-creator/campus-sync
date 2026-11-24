import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TranslationBinding = {
  run: (
    model: string,
    input: { text: string; source_lang: string; target_lang: string },
  ) => Promise<{ translated_text?: string }>;
};

const MODEL = '@cf/meta/m2m100-1.2b';
const MAX_TEXT_LENGTH = 2000;
const LANGUAGE_CODES = new Set([
  'af','am','ar','ast','az','ba','be','bg','bn','br','bs','ca','ceb','cs','cy',
  'da','de','el','en','es','et','fa','ff','fi','fr','fy','ga','gd','gl','gu',
  'ha','he','hi','hr','ht','hu','hy','id','ig','ilo','is','it','ja','jv','ka',
  'kk','km','kn','ko','lb','lg','ln','lo','lt','lv','mg','mk','ml','mn','mr',
  'ms','my','ne','nl','no','ns','oc','or','pa','pl','ps','pt','ro','ru','sd',
  'si','sk','sl','so','sq','sr','ss','su','sv','sw','ta','th','tl','tn','tr',
  'uk','ur','uz','vi','wo','xh','yi','yo','zh','zu',
]);

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function detectSourceLanguage(text: string): string {
  if (/[ぁ-ゖァ-ヺ]/u.test(text)) return 'ja';
  if (/[\uAC00-\uD7AF]/u.test(text)) return 'ko';
  if (/[\u0600-\u06FF]/u.test(text)) return 'ar';
  if (/[\u0900-\u097F]/u.test(text)) return 'hi';
  if (/[\u0E00-\u0E7F]/u.test(text)) return 'th';
  if (/[\u0400-\u04FF]/u.test(text)) return 'ru';
  if (/[\u4E00-\u9FFF]/u.test(text)) return 'zh';
  // Latin-script text is ambiguous; English is only a best-effort fallback.
  return 'en';
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= MAX_TEXT_LENGTH ? text : null;
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: 'このリクエストは許可されていません。' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    text?: unknown;
    sourceLanguage?: unknown;
    targetLanguage?: unknown;
  } | null;

  const text = normalizeText(body?.text);
  const requestedSource = typeof body?.sourceLanguage === 'string' ? body.sourceLanguage : '';
  const targetLanguage = typeof body?.targetLanguage === 'string' ? body.targetLanguage : '';

  if (!text) {
    return NextResponse.json({
      error: '翻訳する文章を入力してください（最大2,000文字）。',
    }, { status: 400 });
  }

  if (requestedSource !== 'auto' && !LANGUAGE_CODES.has(requestedSource)) {
    return NextResponse.json({ error: '翻訳元の言語が正しくありません。' }, { status: 400 });
  }

  if (!LANGUAGE_CODES.has(targetLanguage)) {
    return NextResponse.json({ error: '翻訳先の言語が正しくありません。' }, { status: 400 });
  }

  const sourceLanguage = requestedSource === 'auto'
    ? detectSourceLanguage(text)
    : requestedSource;

  if (sourceLanguage === targetLanguage) {
    return NextResponse.json({
      error: '翻訳元と翻訳先が同じ言語です。別の言語を選択してください。',
    }, { status: 400 });
  }

  try {
    const context = getCloudflareContext() as unknown as { env?: { AI?: TranslationBinding } };
    const ai = context.env?.AI;
    if (!ai) {
      return NextResponse.json({
        error: '翻訳サービスを利用できません。しばらくしてから再度お試しください。',
      }, { status: 503 });
    }

    const response = await ai.run(MODEL, {
      text,
      source_lang: sourceLanguage,
      target_lang: targetLanguage,
    });

    const translatedText = typeof response?.translated_text === 'string'
      ? response.translated_text.trim()
      : '';

    if (!translatedText) {
      return NextResponse.json({
        error: '翻訳結果を取得できませんでした。文章を短くして再度お試しください。',
      }, { status: 502 });
    }

    return NextResponse.json({
      translatedText,
      sourceLanguage,
      targetLanguage,
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const quotaExceeded = /429|quota|neuron|rate.?limit|daily.?limit|exceed|capacity/i.test(message);

    console.error('CampusSync translator request failed:', quotaExceeded ? 'free-capacity-limit' : 'inference-error');

    return NextResponse.json({
      error: quotaExceeded
        ? '本日の無料翻訳枠、または一時的な利用上限に達しました。追加料金は発生しません。明日またお試しください。'
        : '翻訳サーバーが一時的に利用できません。時間をおいて再度お試しください。',
    }, {
      status: quotaExceeded ? 429 : 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
