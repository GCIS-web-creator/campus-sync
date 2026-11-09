export type EarthquakeNotificationPayload = {
  kind: 'eew_kodaira' | 'kodaira_intensity2' | 'eew_cancelled' | 'major_earthquake' | 'eew_national_push' | 'observed_intensity2_push';
  severeAreas?: Array<{ name: string; prefecture: string | null; intensity: string | null }>;
  localImpactAreas?: Array<{ name: string; prefecture: string | null; intensity: string | null }>;
  observedAreas?: Array<{ name: string; prefecture: string | null; intensity: string | null }>;
  eventTime: string;
  issuedAt: string;
  hypocenterName: string;
  magnitude: number | null;
  depthKm: number | null;
  latitude: number | null;
  longitude: number | null;
  maxIntensity: string | null;
  kodairaIntensity: string | null;
  eewTargets: string[];
  eewForecastIntensity: string | null;
  sourceUrl: string;
};

type EarthquakeTheme = {
  headerBackground: string;
  softBackground: string;
  text: string;
  button: string;
  headerText: string;
  kickerText: string;
};

const INTENSITY_THEMES: Record<string, EarthquakeTheme> = {
  '1': {
    headerBackground: '#E2E8F0',
    softBackground: '#F1F5F9',
    text: '#334155',
    button: '#64748B',
    headerText: '#0F172A',
    kickerText: '#475569',
  },
  '2': {
    headerBackground: '#BAE6FD',
    softBackground: '#E0F2FE',
    text: '#075985',
    button: '#0284C7',
    headerText: '#0C4A6E',
    kickerText: '#075985',
  },
  '3': {
    headerBackground: '#2563EB',
    softBackground: '#DBEAFE',
    text: '#1D4ED8',
    button: '#2563EB',
    headerText: '#FFFFFF',
    kickerText: '#DBEAFE',
  },
  '4': {
    headerBackground: '#FDE047',
    softBackground: '#FEF9C3',
    text: '#854D0E',
    button: '#CA8A04',
    headerText: '#713F12',
    kickerText: '#854D0E',
  },
  '5弱': {
    headerBackground: '#F97316',
    softBackground: '#FFEDD5',
    text: '#C2410C',
    button: '#EA580C',
    headerText: '#FFFFFF',
    kickerText: '#FFEDD5',
  },
  '5強': {
    headerBackground: '#DC2626',
    softBackground: '#FEE2E2',
    text: '#B91C1C',
    button: '#DC2626',
    headerText: '#FFFFFF',
    kickerText: '#FEE2E2',
  },
  '6弱': {
    headerBackground: '#FBCFE8',
    softBackground: '#FCE7F3',
    text: '#9D174D',
    button: '#BE185D',
    headerText: '#831843',
    kickerText: '#9D174D',
  },
  '6強': {
    headerBackground: '#BE185D',
    softBackground: '#FCE7F3',
    text: '#9D174D',
    button: '#BE185D',
    headerText: '#FFFFFF',
    kickerText: '#FBCFE8',
  },
  '7': {
    headerBackground: '#111827',
    softBackground: '#FEF08A',
    text: '#713F12',
    button: '#111827',
    headerText: '#FACC15',
    kickerText: '#FACC15',
  },
};

function normalizeIntensity(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s/g, '')
    .replace(/^震度/, '');
}

function getSafetyMessage(maxIntensity: string): string {
  if (maxIntensity === '6弱' || maxIntensity === '6強' || maxIntensity === '7') {
    return '強い揺れの後は、落下物や倒れた物などに注意し、周囲の安全を確認してください。';
  }
  if (maxIntensity === '5弱' || maxIntensity === '5強') {
    return '揺れが収まるまで身を守り、収まった後も周囲の安全を確認してください。';
  }
  return '揺れを感じた場合は無理に移動せず、周囲の安全に注意してください。';
}

