/**
 * @module api/_lib/auth
 * Server-side Supabase service-role client, JWT verification, and Pro subscription guard.
 * Never exposed to client bundles.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { isProSubscriptionActive, SubscriptionStatusSchema } from '../../src/domain/models/monetization.js';

/**
 * Server-side subscription record fetched from `public.subscriptions`.
 */
export interface ServerSubscriptionRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/**
 * Creates a privileged Supabase Admin client using `SUPABASE_SERVICE_ROLE_KEY`.
 * Strictly for server-side `/api/*` verification and Stripe webhook mutations.
 * @returns {SupabaseClient} Server-only Supabase admin client.
 * @throws {Error} When required server environment variables are missing.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    throw new Error('Server configuration missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Extracts the Bearer JWT from the `Authorization` header and verifies it via Supabase Auth.
 * @param {string | string[] | undefined} authHeader - Incoming `Authorization` header.
 * @param {SupabaseClient} [adminClient] - Optional injected admin client for tests.
 * @returns {Promise<User | null>} Verified Supabase user or null if unauthenticated/invalid.
 */
export async function verifySupabaseJwt(
  authHeader: string | string[] | undefined,
  adminClient?: SupabaseClient,
): Promise<User | null> {
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!raw || !raw.startsWith('Bearer ')) {
    return null;
  }

  const token = raw.slice('Bearer '.length).trim();
  if (!token) return null;

  const client = adminClient ?? getSupabaseAdminClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    return null;
  }

  return data.user;
}

/**
 * Checks whether a user holds an active, unexpired Stripe Pro subscription in `public.subscriptions`.
 * @param {string} userId - Verified Supabase user UUID.
 * @param {SupabaseClient} [adminClient] - Optional injected admin client for tests.
 * @returns {Promise<{ isPro: boolean; row: ServerSubscriptionRow | null }>} Pro status and row.
 */
export async function checkUserProSubscription(
  userId: string,
  adminClient?: SupabaseClient,
): Promise<{ isPro: boolean; row: ServerSubscriptionRow | null }> {
  const client = adminClient ?? getSupabaseAdminClient();
  const { data, error } = await client
    .from('subscriptions')
    .select(
      'user_id, stripe_customer_id, stripe_subscription_id, status, price_id, current_period_end, cancel_at_period_end',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return { isPro: false, row: null };
  }

  const row = data as ServerSubscriptionRow;
  const statusParsed = SubscriptionStatusSchema.safeParse(row.status);
  if (!statusParsed.success) {
    return { isPro: false, row };
  }

  const active = isProSubscriptionActive({
    status: statusParsed.data,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
  });

  return { isPro: active, row };
}
