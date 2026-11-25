import type { Metadata } from 'next';
import LiffPortalClient from '../LiffPortalClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '学校情報ポータル | CampusSync',
  description: 'ログイン不要で学校公開情報を確認できるCampusSyncポータル。',
};

export default function LiffProductionPage() {
  return <LiffPortalClient environment="production" />;
}
