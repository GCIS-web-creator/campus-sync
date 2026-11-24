'use client';

import { usePathname } from 'next/navigation';
import CampusAIChat from '@/components/CampusAIChat';

export default function RouteSpecificOverlays() {
  const pathname = usePathname();
  if (pathname === '/calculator' || pathname.startsWith('/calculator/') || pathname === '/liff' || pathname.startsWith('/liff/')) return null;
  return <CampusAIChat />;
}
