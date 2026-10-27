import React from 'react';

export type CampusSyncLogoVariant = 'wordmark' | 'stacked' | 'text' | 'mark';
export type CampusSyncLogoTheme = 'auto' | 'light' | 'dark';
type CampusSyncLogoProps = {
  variant?: CampusSyncLogoVariant;
  theme?: CampusSyncLogoTheme;
  height?: number;
  alt?: string;
  className?: string;
};

const LOGO_FILES: Record<Exclude<CampusSyncLogoVariant, 'mark'>, { light: string; dark: string }> = {
  wordmark: { light: '/branding/campussync-wordmark-light.svg', dark: '/branding/campussync-wordmark-dark.svg' },
  stacked: { light: '/branding/campussync-stacked-light.svg', dark: '/branding/campussync-stacked-dark.svg' },
  text: { light: '/branding/campussync-text-light.svg', dark: '/branding/campussync-text-dark.svg' },
};

export function CampusSyncLogo({ variant = 'wordmark', theme = 'auto', height = 36, alt = 'CampusSync', className = '' }: CampusSyncLogoProps) {
  const wrapperClass = `inline-flex min-w-0 max-w-full items-center overflow-hidden ${className}`;
  const imgStyle: React.CSSProperties = {
    display: 'block',
    width: 'auto',
    height,
    maxWidth: '100%',
    minWidth: 0,
    objectFit: 'contain',
    flexShrink: 1,
  };

  if (variant === 'mark') {
    return <span className={wrapperClass} role="img" aria-label={alt}>
      <img src="/branding/campussync-mark.svg" alt="" aria-hidden="true" style={imgStyle} />
    </span>;
  }

  const files = LOGO_FILES[variant];
  if (theme !== 'auto') {
    return <span className={wrapperClass} role="img" aria-label={alt}>
      <img src={theme === 'dark' ? files.dark : files.light} alt="" aria-hidden="true" style={imgStyle} />
    </span>;
  }

  return (
    <span className={wrapperClass} role="img" aria-label={alt}>
      <img src={files.light} alt="" aria-hidden="true" style={imgStyle} className="campus-sync-logo-light" />
      <img src={files.dark} alt="" aria-hidden="true" style={imgStyle} className="campus-sync-logo-dark" />
    </span>
  );
}
