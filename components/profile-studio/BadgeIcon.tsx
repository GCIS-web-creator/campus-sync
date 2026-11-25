'use client';

import React from 'react';

export type BadgeState = 'unlocked' | 'locked' | 'equipped';

const BADGE_ASSETS: Record<string, string> = {
  badge_first_study: 'first-step',
  badge_study_10: 'steady-learner',
  badge_contribution_3: 'campus-supporter',
};

export function BadgeIcon({ id, state = 'unlocked', size = 40 }: { id: string; state?: BadgeState; size?: number }) {
  const asset = BADGE_ASSETS[id];
  if (!asset) {
    return <span aria-label="バッジ" className="inline-flex items-center justify-center rounded-full bg-slate-500/10" style={{ width: size, height: size }}>✦</span>;
  }
  return (
    <span className="relative inline-grid shrink-0" style={{ width: size, height: size }} aria-label={id}>
      <img
        src={'/profile-studio/badges/' + asset + '.svg'}
        width={size}
        height={size}
        alt=""
        loading="lazy"
        style={{ filter: state === 'locked' ? 'grayscale(1) brightness(.62)' : state === 'equipped' ? 'drop-shadow(0 0 6px rgba(255,255,255,.75))' : 'none', opacity: state === 'locked' ? .72 : 1 }}
      />
      {state === 'locked' && <span className="absolute -bottom-1 -right-1 text-[10px]" aria-hidden>🔒</span>}
    </span>
  );
}
