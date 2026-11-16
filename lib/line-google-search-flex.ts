export type LineGoogleSearchResult = {
  title: string;
  snippet: string;
  url: string;
};

export function buildLineGoogleSearchFlexMessage(input: {
  query: string;
  summary: string;
  results: LineGoogleSearchResult[];
  searchUrl: string;
}) {
  const resultContents: Record<string, unknown>[] = input.results.slice(0, 4).map((item, index) => ({
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    paddingAll: '12px',
    backgroundColor: index % 2 === 0 ? '#F8FAFC' : '#F1F6F5',
    cornerRadius: '10px',
    contents: [
      { type: 'text', text: 'SEARCH RESULT  ' + String(index + 1).padStart(2, '0'), size: 'xxs', color: '#376C69', weight: 'bold' },
      { type: 'text', text: item.title.slice(0, 100), size: 'sm', color: '#173B40', weight: 'bold', wrap: true },
      ...(item.snippet ? [{ type: 'text', text: item.snippet.slice(0, 260), size: 'xs', color: '#475569', wrap: true }] : []),
      {
        type: 'button',
        style: 'link',
        height: 'sm',
        action: { type: 'uri', label: 'ページを開く', uri: item.url },
      },
    ],
  }));

  const summaryText = input.summary.trim().slice(0, 1400)
    || '検索結果を要約できませんでした。Google検索ページから各ページを確認してください。';
  const bodyContents: Record<string, unknown>[] = [
    {
      type: 'box',
      layout: 'vertical',
      paddingAll: '14px',
      cornerRadius: '12px',
      backgroundColor: '#EAF2F1',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'OVERVIEW  /  検索結果のまとめ', size: 'xs', color: '#376C69', weight: 'bold' },
        { type: 'text', text: summaryText, size: 'sm', color: '#263238', wrap: true },
      ],
    },
  ];

  if (resultContents.length) {
    bodyContents.push(
      { type: 'text', text: '見つかったページ', size: 'sm', color: '#173B40', weight: 'bold', margin: 'md' },
      ...resultContents,
    );
  } else {
    bodyContents.push({
      type: 'text',
      text: 'Googleから検索結果を取得できませんでした。下のボタンからGoogle検索を開いてください。',
      size: 'sm',
      color: '#475569',
      wrap: true,
    });
  }

  bodyContents.push({
    type: 'button',
    style: 'primary',
    color: '#376C69',
    action: { type: 'uri', label: 'Googleで検索結果を開く', uri: input.searchUrl },
  });

  return {
    type: 'flex' as const,
    altText: ('CampusSync AI｜Google検索｜' + input.query + '｜' + summaryText).slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#173B40',
        paddingAll: '18px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC  /  GOOGLE SEARCH', size: 'xs', color: '#A7D3CD', weight: 'bold' },
          { type: 'text', text: input.query.slice(0, 100), size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
          { type: 'text', text: '検索結果を読みやすく整理しました', size: 'xs', color: '#D5E6E3', wrap: true },
        ],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md', contents: bodyContents },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        backgroundColor: '#EFF5F4',
        spacing: 'xs',
        contents: [
          { type: 'text', text: '検索結果はGoogleおよび各掲載サイトを確認してください。', size: 'xxs', color: '#64748B', align: 'center', wrap: true },
          { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true },
        ],
      },
    },
  };
}
