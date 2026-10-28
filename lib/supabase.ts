import { createClient } from '@supabase/supabase-js';

/**
 * Avoid failing Next.js build-time module evaluation when Vercel preview
 * deployments do not have the public Supabase variables configured.
 * Supabase features will still require real environment variables at runtime.
 */
const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

const supabaseUrl = configuredUrl || 'https://missing-supabase-config.supabase.co';
const supabasePublishableKey = configuredPublishableKey || 'missing-supabase-publishable-key';

if (typeof window !== 'undefined' && (!configuredUrl || !configuredPublishableKey)) {
  console.error(
    'CampusSync: Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel.',
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
