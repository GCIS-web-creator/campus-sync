// Which street-level scene each civilization stage shows.

export type GroundSceneKind = 'wilderness' | 'village' | 'town' | 'industry' | 'cyber' | 'stellar';

export type GroundStageInfo = {
  stage: number;
  kind: GroundSceneKind;
  name: string;
};

export const GROUND_STAGES: readonly GroundStageInfo[] = [
  { stage: 0, kind: 'wilderness', name: '原始惑星' },
  { stage: 1, kind: 'village', name: '集落時代' },
  { stage: 2, kind: 'town', name: '都市形成期' },
  { stage: 3, kind: 'industry', name: '産業・研究時代' },
  { stage: 4, kind: 'cyber', name: '高度文明' },
  { stage: 5, kind: 'stellar', name: '惑星文明' },
];

export function getGroundStage(stage: number): GroundStageInfo {
  const index = Number.isFinite(stage) ? Math.max(0, Math.min(5, Math.floor(stage))) : 0;
  return GROUND_STAGES[index];
}

export function groundRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}
