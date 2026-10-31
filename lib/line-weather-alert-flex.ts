export type JmaWeatherAlertNotificationPayload = {
  areaName: string;
  issuedAt: string;
  severity: number;
  alerts: Array<{
    name: string;
    status: string;
    details: string;
  }>;
};

export function buildJmaWeatherAlertFlex(payload: JmaWeatherAlertNotificationPayload) {
  const severityLabel = payload.severity >= 5
    ? '特別警報'
    : payload.severity >= 4
      ? '危険警報'
      : '警報';
  const accent = payload.severity >= 5
    ? '#111827'
    : payload.severity >= 4
      ? '#7C3AED'
      : '#DC2626';
  const softBackground = payload.severity >= 5
    ? '#F3F4F6'
    : payload.severity >= 4
      ? '#F5F3FF'
      : '#FEF2F2';
  const headerTitle = '小平市に' + severityLabel;
  const issued = new Date(payload.issuedAt).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const alertContents: Record<string, unknown>[] = payload.alerts.slice(0, 8).map(alert => ({
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    paddingAll: '11px',
    cornerRadius: '10px',
    backgroundColor: softBackground,
    contents: [
      { type: 'text', text: alert.name, size: 'md', weight: 'bold', color: accent, wrap: true },
      { type: 'text', text: alert.status, size: 'xs', weight: 'bold', color: accent, wrap: true },
      ...(alert.details ? [{ type: 'text', text: alert.details.slice(0, 180), size: 'xs', color: '#475569', wrap: true }] : []),
    ],
  }));

  const bubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '18px',
      spacing: 'sm',
      backgroundColor: accent,
      contents: [
        { type: 'text', text: 'CAMPUSSYNC  /  防災速報', size: 'xs', color: '#FDE68A', weight: 'bold' },
        { type: 'text', text: headerTitle, size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
        { type: 'text', text: '気象庁発表 ・ ' + payload.areaName, size: 'sm', color: '#FEF2F2', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      spacing: 'md',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              paddingAll: '7px',
              cornerRadius: '6px',
              backgroundColor: accent,
              contents: [
                { type: 'text', text: severityLabel, size: 'xs', weight: 'bold', color: '#FFFFFF' },
              ],
            },
            { type: 'text', text: issued + ' 発表', size: 'xs', color: '#64748B', align: 'end', flex: 1 },
          ],
        },
        ...alertContents,
        {
          type: 'box',
          layout: 'vertical',
          paddingAll: '12px',
          backgroundColor: softBackground,
          cornerRadius: '10px',
          contents: [
            { type: 'text', text: '最新の気象情報・自治体からの情報を確認し、安全確保を優先してください。', size: 'sm', color: accent, weight: 'bold', wrap: true },
            { type: 'text', text: '※注意報はLINE通知の対象外です。', size: 'xxs', color: accent, wrap: true, margin: 'sm' },
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      backgroundColor: '#F8FAFC',
      contents: [
        { type: 'button', style: 'primary', color: accent, height: 'sm', action: { type: 'uri', label: '気象庁の警報情報を確認', uri: 'https://www.jma.go.jp/bosai/warning/' } },
        { type: 'text', text: 'CAMPUSSYNC・気象庁防災情報', size: 'xxs', color: '#94A3B8', align: 'center', margin: 'sm' },
      ],
    },
  };

  const names = payload.alerts.slice(0, 3).map(alert => alert.name).join('・');
  return {
    type: 'flex',
    altText: ('【CampusSync 防災速報】小平市に' + severityLabel + '：' + names).slice(0, 400),
    contents: bubble,
  };
}
