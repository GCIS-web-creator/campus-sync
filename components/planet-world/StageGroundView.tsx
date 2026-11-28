'use client';

import CityGroundView from '@/components/planet-world/CityGroundView';
import SceneGroundView from '@/components/planet-world/ground/SceneGroundView';
import { getGroundClimate, getPlanetSky } from '@/lib/planet-ground-climate';
import { getGroundStage } from '@/lib/planet-ground-stage';

type Props = { planetId: string; planetName: string; atmosphereColor: string; stage: number; onBack: () => void };

/**
 * Temperate planets show the view for their civilization stage, under their own sky.
 * Every other planet keeps the near-future city until its growth is decided.
 */
export default function StageGroundView(props: Props) {
  const info = getGroundStage(props.stage);
  if (getGroundClimate(props.planetId) !== 'temperate') return <CityGroundView {...props} stage={info.stage} />;
  if (info.kind === 'cyber') return <CityGroundView {...props} stage={info.stage} title={info.name} sky={getPlanetSky(props.planetId)} />;
  return <SceneGroundView {...props} key={info.kind} kind={info.kind} stage={info.stage} stageName={info.name} />;
}
