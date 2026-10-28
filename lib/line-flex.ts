export type FlexMessage = {
  type: 'flex';
  altText: string;
  contents: Record<string, unknown>;
};

const NAVY = '#0F172A';
const SLATE = '#475569';

/** CampusSync共通デザインのAdminお知らせFlex Message */
export function buildNoticeFlexMessage(title: string, message: string): FlexMessage {
  const safeTitle = title.trim().slice(0, 100) || '学校からのお知らせ';
  const safeMessage = message.trim().slice(0, 1900);
  return {
    type: 'flex',
    altText: ('CampusSync｜' + safeTitle + '｜' + safeMessage).slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: NAVY, paddingAll: '18px', spacing: 'sm',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC  /  NOTICE', color: '#67E8F9', size: 'xs', weight: 'bold' },
          { type: 'text', text: safeTitle, color: '#FFFFFF', size: 'xl', weight: 'bold', wrap: true },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'md',
        contents: [
          { type: 'text', text: safeMessage, color: '#1E293B', size: 'sm', wrap: true },
          { type: 'separator', color: '#E2E8F0', margin: 'md' },
          { type: 'text', text: '最新情報はCampusSyncでも確認できます。', color: '#64748B', size: 'xs', wrap: true },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#F8FAFC',
        contents: [{ type: 'text', text: 'SOKA HIGH SCHOOL  •  CampusSync', color: '#64748B', size: 'xs', align: 'center' }],
      },
    },
  };
}

/** 部活・委員会投稿向けFlex Message */
export function buildClubNoteFlexMessage(input: {
  clubName: string; title: string; content: string; author: string; createdAt: string;
}): FlexMessage {
  const clubName = input.clubName.trim().slice(0, 80) || '部活・委員会';
  const title = input.title.trim().slice(0, 100) || '連絡';
  const content = input.content.trim();
  const author = input.author.trim().slice(0, 50) || '学校からのお知らせ';
  const createdAt = input.createdAt.slice(0, 40) || '日時不明';
  return {
    type: 'flex',
    altText: ('CampusSync｜' + clubName + '｜' + title + '｜' + content).slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: NAVY, paddingAll: '18px', spacing: 'sm',
        contents: [
          { type: 'text', text: 'CLUB / COMMITTEE', color: '#67E8F9', size: 'xs', weight: 'bold' },
          { type: 'text', text: clubName, color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
          { type: 'text', text: title, color: '#FFFFFF', size: 'xl', weight: 'bold', wrap: true },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'md',
        contents: [
          { type: 'box', layout: 'vertical', backgroundColor: '#F1F5F9', cornerRadius: '10px', paddingAll: '10px', spacing: 'xs',
            contents: [
              { type: 'text', text: '発信者  ' + author, color: '#334155', size: 'xs', wrap: true },
              { type: 'text', text: '投稿日時  ' + createdAt, color: '#64748B', size: 'xs', wrap: true },
            ],
          },
          { type: 'text', text: content.slice(0, 1800) || '本文はありません。', color: '#1E293B', size: 'sm', wrap: true },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#F8FAFC',
        contents: [{ type: 'text', text: 'CAMPUSSYNC  •  SCHOOL COMMUNITY', color: '#64748B', size: 'xs', align: 'center' }],
      },
    },
  };
}

export type TimetableDeparture = { time: string; service?: string | null };

function timetableDirectionBox(title: string, accent: string, rows: TimetableDeparture[]) {
  const contents: Record<string, unknown>[] = [
    { type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center',
      contents: [
        { type: 'box', layout: 'vertical', width: '4px', height: '18px', backgroundColor: accent, cornerRadius: '2px', contents: [{ type: 'filler' }] },
        { type: 'text', text: title, size: 'md', weight: 'bold', color: '#0F172A', flex: 1, wrap: true },
      ],
    },
  ];
  if (!rows.length) {
    contents.push({ type: 'text', text: 'この時間帯の登録時刻はありません。', size: 'xs', color: '#64748B', wrap: true, margin: 'sm' });
  } else {
    for (const row of rows.slice(0, 12)) {
      contents.push({
        type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', paddingAll: '8px',
        backgroundColor: '#F8FAFC', cornerRadius: '8px',
        contents: [
          { type: 'text', text: row.time, size: 'lg', weight: 'bold', color: accent, flex: 1 },
          { type: 'text', text: row.service?.trim().slice(0, 50) || '各駅停車', size: 'xs', color: '#475569', align: 'end', wrap: true, flex: 2 },
        ],
      });
    }
  }
  return { type: 'box', layout: 'vertical', spacing: 'sm', contents };
}

/** 鷹の台駅の毎時配信Flex Message */
export function buildHourlyTrainTimetableFlex(input: {
  startLabel: string; endLabel: string; kokubunji: TimetableDeparture[]; higashimurayama: TimetableDeparture[];
}): FlexMessage {
  const alt = ('鷹の台駅 発車案内 ' + input.startLabel + '〜' + input.endLabel + '。国分寺方面 ' + input.kokubunji.length + '本、東村山方面 ' + input.higashimurayama.length + '本').slice(0, 400);
  return {
    type: 'flex',
    altText: alt,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: NAVY, paddingAll: '18px', spacing: 'sm',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC  /  TRANSIT', size: 'xs', color: '#67E8F9', weight: 'bold' },
          { type: 'text', text: '鷹の台駅 発車案内', size: 'xl', color: '#FFFFFF', weight: 'bold' },
          { type: 'text', text: 'NEXT 60 MINUTES  •  ' + input.startLabel + ' – ' + input.endLabel, size: 'xs', color: '#CBD5E1', wrap: true },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'xl',
        contents: [
          timetableDirectionBox('国分寺方面', '#2563EB', input.kokubunji),
          { type: 'separator', color: '#E2E8F0' },
          timetableDirectionBox('東村山方面', '#0D9488', input.higashimurayama),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#F8FAFC',
        contents: [
          { type: 'text', text: '時刻表データ登録時点の発車予定です。遅延・運休情報は含みません。', size: 'xs', color: '#64748B', wrap: true },
          { type: 'text', text: 'CAMPUSSYNC  •  SOKA HIGH SCHOOL', size: 'xs', color: '#94A3B8', align: 'center', margin: 'sm' },
        ],
      },
    },
  };
}
