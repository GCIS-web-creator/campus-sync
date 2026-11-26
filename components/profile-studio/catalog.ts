import type { DecoKind } from './effectsRegistry';

export type DecoSlot = 'avatar_deco' | 'profile_effect';
export type DecoRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type DecoGroup = '自然' | '宇宙・科学' | '季節' | '動物' | 'アート・スイーツ';
export interface DecoItem {
  id: string;
  slot: DecoSlot;
  kind: DecoKind;
  name: string;
  rarity: DecoRarity;
  unlockId: string | null;
  group: DecoGroup;
  unlockCondition: string;
  approvalPending: boolean;
}
type ThemeDef = {
  kind: DecoKind;
  label: string;
  group: DecoGroup;
  rarity: DecoRarity;
  avatarRarity?: DecoRarity;
  bannerRarity?: DecoRarity;
  newTheme?: boolean;
  seasonal?: boolean;
};
const legacyCondition = '既存の解放条件を維持（変更なし）';
const proposed = (rarity: DecoRarity) => ({
  common: '学習5回 または 合計60分',
  rare: '学習20回 または 合計300分 または 貢献5件',
  epic: '学習50回 または 合計1,200分 または 貢献15件',
  legendary: '学習100回 または 合計3,000分 または 貢献30件',
}[rarity]);
const THEMES: ThemeDef[] = [
  { kind: 'sakura', label: '桜', group: '季節', rarity: 'epic', avatarRarity: 'legendary', bannerRarity: 'epic', seasonal: true },
  { kind: 'sea', label: '海辺', group: '自然', rarity: 'epic' },
  { kind: 'forest', label: '森林', group: '自然', rarity: 'epic', avatarRarity: 'epic', bannerRarity: 'legendary' },
  { kind: 'meadow', label: '草原', group: '自然', rarity: 'rare' },
  { kind: 'space', label: '宇宙', group: '宇宙・科学', rarity: 'legendary' },
  { kind: 'star', label: '星空', group: '宇宙・科学', rarity: 'epic' },
  { kind: 'mech', label: 'メカニック', group: '宇宙・科学', rarity: 'epic' },
  { kind: 'rain', label: '雨', group: '自然', rarity: 'rare' },
  { kind: 'rabbit', label: 'ウサギ', group: '動物', rarity: 'rare' },
  { kind: 'plush', label: 'ぬいぐるみ', group: '動物', rarity: 'rare' },
  { kind: 'emoji', label: 'ポップ', group: '動物', rarity: 'common' },
  { kind: 'lab', label: '理科室', group: '宇宙・科学', rarity: 'rare', newTheme: true },
  { kind: 'fw', label: '花火', group: '季節', rarity: 'legendary', newTheme: true, seasonal: true },
  { kind: 'momiji', label: '紅葉', group: '季節', rarity: 'epic', newTheme: true, seasonal: true },
  { kind: 'snow', label: '雪', group: '季節', rarity: 'rare', newTheme: true, seasonal: true },
  { kind: 'halloween', label: 'ハロウィン', group: '季節', rarity: 'epic', newTheme: true, seasonal: true },
  { kind: 'neon', label: 'ネオン', group: '宇宙・科学', rarity: 'legendary', newTheme: true },
  { kind: 'magic', label: '魔法', group: '宇宙・科学', rarity: 'legendary', newTheme: true },
  { kind: 'ocean', label: '海中', group: '自然', rarity: 'epic', newTheme: true },
  { kind: 'cat', label: '猫', group: '動物', rarity: 'rare', newTheme: true },
  { kind: 'dog', label: '犬', group: '動物', rarity: 'rare', newTheme: true },
  { kind: 'sweets', label: 'スイーツ', group: 'アート・スイーツ', rarity: 'rare', newTheme: true },
  { kind: 'glass', label: 'ステンドグラス', group: 'アート・スイーツ', rarity: 'legendary', newTheme: true },
];

export const DECO_ITEMS: DecoItem[] = THEMES.flatMap(theme => {
  const seasonalCondition = theme.seasonal ? '期間限定イベント（案・オーナー承認待ち）' : null;
  const condition = theme.newTheme
    ? (seasonalCondition || proposed(theme.rarity)) + '（条件案・承認待ち）'
    : legacyCondition;
  return [
    {
      id: 'deco-' + (theme.kind === 'sakura' ? 'sakura-fubuki' : theme.kind === 'sea' ? 'sea-ripple' : theme.kind === 'forest' ? 'forest-wreath' : theme.kind === 'meadow' ? 'meadow-flowers' : theme.kind),
      slot: 'avatar_deco',
      kind: theme.kind,
      name: theme.kind === 'sakura' ? '桜吹雪の結界' : theme.kind === 'sea' ? '潮騒の波紋' : theme.kind === 'forest' ? '森の若葉と蛍' : theme.kind === 'meadow' ? '草原の花冠' : theme.label + 'のアイコン装飾',
      rarity: theme.avatarRarity || theme.rarity,
      unlockId: null,
      group: theme.group,
      unlockCondition: condition,
      approvalPending: Boolean(theme.newTheme),
    },
    {
      id: 'fx-' + (theme.kind === 'sakura' ? 'sakura-drift' : theme.kind === 'sea' ? 'sea-spray' : theme.kind === 'forest' ? 'forest-light' : theme.kind === 'meadow' ? 'meadow-wind' : theme.kind),
      slot: 'profile_effect',
      kind: theme.kind,
      name: theme.kind === 'sakura' ? '花びら舞う春風' : theme.kind === 'sea' ? '海辺の波しぶき' : theme.kind === 'forest' ? '木漏れ日の森' : theme.kind === 'meadow' ? '風わたる草原' : theme.label + 'のバナー効果',
      rarity: theme.bannerRarity || theme.rarity,
      unlockId: null,
      group: theme.group,
      unlockCondition: condition,
      approvalPending: Boolean(theme.newTheme),
    },
  ];
});
