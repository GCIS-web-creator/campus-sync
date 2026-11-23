const TARGET_TAMA_CITY_CODES = ['13202', '13210', '13213', '13214', '13220'] as const;

/** The five Tama municipalities used for CampusSync local earthquake alerts. */
export function isTargetTokyoTamaMunicipality(prefectureCode: unknown, cityCode: unknown): boolean {
  if (!String(prefectureCode || '').startsWith('13')) return false;
  const normalizedCityCode = String(cityCode || '').trim();
  return TARGET_TAMA_CITY_CODES.some(code => normalizedCityCode.startsWith(code));
}
