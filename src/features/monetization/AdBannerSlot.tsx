/**
 * @module features/monetization/AdBannerSlot
 * Free-tier banner ad slot abstracted over `IAdProvider`.
 * Disabled only for Pro subscribers; always remains visible on the free tier
 * even when Vault / Discreet mode is active.
 */
import { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { getAdProviderConfig } from '../../platform/ads/adProvider';
import { useTranslation } from '../../platform/i18n/LanguageContext';
import { recordMonetizationEvent } from '../../platform/supabase/monetization';

/**
 * Props for `AdBannerSlot`.
 */
export interface AdBannerSlotProps {
  isPro: boolean;
  slot?: string;
  onUpgradeClick: () => void;
}

/**
 * Renders a free-tier banner ad slot (hidden only for Pro users; never hidden by Discreet mode).
 * @param {AdBannerSlotProps} props - Subscription gate and upgrade handler.
 * @returns {React.JSX.Element | null} Banner slot or null for Pro users.
 */
export function AdBannerSlot({
  isPro,
  slot = 'pokedex_banner',
  onUpgradeClick,
}: AdBannerSlotProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const provider = getAdProviderConfig();
  const visible = !isPro;

  useEffect(() => {
    if (!visible) return;
    void recordMonetizationEvent('ad_impression', slot);
  }, [visible, slot]);

  if (!visible) return null;

  return (
    <aside
      aria-label={t('ad.bannerAria')}
      data-testid="ad-banner-slot"
      className="flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-[#080808] px-4 py-3 text-xs"
    >
      <div className="min-w-0">
        <span className="text-[10px] font-semibold tracking-wider text-neutral-400 uppercase">
          {t('ad.sponsored')} • {provider.isConfigured ? provider.networkName : t('ad.freeTier')}
        </span>
        <p className="truncate font-medium text-neutral-200">{t('ad.bannerCopy')}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void recordMonetizationEvent('ad_click', slot);
          onUpgradeClick();
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 font-semibold text-white transition hover:bg-red-500"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {t('ad.goPro')}
      </button>
    </aside>
  );
}
