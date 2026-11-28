'use client';

import CityGroundView from '@/components/planet-world/CityGroundView';
import SceneGroundView from '@/components/planet-world/ground/SceneGroundView';
import { getGroundStage } from '@/lib/planet-ground-stage';

type Props = { planetId: string; planetName: string; atmosphereColor: string; stage: number; onBack: () => void };

/** The ground view that matches the planet's civilization stage. */
export default function StageGroundView(props: Props) {
  const info = getGroundStage(props.stage);
  if (info.kind === 'cyber') return <CityGroundView {...props} stage={info.stage} />;
  return <SceneGroundView {...props} key={info.kind} kind={info.kind} stage={info.stage} stageName={info.name} />;
}
