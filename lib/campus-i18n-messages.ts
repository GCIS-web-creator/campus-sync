import type { CampusLanguage } from './campus-i18n';
import ja from './locales/ja';
import en from './locales/en';
import ar from './locales/ar';
import ko from './locales/ko';
import zh from './locales/zh';

export type CampusMessageKey = keyof typeof ja;
const RESOURCES = { ja, en, ar, ko, zh } satisfies Record<CampusLanguage, Record<CampusMessageKey, string>>;

export function translateCampusMessage(key: CampusMessageKey, language: CampusLanguage): string {
  return RESOURCES[language][key] ?? RESOURCES.ja[key] ?? key;
}
