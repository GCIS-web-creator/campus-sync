import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store, private' };

const MENU_STRING_FIELDS = [
  'soka_lunch', 'healthy_lunch', 'snack_lunch', 'curry', 'noodles',
  'soka_lunch_price', 'soka_lunch_calorie', 'soka_lunch_allergy',
  'healthy_lunch_price', 'healthy_lunch_calorie', 'healthy_lunch_allergy',
  'snack_lunch_price', 'snack_lunch_calorie', 'snack_lunch_allergy',
  'curry_price', 'curry_calorie', 'curry_allergy',
  'noodles_price', 'noodles_calorie', 'noodles_allergy', 'note',
] as const;

const SOLD_OUT_MENU_IDS = new Set(['soka', 'healthy', 'snack', 'curry', 'noodles']);
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type JsonObject = Record<string, unknown>;

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: noStore });
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getLibraryCoverPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!base) return null;
  try {
    const imageUrl = new URL(value);
    const baseUrl = new URL(base);
    const prefix = '/storage/v1/object/public/library-covers/';
    if (imageUrl.origin !== baseUrl.origin || !imageUrl.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(imageUrl.pathname.slice(prefix.length));
    if (!path || path.includes('..') || path.startsWith('/')) return null;
    return path;
  } catch {
    return null;
  }
}

