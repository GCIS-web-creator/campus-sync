/**
 * LINEの定期配信前後は、通常のバックグラウンド処理を一時的に後回しにする。
 * Asia/Tokyo の固定時刻で判定し、端末・Workerのタイムゾーン設定には依存しない。
 */
export type LineDeliveryPriorityWindow = {
  label: string;
  endsAt: string;
};

type ScheduledLineSlot = {
  label: string;
  days: readonly string[];
  hour: number;
  minute: number;
};

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const SCHEDULED_LINE_SLOTS: readonly ScheduledLineSlot[] = [
  { label: '平日16:00の日次LINE配信', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], hour: 16, minute: 0 },
  { label: '土曜12:30の日次LINE配信', days: ['Sat'], hour: 12, minute: 30 },
  { label: '日曜09:00の週間LINE配信', days: ['Sun'], hour: 9, minute: 0 },
  { label: '毎日21:00のBOT切替予告', days: ALL_DAYS, hour: 21, minute: 0 },
];

export function getLineDeliveryPriorityWindow(
  now: Date = new Date(),
): LineDeliveryPriorityWindow | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const weekday = values.weekday || '';
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second || '0');
  const minuteOfDay = hour * 60 + minute;

  for (const slot of SCHEDULED_LINE_SLOTS) {
    if (!slot.days.includes(weekday)) continue;
    const scheduledMinute = slot.hour * 60 + slot.minute;
    const windowStart = scheduledMinute - 5;
    const windowEnd = scheduledMinute + 5;
    if (minuteOfDay < windowStart || minuteOfDay >= windowEnd) continue;

    const millisecondsUntilEnd =
      (windowEnd - minuteOfDay) * 60_000 - second * 1_000 - now.getMilliseconds();

    return {
      label: slot.label,
      endsAt: new Date(now.getTime() + Math.max(0, millisecondsUntilEnd)).toISOString(),
    };
  }

  return null;
}
