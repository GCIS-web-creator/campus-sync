import type { DecoKind } from './effectsRegistry';

export type DecoSlot = 'avatar_deco' | 'profile_effect';
export type DecoRarity = 'common' | 'rare' | 'epic' | 'legendary';
export interface DecoItem {
  id: string;
  slot: DecoSlot;
  kind: DecoKind;
  name: string;
  rarity: DecoRarity;
  unlockId: string | null;
}

// unlockId is intentionally null for the 22 new items. Map to a real,
// existing achievement only after its unlock condition has been approved.
export const DECO_ITEMS: DecoItem[] = [
  { id: 'deco-sakura-fubuki', slot: 'avatar_deco', kind: 'sakura', name: '桜吹雪の結界', rarity: 'legendary', unlockId: null },
  { id: 'deco-sea-ripple', slot: 'avatar_deco', kind: 'sea', name: '潮騒の波紋', rarity: 'epic', unlockId: null },
  { id: 'deco-forest-wreath', slot: 'avatar_deco', kind: 'forest', name: '森の若葉と蛍', rarity: 'epic', unlockId: null },
  { id: 'deco-meadow-flowers', slot: 'avatar_deco', kind: 'meadow', name: '草原の花冠', rarity: 'rare', unlockId: null },
  { id: 'fx-sakura-drift', slot: 'profile_effect', kind: 'sakura', name: '花びら舞う春風', rarity: 'epic', unlockId: null },
  { id: 'fx-sea-spray', slot: 'profile_effect', kind: 'sea', name: '海辺の波しぶき', rarity: 'epic', unlockId: null },
  { id: 'fx-forest-light', slot: 'profile_effect', kind: 'forest', name: '木漏れ日の森', rarity: 'legendary', unlockId: null },
  { id: 'fx-meadow-wind', slot: 'profile_effect', kind: 'meadow', name: '風わたる草原', rarity: 'rare', unlockId: null },
  { id: 'deco-space', slot: 'avatar_deco', kind: 'space', name: '宇宙のアイコン装飾', rarity: 'legendary', unlockId: null },
  { id: 'fx-space', slot: 'profile_effect', kind: 'space', name: '宇宙のバナー効果', rarity: 'legendary', unlockId: null },
  { id: 'deco-star', slot: 'avatar_deco', kind: 'star', name: '星空のアイコン装飾', rarity: 'epic', unlockId: null },
  { id: 'fx-star', slot: 'profile_effect', kind: 'star', name: '星空のバナー効果', rarity: 'epic', unlockId: null },
  { id: 'deco-mech', slot: 'avatar_deco', kind: 'mech', name: 'メカニックのアイコン装飾', rarity: 'epic', unlockId: null },
  { id: 'fx-mech', slot: 'profile_effect', kind: 'mech', name: 'メカニックのバナー効果', rarity: 'epic', unlockId: null },
  { id: 'deco-rain', slot: 'avatar_deco', kind: 'rain', name: '雨のアイコン装飾', rarity: 'rare', unlockId: null },
  { id: 'fx-rain', slot: 'profile_effect', kind: 'rain', name: '雨のバナー効果', rarity: 'rare', unlockId: null },
  { id: 'deco-rabbit', slot: 'avatar_deco', kind: 'rabbit', name: 'ウサギのアイコン装飾', rarity: 'rare', unlockId: null },
  { id: 'fx-rabbit', slot: 'profile_effect', kind: 'rabbit', name: 'ウサギのバナー効果', rarity: 'rare', unlockId: null },
  { id: 'deco-plush', slot: 'avatar_deco', kind: 'plush', name: 'ぬいぐるみのアイコン装飾', rarity: 'rare', unlockId: null },
  { id: 'fx-plush', slot: 'profile_effect', kind: 'plush', name: 'ぬいぐるみのバナー効果', rarity: 'rare', unlockId: null },
  { id: 'deco-emoji', slot: 'avatar_deco', kind: 'emoji', name: '絵文字のアイコン装飾', rarity: 'common', unlockId: null },
  { id: 'fx-emoji', slot: 'profile_effect', kind: 'emoji', name: '絵文字のバナー効果', rarity: 'common', unlockId: null },
];
