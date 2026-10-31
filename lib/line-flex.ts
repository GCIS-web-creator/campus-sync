export type FlexMessage = {
  type: 'flex';
  altText: string;
  contents: Record<string, unknown>;
};

const NAVY = '#0F172A';
const SLATE = '#475569';

/** CampusSync共通デザインのAdminお知らせFlex Message */
export function buildNoticeFlexMessage(title: string, message: string, imageUrl?: string | null): FlexMessage {
  const safeTitle = title.trim().slice(0, 100) || '学校からのお知らせ';
  const safeMessage = message.trim().slice(0, 1800);
  const safeImageUrl = typeof imageUrl === 'string' && /^https:\/\//i.test(imageUrl) ? imageUrl : '';
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
      ...(safeImageUrl ? {
        hero: {
          type: 'image',
          url: safeImageUrl,
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover',
        },
      } : {}),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'md',
        contents: [
          { type: 'text', text: safeMessage, color: '#1E293B', size: 'sm', wrap: true },
          { type: 'separator', color: '#E2E8F0', margin: 'md' },
          { type: 'text', text: '最新情報はCampusSyncでも確認できます。', color: '#64748B', size: 'xs', wrap: true },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#F8FAFC', spacing: 'xs',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', color: '#64748B', size: 'xs', align: 'center', wrap: true },
          { type: 'text', text: '@ created by Fuku', color: '#64748B', size: 'xs', align: 'center', wrap: true },
        ],
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
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#F8FAFC', spacing: 'xs',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', color: '#64748B', size: 'xs', align: 'center', wrap: true },
          { type: 'text', text: '@ created by Fuku', color: '#64748B', size: 'xs', align: 'center', wrap: true },
        ],
      },
    },
  };
}

export type TimetableDeparture = { time: string; service?: string | null };

export function buildTimetableDirectionBox(title: string, accent: string, rows: TimetableDeparture[]) {
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

/** 鷹の台駅の時刻表まとめ配信用Flex Message */
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
          { type: 'text', text: 'AFTERNOON TIMETABLE  •  ' + input.startLabel + ' – ' + input.endLabel, size: 'xs', color: '#CBD5E1', wrap: true },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'xl',
        contents: [
          buildTimetableDirectionBox('国分寺方面', '#2563EB', input.kokubunji),
          { type: 'separator', color: '#E2E8F0' },
          buildTimetableDirectionBox('東村山方面', '#0D9488', input.higashimurayama),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#F8FAFC', spacing: 'xs',
        contents: [
          { type: 'text', text: '時刻表データ登録時点の発車予定です。遅延・運休情報は含みません。', size: 'xs', color: '#64748B', wrap: true },
          { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true },
          { type: 'text', text: '@ created by Fuku', size: 'xs', color: '#64748B', align: 'center', wrap: true },
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
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#F8FAFC', spacing: 'xs',
        contents: [
          { type: 'text', text: '心当たりがある場合は、事務室へお問い合わせください。', size: 'xs', color: '#475569', wrap: true },
          { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true },
          { type: 'text', text: '@ created by Fuku', size: 'xs', color: '#64748B', align: 'center', wrap: true },
        ],
      },
    },
  };
}

