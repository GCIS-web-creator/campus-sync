'use client';

import { CampusSyncLogo } from '@/components/CampusSyncLogo';

type CampusSyncIntroProps = {
  onSkip: () => void;
};

export default function CampusSyncIntro({ onSkip }: CampusSyncIntroProps) {
  return (
    <div className="campus-intro" role="status" aria-label="CampusSyncを開いています">
      <div className="campus-intro__nebula" aria-hidden="true" />
      <div className="campus-intro__stars campus-intro__stars--back" aria-hidden="true" />
      <div className="campus-intro__stars campus-intro__stars--front" aria-hidden="true" />
      <div className="campus-intro__shooting-star" aria-hidden="true"><span /></div>

      <div className="campus-intro__logo-stage" aria-hidden="true">
        <svg className="campus-intro__logo-trace" viewBox="0 0 620 120" role="presentation">
          <defs>
            <linearGradient id="campusIntroTraceGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8AF7FF" />
              <stop offset=".55" stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#75A9FF" />
            </linearGradient>
            <filter id="campusIntroTraceGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path className="campus-intro__trace-mark" d="M34 24 L58 11 L82 24 L58 37 Z M34 24 L34 43 L58 56 L82 43 L82 24 M41 48 L41 65 Q58 76 75 65 L75 48" />
          <text className="campus-intro__trace-word" x="105" y="72" textAnchor="start">CampusSync</text>
        </svg>
        <div className="campus-intro__real-logo">
          <CampusSyncLogo variant="wordmark" theme="dark" height={74} alt="CampusSync" />
        </div>
        <div className="campus-intro__gloss" />
        <div className="campus-intro__logo-aura" />
      </div>

      <div className="campus-intro__supernova" aria-hidden="true">
        <span className="campus-intro__supernova-core" />
        <span className="campus-intro__supernova-ring campus-intro__supernova-ring--one" />
        <span className="campus-intro__supernova-ring campus-intro__supernova-ring--two" />
        <span className="campus-intro__supernova-rays" />
      </div>

      <div className="campus-intro__brand-copy" aria-hidden="true">
        <div className="campus-intro__eyebrow">YOUR CAMPUS, CONNECTED</div>
        <div className="campus-intro__tagline">学校生活を、もっとスムーズに。</div>
      </div>

      <button type="button" className="campus-intro__skip" onClick={onSkip} aria-label="イントロをスキップ">
        スキップ <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
