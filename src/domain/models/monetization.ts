/**
 * @module domain/models/monetization
 * Zod schemas for Stripe subscription state, read-only affiliate offers,
 * anonymous monetization telemetry, and Pro-gated AI Rizz Coach payloads.
 */
import { z } from 'zod';

/**
 * Stripe subscription status values stored in `public.subscriptions`.
 */
export const SubscriptionStatusSchema = z.enum([
  'inactive',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
]);

/**
 * Stripe subscription status union.
 */
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

/**
 * Client-visible subscription summary returned from `public.subscriptions`.
 */
export const SubscriptionSummarySchema = z.object({
  status: SubscriptionStatusSchema,
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean().default(false),
});

/**
 * Subscription summary interface.
 */
export type SubscriptionSummary = z.infer<typeof SubscriptionSummarySchema>;

/**
 * Determines whether a subscription status grants Pro access.
 * @param {SubscriptionSummary | null | undefined} sub - Subscription summary row.
 * @param {number} [nowMs] - Optional current timestamp in ms for deterministic checks.
 * @returns {boolean} True when subscription is active or trialing and not expired.
 */
export function isProSubscriptionActive(
  sub: SubscriptionSummary | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!sub) return false;
  if (sub.status !== 'active' && sub.status !== 'trialing') return false;
  if (!sub.currentPeriodEnd) return true;
  const endMs = Date.parse(sub.currentPeriodEnd);
  return Number.isFinite(endMs) && endMs > nowMs;
}

/**
 * Valid affiliate offer placement slots in the consumer app.
 */
export const AffiliatePlacementSchema = z.enum([
  'pokedex_feed',
  'rizz_footer',
  'map_drawer',
]);

/**
 * Affiliate offer placement slot union.
 */
export type AffiliatePlacement = z.infer<typeof AffiliatePlacementSchema>;

/**
 * Public read-only affiliate offer record from `public.affiliate_offers`.
 */
export const AffiliateOfferSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  subtitle: z.string().max(200).nullable(),
  ctaLabel: z.string().min(1).max(40),
  targetUrl: z.string().url().startsWith('https://'),
  badge: z.string().max(32).nullable(),
  placement: AffiliatePlacementSchema,
  priority: z.number().int(),
});

/**
 * Affiliate offer item rendered in organic placements.
 */
export type AffiliateOffer = z.infer<typeof AffiliateOfferSchema>;

/**
 * Anonymous monetization telemetry event types.
 */
export const MonetizationEventTypeSchema = z.enum([
  'ad_impression',
  'ad_click',
  'affiliate_impression',
  'affiliate_click',
]);

/**
 * Monetization event type union.
 */
export type MonetizationEventType = z.infer<typeof MonetizationEventTypeSchema>;

/**
 * Request payload accepted by `POST /api/rizz-coach`.
 */
export const RizzCoachRequestSchema = z.object({
  situation: z
    .string()
    .trim()
    .min(10, 'Describe the situation in at least 10 characters')
    .max(1200, 'Situation must be 1200 characters or fewer'),
  goal: z.enum(['opener', 'banter', 'date_invite', 'recovery', 'spark']),
  tone: z.enum(['playful', 'confident', 'warm', 'direct']),
  metChannel: z.string().trim().min(1).max(40).default('IRL'),
  city: z.string().trim().max(80).default(''),
});

/**
 * Validated request payload for `/api/rizz-coach`.
 */
export type RizzCoachRequest = z.infer<typeof RizzCoachRequestSchema>;

/**
 * Single AI coaching strategy returned by `/api/rizz-coach`.
 */
export const RizzCoachStrategySchema = z.object({
  title: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  rationale: z.string().min(1).max(300),
});

/**
 * Response payload from `POST /api/rizz-coach` containing exactly 3 tailored strategies.
 */
export const RizzCoachResponseSchema = z.object({
  strategies: z.array(RizzCoachStrategySchema).length(3),
  model: z.string(),
});

/**
 * Validated 3-strategy AI coaching response.
 */
export type RizzCoachResponse = z.infer<typeof RizzCoachResponseSchema>;
