import * as A from './effectsMarkup.js';
import * as B from './effectsMarkup2.js';
import * as C from './effectsMarkup3.js';

export type DecoKind =
  | 'sakura' | 'sea' | 'forest' | 'meadow' | 'space' | 'star' | 'mech'
  | 'rain' | 'rabbit' | 'plush' | 'emoji'
  | 'lab' | 'fw' | 'momiji' | 'snow' | 'halloween' | 'neon'
  | 'magic' | 'ocean' | 'cat' | 'dog' | 'sweets' | 'glass';

type MarkupFactory = (count?: number) => string;
export const ICON: Record<DecoKind, MarkupFactory> = {
  sakura: A.sakuraIcon, sea: A.seaIcon, forest: A.forestIcon, meadow: A.meadowIcon,
  space: B.spaceIcon, star: B.starIcon, mech: B.mechIcon, rain: B.rainIcon,
  rabbit: B.rabbitIcon, plush: B.plushIcon, emoji: B.emojiIcon,
  lab: C.labIcon, fw: C.fwIcon, momiji: C.momijiIcon, snow: C.snowIcon,
  halloween: C.halloweenIcon, neon: C.neonIcon, magic: C.magicIcon, ocean: C.oceanIcon,
  cat: C.catIcon, dog: C.dogIcon, sweets: C.sweetsIcon, glass: C.glassIcon,
};
export const BANNER: Record<DecoKind, MarkupFactory> = {
  sakura: A.sakuraBanner, sea: A.seaBanner, forest: A.forestBanner, meadow: A.meadowBanner,
  space: B.spaceBanner, star: B.starBanner, mech: B.mechBanner, rain: B.rainBanner,
  rabbit: B.rabbitBanner, plush: B.plushBanner, emoji: B.emojiBanner,
  lab: C.labBanner, fw: C.fwBanner, momiji: C.momijiBanner, snow: C.snowBanner,
  halloween: C.halloweenBanner, neon: C.neonBanner, magic: C.magicBanner, ocean: C.oceanBanner,
  cat: C.catBanner, dog: C.dogBanner, sweets: C.sweetsBanner, glass: C.glassBanner,
};
