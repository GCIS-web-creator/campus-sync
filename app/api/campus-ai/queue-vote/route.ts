import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VoteStatus = 'empty' | 'normal' | 'crowded';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    menuId?: unknown; status?: unknown; voterId?: unknown;
  } | null;
  const menuId = typeof body?.menuId === 'string' ? body.menuId.trim().slice(0, 120) : '';
  const voterId = typeof body?.voterId === 'string' ? body.voterId.trim().slice(0, 128) : '';
  const status = body?.status;
  if (!menuId || !voterId || !['empty', 'normal', 'crowded'].includes(String(status))) {
    return NextResponse.json({ answer: '投票内容が正しくありません。もう一度選択してください。' }, { status: 400 });
  }

  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '')?.[1] || '';
  const authed = token && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
      )
    : null;
  const db = authed ?? supabase;

  const { data: soldRow, error: soldError } = await db
    .from('cafeteria_sold_out')
    .select('is_sold_out')
    .eq('menu_id', menuId)
    .maybeSingle();
  if (soldError) {
    console.error('campus-ai queue vote sold-out check failed:', soldError.message);
    return NextResponse.json({ answer: '売り切れ状態を確認できないため、投票を保存できませんでした。' }, { status: 500 });
  }
  if (soldRow?.is_sold_out) return NextResponse.json({ answer: 'このメニューは売り切れのため、列の投票は受け付けていません。' }, { status: 409 });

  const { error } = await db.from('cafeteria_votes').upsert(
    { menu_id: menuId, scope_key: menuId, voter_id: voterId, status: status as VoteStatus },
    { onConflict: 'scope_key,voter_id' },
  );
  if (error) {
    console.error('campus-ai queue vote save failed:', error.message);
    return NextResponse.json({ answer: '投票を保存できませんでした。SupabaseのRLS設定を確認してください。' }, { status: 500 });
  }

  const label = status === 'empty' ? '並びなし' : status === 'normal' ? '普通' : '行列大';
  return NextResponse.json({ answer: `投票を保存しました。${label}として反映しました。` });
}
