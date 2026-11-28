/**
 * @module features/pokedex/HudStatsBar
 * Top HUD header displaying Dates, Countries, Avg Rating, Dates2Bed conversion ratio,
 * and quick one-handed Import, Vault / Discreet, and Settings controls.
 */
import { FileSpreadsheet, Settings, Shield, ShieldOff } from 'lucide-react';
import type { HudStats } from '../../domain/analytics/pokedexStats';
import { formatHudDates2Bed } from '../../domain/vault/masking';
import { useTranslation } from '../../platform/i18n/LanguageContext';

/**
 * Props for `HudStatsBar`.
 */
export interface HudStatsBarProps {
  stats: HudStats;
  discreetMode: boolean;
  hideStats?: boolean;
  isPro: boolean;
  isSignedIn: boolean;
  signedInEmail?: string | null;
  onOpenImport: () => void;
  onToggleDiscreet: () => void;
  onOpenSettings: () => void;
}

/**
 * Renders the top mobile-first HUD header and 4-card stats bar.
 * @param {HudStatsBarProps} props - Calculated HUD metrics and header action handlers.
 * @returns {React.JSX.Element} HUD stats bar component.
 */
export function HudStatsBar({
  stats,
  discreetMode,
  hideStats = false,
  isPro,
  isSignedIn,
  signedInEmail,
  onOpenImport,
  onToggleDiscreet,
  onOpenSettings,
}: HudStatsBarProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <header className="px-4 pt-3 pb-3">
      <div className="mx-auto max-w-2xl space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold tracking-tight text-white">
              Daté<span className="text-red-500">dex</span>
            </span>
            {isPro && (
              <span className="rounded-full border border-red-500/40 bg-red-600/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-red-400 uppercase">
                PRO
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenImport}
              aria-label={t('header.import')}
              title={t('header.importTitle')}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-[#111111] px-3 py-1 text-xs font-semibold text-neutral-200 transition hover:bg-white/10 hover:text-white"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              {t('header.import')}
            </button>

            <button
              type="button"
              onClick={onToggleDiscreet}
              aria-pressed={discreetMode}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                discreetMode
                  ? 'bg-white text-black ring-1 ring-white'
                  : 'border border-white/15 bg-[#111111] text-neutral-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              {discreetMode ? (
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {discreetMode ? t('header.active') : t('header.discreet')}
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={isSignedIn ? t('header.settingsSignedInAria') : t('header.settingsAria')}
              title={
                isSignedIn
                  ? t('header.settingsSignedInTitle', {
                      email: signedInEmail ?? t('header.signedInFallback'),
                    })
                  : t('header.settingsAria')
              }
              className={`relative rounded-full p-1.5 transition ${
                isSignedIn
                  ? 'bg-white/15 text-white ring-1 ring-white/40 hover:bg-white/20'
                  : 'border border-white/15 bg-[#111111] text-neutral-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              {isSignedIn && (
                <span
                  data-testid="settings-signed-in-indicator"
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-black"
                />
              )}
            </button>
          </div>
        </div>

        {!hideStats && (
          <div data-testid="hud-stats-grid" className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl border border-white/15 bg-[#080808] px-2 py-1.5">
              <div className="text-sm font-bold text-white" data-testid="hud-dates">
                {stats.totalDates}
              </div>
              <div className="text-[10px] font-medium tracking-wide text-neutral-400 uppercase">
                {t('hud.dates')}
              </div>
            </div>

            <div className="rounded-xl border border-white/15 bg-[#080808] px-2 py-1.5">
              <div className="text-sm font-bold text-white" data-testid="hud-countries">
                {stats.countriesCount}
              </div>
              <div className="text-[10px] font-medium tracking-wide text-neutral-400 uppercase">
                {t('hud.countries')}
              </div>
            </div>

            <div className="rounded-xl border border-white/15 bg-[#080808] px-2 py-1.5">
              <div className="text-sm font-bold text-red-400" data-testid="hud-avg-rating">
                {stats.avgRating.toFixed(1)}
              </div>
              <div className="text-[10px] font-medium tracking-wide text-neutral-400 uppercase">
                {t('hud.avgRating')}
              </div>
            </div>

            <div className="rounded-xl border border-white/15 bg-[#080808] px-2 py-1.5">
              <div className="text-sm font-bold text-red-400" data-testid="hud-dates2bed">
                {formatHudDates2Bed(stats.dates2BedPercent, discreetMode)}
              </div>
              <div className="text-[10px] font-medium tracking-wide text-neutral-400 uppercase">
                {t('hud.dates2Bed')}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
