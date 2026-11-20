export type PlanetubePageCommand =
  | 'FOCUS_START'
  | 'FOCUS_PAUSE'
  | 'FOCUS_RESUME'
  | 'PHASE_CHANGED'
  | 'SESSION_END'
  | 'PING';

export type PlanetubeExtensionMessage = {
  type: 'READY' | 'DISCONNECTED' | 'ACK' | 'ERROR' | 'RESTRICTION_STATUS';
  extensionVersion?: string;
  command?: string;
  enabled?: boolean;
  errorCode?: string;
};

const PAGE_SOURCE = 'CAMPUSSYNC_PLANETUBE';
const EXTENSION_SOURCE = 'PLANETUBE_EXTENSION';
const PROTOCOL_VERSION = 1;

export function postPlanetubePing() {
  if (typeof window === 'undefined') return;
  window.postMessage({
    source: PAGE_SOURCE,
    protocol: PROTOCOL_VERSION,
    type: 'PING',
    issuedAt: Date.now(),
  }, window.location.origin);
}

export function postPlanetubeCommand(
  command: Exclude<PlanetubePageCommand, 'PING'>,
  payload: Record<string, unknown> = {},
) {
  if (typeof window === 'undefined') return;
  window.postMessage({
    source: PAGE_SOURCE,
    protocol: PROTOCOL_VERSION,
    type: 'COMMAND',
    command,
    issuedAt: Date.now(),
    payload,
  }, window.location.origin);
}

export function subscribePlanetubeExtension(
  callback: (message: PlanetubeExtensionMessage) => void,
) {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.source !== EXTENSION_SOURCE || data.protocol !== PROTOCOL_VERSION) return;
    const allowed = ['READY', 'DISCONNECTED', 'ACK', 'ERROR', 'RESTRICTION_STATUS'];
    if (typeof data.type !== 'string' || !allowed.includes(data.type)) return;
    callback({
      type: data.type as PlanetubeExtensionMessage['type'],
      extensionVersion: typeof data.extensionVersion === 'string' ? data.extensionVersion.slice(0, 32) : undefined,
      command: typeof data.command === 'string' ? data.command.slice(0, 40) : undefined,
      enabled: typeof data.enabled === 'boolean' ? data.enabled : undefined,
      errorCode: typeof data.errorCode === 'string' ? data.errorCode.slice(0, 64) : undefined,
    });
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
