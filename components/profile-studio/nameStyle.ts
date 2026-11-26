import type { CSSProperties } from 'react';

export type NameAppearance = {
  enabled: boolean;
  stops: string[];
  angle: number;
  stroke: number;
  strokeColor: string;
  shadow: number;
  glow: number;
  weight: number;
  spacing: number;
};

export type BannerAppearance = {
  enabled: boolean;
  stops: string[];
  angle: number;
  pattern: 'none' | 'grid' | 'wave' | 'dots' | 'stars';
  positionX: number;
  positionY: number;
  scale: number;
};

export type ProfileStudioSettings = {
  name_appearance: NameAppearance;
  banner_appearance: BannerAppearance;
  name_font_override: string | null;
  equipped: { avatar_deco: string | null; profile_effect: string | null };
  motionPaused: boolean;
};

export const DEFAULT_NAME_APPEARANCE: NameAppearance = {
  enabled: false,
  stops: ['#f56fb1', '#faa36f', '#edcf5d', '#9cd865', '#57c3b3', '#718fe5', '#be74db'],
  angle: 90,
  stroke: 0,
  strokeColor: '#ffffff',
  shadow: 0,
  glow: 0,
  weight: 800,
  spacing: 0,
};

export const DEFAULT_PROFILE_STUDIO: ProfileStudioSettings = {
  name_appearance: DEFAULT_NAME_APPEARANCE,
  banner_appearance: { enabled: false, stops: ['#12386e', '#6d42a7', '#102344'], angle: 125, pattern: 'none', positionX: 50, positionY: 50, scale: 100 },
  name_font_override: null,
  equipped: { avatar_deco: null, profile_effect: null },
  motionPaused: false,
};

function validHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function normalizeProfileStudio(raw: unknown): ProfileStudioSettings {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const sourceName = value.name_appearance && typeof value.name_appearance === 'object'
    ? value.name_appearance as Record<string, unknown> : {};
  const rawStops = Array.isArray(sourceName.stops) ? sourceName.stops : DEFAULT_NAME_APPEARANCE.stops;
  const stops = rawStops.slice(0, 8).map((c) => validHex(c, '#ffffff'));
  const cleanStops = stops.length ? stops : ['#ffffff'];
  const sourceBanner = value.banner_appearance && typeof value.banner_appearance === 'object'
    ? value.banner_appearance as Record<string, unknown> : {};
  const rawBannerStops = Array.isArray(sourceBanner.stops) ? sourceBanner.stops : DEFAULT_PROFILE_STUDIO.banner_appearance.stops;
  const bannerStops = rawBannerStops.slice(0, 8).map((color) => validHex(color, '#ffffff'));
  const fontOverride = typeof value.name_font_override === 'string'
    && ['m-plus-rounded','zen-maru','kiwi-maru','zen-kaku','shippori-mincho','mochiy-pop','dela-gothic','dotgothic16','yusei-magic'].includes(value.name_font_override)
    ? value.name_font_override : null;
  const sourceEquipped = value.equipped && typeof value.equipped === 'object'
    ? value.equipped as Record<string, unknown> : {};
  const avatarDeco = typeof sourceEquipped.avatar_deco === 'string' ? sourceEquipped.avatar_deco : null;
  const profileEffect = typeof sourceEquipped.profile_effect === 'string' ? sourceEquipped.profile_effect : null;
  return {
    name_appearance: {
      enabled: sourceName.enabled === true,
      stops: cleanStops,
      angle: bounded(sourceName.angle, 90, 0, 360),
      stroke: bounded(sourceName.stroke, 0, 0, 8),
      strokeColor: validHex(sourceName.strokeColor, '#ffffff'),
      shadow: bounded(sourceName.shadow, 0, 0, 24),
      glow: bounded(sourceName.glow, 0, 0, 24),
      weight: bounded(sourceName.weight, 800, 300, 900),
      spacing: bounded(sourceName.spacing, 0, -2, 12),
    },
    banner_appearance: {
      enabled: sourceBanner.enabled === true,
      stops: bannerStops.length ? bannerStops : DEFAULT_PROFILE_STUDIO.banner_appearance.stops,
      angle: bounded(sourceBanner.angle, 125, 0, 360),
      pattern: ['none','grid','wave','dots','stars'].includes(String(sourceBanner.pattern)) ? sourceBanner.pattern as BannerAppearance['pattern'] : 'none',
      positionX: bounded(sourceBanner.positionX, 50, 0, 100),
      positionY: bounded(sourceBanner.positionY, 50, 0, 100),
      scale: bounded(sourceBanner.scale, 100, 100, 220),
    },
    name_font_override: fontOverride,
    equipped: { avatar_deco: avatarDeco, profile_effect: profileEffect },
    motionPaused: value.motionPaused === true,
  };
}

export function nameCss(settings: NameAppearance): CSSProperties {
  const first = settings.stops[0] || '#ffffff';
  const gradient = settings.stops.length > 1
    ? 'linear-gradient(' + settings.angle + 'deg,' + settings.stops.join(',') + ')'
    : first;
  const filters = [
    settings.shadow > 0 ? 'drop-shadow(0 ' + settings.shadow + 'px ' + settings.shadow + 'px rgba(0,0,0,.42))' : '',
    settings.glow > 0 ? 'drop-shadow(0 0 ' + settings.glow + 'px ' + first + ')' : '',
  ].filter(Boolean).join(' ');
  return {
    backgroundImage: gradient,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
    WebkitTextStroke: settings.stroke > 0 ? settings.stroke + 'px ' + settings.strokeColor : undefined,
    fontWeight: settings.weight,
    letterSpacing: settings.spacing + 'px',
    filter: filters || undefined,
  };
}