/** 学食メニューが正式に売切へ切り替わったときの通知 */
export function buildCafeteriaSoldOutFlexMessage(input: {
  menuName?: string;
  price?: string | null;
  items?: Array<{ menuName: string; price?: string | null }>;
  updatedAt?: string;
}): FlexMessage {
  const items=(input.items?.length?input.items:[{menuName:input.menuName||'本日のメニュー',price:input.price}])
    .slice(0,5)
    .map(item=>({menuName:String(item.menuName||'本日のメニュー').trim().slice(0,100),price:String(item.price||'').trim().slice(0,40)}))
    .filter(item=>item.menuName);
  const updatedAt=String(input.updatedAt||'').trim().slice(0,50);
  const body:Record<string,unknown>[]=[];
  for(const [index,item] of items.entries()){
    if(index>0)body.push({type:'separator',color:'#FECACA',margin:'md'});
    body.push(
      {type:'text',text:item.menuName,size:'lg',weight:'bold',color:'#0F172A',wrap:true},
      {type:'box',layout:'horizontal',alignItems:'center',spacing:'sm',margin:'sm',contents:[
        {type:'box',layout:'vertical',width:'5px',height:'22px',backgroundColor:'#EF4444',cornerRadius:'3px',contents:[{type:'filler'}]},
        {type:'text',text:'本日の販売は終了しました',size:'sm',weight:'bold',color:'#B91C1C',wrap:true,flex:1},
      ]},
      ...(item.price?[{type:'text',text:'価格：'+item.price,size:'xs',color:'#64748B',margin:'xs',wrap:true}]:[]),
    );
  }
  if(updatedAt)body.push({type:'text',text:'更新：'+updatedAt,size:'xs',color:'#94A3B8',margin:'md'});
  const itemNames=items.map(item=>item.menuName).join('・');
  return {
    type:'flex',
    altText:('【学食・売切情報】'+itemNames+'は売切となりました。').slice(0,400),
    contents:{
      type:'bubble',size:'mega',
      header:{type:'box',layout:'vertical',backgroundColor:'#7F1D1D',paddingAll:'18px',spacing:'sm',contents:[
        {type:'text',text:'CAMPUSSYNC / CAFETERIA',size:'xs',color:'#FECACA',weight:'bold'},
        {type:'text',text:'売切のお知らせ',size:'xl',color:'#FFFFFF',weight:'bold',wrap:true},
        {type:'text',text:items.length+'件のメニューが売切となりました',size:'xs',color:'#FEE2E2',wrap:true},
      ]},
      body:{type:'box',layout:'vertical',paddingAll:'18px',spacing:'sm',contents:body},
      footer:{type:'box',layout:'vertical',backgroundColor:'#FFF7F7',paddingAll:'12px',spacing:'xs',contents:[
        {type:'text',text:'次回の販売状況はCampusSyncでご確認ください。',size:'xs',color:'#7F1D1D',wrap:true},
        {type:'text',text:'CAMPUSSYNC・SOKA HIGH SCHOOL',size:'xs',color:'#64748B',align:'center',wrap:true},
        {type:'text',text:'@ created by Fuku',size:'xs',color:'#64748B',align:'center',wrap:true},
      ]},
    },
  };
}

