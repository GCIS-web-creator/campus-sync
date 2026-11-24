/**
 * Utilities for editing saved Pomodoro study-session timestamps and durations.
 * Duration inputs use HH:MM:SS so existing second-level precision is preserved.
 */

export function formatStudyDurationInput(totalSeconds: number): string {
  const safeSeconds = Math.min(86_400, Math.max(0, Math.floor(Number(totalSeconds) || 0)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
}

/** Parse HH:MM:SS into seconds. Returns null for invalid or >24-hour values. */
export function parseStudyDurationInput(value: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (hours > 24 || (hours === 24 && (minutes > 0 || seconds > 0))) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function toLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function fromLocalDateTimeInput(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}


/**
 * Infer a likely school subject from a selected book title.
 * Returns null when the title does not provide a clear subject clue.
 */
export function inferStudySubjectFromBookTitle(title: string): string | null {
  const normalized = String(title || '').normalize('NFKC').toLowerCase().replace(/[\\s　]+/g, '');
  if (!normalized) return null;

  // Match more specific subjects before their broader prefixes.
  const subjectRules: Array<[RegExp, string]> = [
    [/(?:数学|数)(?:iii|3|三)(?=$|[^a-z0-9])/, '数学III'],
    [/数学(?:ii|2)(?=$|[^a-z0-9])/, '数学Ⅱ'],
    [/数学(?:i|1)(?=$|[^a-z0-9])/, '数学I'],
    [/数学a(?=$|[^a-z0-9])/, '数学A'],
    [/数学b(?=$|[^a-z0-9])/, '数学B'],
    [/数学c(?=$|[^a-z0-9])/, '数学C'],
    [/物理基礎/, '物理基礎'],
    [/物理/, '物理'],
    [/化学基礎/, '化学基礎'],
    [/化学/, '化学'],
    [/生物基礎/, '生物基礎'],
    [/生物/, '生物'],
    [/地学基礎/, '地学基礎'],
    [/地学/, '地学'],
    [/地理総合/, '地理総合'],
    [/地理探究/, '地理探究'],
    [/日本史/, '日本史探究'],
    [/世界史/, '世界史探究'],
    [/古典/, '古典探究'],
    [/現代文|現代の国語/, '現代の国語'],
    [/英語コミュニケーション|英コミュ/, '英語コミュニケーションI'],
    [/論理表現|論理・表現|論表/, '論理・表現I'],
    [/情報i|情報1/, '情報I'],
    [/情報ii|情報2/, '情報II'],
  ];

  for (const [pattern, subject] of subjectRules) {
    if (pattern.test(normalized)) return subject;
  }
  return null;
}
