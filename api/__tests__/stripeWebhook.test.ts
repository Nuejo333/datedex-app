/**
 * @module api/__tests__/stripeWebhook.test
 * Security & integration tests for `/api/stripe-webhook` verifying signature checks
 * and idempotent `subscriptions` table upserts on checkout & cancellation events.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { handleStripeWebhook, type StripeWebhookDeps } from '../stripe-webhook.js';

function createMockRes(): {
  res: VercelResponse;
  getStatus: () => number;
} {
  let statusCode = 200;
  const res = {
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn().mockReturnThis(),
  } as unknown as VercelResponse;
  return { res, getStatus: () => statusCode };
}

describe('/api/stripe-webhook', () => {
  it('returns 400 when stripe-signature header is invalid', async () => {
    const mock = createMockRes();
    const deps: StripeWebhookDeps = {
      constructEvent: () => {
        throw new Error('Bad signature');
      },
      upsertSubscription: vi.fn(),
      findUserIdByCustomerId: vi.fn(),
    };

    const req = {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=bad' },
      body: Buffer.from('{}'),
    } as unknown as VercelRequest;

    await handleStripeWebhook(req, mock.res, deps);
    expect(mock.getStatus()).toBe(400);
    expect(deps.upsertSubscription).not.toHaveBeenCalled();
  });

  it('upserts active Pro subscription on verified checkout.session.completed', async () => {
    const mock = createMockRes();
    const upsertSubscription = vi.fn().mockResolvedValue(undefined);
    const deps: StripeWebhookDeps = {
      constructEvent: () =>
        ({
          id: 'evt_1',
          type: 'checkout.session.completed',
          data: {
            object: {
              client_reference_id: 'user-abc',
              customer: 'cus_123',
              subscription: 'sub_123',
              payment_status: 'paid',
              metadata: { user_id: 'user-abc' },
            },
          },
        }) as unknown as Stripe.Event,
      upsertSubscription,
      findUserIdByCustomerId: vi.fn(),
    };

    const req = {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=valid' },
      body: Buffer.from('{}'),
    } as unknown as VercelRequest;

    await handleStripeWebhook(req, mock.res, deps);
    expect(mock.getStatus()).toBe(200);
    expect(upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-abc',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
        status: 'active',
      }),
    );
  });

  it('marks subscription canceled on customer.subscription.deleted', async () => {
    const mock = createMockRes();
    const upsertSubscription = vi.fn().mockResolvedValue(undefined);
    const deps: StripeWebhookDeps = {
      constructEvent: () =>
        ({
          id: 'evt_2',
          type: 'customer.subscription.deleted',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'canceled',
              cancel_at_period_end: true,
              metadata: {},
              items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1800000000 }] },
            },
          },
        }) as unknown as Stripe.Event,
      upsertSubscription,
      findUserIdByCustomerId: async () => 'user-abc',
    };

    const req = {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=valid' },
      body: Buffer.from('{}'),
    } as unknown as VercelRequest;

    await handleStripeWebhook(req, mock.res, deps);
    expect(mock.getStatus()).toBe(200);
    expect(upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-abc',
        status: 'canceled',
        cancel_at_period_end: true,
      }),
    );
  });
});
