/**
 * @module features/monetization/AffiliateSlot
 * Organic affiliate & sponsor placement cards reading active rows from the public
 * read-only `affiliate_offers` Supabase table. Hidden in Vault / Discreet mode.
 */
import { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import type { AffiliateOffer, AffiliatePlacement } from '../../domain/models/monetization';
import { recordMonetizationEvent } from '../../platform/supabase/monetization';

/**
 * Props for `AffiliateSlot`.
 */
export interface AffiliateSlotProps {
  offers: AffiliateOffer[];
  placement: AffiliatePlacement;
  discreetMode: boolean;
}

/**
 * Renders the top-priority active affiliate offer for a placement slot (hidden in Discreet mode).
 * @param {AffiliateSlotProps} props - Active affiliate offers, target placement, and discreet flag.
 * @returns {React.JSX.Element | null} Affiliate card or null if empty or discreet mode is active.
 */
export function AffiliateSlot({
  offers,
  placement,
  discreetMode,
}: AffiliateSlotProps): React.JSX.Element | null {
  const offer = offers.find((o) => o.placement === placement);
  const visible = Boolean(offer) && !discreetMode;

  useEffect(() => {
    if (!visible || !offer) return;
    void recordMonetizationEvent('affiliate_impression', placement, offer.id);
  }, [visible, placement, offer]);

  if (!visible || !offer) return null;

  return (
    <aside
      aria-label="Partner Recommendation"
      data-testid="affiliate-slot"
      className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/20 bg-gradient-to-r from-[#161927] to-[#1a1423] px-4 py-3 text-xs"
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300 uppercase">
            {offer.badge ?? 'Partner'}
          </span>
          <span className="truncate font-semibold text-white">{offer.title}</span>
        </div>
        {offer.subtitle && <p className="truncate text-[11px] text-slate-400">{offer.subtitle}</p>}
      </div>

      <a
        href={offer.targetUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={() => {
          void recordMonetizationEvent('affiliate_click', placement, offer.id);
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-rose-400/30 bg-rose-500/15 px-3 py-1.5 font-semibold text-rose-200 hover:bg-rose-500/25"
      >
        {offer.ctaLabel}
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </aside>
  );
}