/** 月曜〜日曜の週間学校予定表。LINE上で曜日ごとのカードを切り替えて確認できる。 */
export function buildWeeklySchoolScheduleFlexMessage(input: {
  title: string;
  weekStart: string;
  days: Array<{
    date: string;
    dayLabel: string;
    isHoliday?: boolean;
    holidayName?: string;
    isWeekendSchool?: boolean;
    items?: Array<{ id?: string; time?: string; title?: string; location?: string; details?: string }>;
  }>;
}): FlexMessage {
  const weekEndDate = new Date(input.weekStart + 'T00:00:00Z');
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);
  const dateLabel = (value: string) => value.slice(5).replace('-', '/');
  const heading = input.title.trim().slice(0, 100) || '学校予定表';
  const bubbles = input.days.slice(0, 7).map((day, index) => {
    const holiday = day.isHoliday === true;
    const weekend = day.dayLabel === '土' || day.dayLabel === '日';
    const weekendSchool = weekend && day.isWeekendSchool === true;
    const allItems = Array.isArray(day.items) ? day.items : [];
    const items = allItems.filter(item => String(item.title || item.details || item.time || item.location || '').trim());
    const bodyContents: Record<string, unknown>[] = [];
    if (holiday) {
      bodyContents.push({
        type: 'box', layout: 'vertical', paddingAll: '10px', cornerRadius: '9px',
        backgroundColor: '#FFF1F2', contents: [
          { type: 'text', text: '祝日・休校日', size: 'sm', weight: 'bold', color: '#BE123C', wrap: true },
          ...(day.holidayName ? [{ type: 'text', text: String(day.holidayName).slice(0, 100), size: 'xs', color: '#9F1239', wrap: true, margin: 'xs' }] : []),
        ],
      });
    }
    if (weekend && !holiday) {
      bodyContents.push({
        type: 'box', layout: 'vertical', paddingAll: '10px', cornerRadius: '9px',
        backgroundColor: weekendSchool ? '#D1FAE5' : '#E2E8F0',
        contents: [{ type: 'text', text: weekendSchool ? '休日登校日' : '基本休日', size: 'sm', weight: 'bold', color: weekendSchool ? '#065F46' : '#334155', wrap: true }],
      });
    }
    if (items.length === 0 && !holiday && !(weekend && !weekendSchool)) {
      bodyContents.push({ type: 'text', text: 'この日の予定はありません。', size: 'sm', color: '#64748B', wrap: true });
    }
    for (const item of items.slice(0, 7)) {
      const contents: Record<string, unknown>[] = [];
      if (item.time) contents.push({ type: 'text', text: String(item.time).slice(0, 30), size: 'xs', color: '#0E7490', weight: 'bold', wrap: true });
      contents.push({ type: 'text', text: String(item.title || '予定').slice(0, 120), size: 'sm', color: '#0F172A', weight: 'bold', wrap: true });
      if (item.location) contents.push({ type: 'text', text: '場所：' + String(item.location).slice(0, 100), size: 'xs', color: '#475569', wrap: true });
      if (item.details) contents.push({ type: 'text', text: String(item.details).slice(0, 220), size: 'xs', color: '#475569', wrap: true });
      bodyContents.push({
        type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px',
        cornerRadius: '9px', backgroundColor: '#F8FAFC', contents,
      });
    }
    if (items.length > 7) bodyContents.push({
      type: 'text', text: 'ほか' + (items.length - 7) + '件の予定があります。CampusSyncで確認してください。',
      size: 'xs', color: '#64748B', wrap: true,
    });

    return {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
        backgroundColor: holiday ? '#881337' : '#0F172A',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC  /  WEEKLY SCHEDULE', size: 'xs', color: '#67E8F9', weight: 'bold', wrap: true },
          { type: 'text', text: String(day.dayLabel || ['月', '火', '水', '木', '金', '土', '日'][index]) + '曜日の予定', size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
          { type: 'text', text: dateLabel(day.date), size: 'sm', color: '#CBD5E1', wrap: true },
        ],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm', contents: bodyContents },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px', backgroundColor: '#F1F5F9', spacing: 'xs',
        contents: [
          { type: 'text', text: heading + '  •  ' + dateLabel(input.weekStart) + '〜' + dateLabel(weekEnd), size: 'xs', color: '#475569', wrap: true },
          { type: 'text', text: (index + 1) + ' / 7  日曜日の週予定配信', size: 'xs', color: '#64748B', align: 'center', wrap: true },
          { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true },
          { type: 'text', text: '@ created by Fuku', size: 'xs', color: '#64748B', align: 'center', wrap: true },
        ],
      },
    };
  });

  return {
    type: 'flex',
    altText: ('CampusSync｜' + heading + '｜' + dateLabel(input.weekStart) + '〜' + dateLabel(weekEnd) + 'の学校予定表').slice(0, 400),
    contents: { type: 'carousel', contents: bubbles },
  };
}



