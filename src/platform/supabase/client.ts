/**
 * @module platform/supabase/client
 * Browser Supabase client configured strictly with the public publishable key.
 * Returns null gracefully when Supabase environment variables are absent (100% offline mode).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null | undefined;

/**
 * Returns the configured Supabase browser client or `null` in offline-only mode.
 * @returns {SupabaseClient | null} Public Supabase client instance or null.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !key) {
    cachedClient = null;
    return null;
  }

  cachedClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cachedClient;
}

/**
 * Reports whether Supabase cloud features are configured in this build.
 * @returns {boolean} True if both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL?.trim() &&
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}
