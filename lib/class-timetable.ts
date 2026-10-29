export type ClassTimetableDayKey = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';
export type ClassTimetableGroup = '7組' | '8組';

export type ClassTimetableSlot = {
  period: number;
  subject: string;
  teacher: string;
};

export type ClassTimetableData = Record<ClassTimetableGroup, Record<ClassTimetableDayKey, ClassTimetableSlot[]>>;

export const CLASS_TIMETABLE_DATA: ClassTimetableData = {
  '7組': {
    Mon: [
      { period: 1, subject: '公共', teacher: '江添' },
      { period: 2, subject: '物理／生物', teacher: '片桐泉・今野／児玉・渡邊啓' },
      { period: 3, subject: '数学C', teacher: '小森' },
      { period: 4, subject: '化学', teacher: '高松' },
      { period: 5, subject: '数学Ⅱ 2-1', teacher: '落合・長尾' },
      { period: 6, subject: '英コミⅡa', teacher: '蜂川・松本卓・福田' },
    ],
    Tue: [
      { period: 1, subject: '英コミⅡa', teacher: '蜂川・松本卓・福田' },
      { period: 2, subject: '公共', teacher: '江添' },
      { period: 3, subject: '情報', teacher: '佐藤暢' },
      { period: 4, subject: '数学C', teacher: '小森' },
      { period: 5, subject: '数学Ⅱ PC', teacher: '落合・長尾' },
      { period: 6, subject: '国語演習', teacher: '鈴木' },
      { period: 7, subject: '化学', teacher: '高松' },
    ],
    Wed: [
      { period: 1, subject: '数学Ⅱ PC', teacher: '落合・長尾' },
      { period: 2, subject: '体育', teacher: '中里・小松' },
      { period: 3, subject: '物理／生物', teacher: '片桐泉・今野／児玉・渡邊啓' },
      { period: 4, subject: '古典探究', teacher: '石澤' },
      { period: 5, subject: '英会話', teacher: 'セリーヌ・ドレイク' },
      { period: 6, subject: 'LHR', teacher: '長尾' },
    ],
    Thu: [
      { period: 1, subject: '家庭基礎', teacher: '安田・大津' },
      { period: 2, subject: '家庭基礎', teacher: '安田・大津' },
      { period: 3, subject: '物理／生物', teacher: '片桐泉・今野／児玉・渡邊啓' },
      { period: 4, subject: '化学', teacher: '高松' },
      { period: 5, subject: '保健', teacher: '長堂' },
      { period: 6, subject: '論理表現Ⅱ', teacher: '蜂川・松本卓' },
    ],
    Fri: [
      { period: 1, subject: '数学Ⅱ PC', teacher: '落合・長尾' },
      { period: 2, subject: '化学', teacher: '高松' },
      { period: 3, subject: '古典探究', teacher: '石澤' },
      { period: 4, subject: '情報', teacher: '佐藤暢' },
      { period: 5, subject: '体育', teacher: '中里・小松' },
      { period: 6, subject: '英コミⅡb', teacher: '蜂川・松本卓・福田・スコービ' },
      { period: 7, subject: '国語演習', teacher: '鈴木' },
    ],
  },
  '8組': {
    Mon: [
      { period: 1, subject: '公共', teacher: '佐久間' },
      { period: 2, subject: '物理／生物', teacher: '片桐泉・今野／児玉・渡邊啓' },
      { period: 3, subject: '化学', teacher: '高松' },
      { period: 4, subject: '古典探究', teacher: '石澤' },
      { period: 5, subject: '数学Ⅱ', teacher: '落合・田村' },
      { period: 6, subject: '英コミⅡa', teacher: '蜂川・松本卓・福田' },
    ],
    Tue: [
      { period: 1, subject: '英コミⅢa', teacher: '蜂川・松本卓・福田' },
      { period: 2, subject: '数学C', teacher: '小森' },
      { period: 3, subject: '古典探究', teacher: '石澤' },
      { period: 4, subject: '情報', teacher: '佐藤暢' },
      { period: 5, subject: '数学Ⅱ', teacher: '落合・田村' },
      { period: 6, subject: '化学', teacher: '高松' },
      { period: 7, subject: '国語演習', teacher: '鈴木' },
    ],
    Wed: [
      { period: 1, subject: '数学Ⅱ', teacher: '落合・田村' },
      { period: 2, subject: '体育', teacher: '中里・小松' },
      { period: 3, subject: '物理／生物', teacher: '片桐泉・今野／児玉・渡邊啓' },
      { period: 4, subject: '保健', teacher: '長堂' },
      { period: 5, subject: '公共', teacher: '佐久間' },
      { period: 6, subject: 'LHR', teacher: '落合' },
    ],
    Thu: [
      { period: 1, subject: '家庭基礎', teacher: '安田・大津' },
      { period: 2, subject: '家庭基礎', teacher: '安田・大津' },
      { period: 3, subject: '物理／生物', teacher: '片桐泉・今野／児玉・渡邊啓' },
      { period: 4, subject: '英会話', teacher: 'セリーヌ・ドレイク' },
      { period: 5, subject: '論理表現Ⅱ', teacher: '蜂川・松本卓' },
      { period: 6, subject: '化学', teacher: '高松' },
    ],
    Fri: [
      { period: 1, subject: '数学Ⅱ', teacher: '落合・田村' },
      { period: 2, subject: '情報', teacher: '佐藤暢' },
      { period: 3, subject: '化学', teacher: '高松' },
      { period: 4, subject: '国語演習', teacher: '鈴木' },
      { period: 5, subject: '体育', teacher: '中里・小松' },
      { period: 6, subject: '英コミⅡb', teacher: '蜂川・松本卓・福田・スコービ' },
      { period: 7, subject: '数学C', teacher: '小森' },
    ],
  },
};

