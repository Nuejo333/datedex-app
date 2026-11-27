/**
 * @module api/stripe-checkout
 * Creates a verified Stripe Checkout Session for the €2.99/mo Datédex Pro subscription.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import {
  checkUserProSubscription,
  getSupabaseAdminClient,
  verifySupabaseJwt,
} from './_lib/auth.js';
import { requireMethod, sendJson } from './_lib/http.js';

/**
 * Creates a Stripe Checkout session URL for the authenticated user.
 * @param {VercelRequest} req - Incoming Vercel HTTP request.
 * @param {VercelResponse} res - Outgoing Vercel HTTP response.
 * @returns {Promise<void>}
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireMethod(req, res, 'POST')) return;

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  const priceId = process.env.STRIPE_PRO_PRICE_ID?.trim();
  const appUrl = process.env.APP_URL?.trim() || 'http://localhost:5173';

  if (!stripeKey || !priceId) {
    sendJson(res, 500, { error: 'Stripe Checkout is not configured on this deployment' });
    return;
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'Server configuration error' });
    return;
  }

  const user = await verifySupabaseJwt(req.headers.authorization, admin);
  if (!user) {
    sendJson(res, 401, { error: 'Sign in with Google or Magic Link before upgrading to Pro' });
    return;
  }

  const { row } = await checkUserProSubscription(user.id, admin);
  const stripe = new Stripe(stripeKey);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer: row?.stripe_customer_id ?? undefined,
      customer_email: row?.stripe_customer_id ? undefined : (user.email ?? undefined),
      metadata: {
        user_id: user.id,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
        },
      },
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      sendJson(res, 500, { error: 'Stripe did not return a checkout URL' });
      return;
    }

    sendJson(res, 200, { url: session.url });
  } catch (err) {
    sendJson(res, 502, { error: err instanceof Error ? err.message : 'Stripe Checkout failed' });
  }
}
