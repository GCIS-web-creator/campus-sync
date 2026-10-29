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

/** 事務室で実物確認され、校内全体へ公開された落とし物のお知らせ */
export function buildLostFoundApprovedFlexMessage(input: {
  title: string;
  location: string;
  storage?: string | null;
  description?: string | null;
  approvedAt?: string;
}): FlexMessage {
  const title = input.title.trim().slice(0, 100) || '落とし物';
  const location = input.location.trim().slice(0, 100) || '場所未登録';
  const storage = String(input.storage || '').trim().slice(0, 120);
  const description = String(input.description || '').trim().slice(0, 900);
  const approvedAt = String(input.approvedAt || '').trim().slice(0, 50);

  const details: Record<string, unknown>[] = [
    { type: 'text', text: title, size: 'xl', weight: 'bold', color: '#0F172A', wrap: true },
    { type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'md', contents: [
      { type: 'text', text: '発見場所', size: 'sm', color: '#64748B', flex: 2 },
      { type: 'text', text: location, size: 'sm', color: '#1E293B', weight: 'bold', flex: 5, wrap: true },
    ] },
  ];
  if (storage) details.push({
    type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'sm', contents: [
      { type: 'text', text: '保管場所', size: 'sm', color: '#64748B', flex: 2 },
      { type: 'text', text: storage, size: 'sm', color: '#1E293B', flex: 5, wrap: true },
    ],
  });
  if (description) details.push({
    type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md', backgroundColor: '#F1F5F9', cornerRadius: '10px', paddingAll: '12px',
    contents: [
      { type: 'text', text: '特徴', size: 'xs', weight: 'bold', color: '#64748B' },
      { type: 'text', text: description, size: 'sm', color: '#334155', wrap: true },
    ],
  });
  if (approvedAt) details.push({ type: 'text', text: '事務室確認済み  •  ' + approvedAt, size: 'xs', color: '#64748B', wrap: true, margin: 'md' });

  return {
    type: 'flex',
    altText: ('【落とし物・忘れ物】' + title + '／場所：' + location + '。事務室で実物確認し、全体公開しました。').slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#0F172A', paddingAll: '18px', spacing: 'sm',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC  /  LOST & FOUND', size: 'xs', color: '#67E8F9', weight: 'bold' },
          { type: 'text', text: '落とし物のお知らせ', size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
          { type: 'text', text: '✓ 事務室で実物確認済み・公開中', size: 'xs', color: '#A7F3D0', weight: 'bold', wrap: true },
        ],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'sm', contents: details },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#F8FAFC',
        contents: [
          { type: 'text', text: '心当たりがある場合は、事務室へお問い合わせください。', size: 'xs', color: '#475569', wrap: true },
          { type: 'text', text: 'CAMPUSSYNC  •  SOKA HIGH SCHOOL', size: 'xs', color: '#94A3B8', align: 'center', margin: 'sm' },
        ],
      },
    },
  };
}

/** 学食メニューが正式に売切へ切り替わったときの通知 */
export function buildCafeteriaSoldOutFlexMessage(input: {
  menuName: string;
  price?: string | null;
  updatedAt?: string;
}): FlexMessage {
  const menuName = input.menuName.trim().slice(0, 100) || '本日のメニュー';
  const price = String(input.price || '').trim().slice(0, 40);
  const updatedAt = String(input.updatedAt || '').trim().slice(0, 50);
  const bodyContents: Record<string, unknown>[] = [
    { type: 'text', text: menuName, size: 'xl', weight: 'bold', color: '#0F172A', wrap: true },
    { type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'sm', margin: 'md', contents: [
      { type: 'box', layout: 'vertical', width: '5px', height: '24px', backgroundColor: '#EF4444', cornerRadius: '3px', contents: [{ type: 'filler' }] },
      { type: 'text', text: '本日の販売は終了しました', size: 'md', weight: 'bold', color: '#B91C1C', wrap: true, flex: 1 },
    ] },
  ];
  if (price) bodyContents.push({ type: 'text', text: '価格：' + price, size: 'sm', color: '#64748B', margin: 'sm' });
  if (updatedAt) bodyContents.push({ type: 'text', text: '更新：' + updatedAt, size: 'xs', color: '#94A3B8', margin: 'md' });

  return {
    type: 'flex',
    altText: ('【学食・売切情報】' + menuName + 'は売切となりました。').slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#7F1D1D', paddingAll: '18px', spacing: 'sm',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC  /  CAFETERIA', size: 'xs', color: '#FECACA', weight: 'bold' },
          { type: 'text', text: '売切のお知らせ', size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
        ],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'sm', contents: bodyContents },
      footer: {
        type: 'box', layout: 'vertical', backgroundColor: '#FFF7F7', paddingAll: '12px',
        contents: [
          { type: 'text', text: '次回の販売状況はCampusSyncでご確認ください。', size: 'xs', color: '#7F1D1D', wrap: true },
          { type: 'text', text: 'CAMPUSSYNC  •  SOKA HIGH SCHOOL', size: 'xs', color: '#94A3B8', align: 'center', margin: 'sm' },
        ],
      },
    },
  };
}

