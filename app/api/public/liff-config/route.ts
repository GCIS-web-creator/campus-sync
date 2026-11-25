import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LiffEnvironment = 'development' | 'review' | 'production';

const DEFAULT_LIFF_IDS: Record<LiffEnvironment, string> = {
  development: '2012791692-PKTT2jnX',
  review: '2012791693-4NrSLd3F',
  production: '2012791695-OIyf4BUb',
};

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get('environment') || 'development';
  const environment: LiffEnvironment =
    requested === 'review' || requested === 'production' ? requested : 'development';

  const environmentVariable = {
    development: process.env.CAMPUS_SYNC_PUBLIC_LIFF_ID_DEVELOPMENT,
    review: process.env.CAMPUS_SYNC_PUBLIC_LIFF_ID_REVIEW,
    production: process.env.CAMPUS_SYNC_PUBLIC_LIFF_ID_PRODUCTION,
  }[environment];

  const liffId = (environmentVariable || DEFAULT_LIFF_IDS[environment]).trim();

  return NextResponse.json(
    { liffId, environment },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
