export type EarthquakeNotificationPayload = {
  kind: 'eew_kodaira' | 'kodaira_intensity2' | 'eew_cancelled';
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

export function buildLineEarthquakeFlex(payload: EarthquakeNotificationPayload) {
  const isEew = payload.kind === 'eew_kodaira';
  const isCancelled = payload.kind === 'eew_cancelled';
  const accent = isCancelled ? '#475569' : isEew ? '#DC2626' : '#7C3AED';
  const soft = isCancelled ? '#F1F5F9' : isEew ? '#FEF2F2' : '#F5F3FF';
  const header = isCancelled ? '緊急地震速報の取消情報' : isEew ? '緊急地震速報（警報）' : '小平市で震度2以上を観測';
  const eventTime = new Date(payload.eventTime).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const rows: Array<Record<string, unknown>> = [
    { type: 'text', text: '震源：' + payload.hypocenterName, size: 'sm', weight: 'bold', wrap: true, color: '#0F172A' },
    { type: 'text', text: '発生時刻：' + eventTime, size: 'sm', wrap: true, color: '#334155' },
    { type: 'text', text: 'マグニチュード：' + (payload.magnitude === null ? '確認中' : 'M' + payload.magnitude.toFixed(1)), size: 'sm', wrap: true, color: '#334155' },
    { type: 'text', text: '深さ：' + (payload.depthKm === null ? '確認中' : Math.round(payload.depthKm) + 'km'), size: 'sm', wrap: true, color: '#334155' },
    ...(isEew ? [
      { type: 'text', text: '対象区域：' + (payload.eewTargets.join('、') || '東京都多摩東部'), size: 'sm', weight: 'bold', wrap: true, color: accent },
      { type: 'text', text: '予想震度：' + (payload.eewForecastIntensity || '発表内容を確認してください'), size: 'sm', wrap: true, color: '#334155' },
    ] : isCancelled ? [
      { type: 'text', text: '小平市を対象に発表された緊急地震速報の取消情報です。', size: 'sm', weight: 'bold', wrap: true, color: accent },
      { type: 'text', text: '対象区域：' + (payload.eewTargets.join('、') || '東京都多摩東部'), size: 'sm', wrap: true, color: '#334155' },
    ] : [
      { type: 'text', text: '小平市の観測震度：震度' + (payload.kodairaIntensity || '2以上'), size: 'sm', weight: 'bold', wrap: true, color: accent },
      { type: 'text', text: '最大震度：' + (payload.maxIntensity || '確認中'), size: 'sm', wrap: true, color: '#334155' },
    ]),
  ];
  const bubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      backgroundColor: accent,
      contents: [
        { type: 'text', text: 'CAMPUSSYNC / EARTHQUAKE', color: '#FFFFFF', size: 'xs', weight: 'bold' },
        { type: 'text', text: header, color: '#FFFFFF', size: 'lg', weight: 'bold', wrap: true, margin: 'md' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        { type: 'box', layout: 'vertical', backgroundColor: soft, cornerRadius: '12px', paddingAll: '12px', spacing: 'sm', contents: rows },
        { type: 'text', text: '気象庁の地震情報を基に自動配信しています。詳細・更新情報は公式発表を確認してください。', size: 'xs', color: '#64748B', wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [{
        type: 'button',
        style: 'primary',
        color: accent,
        action: { type: 'uri', label: '気象庁の情報を確認', uri: 'https://www.jma.go.jp/bosai/map.html#contents=earthquake_map' },
      }],
    },
  };
  return { type: 'flex', altText: 'CampusSync 地震情報：' + header, contents: bubble };
}
