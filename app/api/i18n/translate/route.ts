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
  return text.length > 0 && text.length <= 600 ? text : null;
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

  if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 12) {
    return NextResponse.json({ error: 'A batch must contain between 1 and 12 strings.' }, { status: 400 });
  }

  const items = body.items.map(normalizeTranslation);
  if (items.some(item => !item) || items.reduce((sum, item) => sum + (item?.length ?? 0), 0) > 3200) {
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

    const translated = typeof response.translated_text === 'string'
      ? response.translated_text.split(/\s*###\s*/u).map(value => value.trim())
      : [];

    if (translated.length === sourceTexts.length && translated.every(value => value.length > 0)) {
      return NextResponse.json({ translations: translated }, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    // Separator loss is rare, but translate each item separately rather than returning misaligned strings.
    const individual = await Promise.all(sourceTexts.map(item =>
      ai.run(MODEL, { text: item, source_lang: 'ja', target_lang: language }),
    ));
    const translations = individual.map((item, index) =>
      normalizeTranslation(item.translated_text) ?? sourceTexts[index],
    );
    return NextResponse.json({ translations }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('CampusSync UI translation failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Translation is temporarily unavailable.' }, { status: 503 });
  }
}
