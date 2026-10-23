import React from 'react';
import { getRank, getNextRank } from '@/lib/ranks';
import { CROWD_ICONS } from '@/lib/status';

export type IllustrationKind =
  | 'empty-notifications' | 'empty-todo-done' | 'empty-reviews' | 'empty-lost-found'
  | 'empty-library-search' | 'empty-club-note' | 'error-offline' | 'empty-no-class';

const ILLUSTRATIONS: Record<IllustrationKind, string> = {
  'empty-notifications': '/illustrations/empty-notifications.svg',
  'empty-todo-done': '/illustrations/empty-todo-done.svg',
  'empty-reviews': '/illustrations/empty-reviews.svg',
  'empty-lost-found': '/illustrations/empty-lost-found.svg',
  'empty-library-search': '/illustrations/empty-library-search.svg',
  'empty-club-note': '/illustrations/empty-club-note.svg',
  'error-offline': '/illustrations/error-offline.svg',
  'empty-no-class': '/illustrations/empty-no-class.svg',
};

export function EmptyStateIllustration({ kind, caption, className = '' }: {
  kind: IllustrationKind; caption: string; className?: string;
}) {
  return (
    <div className={`mx-auto flex w-full min-w-0 flex-col items-center justify-center px-3 py-5 text-center ${className}`}>
      <img src={ILLUSTRATIONS[kind]} alt="" loading="lazy" className="h-auto w-40 max-w-full object-contain sm:w-48" />
      <p className="mt-2 max-w-prose text-sm font-semibold leading-relaxed text-slate-500 dark:text-slate-400">{caption}</p>
    </div>
  );
}

export function AnimatedAsset({ name, alt = '', className = '' }: {
  name: 'loading-logo' | 'qr-scan' | 'bell-ring' | 'aircon-wind' | 'cafeteria-steam' | 'lost-found-search' | 'train-move' | 'trophy-shine';
  alt?: string;
  className?: string;
}) {
  return <img src={`/animated/${name}.svg`} alt={alt} aria-hidden={alt ? undefined : true} className={`max-w-full object-contain ${className}`} />;
}

export function ScoreRankBadge({ points }: { points: number }) {
  const rank = getRank(points);
  const next = getNextRank(points);
  return (
    <div className="mt-2 inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-2 text-white">
      <img src={rank.src} alt={`${rank.label}メダル`} width={48} height={54} className="h-[54px] w-12 shrink-0 object-contain" />
      <div className="min-w-0">
        <p className="text-sm font-black">{rank.label}ランク</p>
        <p className="text-xs leading-relaxed text-white/80">{next ? `あと${next.remaining} ptで${next.rank.label}` : '最高ランク到達！'}</p>
      </div>
    </div>
  );
}

export function CrowdStatusIcon({ value, label }: { value: string; label: string }) {
  const search = `${value} ${label}`.toLowerCase();
  const key = /empty|空いて|空き|すいて/.test(search) ? 'empty'
    : /crowd|混雑|混ん/.test(search) ? 'crowded'
    : /normal|通常|普通/.test(search) ? 'normal' : null;
  if (!key) return null;
  const item = CROWD_ICONS[key];
  return <img src={item.src} alt="" aria-hidden="true" title={item.label} className="inline-block h-5 w-5 shrink-0 object-contain" />;
}

type StatusIconProps = { size?: number; className?: string };
function StatusImage({ src, size = 24, className = '' }: StatusIconProps & { src: string }) {
  return <img src={src} alt="" aria-hidden="true" width={size} height={size} className={`inline-block shrink-0 object-contain ${className}`} style={{ width: size, height: size }} />;
}
export function AirconColdIcon(props: StatusIconProps) { return <StatusImage src="/status-icons/ac-cold.svg" {...props} />; }
export function AirconComfortableIcon(props: StatusIconProps) { return <StatusImage src="/status-icons/ac-comfy.svg" {...props} />; }
export function AirconHotIcon(props: StatusIconProps) { return <StatusImage src="/status-icons/ac-hot.svg" {...props} />; }