const ENGLISH_DAY_TO_KEY: Record<string, ClassTimetableDayKey | null> = {
  Mon: 'Mon',
  Tue: 'Tue',
  Wed: 'Wed',
  Thu: 'Thu',
  Fri: 'Fri',
  Sat: null,
  Sun: null,
};

const JAPANESE_DAY_LABEL: Record<string, string> = {
  Mon: '月',
  Tue: '火',
  Wed: '水',
  Thu: '木',
  Fri: '金',
  Sat: '土',
  Sun: '日',
};

export type TokyoTomorrowTimetableInfo = {
  dateKey: string;
  dayKey: ClassTimetableDayKey | null;
  dayLabel: string;
  dateLabel: string;
};

export function getTokyoTomorrowTimetableInfo(now: Date = new Date()): TokyoTomorrowTimetableInfo {
  // Japan has no daylight-saving time, so adding 24 hours gives the next JST date.
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(tomorrow);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const weekday = values.weekday || 'Mon';
  const dayKey = ENGLISH_DAY_TO_KEY[weekday] ?? null;
  const dayLabel = JAPANESE_DAY_LABEL[weekday] || weekday;
  const month = Number(values.month);
  const day = Number(values.day);
  return {
    dateKey: String(values.year) + '-' + String(values.month) + '-' + String(values.day),
    dayKey,
    dayLabel,
    dateLabel: month + '月' + day + '日（' + dayLabel + '）',
  };
}

function buildGroupBubble(group: ClassTimetableGroup, dayKey: ClassTimetableDayKey, dateLabel: string) {
  const rows = CLASS_TIMETABLE_DATA[group][dayKey];
  const accent = group === '7組' ? '#0891B2' : '#4F46E5';
  const contents: Record<string, unknown>[] = rows.map(slot => ({
    type: 'box',
    layout: 'horizontal',
    alignItems: 'center',
    spacing: 'md',
    paddingAll: '10px',
    backgroundColor: '#F8FAFC',
    cornerRadius: '9px',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: '30px',
        height: '30px',
        cornerRadius: '8px',
        backgroundColor: accent,
        justifyContent: 'center',
        alignItems: 'center',
        contents: [{ type: 'text', text: String(slot.period), size: 'sm', weight: 'bold', color: '#FFFFFF', align: 'center' }],
      },
      {
        type: 'box',
        layout: 'vertical',
        flex: 1,
        spacing: 'xs',
        contents: [
          { type: 'text', text: slot.subject, size: 'sm', weight: 'bold', color: '#0F172A', wrap: true },
          { type: 'text', text: slot.teacher, size: 'xs', color: '#64748B', wrap: true },
        ],
      },
    ],
  }));

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '18px',
      backgroundColor: '#0F172A',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'CAMPUSSYNC  /  CLASS TIMETABLE', size: 'xs', color: '#67E8F9', weight: 'bold' },
        { type: 'text', text: group + '時間割', size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
        { type: 'text', text: dateLabel + 'の授業', size: 'sm', color: '#CBD5E1', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '14px',
      spacing: 'sm',
      contents: contents.length ? contents : [
        { type: 'text', text: 'この曜日の授業はありません。', size: 'sm', color: '#64748B', wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '10px',
      backgroundColor: '#F1F5F9',
      contents: [{ type: 'text', text: 'SOKA HIGH SCHOOL  •  CampusSync', size: 'xs', color: '#64748B', align: 'center' }],
    },
  };
}

export function buildClassTimetableFlexMessage(dayKey: ClassTimetableDayKey, dateLabel: string) {
  return {
    type: 'flex',
    altText: ('CampusSync｜' + dateLabel + 'の7組・8組時間割').slice(0, 400),
    contents: {
      type: 'carousel',
      contents: [
        buildGroupBubble('7組', dayKey, dateLabel),
        buildGroupBubble('8組', dayKey, dateLabel),
      ],
    },
  };
}
