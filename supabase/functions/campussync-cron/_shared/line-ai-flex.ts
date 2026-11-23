export type FlexMessage = { type: 'flex'; altText: string; contents: Record<string, unknown> };

const AI_PRIMARY = '#173B40';
const AI_ACCENT = '#A7D3CD';
const AI_TEXT = '#263238';
const AI_TEAL = '#376C69';
const AI_MINT = '#EAF2F1';
const AI_BORDER = '#D8E6E4';

function campusAiCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const text = String(value).trim();
  return (text || '—').slice(0, 240);
}

/** LINEのCampusSync AI専用Flex Message。青緑のブランドヘッダーと質問・回答・データカードで構成する。 */
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
    {
      type: 'box', layout: 'vertical', backgroundColor: '#F8FAFC',
      cornerRadius: '12px', paddingAll: '12px', spacing: 'sm',
      contents: [
        {
          type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'sm',
          contents: [
            {
              type: 'box', layout: 'vertical', width: '4px', height: '18px',
              backgroundColor: AI_TEAL, cornerRadius: '2px', contents: [{ type: 'filler' }],
            },
            { type: 'text', text: 'AI ANSWER  /  回答', size: 'xs', weight: 'bold', color: AI_TEAL, flex: 1 },
            {
              type: 'box', layout: 'vertical', backgroundColor: AI_MINT,
              cornerRadius: '999px', paddingAll: '5px',
              contents: [{ type: 'text', text: 'AI', size: 'xxs', weight: 'bold', color: AI_TEAL, align: 'center' }],
            },
          ],
        },
        { type: 'text', text: answer, size: 'sm', color: AI_TEXT, wrap: true },
      ],
    },
  ];

  if (question) {
    contents.unshift({
      type: 'box', layout: 'vertical', backgroundColor: AI_MINT,
      cornerRadius: '12px', paddingAll: '12px', spacing: 'xs',
      contents: [
        { type: 'text', text: 'YOUR QUESTION  /  質問', size: 'xxs', color: AI_TEAL, weight: 'bold' },
        { type: 'text', text: question, size: 'sm', color: AI_TEXT, wrap: true },
      ],
    });
  }

  if (headers.length > 0 && rows.length > 0) {
    contents.push({ type: 'separator', color: AI_BORDER, margin: 'md' });
    contents.push({
      type: 'box', layout: 'horizontal', alignItems: 'center',
      backgroundColor: AI_MINT, cornerRadius: '10px', paddingAll: '10px',
      contents: [
        { type: 'text', text: 'REGISTERED DATA  /  データ', size: 'xs', weight: 'bold', color: AI_TEAL, wrap: true },
        { type: 'text', text: rows.length + '件', size: 'xs', color: AI_TEAL, align: 'end', flex: 1 },
      ],
    });

    if (headers.length <= 3) {
      const columnFlex = headers.map((header, index) => {
        const length = Math.max(header.length, ...rows.map(row => campusAiCell(row[index]).length));
        return Math.max(1, Math.min(3, Math.ceil(length / 12)));
      });
      contents.push({
        type: 'box', layout: 'horizontal', spacing: 'xs', margin: 'sm',
        contents: headers.map((header, index) => ({
          type: 'text', text: header.slice(0, 45), size: 'xs',
          weight: 'bold', color: AI_TEAL, flex: columnFlex[index], wrap: true,
        })),
      });
      rows.forEach((row, rowIndex) => {
        contents.push({
          type: 'box', layout: 'horizontal', spacing: 'xs', paddingAll: '9px',
          backgroundColor: rowIndex % 2 === 0 ? '#F1F6F5' : '#FFFFFF',
          cornerRadius: '7px',
          contents: headers.map((_, index) => ({
            type: 'text', text: campusAiCell(row[index]), size: 'xs',
            color: AI_TEXT, flex: columnFlex[index], wrap: true,
          })),
        });
        if (rowIndex < rows.length - 1) contents.push({ type: 'separator', color: AI_BORDER });
      });
    } else {
      rows.forEach((row, rowIndex) => {
        const pairContents: Record<string, unknown>[] = [
          { type: 'text', text: 'ITEM  ' + String(rowIndex + 1).padStart(2, '0'), size: 'xxs', color: AI_TEAL, weight: 'bold' },
        ];
        headers.forEach((header, index) => {
          pairContents.push({
            type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'xs',
            contents: [
              { type: 'text', text: header.slice(0, 50), size: 'xs', color: '#64748B', flex: 2, wrap: true },
              { type: 'text', text: campusAiCell(row[index]), size: 'xs', color: AI_TEXT, flex: 5, wrap: true },
            ],
          });
        });
        contents.push({
          type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '11px',
          backgroundColor: rowIndex % 2 === 0 ? '#F1F6F5' : '#FFFFFF',
          cornerRadius: '9px', contents: pairContents,
        });
      });
    }

    if ((input.rows?.length ?? rows.length) > rows.length) {
      contents.push({
        type: 'text',
        text: '表示は先頭8件までです。続きはCampusSyncサイトのAIで確認してください。',
        size: 'xs', color: '#64748B', wrap: true, margin: 'md',
      });
    }
  }

  contents.push({ type: 'separator', color: AI_BORDER, margin: 'md' });

  return {
    type: 'flex',
    altText: ('CampusSync AI｜' + (question ? question + '｜' : '') + answer).slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: AI_PRIMARY,
        paddingAll: '18px', spacing: 'md',
        contents: [{
          type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'sm',
          contents: [
            {
              type: 'box', layout: 'vertical', width: '4px', height: '46px',
              backgroundColor: AI_ACCENT, cornerRadius: '2px', contents: [{ type: 'filler' }],
            },
            {
              type: 'box', layout: 'vertical', flex: 1, spacing: 'xs',
              contents: [
                { type: 'text', text: 'CAMPUSSYNC  /  AI ASSISTANT', size: 'xxs', color: AI_ACCENT, weight: 'bold', wrap: true },
                { type: 'text', text: 'CampusSync AI', size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
                { type: 'text', text: 'SOKA HIGH SCHOOL  •  SCHOOL LIFE SUPPORT', size: 'xxs', color: '#D5E6E3', wrap: true },
              ],
            },
            {
              type: 'box', layout: 'vertical', backgroundColor: '#315D60',
              cornerRadius: '9px', paddingAll: '8px',
              contents: [{ type: 'text', text: '✦ AI', size: 'xs', color: '#FFFFFF', weight: 'bold', align: 'center' }],
            },
          ],
        }],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md', contents },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        backgroundColor: '#EFF5F4', spacing: 'xs',
        contents: [
          { type: 'text', text: 'このメッセージはCampusSync AIが回答しました', size: 'xs', color: AI_TEAL, align: 'center', wrap: true },
          { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true },
          { type: 'text', text: '@ created by Fuku', size: 'xs', color: '#64748B', align: 'center', wrap: true },
        ],
      },
    },
  };
}