/** イベントの指定日カウントダウンを、12イベントずつのLINE Flex carouselに分割して構築します。 */
export function buildSchoolEventCountdownFlexMessages(input: Array<{
  title: string;
  summary?: string | null;
  eventDate: string;
  daysRemaining: number;
}>): FlexMessage[] {
  const items = input.filter(item => item && String(item.title || '').trim()).map(item => ({
    title: String(item.title || '学校イベント').trim().slice(0, 120),
    summary: String(item.summary || '').trim().slice(0, 1200),
    eventDate: String(item.eventDate || ''),
    daysRemaining: Math.max(0, Math.floor(Number(item.daysRemaining) || 0)),
  }));
  const dateLabel = (value: string) => value.slice(0, 10).replace(/-/g, '/');
  const messages: FlexMessage[] = [];

  for (let offset = 0; offset < items.length; offset += 12) {
    const chunk = items.slice(offset, offset + 12);
    const contents = chunk.map(event => {
      const remainingColor = event.daysRemaining <= 3 ? '#B91C1C' : event.daysRemaining <= 7 ? '#C2410C' : '#4338CA';
      const countdownLabel = event.daysRemaining === 1 ? 'あと1日' : 'あと' + event.daysRemaining + '日';
      const bodyContents: Record<string, unknown>[] = [
        { type: 'text', text: event.title, size: 'xl', weight: 'bold', color: '#0F172A', wrap: true },
        { type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'md', contents: [
          { type: 'text', text: '開催日', size: 'sm', color: '#64748B', flex: 2 },
          { type: 'text', text: dateLabel(event.eventDate), size: 'sm', color: '#1E293B', weight: 'bold', flex: 5, wrap: true },
        ] },
      ];
      if (event.summary) bodyContents.push({
        type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md', backgroundColor: '#F1F5F9', cornerRadius: '10px', paddingAll: '12px',
        contents: [{ type: 'text', text: 'イベント概要', size: 'xs', weight: 'bold', color: '#64748B' },
          { type: 'text', text: event.summary, size: 'sm', color: '#334155', wrap: true }],
      });
      return {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#0F172A', paddingAll: '18px', spacing: 'sm',
          contents: [
            { type: 'text', text: 'CAMPUSSYNC  /  EVENT COUNTDOWN', size: 'xs', color: '#67E8F9', weight: 'bold' },
            { type: 'text', text: '学校イベントのお知らせ', size: 'lg', color: '#FFFFFF', weight: 'bold', wrap: true },
          ],
        },
        hero: {
          type: 'box', layout: 'vertical', backgroundColor: remainingColor, paddingAll: '16px', spacing: 'xs',
          contents: [
            { type: 'text', text: countdownLabel, size: '3xl', color: '#FFFFFF', weight: 'bold', align: 'center', wrap: true },
            { type: 'text', text: 'EVENT COUNTDOWN', size: 'xs', color: '#FFFFFF', align: 'center', weight: 'bold' },
          ],
        },
        body: { type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'sm', contents: bodyContents },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#F8FAFC', spacing: 'xs',
          contents: [
            { type: 'text', text: '開催日までのカウントダウン通知です。', size: 'xs', color: '#475569', wrap: true },
            { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true },
            { type: 'text', text: '@ created by Fuku', size: 'xs', color: '#64748B', align: 'center', wrap: true },
          ],
        },
      };
    });
    const altText = ('CampusSync｜学校イベントのカウントダウン｜' + chunk.map(item => item.title + ' あと' + item.daysRemaining + '日').join('、')).slice(0, 400);
    messages.push({ type: 'flex', altText, contents: { type: 'carousel', contents } });
  }
  return messages;
}


const AI_PURPLE = '#4C1D95';
const AI_ACCENT = '#C4B5FD';
const AI_TEXT = '#1E1B4B';

function campusAiCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const text = String(value).trim();
  return (text || '—').slice(0, 240);
}

/**
 * LINEのCampusSync AI専用Flex Message。
 * 通常のお知らせと見分けやすい紫系ヘッダーを使い、表データは端末幅に合わせて配置する。
 */
