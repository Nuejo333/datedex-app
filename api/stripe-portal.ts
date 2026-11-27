/**
 * @module api/stripe-portal
 * Creates a Stripe Customer Billing Portal session for an authenticated Pro subscriber.
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
 * Creates a Stripe Billing Portal session URL for managing or canceling Datédex Pro.
 * @param {VercelRequest} req - Incoming HTTP request.
 * @param {VercelResponse} res - Outgoing HTTP response.
 * @returns {Promise<void>}
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireMethod(req, res, 'POST')) return;

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  const appUrl = process.env.APP_URL?.trim() || 'http://localhost:5173';

  if (!stripeKey) {
    sendJson(res, 500, { error: 'Stripe Portal is not configured on this deployment' });
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
    sendJson(res, 401, { error: 'Authentication required' });
    return;
  }

  const { row } = await checkUserProSubscription(user.id, admin);
  if (!row?.stripe_customer_id) {
    sendJson(res, 404, { error: 'No active Stripe billing profile found for this account' });
    return;
  }

  const stripe = new Stripe(stripeKey);
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: appUrl,
    });
    sendJson(res, 200, { url: portal.url });
  } catch (err) {
    sendJson(res, 502, { error: err instanceof Error ? err.message : 'Stripe Portal failed' });
  }
}
