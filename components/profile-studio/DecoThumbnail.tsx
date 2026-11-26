'use client';

import React from 'react';
import type { DecoKind } from './effectsRegistry';
import type { DecoSlot } from './catalog';

const PALETTE: Record<DecoKind, [string, string, string]> = {
  sakura:['#f6a8ce','#c084fc','#fff1f7'], sea:['#40bde8','#7ce6d4','#e0fbff'],
  forest:['#237b58','#9be7a1','#f2ffd8'], meadow:['#8fcf69','#f8d97a','#fff4bf'],
  space:['#273c9a','#8b5cf6','#b8e7ff'], star:['#182a66','#66a6ff','#fff5bc'],
  mech:['#27384b','#5eead4','#d1fae5'], rain:['#4f78ad','#a5c9f3','#eaf5ff'],
  rabbit:['#f2b6d1','#d9c2ff','#fff4fa'], plush:['#bc8b70','#f1c7a7','#fff0dc'],
  emoji:['#f9a8d4','#fcd34d','#c4b5fd'], lab:['#16845f','#7de7b4','#e2fff0'],
  fw:['#ee6b9a','#fbbf24','#7dd3fc'], momiji:['#b94a29','#f59e0b','#ffe0a5'],
  snow:['#75bce8','#d7efff','#ffffff'], halloween:['#ea8b2c','#a78bfa','#ffdda7'],
  neon:['#ec3fcf','#22d3ee','#ffffff'], magic:['#8b5cf6','#d8b4fe','#fef3c7'],
  ocean:['#0b6e9c','#58c9e8','#dff7ff'], cat:['#e5a6bd','#f6d5e5','#fff8fb'],
  dog:['#a9784e','#e5bc8d','#fff0d8'], sweets:['#ee8eaf','#ffdb75','#8ed9f0'],
  glass:['#4f84da','#f3bd46','#e56a6a'],
};

export function DecoThumbnail({ kind, slot, size = 'normal' }: { kind: DecoKind; slot: DecoSlot; size?: 'small' | 'normal' }) {
  const [a,b,c] = PALETTE[kind];
  const banner = slot === 'profile_effect';
  return (
    <span
      className={'ps-deco-thumb ' + (banner ? 'ps-deco-thumb-banner' : 'ps-deco-thumb-avatar') + (size === 'small' ? ' ps-deco-thumb-small' : '')}
      style={{ '--thumb-a': a, '--thumb-b': b, '--thumb-c': c } as React.CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 44" preserveAspectRatio="xMidYMid meet">
        {banner ? (
          <>
            <rect x="2" y="3" width="60" height="38" rx="8" fill="var(--thumb-a)" />
            <path d="M6 30Q18 18 29 29T58 23" fill="none" stroke="var(--thumb-c)" strokeWidth="2" opacity=".9" />
            <circle cx="17" cy="13" r="2" fill="var(--thumb-c)" /><circle cx="46" cy="11" r="1.5" fill="var(--thumb-c)" />
          </>
        ) : (
          <>
            <circle cx="32" cy="22" r="19" fill="url(#thumbGradient)" />
            <circle cx="32" cy="22" r="14.5" fill="none" stroke="var(--thumb-c)" strokeWidth="3" />
            <path d="M22 25Q32 12 42 25" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" opacity=".85" />
            <circle cx="32" cy="18" r="3.5" fill="var(--thumb-c)" />
          </>
        )}
        <path d="M7 36h50" stroke="var(--thumb-b)" strokeWidth="1.4" opacity=".65" />
      </svg>
    </span>
  );
}
