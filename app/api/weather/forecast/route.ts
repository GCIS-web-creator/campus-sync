import { NextResponse } from 'next/server';
import { fetchSchoolWeatherBundle } from '@/lib/weather';

export const runtime = 'nodejs';
export const revalidate = 1800;

export async function GET() {
  try {
    const data = await fetchSchoolWeatherBundle(16);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
    });
  } catch (error) {
    console.error('School weather forecast failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { message: '天気予報を取得できませんでした。時間をおいて再度お試しください。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