export function buildCampusAiFlexMessage(input: {
  question?: string;
  answer: string;
  headers?: string[];
  rows?: unknown[][];
}): FlexMessage {
  const question = String(input.question || '').trim().slice(0, 100);
  const answer = String(input.answer || '').trim().slice(0, 1800)
    || '回答を取得できませんでした。少し待ってからもう一度質問してください。';
  const headers = Array.isArray(input.headers)
    ? input.headers.filter((value): value is string => typeof value === 'string').slice(0, 6)
    : [];
  const rows = Array.isArray(input.rows)
    ? input.rows.filter((row): row is unknown[] => Array.isArray(row)).slice(0, 8)
    : [];
  const contents: Record<string, unknown>[] = [
    { type: 'text', text: answer, size: 'sm', color: '#1E293B', wrap: true },
  ];

  if (question) {
    contents.unshift({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#F5F3FF',
      cornerRadius: '10px',
      paddingAll: '10px',
      contents: [
        { type: 'text', text: 'YOUR QUESTION', size: 'xxs', color: '#7C3AED', weight: 'bold' },
        { type: 'text', text: question, size: 'sm', color: AI_TEXT, wrap: true },
      ],
    });
  }

  if (headers.length > 0 && rows.length > 0) {
    contents.push({ type: 'separator', color: '#DDD6FE', margin: 'md' });
    contents.push({
      type: 'box',
      layout: 'horizontal',
      alignItems: 'center',
      backgroundColor: '#EDE9FE',
      cornerRadius: '8px',
      paddingAll: '10px',
      contents: [
        { type: 'text', text: '▦ DATA TABLE', size: 'xs', weight: 'bold', color: '#5B21B6', wrap: true },
        { type: 'text', text: rows.length + '件', size: 'xs', color: '#6D28D9', align: 'end', flex: 1 },
      ],
    });

    if (headers.length <= 3) {
      const columnFlex = headers.map((header, index) => {
        const length = Math.max(header.length, ...rows.map(row => campusAiCell(row[index]).length));
        return Math.max(1, Math.min(3, Math.ceil(length / 12)));
      });
      contents.push({
        type: 'box',
        layout: 'horizontal',
        spacing: 'xs',
        margin: 'sm',
        contents: headers.map((header, index) => ({
          type: 'text',
          text: header.slice(0, 45),
          size: 'xs',
          weight: 'bold',
          color: '#5B21B6',
          flex: columnFlex[index],
          wrap: true,
        })),
      });
      rows.forEach((row, rowIndex) => {
        contents.push({
          type: 'box',
          layout: 'horizontal',
          spacing: 'xs',
          paddingAll: '8px',
          backgroundColor: rowIndex % 2 === 0 ? '#F8FAFC' : '#FFFFFF',
          contents: headers.map((_, index) => ({
            type: 'text',
            text: campusAiCell(row[index]),
            size: 'xs',
            color: '#1E293B',
            flex: columnFlex[index],
            wrap: true,
          })),
        });
        if (rowIndex < rows.length - 1) contents.push({ type: 'separator', color: '#E2E8F0' });
      });
    } else {
      rows.forEach((row, rowIndex) => {
        const pairContents: Record<string, unknown>[] = [
          { type: 'text', text: 'レコード ' + (rowIndex + 1), size: 'xs', color: '#7C3AED', weight: 'bold', margin: 'none' },
        ];
        headers.forEach((header, index) => {
          pairContents.push({
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            margin: 'xs',
            contents: [
              { type: 'text', text: header.slice(0, 50), size: 'xs', color: '#64748B', flex: 2, wrap: true },
              { type: 'text', text: campusAiCell(row[index]), size: 'xs', color: '#1E293B', flex: 5, wrap: true },
            ],
          });
        });
        contents.push({
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          paddingAll: '10px',
          backgroundColor: rowIndex % 2 === 0 ? '#F8FAFC' : '#FFFFFF',
          cornerRadius: '8px',
          contents: pairContents,
        });
      });
    }

    if ((input.rows?.length ?? rows.length) > rows.length) {
      contents.push({
        type: 'text',
        text: '表示は先頭8件までです。続きはCampusSyncサイトのAIで確認してください。',
        size: 'xs',
        color: '#64748B',
        wrap: true,
        margin: 'md',
      });
    }
  }

  contents.push({
    type: 'separator',
    color: '#E2E8F0',
    margin: 'md',
  });

  return {
    type: 'flex',
    altText: ('CampusSync AI｜' + (question ? question + '｜' : '') + answer).slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: AI_PURPLE,
        paddingAll: '18px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: '✦ CAMPUSSYNC AI', size: 'xs', color: AI_ACCENT, weight: 'bold' },
          { type: 'text', text: 'AIアシスタントの回答', size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
          { type: 'text', text: 'SMART ANSWER  /  DATA ASSISTANT', size: 'xxs', color: '#DDD6FE', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'md',
        contents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        backgroundColor: '#F5F3FF',
        spacing: 'xs',
        contents: [
          { type: 'text', text: '✦ このメッセージはCampusSync AIが回答しました', size: 'xs', color: '#6D28D9', align: 'center', wrap: true },
          { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true },
          { type: 'text', text: '@ created by Fuku', size: 'xs', color: '#64748B', align: 'center', wrap: true },
        ],
      },
    },
  };
}


