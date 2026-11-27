/**
 * @module platform/ads/adProvider
 * Abstracted ad provider interface, Google AdSense config reader,
 * and frequency-capped interstitial controller for free-tier users.
 */

/**
 * Abstraction for display banner and interstitial ad networks.
 */
export interface IAdProvider {
  readonly networkName: string;
  readonly isConfigured: boolean;
  readonly clientId: string;
  readonly bannerSlotId: string;
}

const INTERSTITIAL_LAST_SHOWN_KEY = 'datedex.interstitial.lastShownMs';
const INTERSTITIAL_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Reads public AdSense configuration from Vite env variables (optional).
 * @returns {IAdProvider} Ad provider metadata.
 */
export function getAdProviderConfig(): IAdProvider {
  const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID?.trim() ?? '';
  const bannerSlotId = import.meta.env.VITE_ADSENSE_BANNER_SLOT?.trim() ?? '';
  return {
    networkName: 'Google AdSense',
    isConfigured: Boolean(clientId && bannerSlotId),
    clientId,
    bannerSlotId,
  };
}

/**
 * Evaluates whether a frequency-capped interstitial ad slot may be displayed.
 * Always returns false for Pro subscribers or when Vault / Discreet mode is active.
 * @param {boolean} isPro - Active Pro subscription flag.
 * @param {boolean} discreetMode - Active Vault / Discreet mode flag.
 * @param {number} [nowMs] - Current epoch time in milliseconds.
 * @returns {boolean} True when interstitial cooldown has elapsed for a free-tier user.
 */
export function canShowInterstitialAd(
  isPro: boolean,
  discreetMode: boolean,
  nowMs: number = Date.now(),
): boolean {
  if (isPro || discreetMode) return false;
  try {
    const raw = globalThis.localStorage?.getItem(INTERSTITIAL_LAST_SHOWN_KEY);
    if (!raw) return true;
    const lastShown = Number(raw);
    if (!Number.isFinite(lastShown)) return true;
    return nowMs - lastShown >= INTERSTITIAL_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/**
 * Records the timestamp of the most recent interstitial display to enforce frequency capping.
 * @param {number} [nowMs] - Current epoch time in milliseconds.
 * @returns {void}
 */
export function markInterstitialAdShown(nowMs: number = Date.now()): void {
  try {
    globalThis.localStorage?.setItem(INTERSTITIAL_LAST_SHOWN_KEY, String(nowMs));
  } catch {
    // Ignore storage quota / private-browsing exceptions
  }
}
