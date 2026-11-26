'use client';

import React, { useMemo, useRef, useId } from 'react';
import './effects.css';
import './nature.css';
import './themes2.css';
import './themes3.css';
import './effects-overrides.css';
import './motion-pause.css';
import { ICON, BANNER, type DecoKind } from './effectsRegistry';
import { usePlayWhenVisible } from './usePlayWhenVisible';
export type { DecoKind };

const overlay: React.CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };

function scopeSvgIds(markup: string, prefix: string) {
  const ids = new Map<string, string>();
  const withIds = markup.replace(/\bid="([^"]+)"/g, (_match, id: string) => {
    const next = prefix + '-' + id;
    ids.set(id, next);
    return 'id="' + next + '"';
  });
  return withIds
    .replace(/url\(#([^)]+)\)/g, (_match, id: string) => 'url(#' + (ids.get(id) || prefix + '-' + id) + ')')
    .replace(/\b(href|xlink:href)="#([^"]+)"/g, (_match, attr: string, id: string) => attr + '="#' + (ids.get(id) || prefix + '-' + id) + '"');
}

/** Place inside a position:relative avatar wrapper. Markup is generated only from trusted theme constants. */
export function AvatarDeco({ kind, count = 6, paused = false }: { kind: DecoKind; count?: number; paused?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = usePlayWhenVisible(ref);
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const html = useMemo(() => scopeSvgIds(ICON[kind](Math.min(10, Math.max(1, count))), 'avatar-' + reactId), [kind, count, reactId]);
  return <div ref={ref} aria-hidden="true" style={{ ...overlay, zIndex: 3 }} data-paused={paused || !visible ? 'true' : 'false'} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Place inside a position:relative; overflow:hidden profile banner. */
export function BannerEffect({ kind, count = 14, paused = false, intensity = 0.16 }: { kind: DecoKind; count?: number; paused?: boolean; intensity?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = usePlayWhenVisible(ref);
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const html = useMemo(() => scopeSvgIds(BANNER[kind](Math.min(24, Math.max(1, count))), 'banner-' + reactId), [kind, count, reactId]);
  return <div ref={ref} aria-hidden="true" style={{ ...overlay, zIndex: 2, ['--ps-sea-opacity' as string]: String(Math.min(0.4, Math.max(0, intensity))) } as React.CSSProperties} data-paused={paused || !visible ? 'true' : 'false'} dangerouslySetInnerHTML={{ __html: html }} />;
}
