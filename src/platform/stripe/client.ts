/**
 * @module platform/stripe/client
 * Client wrappers for `/api/stripe-checkout` and `/api/stripe-portal` endpoints.
 */

/**
 * Requests a Stripe Checkout session URL for the €2.99/mo Datédex Pro tier.
 * @param {string} accessToken - Supabase JWT access token for the signed-in user.
 * @returns {Promise<string>} Stripe-hosted Checkout redirect URL.
 * @throws {Error} When unauthenticated or Checkout session creation fails.
 */
export async function createProCheckoutSession(accessToken: string): Promise<string> {
  const response = await fetch('/api/stripe-checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });

  const payload = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error ?? 'Failed to start Stripe Checkout');
  }
  return payload.url;
}

/**
 * Requests a Stripe Customer Billing Portal URL for managing an active Pro subscription.
 * @param {string} accessToken - Supabase JWT access token.
 * @returns {Promise<string>} Stripe Customer Portal URL.
 * @throws {Error} When unauthenticated or portal session creation fails.
 */
export async function createBillingPortalSession(accessToken: string): Promise<string> {
  const response = await fetch('/api/stripe-portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });

  const payload = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error ?? 'Failed to open Billing Portal');
  }
  return payload.url;
}
