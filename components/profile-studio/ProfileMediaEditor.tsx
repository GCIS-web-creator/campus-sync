'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Camera, ImagePlus, LoaderCircle, Trash2, Upload, X } from 'lucide-react';

type MediaKind = 'avatar' | 'banner';
type UploadedImage = { path: string; url: string };

type Props = {
  kind: MediaKind;
  userId: string;
  currentUrl: string;
  hasImage: boolean;
  dark?: boolean;
  onUploaded: (image: UploadedImage) => void;
  onRemove: () => void;
};

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function canvasToWebp(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
  for (const quality of [0.9, 0.84, 0.78, 0.7, 0.62]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error('画像を2MB以下に圧縮できませんでした。別の画像を選んでください。');
}

export function ProfileMediaEditor({ kind, userId, currentUrl, hasImage, dark = false, onUploaded, onRemove }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const isAvatar = kind === 'avatar';
  const frameClass = isAvatar ? 'aspect-square max-w-[220px] rounded-full' : 'aspect-[12/5] w-full rounded-xl';
  const frameWidth = isAvatar ? 512 : 1200;
  const frameHeight = isAvatar ? 512 : 500;
  const label = isAvatar ? 'アイコン' : 'バナー';

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function pickFile(file?: File) {
    if (!file) return;
    setMessage('');
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setMessage('JPEG・PNG・WebP画像を選んでください。');
      return;
    }
    if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) {
      setMessage('元画像は10MB以下にしてください。');
      return;
    }
    const nextPreview = URL.createObjectURL(file);
    setPreview(old => {
      if (old) URL.revokeObjectURL(old);
      return nextPreview;
    });
    setSource(file);
    setZoom(1);
    setX(50);
    setY(50);
  }

  async function upload() {
    if (!source || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const bitmap = await createImageBitmap(source);
      const scale = Math.max(frameWidth / bitmap.width, frameHeight / bitmap.height) * zoom;
      const drawWidth = bitmap.width * scale;
      const drawHeight = bitmap.height * scale;
      const overflowX = Math.max(0, drawWidth - frameWidth);
      const overflowY = Math.max(0, drawHeight - frameHeight);
      const offsetX = -overflowX * (x / 100);
      const offsetY = -overflowY * (y / 100);
      const canvas = document.createElement('canvas');
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('画像処理を開始できませんでした。');
      context.drawImage(bitmap, offsetX, offsetY, drawWidth, drawHeight);
      bitmap.close();
      const webp = await canvasToWebp(canvas, MAX_OUTPUT_BYTES);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('ログイン状態を確認できませんでした。再ログインしてください。');

      const uploadResponse = await fetch('/api/profile/images/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ kind, mimeType: 'image/webp', size: webp.size }),
      });
      const uploadData = await uploadResponse.json().catch(() => null);
      if (!uploadResponse.ok || !uploadData?.path || !uploadData?.token) {
        throw new Error(uploadData?.message || '画像のアップロード準備に失敗しました。');
      }

      const { error: storageError } = await supabase.storage
        .from('profile-images')
        .uploadToSignedUrl(uploadData.path, uploadData.token, webp, {
          contentType: 'image/webp',
          upsert: false,
        });
      if (storageError) throw new Error('画像を保存できませんでした。' + storageError.message);

      const resolveResponse = await fetch('/api/profile/images/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ items: [{ userId, kind, path: uploadData.path }] }),
      });
      const resolveData = await resolveResponse.json().catch(() => null);
      const url = resolveData?.items?.[0]?.url;
      if (!resolveResponse.ok || typeof url !== 'string') {
        throw new Error(resolveData?.message || 'アップロード画像のプレビューURLを取得できませんでした。');
      }
      onUploaded({ path: uploadData.path, url });
      setSource(null);
      setPreview(old => {
        if (old) URL.revokeObjectURL(old);
        return '';
      });
      setMessage('画像を登録しました。プロフィールの変更も保存してください。');
    } catch (error) {
      console.error('プロフィール画像の登録に失敗:', error);
      setMessage(error instanceof Error ? error.message : '画像を登録できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  const cardTone = dark ? 'border-slate-600 bg-slate-900/40 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-800';

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2 text-[11px] font-bold">
          <ImagePlus size={14} /> 写真を選ぶ
        </button>
        <button type="button" onClick={() => cameraInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2 text-[11px] font-bold">
          <Camera size={14} /> カメラで撮影
        </button>
        {hasImage && <button type="button" onClick={onRemove} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300/40 px-3 py-2 text-[11px] font-bold text-rose-500"><Trash2 size={13} /> 削除</button>}
      </div>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => pickFile(e.target.files?.[0])} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture={isAvatar ? "user" : "environment"} className="hidden" onChange={e => pickFile(e.target.files?.[0])} />
      <p className="text-[10px] leading-5 text-slate-500">{label}画像はJPEG・PNG・WebPに対応。元画像10MB以下、登録時はWebP・最大2MBに自動変換して非公開ストレージへ保存します。</p>
      {preview && source && (
        <div className={'rounded-xl border p-3 ' + cardTone}>
          <p className="mb-2 text-xs font-black">切り抜き位置を調整</p>
          <div className={'relative mx-auto overflow-hidden border border-white/40 bg-slate-800 ' + frameClass}>
            <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: x + '% ' + y + '%', transform: 'scale(' + zoom + ')' }} />
          </div>
          <div className="mt-3 space-y-2">
            <label className="block text-[10px] font-bold">拡大
              <input type="range" min="1" max="3" step=".05" value={zoom} onChange={e => setZoom(Number(e.target.value))} className="mt-1 w-full" />
            </label>
            <label className="block text-[10px] font-bold">左右
              <input type="range" min="0" max="100" value={x} onChange={e => setX(Number(e.target.value))} className="mt-1 w-full" />
            </label>
            <label className="block text-[10px] font-bold">上下
              <input type="range" min="0" max="100" value={y} onChange={e => setY(Number(e.target.value))} className="mt-1 w-full" />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void upload()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-3 py-2.5 text-xs font-black text-white disabled:opacity-60">
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />} {busy ? '登録中…' : 'この画像を登録'}
            </button>
            <button type="button" disabled={busy} onClick={() => { setSource(null); setPreview(old => { if (old) URL.revokeObjectURL(old); return ''; }); }} className="rounded-xl border border-slate-300/40 px-3 py-2.5 text-xs font-bold disabled:opacity-60"><X size={14} /></button>
          </div>
        </div>
      )}
      {currentUrl && !preview && <p className="truncate text-[10px] text-emerald-600">画像登録済み</p>}
      {message && <p role="status" className="text-[10px] leading-5 text-amber-600">{message}</p>}
    </div>
  );
}
