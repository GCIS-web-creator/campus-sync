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

export function createPlanetubeSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

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
    const extensionVersion = typeof data.extensionVersion === 'string' && /^[A-Za-z0-9._+-]{1,32}$/.test(data.extensionVersion)
      ? data.extensionVersion
      : undefined;
    const allowedCommands = ['FOCUS_START', 'FOCUS_PAUSE', 'FOCUS_RESUME', 'PHASE_CHANGED', 'SESSION_END', 'PING'];
    const command = typeof data.command === 'string' && allowedCommands.includes(data.command)
      ? data.command
      : undefined;
    const errorCode = typeof data.errorCode === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(data.errorCode)
      ? data.errorCode
      : undefined;
    callback({
      type: data.type as PlanetubeExtensionMessage['type'],
      extensionVersion,
      command,
      enabled: typeof data.enabled === 'boolean' ? data.enabled : undefined,
      errorCode,
    });
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
