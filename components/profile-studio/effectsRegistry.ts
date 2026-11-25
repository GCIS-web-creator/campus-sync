import * as A from './effectsMarkup.js';
import * as B from './effectsMarkup2.js';

export type DecoKind = 'sakura' | 'sea' | 'forest' | 'meadow' | 'space' | 'star' | 'mech' | 'rain' | 'rabbit' | 'plush' | 'emoji';
type MarkupFactory = (count?: number) => string;

export const ICON: Record<DecoKind, MarkupFactory> = {
  sakura: A.sakuraIcon, sea: A.seaIcon, forest: A.forestIcon, meadow: A.meadowIcon,
  space: B.spaceIcon, star: B.starIcon, mech: B.mechIcon, rain: B.rainIcon, rabbit: B.rabbitIcon, plush: B.plushIcon, emoji: B.emojiIcon,
};
export const BANNER: Record<DecoKind, MarkupFactory> = {
  sakura: A.sakuraBanner, sea: A.seaBanner, forest: A.forestBanner, meadow: A.meadowBanner,
  space: B.spaceBanner, star: B.starBanner, mech: B.mechBanner, rain: B.rainBanner, rabbit: B.rabbitBanner, plush: B.plushBanner, emoji: B.emojiBanner,
};