/** 緊急連絡専用Flex。通常のお知らせと区別できる警告色・行動確認欄を使用する。 */
export function buildEmergencyNoticeFlexMessage(
  title: string,
  message: string,
  imageUrl?: string | null,
  category?: string,
): FlexMessage {
  const safeTitle = title.trim().slice(0, 100) || '緊急連絡';
  const safeMessage = message.trim().slice(0, 1800);
  const safeImageUrl = typeof imageUrl === 'string' && /^https:\/\//i.test(imageUrl) ? imageUrl : '';
  const categoryLabels: Record<string, string> = {
    school_closure: '休校・登校時間変更',
    class_change: '授業変更・休講',
    early_dismissal: '緊急下校',
    disaster: '災害・気象情報',
    emergency: '緊急連絡',
  };
  const categoryLabel = categoryLabels[category || ''] || '緊急連絡';

  return {
    type: 'flex',
    altText: ('【緊急】CampusSync｜' + safeTitle + '｜' + safeMessage).slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#991B1B',
        paddingAll: '18px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: '●  CAMPUSSYNC  /  EMERGENCY', color: '#FECACA', size: 'xs', weight: 'bold' },
          { type: 'text', text: categoryLabel, color: '#FEE2E2', size: 'sm', weight: 'bold' },
          { type: 'text', text: safeTitle, color: '#FFFFFF', size: 'xl', weight: 'bold', wrap: true },
        ],
      },
      ...(safeImageUrl ? {
        hero: {
          type: 'image',
          url: safeImageUrl,
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover',
        },
      } : {}),
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        spacing: 'md',
        contents: [
          { type: 'text', text: '重要：学校からの緊急連絡です。本文と対象者・時刻を確認してください。', color: '#991B1B', size: 'xs', weight: 'bold', wrap: true },
          { type: 'text', text: safeMessage, color: '#1E293B', size: 'sm', wrap: true },
          { type: 'separator', color: '#FECACA', margin: 'md' },
          { type: 'text', text: '不明点がある場合は、学校からの正式な案内・教職員の指示を確認してください。', color: '#475569', size: 'xs', wrap: true },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        backgroundColor: '#FEF2F2',
        spacing: 'xs',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', color: '#7F1D1D', size: 'xs', align: 'center', wrap: true },
          { type: 'text', text: '@ created by Fuku', color: '#7F1D1D', size: 'xs', align: 'center', wrap: true },
        ],
      },
    },
  };
}
