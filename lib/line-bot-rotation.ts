import { createClient } from '@supabase/supabase-js';

export type LineBotSlot = 1 | 2 | 3 | 4 | 5;

export type LineBotCredential = {
  slot: LineBotSlot | 0;
  channelSecret: string;
  accessToken: string;
};

/** Returns the balanced BOT slot assigned to a JST calendar date. */
export function getLineBotSlotForDate(dateValue: Date | string): LineBotSlot | null {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  if (!year || month < 1 || month > 12 || day < 1) return null;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(5, Math.ceil(day * 5 / daysInMonth)) as LineBotSlot;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getLineBotCredentialsForSlot(slot: LineBotSlot): LineBotCredential | null {
  const channelSecret = process.env[`LINE_CHANNEL_SECRET_${slot}`] || '';
  const accessToken = process.env[`LINE_CHANNEL_ACCESS_TOKEN_${slot}`] || '';
  if (!channelSecret || !accessToken) return null;
  return { slot, channelSecret, accessToken };
}

/**
 * Resolves the active official account using the server-only Supabase setting.
 * Before the rotation SQL is installed, it safely falls back to the legacy
 * single-account environment variables so the existing deployment keeps working.
 */
export async function getActiveLineBot(): Promise<LineBotCredential | null> {
  const admin = getAdminClient();
  if (admin) {
    const { data, error } = await admin
      .from('line_bot_rotation')
      .select('active_bot_slot')
      .eq('id', 1)
      .maybeSingle();

    if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
      console.error('LINE BOTの有効スロットを取得できません:', error.message);
      return null;
    }
    if (!error && data) {
      const slot = Number(data.active_bot_slot);
      if (slot >= 1 && slot <= 5) {
        const configured = getLineBotCredentialsForSlot(slot as LineBotSlot);
        if (configured) return configured;
        // Keep BOT 1 compatible with the currently deployed single-account setup.
        if (slot === 1 && process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
          return {
            slot: 0,
            channelSecret: process.env.LINE_CHANNEL_SECRET,
            accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
          };
        }
        return null;
      }
    }
  }

  const legacySecret = process.env.LINE_CHANNEL_SECRET || '';
  const legacyToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  return legacySecret && legacyToken
    ? { slot: 0, channelSecret: legacySecret, accessToken: legacyToken }
    : null;
}

/** All configured channels are accepted by the shared webhook URL. */
export function getLineWebhookCredentials(): LineBotCredential[] {
  const credentials: LineBotCredential[] = [];
  for (const slot of [1, 2, 3, 4, 5] as const) {
    const credential = getLineBotCredentialsForSlot(slot);
    if (credential) credentials.push(credential);
  }

  const legacySecret = process.env.LINE_CHANNEL_SECRET || '';
  const legacyToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  if (legacySecret && legacyToken && !credentials.some(item => item.channelSecret === legacySecret)) {
    credentials.push({ slot: 0, channelSecret: legacySecret, accessToken: legacyToken });
  }
  return credentials;
}

/** Returns configuration presence only. Never returns any secret/token value. */
export function getLineBotEnvironmentStatus() {
  return ([1, 2, 3, 4, 5] as const).map(slot => ({
    slot,
    channelSecretConfigured: Boolean(process.env[`LINE_CHANNEL_SECRET_${slot}`] || (slot === 1 && process.env.LINE_CHANNEL_SECRET)),
    accessTokenConfigured: Boolean(process.env[`LINE_CHANNEL_ACCESS_TOKEN_${slot}`] || (slot === 1 && process.env.LINE_CHANNEL_ACCESS_TOKEN)),
  }));
}
