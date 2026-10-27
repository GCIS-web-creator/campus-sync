'use client';

import { useEffect, useState, type AnimationEvent } from 'react';
import { CampusSyncLogo } from '@/components/CampusSyncLogo';

type CampusSyncIntroProps = {
  onSkip: () => void;
};

export default function CampusSyncIntro({ onSkip }: CampusSyncIntroProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setIsExiting(true), reducedMotion ? 0 : 5550);
    return () => window.clearTimeout(timer);
  }, []);

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && event.animationName === 'campusIntroExit') onSkip();
  }

  return (
    <div className={'campus-intro' + (isExiting ? ' campus-intro--exiting' : '')} onAnimationEnd={handleAnimationEnd} role="status" aria-label="CampusSyncを開いています">
      <div className="campus-intro__nebula" aria-hidden="true" />
      <div className="campus-intro__stars campus-intro__stars--back" aria-hidden="true" />
      <div className="campus-intro__stars campus-intro__stars--front" aria-hidden="true" />
      <div className="campus-intro__shooting-star" aria-hidden="true"><span /></div>

      <div className="campus-intro__logo-stage" aria-hidden="true">
        <div className="campus-intro__draw-spark" aria-hidden="true"><span /></div>
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

      <button type="button" className="campus-intro__skip" onClick={() => setIsExiting(true)} aria-label="イントロをスキップ">
        スキップ <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
