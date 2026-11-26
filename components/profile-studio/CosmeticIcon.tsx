'use client';

import React from 'react';
import Image from 'next/image';

const FILES: Record<string, string> = {
  badge_first_study: 'first-step',
  badge_study_10: 'steady-learner',
  badge_contribution_3: 'campus-supporter',
};

export function CosmeticIcon({ id, size = 24 }: { id: string; size?: number }) {
  const file = FILES[id];
  if (file) {
    return <Image src={'/profile-studio/badges/' + file + '.svg'} width={size} height={size} alt="" unoptimized className="inline-block shrink-0 align-middle" />;
  }
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (id === 'frame_aurora') return <svg {...common}><defs><linearGradient id="cos-aurora" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#67e8f9" /><stop offset=".5" stopColor="#a78bfa" /><stop offset="1" stopColor="#f0abfc" /></linearGradient></defs><circle cx="12" cy="12" r="9" stroke="url(#cos-aurora)" strokeWidth="3" /><circle cx="12" cy="12" r="4.5" stroke="currentColor" opacity=".35" /></svg>;
  if (id === 'frame_prism') return <svg {...common}><defs><linearGradient id="cos-prism" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f0abfc" /><stop offset=".5" stopColor="#67e8f9" /><stop offset="1" stopColor="#fcd34d" /></linearGradient></defs><path d="M12 2 21 10 12 22 3 10Z" fill="url(#cos-prism)" stroke="currentColor" /><path d="M3 10h18M12 2 9 10l3 12 3-12Z" stroke="#fff" opacity=".75" /></svg>;
  if (id === 'effect_sparkle') return <svg {...common}><path d="M12 2Q12 12 22 12Q12 12 12 22Q12 12 2 12Q12 12 12 2Z" fill="#bae6fd" stroke="#67e8f9" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M7 12h10" /></svg>;
}
