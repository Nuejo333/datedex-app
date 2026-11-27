/**
 * @module api/stripe-webhook
 * Verifies Stripe webhook signatures and idempotently syncs subscription status
 * into `public.subscriptions` using `SUPABASE_SERVICE_ROLE_KEY`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { getSupabaseAdminClient } from './_lib/auth.js';
import { readRawBody, requireMethod, sendJson } from './_lib/http.js';

/**
 * Persisted subscription state row passed to Supabase upsert.
 */
export interface SubscriptionUpsertRecord {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/**
 * Injectable dependencies for testing Stripe webhook verification and database sync.
 */
export interface StripeWebhookDeps {
  constructEvent: (rawBody: Buffer, signature: string) => Stripe.Event;
  upsertSubscription: (record: SubscriptionUpsertRecord) => Promise<void>;
  findUserIdByCustomerId: (customerId: string) => Promise<string | null>;
}

/**
 * Vercel Serverless config disabling automatic body parsing so raw Stripe signature bytes stay intact.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

function toIsoFromUnix(seconds: number | null | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function getSubscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const firstItemEnd = sub.items?.data?.[0]?.current_period_end;
  const legacyEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
  return toIsoFromUnix(firstItemEnd ?? legacyEnd ?? null);
}

function createDefaultDeps(): StripeWebhookDeps {
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripeKey || !webhookSecret) {
    throw new Error('Server missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
  }

  const stripe = new Stripe(stripeKey);
  const admin = getSupabaseAdminClient();

  return {
    constructEvent: (rawBody, signature) =>
      stripe.webhooks.constructEvent(rawBody, signature, webhookSecret),
    upsertSubscription: async (record) => {
      const { error } = await admin
        .from('subscriptions')
        .upsert(record, { onConflict: 'user_id' });
      if (error) {
        throw new Error(`Failed to upsert subscription: ${error.message}`);
      }
    },
    findUserIdByCustomerId: async (customerId) => {
      const { data } = await admin
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();
      return (data as { user_id?: string } | null)?.user_id ?? null;
    },
  };
}

/**
 * Processes a Stripe webhook request with signature verification and idempotent DB sync.
 * @param {VercelRequest} req - Incoming Stripe webhook request.
 * @param {VercelResponse} res - Outgoing HTTP response.
 * @param {StripeWebhookDeps} [deps] - Optional dependency overrides for unit tests.
 * @returns {Promise<void>}
 */
export async function handleStripeWebhook(
  req: VercelRequest,
  res: VercelResponse,
  deps?: StripeWebhookDeps,
): Promise<void> {
  if (!requireMethod(req, res, 'POST')) return;

  const sigHeader = req.headers['stripe-signature'];
  const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  if (!signature) {
    sendJson(res, 400, { error: 'Missing stripe-signature header' });
    return;
  }

  let resolvedDeps: StripeWebhookDeps;
  try {
    resolvedDeps = deps ?? createDefaultDeps();
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'Server configuration error' });
    return;
  }

  const rawBody = await readRawBody(req);
  let event: Stripe.Event;
  try {
    event = resolvedDeps.constructEvent(rawBody, signature);
  } catch {
    sendJson(res, 400, { error: 'Invalid Stripe webhook signature' });
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
      const customerId = typeof session.customer === 'string' ? session.customer : null;
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : null;

      if (userId) {
        await resolvedDeps.upsertSubscription({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: session.payment_status === 'paid' ? 'active' : 'trialing',
          price_id: process.env.STRIPE_PRO_PRICE_ID?.trim() ?? null,
          current_period_end: null,
          cancel_at_period_end: false,
        });
      }
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : '';
      const userId =
        sub.metadata?.user_id ||
        (customerId ? await resolvedDeps.findUserIdByCustomerId(customerId) : null);

      if (userId) {
        await resolvedDeps.upsertSubscription({
          user_id: userId,
          stripe_customer_id: customerId || null,
          stripe_subscription_id: sub.id,
          status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
          price_id: sub.items?.data?.[0]?.price?.id ?? null,
          current_period_end: getSubscriptionPeriodEnd(sub),
          cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        });
      }
    }

    sendJson(res, 200, { received: true });
  } catch (err) {
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Webhook processing failed',
    });
  }
}

/**
 * Vercel Serverless Function entrypoint for `POST /api/stripe-webhook`.
 * @param {VercelRequest} req - Incoming webhook request.
 * @param {VercelResponse} res - Outgoing webhook response.
 * @returns {Promise<void>}
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await handleStripeWebhook(req, res);
}
