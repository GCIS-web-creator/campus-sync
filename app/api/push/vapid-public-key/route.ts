import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, message: '通知サービスの設定が不足しています。' }, { status: 503 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await admin.rpc('campussync_get_vapid_credentials');
    const credentials = data as { public_key?: string } | null;
    if (error || !credentials?.public_key) {
      console.error('VAPID public key lookup failed:', error?.message || 'missing public key');
      return NextResponse.json({ success: false, message: '通知用の公開鍵を取得できませんでした。' }, { status: 503 });
    }

    return NextResponse.json(
      { success: true, publicKey: credentials.public_key },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('VAPID public key endpoint failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, message: '通知用の公開鍵を取得できませんでした。' }, { status: 500 });
  }
}
