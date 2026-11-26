'use client';

import React from 'react';
import { Lock } from 'lucide-react';
import { CosmeticIcon } from './CosmeticIcon';

export type BadgeState = 'unlocked' | 'locked' | 'equipped';

export function BadgeIcon({ id, state = 'unlocked', size = 40 }: { id: string; state?: BadgeState; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-label={id}>
      <span style={{ filter: state === 'locked' ? 'grayscale(1) brightness(.62)' : state === 'equipped' ? 'drop-shadow(0 0 6px rgba(255,255,255,.75))' : 'none', opacity: state === 'locked' ? .72 : 1 }}>
        <CosmeticIcon id={id} size={size} />
      </span>
      {state === 'locked' && <span className="absolute -bottom-1 -right-1 inline-flex rounded-full border border-current bg-slate-950 p-[2px] text-white" aria-hidden="true"><Lock size={Math.max(9, Math.round(size * .38))} /></span>}
    </span>
  );
}
