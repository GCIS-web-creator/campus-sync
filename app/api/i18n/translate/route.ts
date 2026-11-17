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

const TARGET_LANGUAGES = new Set(['en', 'ar', 'ko', 'zh']);
const MODEL = '@cf/meta/m2m100-1.2b';
const SEPARATOR = ' ### ';
const JAPANESE_TEXT = /[ぁ-んァ-ヶ一-龠]/u;

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function normalizeTranslation(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= 1500 ? text : null;
}

function containsTargetScript(value: string, language: string): boolean {
  if (language === 'en') return /[A-Za-z]/u.test(value);
  if (language === 'ar') return /[\u0600-\u06FF]/u.test(value);
  if (language === 'ko') return /[\uAC00-\uD7AF]/u.test(value);
  if (language === 'zh') return /[\u4E00-\u9FFF]/u.test(value);
  return false;
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin request is not allowed.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    language?: unknown;
    items?: unknown;
  } | null;

  const language = typeof body?.language === 'string' ? body.language : '';
  if (!TARGET_LANGUAGES.has(language)) {
    return NextResponse.json({ error: 'Unsupported language.' }, { status: 400 });
  }

  if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 8) {
    return NextResponse.json({ error: 'A batch must contain between 1 and 8 strings.' }, { status: 400 });
  }

  const items = body.items.map(normalizeTranslation);
  if (items.some(item => !item) || items.reduce((sum, item) => sum + (item?.length ?? 0), 0) > 4800) {
    return NextResponse.json({ error: 'Invalid or oversized translation batch.' }, { status: 400 });
  }

  const sourceTexts = items as string[];
  if (sourceTexts.some(item => !JAPANESE_TEXT.test(item))) {
    return NextResponse.json({ error: 'Only Japanese UI strings can be translated.' }, { status: 400 });
  }

  try {
    const context = getCloudflareContext() as unknown as { env?: { AI?: TranslationBinding } };
    const ai = context.env?.AI;
    if (!ai) {
      return NextResponse.json({ error: 'Translation service is unavailable.' }, { status: 503 });
    }

    const joined = sourceTexts.join(SEPARATOR);
    const response = await ai.run(MODEL, {
      text: joined,
      source_lang: 'ja',
      target_lang: language,
    });

    let translated = typeof response.translated_text === 'string'
      ? response.translated_text.split(/\s*#{3,}\s*/u).map(value => value.trim())
      : [];

    // If a model drops separators or leaves Japanese text untranslated, retry only
    // affected strings individually so one bad item cannot misalign the whole batch.
    if (translated.length !== sourceTexts.length) {
      translated = sourceTexts.map(() => '');
    }

    const needsRetry = translated.map((value, index) =>
      !normalizeTranslation(value)
      || value === sourceTexts[index]
      || !containsTargetScript(value, language),
    );
    const retries = await Promise.all(sourceTexts.map(async (item, index) => {
      if (!needsRetry[index]) return translated[index];
      const individual = await ai.run(MODEL, {
        text: item,
        source_lang: 'ja',
        target_lang: language,
      });
      const candidate = normalizeTranslation(individual.translated_text);
      return candidate && containsTargetScript(candidate, language) ? candidate : sourceTexts[index];
    }));

    return NextResponse.json({ translations: retries }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('CampusSync UI translation failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Translation is temporarily unavailable.' }, { status: 503 });
  }
}
