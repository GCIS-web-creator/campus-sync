import type { Metadata } from 'next';
import LiffMaterialsClient from './LiffMaterialsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '学校資料エクスプローラー | CampusSync',
  description: 'CampusSyncの学校資料をLINE内で閲覧できます。',
};

export default function LiffMaterialsPage() {
  const liffId = process.env.LINE_LIFF_ID || process.env.NEXT_PUBLIC_LINE_LIFF_ID || '';
  return <LiffMaterialsClient liffId={liffId} />;
}
