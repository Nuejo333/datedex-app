/**
 * @module platform/supabase/monetization
 * Fetches active public read-only `affiliate_offers` and logs anonymous
 * `monetization_events` counters via Supabase RPC.
 */
import {
  AffiliateOfferSchema,
  type AffiliateOffer,
  type AffiliatePlacement,
  type MonetizationEventType,
} from '../../domain/models/monetization';
import { getSupabaseClient } from './client';

/**
 * Queries active `affiliate_offers` from Supabase for a placement slot.
 * Returns an empty array cleanly when offline or unconfigured.
 * @param {AffiliatePlacement} [placement] - Optional placement filter.
 * @returns {Promise<AffiliateOffer[]>} Active validated affiliate offers sorted by priority.
 */
export async function fetchActiveAffiliateOffers(
  placement?: AffiliatePlacement,
): Promise<AffiliateOffer[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from('affiliate_offers')
    .select('id, title, subtitle, cta_label, target_url, badge, placement, priority')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (placement) {
    query = query.eq('placement', placement);
  }

  try {
    const { data, error } = await query;
    if (error || !data) return [];

    const offers: AffiliateOffer[] = [];
    for (const row of data) {
      const parsed = AffiliateOfferSchema.safeParse({
        id: row.id,
        title: row.title,
        subtitle: row.subtitle,
        ctaLabel: row.cta_label,
        targetUrl: row.target_url,
        badge: row.badge,
        placement: row.placement,
        priority: row.priority,
      });
      if (parsed.success) {
        offers.push(parsed.data);
      }
    }
    return offers;
  } catch {
    return [];
  }
}

/**
 * Records an anonymous ad or affiliate telemetry event via `record_monetization_event` RPC.
 * @param {MonetizationEventType} eventType - Event category.
 * @param {string} slot - Slot identifier (e.g. `'pokedex_feed'`).
 * @param {string | null} [offerId] - Optional affiliate offer UUID.
 * @returns {Promise<void>}
 */
export async function recordMonetizationEvent(
  eventType: MonetizationEventType,
  slot: string,
  offerId: string | null = null,
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  await supabase.rpc('record_monetization_event', {
    p_event_type: eventType,
    p_slot: slot,
    p_offer_id: offerId,
  });
}