export function buildLineEarthquakeFlex(payload: EarthquakeNotificationPayload) {
  const isEew = payload.kind === 'eew_kodaira';
  const isCancelled = payload.kind === 'eew_cancelled';
  const isMajor = payload.kind === 'major_earthquake';
  const normalizedMaxIntensity = normalizeIntensity(payload.maxIntensity);
  const observationTheme = payload.kind === 'kodaira_intensity2' || isMajor
    ? INTENSITY_THEMES[normalizedMaxIntensity]
    : undefined;

  const theme: EarthquakeTheme = observationTheme || {
    headerBackground: isCancelled ? '#475569' : '#B91C1C',
    softBackground: isCancelled ? '#F1F5F9' : '#FEE2E2',
    text: isCancelled ? '#475569' : '#991B1B',
    button: isCancelled ? '#475569' : '#B91C1C',
    headerText: '#FFFFFF',
    kickerText: '#FEE2E2',
  };

  const header = isCancelled
    ? '緊急地震速報の取消情報'
    : isEew
      ? '緊急地震速報（警報）'
      : isMajor
        ? '全国で大地震を観測'
        : '小平市または多摩地区で震度2以上を観測';

  const kicker = isCancelled
    ? 'CAMPUSSYNC / EEW CANCELLED'
    : isEew
      ? 'CAMPUSSYNC / EEW WARNING'
      : isMajor
        ? 'CAMPUSSYNC / MAJOR EARTHQUAKE'
        : 'CAMPUSSYNC / KODAIRA + TAMA EARTHQUAKE ALERT';

  const eventTime = new Date(payload.eventTime).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const heroValue = isCancelled
    ? '取消'
    : isEew
      ? (payload.eewForecastIntensity || '発表中')
      : (normalizedMaxIntensity || '確認中');

  const heroLabel = isCancelled
    ? '速報の発表状況'
    : isEew
      ? '小平市周辺で予想される震度'
      : isMajor
        ? '国内で観測された最大震度'
        : '小平市・多摩地区で観測された震度';

  const heroCaption = isCancelled
    ? '緊急地震速報は取り消されました'
    : isEew
      ? '強い揺れに備えてください'
      : isMajor
        ? '観測結果・気象庁発表'
        : '気象庁発表';

  const topNotice = isCancelled
    ? '取消情報'
    : isEew
      ? 'ただちに身を守る行動を'
      : isMajor
        ? normalizedMaxIntensity === '7' ? '最大級の揺れを観測' : '震度6弱以上の強い揺れを観測'
        : normalizedMaxIntensity === '7'
          ? '最大級の揺れを観測'
          : normalizedMaxIntensity === '6弱' || normalizedMaxIntensity === '6強'
            ? '非常に強い揺れを観測'
            : normalizedMaxIntensity === '5弱' || normalizedMaxIntensity === '5強'
              ? '強い揺れを観測'
              : '地震情報';

  const heroContents: Array<Record<string, unknown>> = [
    { type: 'text', text: heroLabel, size: 'sm', weight: 'bold', color: theme.headerText, wrap: true },
    {
      type: 'text',
      text: heroValue,
      size: isCancelled ? '3xl' : '5xl',
      weight: 'bold',
      color: theme.headerText,
      margin: 'sm',
      wrap: true,
    },
    { type: 'text', text: heroCaption, size: 'xs', color: theme.headerText, wrap: true },
  ];

  const localImpactContents: Array<Record<string, unknown>> = isEew
    ? [
        { type: 'text', text: '緊急地震速報の対象区域', size: 'xs', weight: 'bold', color: '#991B1B' },
        { type: 'text', text: payload.eewTargets.join('・') || '東京都多摩東部など', size: 'md', weight: 'bold', color: '#7F1D1D', wrap: true, margin: 'sm' },
      ]
    : isCancelled
      ? [
          { type: 'text', text: '発表状況', size: 'xs', weight: 'bold', color: '#475569' },
          { type: 'text', text: '小平市を対象に発表された緊急地震速報の取消情報です。', size: 'sm', weight: 'bold', color: '#334155', wrap: true, margin: 'sm' },
        ]
      : isMajor
        ? [
            { type: 'text', text: '震度6弱以上を観測した地域', size: 'xs', weight: 'bold', color: theme.text },
            {
              type: 'text',
              text: payload.severeAreas?.length
                ? payload.severeAreas.slice(0, 8).map(area => (area.prefecture || '') + area.name + (area.intensity ? '（震度' + area.intensity + '）' : '')).join('、')
                  + (payload.severeAreas.length > 8 ? ' ほか' + (payload.severeAreas.length - 8) + '市区町村' : '')
                : '観測地域の詳細は気象庁の続報を確認してください。',
              size: 'sm',
              weight: 'bold',
              color: theme.text,
              wrap: true,
              margin: 'sm',
            },
            { type: 'text', text: '小平市の揺れの有無にかかわらず、国内の大地震としてお知らせしています。', size: 'xs', color: '#475569', wrap: true, margin: 'sm' },
          ]
        : [
              { type: 'text', text: '小平市・多摩地区の観測震度', size: 'xs', weight: 'bold', color: theme.text },
              {
                type: 'text',
                text: payload.localImpactAreas?.length
                  ? payload.localImpactAreas.slice(0, 10).map(area => (area.prefecture || '') + area.name + (area.intensity ? '（震度' + area.intensity + '）' : '')).join('、')
                    + (payload.localImpactAreas.length > 10 ? ' ほか' + (payload.localImpactAreas.length - 10) + '市町村' : '')
                  : payload.kodairaIntensity ? '小平市（震度' + payload.kodairaIntensity + '）' : '多摩地区の観測情報',
                size: 'sm', weight: 'bold', color: theme.text, margin: 'sm', wrap: true,
              },
              { type: 'text', text: '※上の大きな表示は地震全体の最大震度です', size: 'xs', color: '#475569', wrap: true, margin: 'sm' },
            ];

  const detailContents: Array<Record<string, unknown>> = [
    { type: 'text', text: '地震の詳細', size: 'md', weight: 'bold', color: '#0F172A' },
    { type: 'text', text: '震源：' + (payload.hypocenterName || '確認中'), size: 'sm', weight: 'bold', color: '#0F172A', wrap: true, margin: 'md' },
    { type: 'text', text: '発生時刻：' + eventTime, size: 'sm', color: '#334155', wrap: true, margin: 'sm' },
    { type: 'text', text: 'マグニチュード：' + (payload.magnitude === null ? '確認中' : 'M' + payload.magnitude.toFixed(1)), size: 'sm', color: '#334155', wrap: true, margin: 'sm' },
    { type: 'text', text: '深さ：' + (payload.depthKm === null ? '確認中' : Math.round(payload.depthKm) + 'km'), size: 'sm', color: '#334155', wrap: true, margin: 'sm' },
  ];

  const safetyTitle = isEew
    ? '⚠ 今すぐ身を守ってください'
    : isCancelled
      ? '速報の取消について'
      : isMajor
        ? '⚠ 強い揺れが観測された地域の方へ'
        : '⚠ 揺れの後も安全を確認';

  const safetyMessage = isEew
    ? '頭を守り、丈夫な机の下など安全な場所で身を守ってください。周囲の人にも注意を呼びかけてください。'
    : isCancelled
      ? '速報は取り消されました。地震情報や周囲の状況もあわせて確認してください。'
      : getSafetyMessage(normalizedMaxIntensity);

  const bubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      backgroundColor: theme.headerBackground,
      spacing: 'sm',
      contents: [
        { type: 'text', text: kicker, color: theme.kickerText, size: 'xs', weight: 'bold', wrap: true },
        { type: 'text', text: header, color: theme.headerText, size: 'lg', weight: 'bold', wrap: true, margin: 'sm' },
        { type: 'text', text: topNotice, color: theme.headerText, size: 'sm', weight: 'bold', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      spacing: 'lg',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          backgroundColor: theme.headerBackground,
          cornerRadius: '12px',
          spacing: 'xs',
          contents: heroContents,
        },
        {
          type: 'box',
          layout: 'vertical',
          paddingAll: '14px',
          backgroundColor: isEew ? '#FEF2F2' : isCancelled ? '#F1F5F9' : theme.softBackground,
          cornerRadius: '10px',
          spacing: 'xs',
          contents: localImpactContents,
        },
        {
          type: 'box',
          layout: 'vertical',
          paddingAll: '14px',
          backgroundColor: '#F8FAFC',
          cornerRadius: '10px',
          spacing: 'none',
          contents: detailContents,
        },
        {
          type: 'box',
          layout: 'vertical',
          paddingAll: '14px',
          backgroundColor: isCancelled ? '#F1F5F9' : '#FFF7ED',
          cornerRadius: '10px',
          spacing: 'sm',
          contents: [
            { type: 'text', text: safetyTitle, size: 'sm', weight: 'bold', color: isCancelled ? '#334155' : '#9A3412', wrap: true },
            { type: 'text', text: safetyMessage, size: 'sm', color: '#334155', wrap: true },
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '14px',
      spacing: 'md',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: theme.button,
          action: {
            type: 'uri',
            label: '気象庁の地震情報を確認',
            uri: 'https://www.jma.go.jp/bosai/map.html#contents=earthquake_map',
          },
        },
        { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', weight: 'bold', wrap: true },
        { type: 'text', text: '@ created by Fuku', size: 'xs', color: '#94A3B8', align: 'center' },
      ],
    },
  };

  return {
    type: 'flex',
    altText: 'CampusSync 地震情報：' + header + '／' + heroLabel + ' ' + heroValue,
    contents: bubble,
  };
}