async function handleUploadCover(request: Request, admin: NonNullable<ReturnType<typeof getAdminClient>>) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return jsonError('表紙画像ファイルがありません。', 400);
  if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    return jsonError('画像はJPG・PNG・WebP形式、5MB以下のものを選んでください。', 400);
  }

  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${Date.now()}-${randomUUID()}.${extension}`;
  const { error } = await admin.storage.from('library-covers').upload(path, Buffer.from(await file.arrayBuffer()), {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    console.error('Admin library cover upload failed:', error.message);
    return jsonError('表紙画像をアップロードできませんでした。', 500);
  }

  const coverUrl = admin.storage.from('library-covers').getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ success: true, coverUrl }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError('不正な管理操作です。', 403);
  if (!verifyAdminSessionRequest(request)) return jsonError('管理者ログインが必要です。', 401);

  const admin = getAdminClient();
  if (!admin) return jsonError('Supabaseのサーバー設定が不足しています。', 503);

  if (request.headers.get('content-type')?.toLowerCase().includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    if (!form || form.get('action') !== 'upload-library-cover') return jsonError('不正な画像アップロード要求です。', 400);
    // handleUploadCover reads the request body, so pass the parsed form's file through a fresh FormData.
    const file = form.get('file');
    if (!(file instanceof File)) return jsonError('表紙画像ファイルがありません。', 400);
    if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
      return jsonError('画像はJPG・PNG・WebP形式、5MB以下のものを選んでください。', 400);
    }
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${Date.now()}-${randomUUID()}.${extension}`;
    const { error } = await admin.storage.from('library-covers').upload(path, Buffer.from(await file.arrayBuffer()), {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      console.error('Admin library cover upload failed:', error.message);
      return jsonError('表紙画像をアップロードできませんでした。', 500);
    }
    const coverUrl = admin.storage.from('library-covers').getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ success: true, coverUrl }, { headers: noStore });
  }

  const payload = await request.json().catch(() => null);
  if (!isObject(payload) || typeof payload.action !== 'string') return jsonError('管理操作の内容を確認してください。', 400);

  try {
    switch (payload.action) {
      case 'save-monthly-menus': {
        if (!Array.isArray(payload.rows) || payload.rows.length < 1 || payload.rows.length > 31) {
          return jsonError('保存する献立データを確認してください。', 400);
        }
        const rows: JsonObject[] = [];
        for (const value of payload.rows) {
          if (!isObject(value) || typeof value.service_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.service_date)) {
            return jsonError('献立の日付形式が正しくありません。', 400);
          }
          const row: JsonObject = { service_date: value.service_date, updated_at: new Date().toISOString() };
          for (const field of MENU_STRING_FIELDS) {
            if (field === 'note') {
              row[field] = typeof value[field] === 'string' ? String(value[field]).slice(0, 1000) : '';
            } else {
              row[field] = typeof value[field] === 'string' ? String(value[field]).slice(0, 200) : '';
            }
          }
          row.is_closed = value.is_closed === true;
          rows.push(row);
        }
        const { error } = await admin.from('cafeteria_daily_menus').upsert(rows, { onConflict: 'service_date' });
        if (error) {
          console.error('Admin monthly menu save failed:', error.message);
          return jsonError('月間献立を保存できませんでした。', 500);
        }
        return NextResponse.json({ success: true }, { headers: noStore });
      }

      case 'publish-cafeteria-announcement':
      case 'unpublish-cafeteria-announcement': {
        const message = typeof payload.message === 'string' ? payload.message.trim() : '';
        if (message.length > 500) return jsonError('学食のお知らせは500文字以内で入力してください。', 400);
        if (payload.action === 'publish-cafeteria-announcement' && !message) return jsonError('お知らせ内容を入力してください。', 400);
        const visible = payload.action === 'publish-cafeteria-announcement';
        const { error } = await admin.from('cafeteria_announcements').upsert({
          id: 1,
          message,
          show_popup: visible,
          show_banner: visible,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (error) {
          console.error('Admin cafeteria announcement save failed:', error.message);
          return jsonError('学食のお知らせを保存できませんでした。', 500);
        }
        return NextResponse.json({ success: true }, { headers: noStore });
      }

      case 'resolve-room-status': {
        const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim() : '';
        if (!roomId || roomId.length > 80) return jsonError('教室IDを確認してください。', 400);
        const { error } = await admin.from('room_status')
          .update({ status: '快適', updated_at: new Date().toISOString() })
          .eq('room_id', roomId);
        if (error) {
          console.error('Admin room status update failed:', error.message);
          return jsonError('教室状況を更新できませんでした。', 500);
        }
        return NextResponse.json({ success: true }, { headers: noStore });
      }

      case 'toggle-cafeteria-sold-out': {
        const menuId = typeof payload.menuId === 'string' ? payload.menuId : '';
        if (!SOLD_OUT_MENU_IDS.has(menuId) || typeof payload.isSoldOut !== 'boolean') {
          return jsonError('売切状態の指定が正しくありません。', 400);
        }
        const { error } = await admin.from('cafeteria_sold_out').upsert({
          menu_id: menuId,
          is_sold_out: payload.isSoldOut,
          line_notified_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'menu_id' });
        if (error) {
          console.error('Admin cafeteria sold-out update failed:', error.message);
          return jsonError('学食の売切状態を保存できませんでした。', 500);
        }
        return NextResponse.json({ success: true }, { headers: noStore });
      }

      case 'create-library-book': {
        if (!isObject(payload.book)) return jsonError('蔵書情報を確認してください。', 400);
        const title = typeof payload.book.title === 'string' ? payload.book.title.trim() : '';
        const author = typeof payload.book.author === 'string' ? payload.book.author.trim() : '';
        const code = typeof payload.book.code === 'string' ? payload.book.code.trim() : '';
        const coverUrl = payload.book.cover_url === null ? null : getLibraryCoverPath(payload.book.cover_url) ? payload.book.cover_url : null;
        if (!title || title.length > 200 || !author || author.length > 200 || !/^LIB-[A-Za-z0-9-]{8,80}$/.test(code)) {
          return jsonError('蔵書のタイトル・著者・管理番号を確認してください。', 400);
        }
        if (payload.book.cover_url && !coverUrl) return jsonError('表紙画像のURLが正しくありません。', 400);
        const { data, error } = await admin.from('library_books').insert({
          title,
          author,
          code,
          status: '貸出可能',
          cover_url: coverUrl,
        }).select('id, title, author, code, status, cover_url, created_at').single();
        if (error) {
          console.error('Admin library book insert failed:', error.message);
          return jsonError(error.code === '23505' ? '同じタイトル・著者または管理番号の蔵書が既に登録されています。' : '蔵書を登録できませんでした。', error.code === '23505' ? 409 : 500);
        }
        return NextResponse.json({ success: true, book: data }, { headers: noStore });
      }

      case 'update-library-book-cover': {
        const bookId = payload.bookId;
        const coverUrl = getLibraryCoverPath(payload.coverUrl) ? payload.coverUrl : null;
        if ((typeof bookId !== 'string' && typeof bookId !== 'number') || !coverUrl) return jsonError('蔵書IDまたは表紙画像URLが正しくありません。', 400);
        const { data, error } = await admin.from('library_books')
          .update({ cover_url: coverUrl })
          .eq('id', bookId)
          .select('id, title, author, code, status, cover_url, created_at')
          .single();
        if (error) {
          console.error('Admin library book cover update failed:', error.message);
          return jsonError('蔵書の表紙画像を更新できませんでした。', 500);
        }
        return NextResponse.json({ success: true, book: data }, { headers: noStore });
      }

      case 'delete-library-book': {
        const bookId = payload.bookId;
        if (typeof bookId !== 'string' && typeof bookId !== 'number') return jsonError('蔵書IDが正しくありません。', 400);
        const { data: book, error: readError } = await admin.from('library_books')
          .select('id, cover_url')
          .eq('id', bookId)
          .maybeSingle();
        if (readError) {
          console.error('Admin library book lookup failed:', readError.message);
          return jsonError('蔵書情報を取得できませんでした。', 500);
        }
        if (!book) return jsonError('対象の蔵書が見つかりません。', 404);
        const { error: deleteError } = await admin.from('library_books').delete().eq('id', bookId);
        if (deleteError) {
          console.error('Admin library book delete failed:', deleteError.message);
          return jsonError('蔵書を削除できませんでした。', 500);
        }
        const storagePath = getLibraryCoverPath(book.cover_url);
        let imageDeleted = true;
        if (storagePath) {
          const { error: storageError } = await admin.storage.from('library-covers').remove([storagePath]);
          if (storageError) {
            imageDeleted = false;
            console.error('Admin library cover cleanup failed:', storageError.message);
          }
        }
        return NextResponse.json({ success: true, imageDeleted }, { headers: noStore });
      }

      case 'save-study-room-status': {
        const occupied = Number(payload.occupiedSeats);
        const total = Number(payload.totalSeats);
        if (!Number.isInteger(occupied) || !Number.isInteger(total) || total < 1 || occupied < 0 || occupied > total || total > 500) {
          return jsonError('自習室の座席数を確認してください。', 400);
        }
        const { data, error } = await admin.from('study_room_status').upsert({
          room_key: 'career_center',
          room_name: 'キャリアセンター自習室',
          occupied_seats: occupied,
          total_seats: total,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'room_key' })
          .select('room_key, room_name, occupied_seats, total_seats, updated_at')
          .single();
        if (error) {
          console.error('Admin study room save failed:', error.message);
          return jsonError('自習室の座席状況を保存できませんでした。', 500);
        }
        return NextResponse.json({ success: true, studyRoom: data }, { headers: noStore });
      }

      default:
        return jsonError('未対応の管理操作です。', 400);
    }
  } catch (error) {
    console.error('Admin data API unexpected error:', error);
    return jsonError('管理データを処理できませんでした。', 500);
  }
}
