import React from 'react';

export type CampusSyncLogoVariant = 'wordmark' | 'stacked' | 'text' | 'mark';
type CampusSyncLogoProps = {
  variant?: CampusSyncLogoVariant;
  height?: number;
  alt?: string;
  className?: string;
};

const LOGO_FILES: Record<Exclude<CampusSyncLogoVariant, 'mark'>, { light: string; dark: string }> = {
  wordmark: { light: '/branding/campussync-wordmark-light.svg', dark: '/branding/campussync-wordmark-dark.svg' },
  stacked: { light: '/branding/campussync-stacked-light.svg', dark: '/branding/campussync-stacked-dark.svg' },
  text: { light: '/branding/campussync-text-light.svg', dark: '/branding/campussync-text-dark.svg' },
};

export function CampusSyncLogo({ variant = 'wordmark', height = 36, alt = 'CampusSync', className = '' }: CampusSyncLogoProps) {
  const imgStyle: React.CSSProperties = { display: 'block', width: 'auto', height, maxWidth: '100%' };
  if (variant === 'mark') {
    return <img src="/branding/campussync-mark.svg" alt={alt} height={height} style={imgStyle} className={className} />;
  }
  const files = LOGO_FILES[variant];
  return (
    <span className={`inline-flex items-center ${className}`} role="img" aria-label={alt}>
      <img src={files.light} alt="" aria-hidden="true" style={imgStyle} className="dark:hidden" />
      <img src={files.dark} alt="" aria-hidden="true" style={imgStyle} className="hidden dark:block" />
    </span>
  );
}
