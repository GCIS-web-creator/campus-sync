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
  const match = /^(\\d{1,2}):([0-5]\\d):([0-5]\\d)$/.exec(value.trim());
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
