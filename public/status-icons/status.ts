// 学食の混雑投票(empty / normal / crowded)と、エアコン状況(寒い / 快適 / 暑い)のアイコン対応表。
// 色は page.tsx の VoteBar と同じ緑・オレンジ・赤です。
export type CrowdVote = 'empty' | 'normal' | 'crowded';
export type AirconStatus = '寒い' | '快適' | '暑い';

export const CROWD_ICONS: Record<CrowdVote, { label: string; src: string; color: string }> = {
  empty:   { label: '空いていて快適',   src: '/status-icons/crowd-empty.svg',   color: '#22C55E' },
  normal:  { label: '通常の混み具合',   src: '/status-icons/crowd-normal.svg',  color: '#FB923C' },
  crowded: { label: '大変混雑している', src: '/status-icons/crowd-crowded.svg', color: '#EF4444' },
};

export const AIRCON_ICONS: Record<AirconStatus, { src: string }> = {
  '寒い': { src: '/status-icons/ac-cold.svg' },
  '快適': { src: '/status-icons/ac-comfy.svg' },
  '暑い': { src: '/status-icons/ac-hot.svg' },
};
