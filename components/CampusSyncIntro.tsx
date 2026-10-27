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

      <button type="button" className="campus-intro__skip" onClick={onSkip} aria-label="イントロをスキップ">
        スキップ <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
