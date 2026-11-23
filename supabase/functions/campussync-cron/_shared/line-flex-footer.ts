/**
 * Add the standard CampusSync signature to every Flex bubble immediately before
 * it is sent to LINE. This keeps carousels, nested bubbles, broadcasts, replies,
 * and group pushes consistent without duplicating signature lines already present.
 */
type FlexJsonObject = Record<string, unknown>;

const CAMPUSSYNC_FOOTER_LINES = [
  'CAMPUSSYNC・SOKA HIGH SCHOOL',
  '@ created by Fuku',
] as const;

function isFlexJsonObject(value: unknown): value is FlexJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applyToFlexNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(applyToFlexNode);
  if (!isFlexJsonObject(value)) return value;

  const node: FlexJsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    node[key] = applyToFlexNode(child);
  }

  if (node.type !== 'bubble') return node;

  const currentFooter = isFlexJsonObject(node.footer) ? node.footer : {};
  const currentContents = Array.isArray(currentFooter.contents) ? currentFooter.contents : [];
  const preservedContents = currentContents.filter(item => {
    if (!isFlexJsonObject(item) || item.type !== 'text') return true;
    return !CAMPUSSYNC_FOOTER_LINES.includes(String(item.text || '') as typeof CAMPUSSYNC_FOOTER_LINES[number]);
  });

  node.footer = {
    type: 'box',
    layout: 'vertical',
    paddingAll: '12px',
    backgroundColor: '#F8FAFC',
    spacing: 'xs',
    ...currentFooter,
    contents: [
      ...preservedContents,
      { type: 'text', text: CAMPUSSYNC_FOOTER_LINES[0], size: 'xs', color: '#64748B', align: 'center', wrap: true },
      { type: 'text', text: CAMPUSSYNC_FOOTER_LINES[1], size: 'xs', color: '#64748B', align: 'center', wrap: true },
    ],
  };
  return node;
}

/** Returns messages with both signature lines on every Flex bubble. Safe to call repeatedly. */
export function applyCampusSyncFlexFooters(messages: unknown[]): unknown[] {
  return messages.map(applyToFlexNode);
}
