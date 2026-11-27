/**
 * @module features/pokedex/HudStatsBar
 * Sticky top HUD displaying Dates, Countries, Avg Rating, Dates2Bed conversion ratio,
 * and quick one-handed Vault / Discreet & Hide HUD controls.
 */
import { Eye, EyeOff, Shield, ShieldOff } from 'lucide-react';
import type { HudStats } from '../../domain/analytics/pokedexStats';
import { formatHudDates2Bed } from '../../domain/vault/masking';

/**
 * Props for `HudStatsBar`.
 */
export interface HudStatsBarProps {
  stats: HudStats;
  discreetMode: boolean;
  isPro: boolean;
  onToggleDiscreet: () => void;
  onToggleHideHud: () => void;
}

/**
 * Renders the top mobile-first HUD stats bar.
 * @param {HudStatsBarProps} props - Calculated HUD metrics and toggle handlers.
 * @returns {React.JSX.Element} HUD stats bar component.
 */
export function HudStatsBar({
  stats,
  discreetMode,
  isPro,
  onToggleDiscreet,
  onToggleHideHud,
}: HudStatsBarProps): React.JSX.Element {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0d14]/90 px-4 pt-3 pb-3 backdrop-blur-md">
      <div className="mx-auto max-w-2xl space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold tracking-tight text-white">
              Daté<span className="text-rose-400">dex</span>
            </span>
            {isPro && (
              <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-300 uppercase">
                PRO
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleDiscreet}
              aria-pressed={discreetMode}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                discreetMode
                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40'
                  : 'bg-white/10 text-slate-200 hover:bg-white/15'
              }`}
            >
              {discreetMode ? (
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {discreetMode ? 'Vault On' : 'Discreet'}
            </button>

            <button
              type="button"
              onClick={onToggleHideHud}
              aria-label="Hide HUD"
              title="Hide HUD"
              className="rounded-full bg-white/10 p-1.5 text-slate-300 hover:bg-white/15 hover:text-white"
            >
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-xl border border-white/10 bg-[#121622] px-2 py-1.5">
            <div className="text-sm font-bold text-white" data-testid="hud-dates">
              {stats.totalDates}
            </div>
            <div className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
              Dates
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#121622] px-2 py-1.5">
            <div className="text-sm font-bold text-rose-300" data-testid="hud-countries">
              {stats.countriesCount}
            </div>
            <div className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
              Countries
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#121622] px-2 py-1.5">
            <div className="text-sm font-bold text-amber-300" data-testid="hud-avg-rating">
              {stats.avgRating.toFixed(1)}
            </div>
            <div className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
              Avg ★
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#121622] px-2 py-1.5">
            <div className="text-sm font-bold text-emerald-300" data-testid="hud-dates2bed">
              {formatHudDates2Bed(stats.dates2BedPercent, discreetMode)}
            </div>
            <div className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
              Dates2Bed
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Floating restore pill rendered when the user hides the top HUD.
 * @param {{ onRestore: () => void }} props - Callback to restore the HUD.
 * @returns {React.JSX.Element} Floating restore button.
 */
export function RestoreHudPill({ onRestore }: { onRestore: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onRestore}
      className="fixed top-3 right-3 z-40 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#121622]/90 px-3 py-1.5 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur"
    >
      <Eye className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
      Show HUD
    </button>
  );
}
