/**
 * @module features/monetization/InterstitialAdDialog
 * Frequency-capped native `<dialog>` interstitial ad slot shown only to Free-tier users
 * when Vault / Discreet mode is inactive.
 */
import { useEffect, useRef } from 'react';
import { Sparkles, X } from 'lucide-react';
import { markInterstitialAdShown } from '../../platform/ads/adProvider';
import { useTranslation } from '../../platform/i18n/LanguageContext';
import { recordMonetizationEvent } from '../../platform/supabase/monetization';
import { useNativeModalDialog } from '../../platform/ui/dialogUtils';

/**
 * Props for `InterstitialAdDialog`.
 */
export interface InterstitialAdDialogProps {
  open: boolean;
  isPro: boolean;
  discreetMode: boolean;
  onClose: () => void;
  onUpgradeClick: () => void;
}

/**
 * Renders a frequency-capped interstitial modal for free-tier users.
 * @param {InterstitialAdDialogProps} props - Visibility and tier/discreet flags.
 * @returns {React.JSX.Element | null} Interstitial modal or null when gated out.
 */
export function InterstitialAdDialog({
  open,
  isPro,
  discreetMode,
  onClose,
  onUpgradeClick,
}: InterstitialAdDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const shouldOpen = open && !isPro && !discreetMode;
  const dialogRef = useRef<HTMLDialogElement>(null);
  useNativeModalDialog(dialogRef, shouldOpen, onClose, true);

  useEffect(() => {
    if (!shouldOpen) return;
    markInterstitialAdShown();
    void recordMonetizationEvent('ad_impression', 'interstitial_modal');
  }, [shouldOpen]);

  if (isPro || discreetMode) return null;

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="interstitial-ad-title"
      className="dd-dialog"
    >
      <div className="flex items-center justify-between border-b border-white/15 bg-black px-5 py-3.5">
        <h1 id="interstitial-ad-title" className="text-xs font-semibold tracking-wider text-neutral-400 uppercase">
          {t('ad.interstitialTitle')}
        </h1>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={t('ad.dismissModalAria')}
          className="rounded-lg p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-4 bg-black p-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/30 bg-red-600/15 text-red-400">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-white">{t('ad.interstitialHeading')}</h2>
        <p className="text-xs text-neutral-300">{t('ad.interstitialCopy')}</p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="flex-1 rounded-xl border border-white/15 bg-[#111111] px-4 py-2.5 text-xs font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
          >
            {t('ad.continueFree')}
          </button>
          <button
            type="button"
            onClick={() => {
              void recordMonetizationEvent('ad_click', 'interstitial_modal');
              onClose();
              onUpgradeClick();
            }}
            className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-red-500"
          >
            {t('ad.upgradeToPro')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
