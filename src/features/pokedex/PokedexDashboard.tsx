/**
 * @module features/pokedex/PokedexDashboard
 * Full Pokédex & Analytics view featuring chronologically ordered mini cards
 * (with sequential `#N` badge, Encounter Date, and Intimacy Date), world coverage meter,
 * top nationalities leaderboard, rating distribution, milestone badges, and city filters
 * (`All Cities`, `Born in`, `Lives in`, `Met in`).
 */
import { useMemo, useState } from 'react';
import { Award, Calendar, Flame, Globe, Lock, MapPin, Search, Star, X } from 'lucide-react';
import { assignChronologicalNumbers } from '../../domain/analytics/chronology';
import {
  computeBadges,
  computeRatingDistribution,
  computeTopNationalities,
  computeWorldCoverage,
  filterPins,
  type PokedexFilter,
} from '../../domain/analytics/pokedexStats';
import { COUNTRY_BY_CODE, getCountryFlag } from '../../domain/countries/countries';
import {
  EMPTY_CITY_FILTER,
  getCityOptionsForDimension,
  toCityFilterCriteria,
  type ActiveCityFilter,
  type CityFilterDimension,
} from '../../domain/filters/pinCityFilters';
import {
  MetChannelSchema,
  RelationshipStatusSchema,
  formatCompactBadgeDate,
  formatTenScale,
  type DecryptedPin,
  type MetChannel,
  type RelationshipStatus,
} from '../../domain/models/pin';
import { maskPinForDiscreet } from '../../domain/vault/masking';
import { useTranslation } from '../../platform/i18n/LanguageContext';
import type { TranslationKey } from '../../platform/i18n/translations';

const STATUS_TRANSLATION_KEY: Record<RelationshipStatus, TranslationKey> = {
  talking: 'status.talking',
  first_date: 'status.first_date',
  dating: 'status.dating',
  situationship: 'status.situationship',
  exclusive: 'status.exclusive',
  standby_ghosted: 'status.standby_ghosted',
  standby_ghosting: 'status.standby_ghosting',
  friends: 'status.friends',
  archived: 'status.archived',
};

const BADGE_TRANSLATION_KEYS: Record<string, { title: TranslationKey; desc: TranslationKey }> = {
  'first-stamp': {
    title: 'pokedex.badge.first-stamp.title',
    desc: 'pokedex.badge.first-stamp.desc',
  },
  polyglot: {
    title: 'pokedex.badge.polyglot.title',
    desc: 'pokedex.badge.polyglot.desc',
  },
  jetsetter: {
    title: 'pokedex.badge.jetsetter.title',
    desc: 'pokedex.badge.jetsetter.desc',
  },
  chemistry: {
    title: 'pokedex.badge.chemistry.title',
    desc: 'pokedex.badge.chemistry.desc',
  },
  'irl-charm': {
    title: 'pokedex.badge.irl-charm.title',
    desc: 'pokedex.badge.irl-charm.desc',
  },
};

/**
 * Props for `PokedexDashboard`.
 */
export interface PokedexDashboardProps {
  pins: DecryptedPin[];
  discreetMode: boolean;
  /** Optional shared city filter controlled by the root app shell so Pokédex and Map stay in sync. */
  cityFilter?: ActiveCityFilter;
  /** Callback when the user changes or clears the city filter. */
  onCityFilterChange?: (next: ActiveCityFilter) => void;
  onSelectPin: (pin: DecryptedPin) => void;
}

/**
 * Renders the searchable, chronologically ordered Pokédex cards and global dating analytics dashboard.
 * @param {PokedexDashboardProps} props - Pins, discreet toggle, city filter state, and card click callback.
 * @returns {React.JSX.Element} Pokédex analytics & card feed.
 */
export function PokedexDashboard({
  pins,
  discreetMode,
  cityFilter: controlledCityFilter,
  onCityFilterChange,
  onSelectPin,
}: PokedexDashboardProps): React.JSX.Element {
  const { t } = useTranslation();
  const [internalCityFilter, setInternalCityFilter] =
    useState<ActiveCityFilter>(EMPTY_CITY_FILTER);
  const activeCityFilter = controlledCityFilter ?? internalCityFilter;
  const updateCityFilter = onCityFilterChange ?? setInternalCityFilter;

  const [filter, setFilter] = useState<PokedexFilter>({
    searchQuery: '',
    nationalityCode: 'ALL',
    status: 'all',
    channel: 'all',
    minRating: 1,
    sortBy: 'chronological',
  });

  // Always compute canonical chronological #1..#N profile numbers deterministically
  const numberedPins = useMemo(() => assignChronologicalNumbers(pins), [pins]);

  const coverage = useMemo(() => computeWorldCoverage(numberedPins), [numberedPins]);
  const topNationalities = useMemo(() => computeTopNationalities(numberedPins, 5), [numberedPins]);
  const ratingBuckets = useMemo(() => computeRatingDistribution(numberedPins), [numberedPins]);
  const badges = useMemo(() => computeBadges(numberedPins), [numberedPins]);

  const cityOptions = useMemo(
    () => getCityOptionsForDimension(numberedPins, activeCityFilter.dimension),
    [numberedPins, activeCityFilter.dimension],
  );

  const filtered = useMemo(() => {
    const cityCriteria = toCityFilterCriteria(activeCityFilter);
    return filterPins(numberedPins, {
      ...filter,
      birthCity: cityCriteria.birthCity,
      livingCity: cityCriteria.livingCity,
      metCity: cityCriteria.metCity,
      anyCity: cityCriteria.anyCity,
    });
  }, [numberedPins, filter, activeCityFilter]);

  const representedCountries = useMemo(() => {
    const codes = Array.from(new Set(numberedPins.map((p) => p.nationalityCode)));
    return codes.sort((a, b) => a.localeCompare(b));
  }, [numberedPins]);

  const hasActiveCityFilter =
    activeCityFilter.dimension !== 'all' || activeCityFilter.city.trim().length > 0;

  return (
    <div className="space-y-5">
      {/* World Coverage + Top Nationalities */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#121622] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 uppercase">
              <Globe className="h-4 w-4 text-rose-400" aria-hidden="true" />
              {t('pokedex.worldCoverage')}
            </h2>
            <span className="text-sm font-bold text-rose-300">
              {coverage.unlockedCount}/{coverage.totalCountries} ({coverage.percentage}%)
            </span>
          </div>
          <progress
            max={coverage.totalCountries}
            value={coverage.unlockedCount}
            aria-label={t('pokedex.worldCoverageAria')}
            className="h-2.5 w-full overflow-hidden rounded-full"
          />
          <p className="mt-2 text-[11px] text-slate-400">
            {coverage.unlockedCount === 0
              ? t('pokedex.coverageEmpty')
              : coverage.unlockedCount === 1
                ? t('pokedex.coverageStampedSingle', { count: coverage.unlockedCount })
                : t('pokedex.coverageStampedPlural', { count: coverage.unlockedCount })}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#121622] p-4">
          <h2 className="mb-2.5 text-xs font-semibold text-slate-200 uppercase">
            {t('pokedex.topNationalities')}
          </h2>
          {topNationalities.length === 0 ? (
            <p className="text-xs text-slate-400">{t('pokedex.noEntriesYet')}</p>
          ) : (
            <ul className="space-y-1.5">
              {topNationalities.map((nat) => (
                <li key={nat.code} className="flex items-center justify-between text-xs">
                  <span className="text-slate-200">
                    {nat.flag} {nat.name}
                  </span>
                  <span className="font-mono text-slate-400">
                    {nat.count} • {nat.avgRating.toFixed(1)}★
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Rating Distribution & Badges */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#121622] p-4">
          <h2 className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 uppercase">
            <Star className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            {t('pokedex.ratingDistribution')}
          </h2>
          <div className="space-y-1.5">
            {ratingBuckets.map((bucket) => (
              <div key={bucket.star} className="flex items-center gap-2 text-xs">
                <span className="w-8 font-mono text-amber-300">{bucket.star}★</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-400"
                    style={{ width: `${bucket.percentage}%` }}
                  />
                </div>
                <span className="w-7 text-right font-mono text-slate-400">{bucket.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#121622] p-4">
          <h2 className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 uppercase">
            <Award className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            {t('pokedex.achievementBadges')}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {badges.map((badge) => {
              const badgeKeys = BADGE_TRANSLATION_KEYS[badge.id];
              const badgeTitle = badgeKeys ? t(badgeKeys.title) : badge.title;
              const badgeDesc = badgeKeys ? t(badgeKeys.desc) : badge.description;
              return (
                <span
                  key={badge.id}
                  title={badgeDesc}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                    badge.unlocked
                      ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
                      : 'border-white/10 bg-slate-900/60 text-slate-400'
                  }`}
                >
                  {badge.unlocked ? '★ ' : ''}
                  {badgeTitle} ({badge.progressText})
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* Search & Filters (including synchronized Birth / Living / Met City filters) */}
      <section className="space-y-2.5 rounded-2xl border border-white/10 bg-[#121622] p-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label={t('pokedex.searchAria')}
            value={filter.searchQuery}
            onChange={(e) => setFilter((prev) => ({ ...prev, searchQuery: e.target.value }))}
            placeholder={t('pokedex.searchPlaceholder')}
            className="dd-input pl-9 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select
            aria-label={t('pokedex.filterCountryAria')}
            value={filter.nationalityCode}
            onChange={(e) => setFilter((prev) => ({ ...prev, nationalityCode: e.target.value }))}
            className="dd-input text-xs"
          >
            <option value="ALL">{t('pokedex.allCountries')}</option>
            {representedCountries.map((code) => (
              <option key={code} value={code}>
                {getCountryFlag(code)} {COUNTRY_BY_CODE.get(code)?.name ?? code}
              </option>
            ))}
          </select>

          <select
            aria-label={t('pokedex.filterStatusAria')}
            value={filter.status}
            onChange={(e) =>
              setFilter((prev) => ({
                ...prev,
                status: e.target.value as RelationshipStatus | 'all',
              }))
            }
            className="dd-input text-xs"
          >
            <option value="all">{t('pokedex.allStatuses')}</option>
            {RelationshipStatusSchema.options.map((opt) => (
              <option key={opt} value={opt}>
                {t(STATUS_TRANSLATION_KEY[opt])}
              </option>
            ))}
          </select>

          <select
            aria-label={t('pokedex.filterChannelAria')}
            value={filter.channel}
            onChange={(e) =>
              setFilter((prev) => ({ ...prev, channel: e.target.value as MetChannel | 'all' }))
            }
            className="dd-input text-xs"
          >
            <option value="all">{t('pokedex.allChannels')}</option>
            {MetChannelSchema.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>

          <select
            aria-label={t('pokedex.sortAria')}
            value={filter.sortBy}
            onChange={(e) =>
              setFilter((prev) => ({
                ...prev,
                sortBy: e.target.value as PokedexFilter['sortBy'],
              }))
            }
            className="dd-input text-xs"
          >
            <option value="chronological">{t('pokedex.sortChronological')}</option>
            <option value="recent">{t('pokedex.sortRecent')}</option>
            <option value="rating">{t('pokedex.sortRating')}</option>
            <option value="name">{t('pokedex.sortName')}</option>
          </select>
        </div>

        {/* Synchronized City Filter Row: All Cities / Born in / Lives in / Met in */}
        <div
          data-testid="pokedex-city-filter"
          className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2.5"
        >
          <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden="true" />
          <select
            data-testid="pokedex-city-dimension"
            aria-label={t('cityFilter.dimensionAria')}
            value={activeCityFilter.dimension}
            onChange={(e) => {
              const nextDimension = e.target.value as CityFilterDimension;
              const nextOptions = getCityOptionsForDimension(numberedPins, nextDimension);
              const keepCity = nextOptions.includes(activeCityFilter.city)
                ? activeCityFilter.city
                : '';
              updateCityFilter({ dimension: nextDimension, city: keepCity });
            }}
            className="dd-input w-auto min-w-[120px] flex-1 py-1.5 text-xs"
          >
            <option value="all">{t('cityFilter.allCities')}</option>
            <option value="birthCity">{t('cityFilter.bornIn')}</option>
            <option value="livingCity">{t('cityFilter.livesIn')}</option>
            <option value="metCity">{t('cityFilter.metIn')}</option>
          </select>

          <select
            data-testid="pokedex-city-value"
            aria-label={t('cityFilter.cityAria')}
            value={activeCityFilter.city}
            onChange={(e) =>
              updateCityFilter({
                ...activeCityFilter,
                city: e.target.value,
              })
            }
            className="dd-input w-auto min-w-[130px] flex-1 py-1.5 text-xs"
          >
            <option value="">{t('cityFilter.allValues')}</option>
            {cityOptions.map((cityName) => (
              <option key={cityName} value={cityName}>
                {cityName}
              </option>
            ))}
          </select>

          {hasActiveCityFilter && (
            <button
              type="button"
              data-testid="pokedex-city-filter-clear"
              aria-label={t('cityFilter.clearAria')}
              onClick={() => updateCityFilter(EMPTY_CITY_FILTER)}
              className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/15"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {t('cityFilter.clear')}
            </button>
          )}
        </div>
      </section>

      {/* Cards Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#121622]/60 p-8 text-center">
          <p className="text-sm font-medium text-slate-300">{t('pokedex.emptyTitle')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('pokedex.emptySubtitle')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="pokedex-cards">
          {filtered.map((pin) => {
            const display = maskPinForDiscreet(pin, discreetMode);
            const flag = getCountryFlag(pin.nationalityCode);
            const encounterDateStr = formatCompactBadgeDate(pin.dateMet) || pin.dateMet;
            const intimacyDateStr = display.isMasked
              ? '•••'
              : formatCompactBadgeDate(pin.firstIntimateDate) ||
                t('pokedex.card.noIntimacyDate');

            return (
              <button
                key={pin.id}
                type="button"
                data-testid={`pokedex-card-${pin.id}`}
                onClick={() => onSelectPin(pin)}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#121622] p-3.5 text-left transition hover:border-rose-400/40 hover:bg-[#171c2b]"
              >
                {display.displayPhotoUrl ? (
                  <img
                    src={display.displayPhotoUrl}
                    alt={display.displayName}
                    className="h-16 w-16 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/5 text-2xl">
                    {display.isMasked ? (
                      <Lock className="h-6 w-6 text-emerald-400" />
                    ) : (
                      pin.avatarEmoji || flag
                    )}
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-bold text-white">
                      <span
                        data-testid={`pokedex-card-number-${pin.id}`}
                        className="shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300"
                      >
                        #{pin.entryNumber}
                      </span>
                      <span className="truncate">
                        {flag} {display.displayName}
                        {!display.isMasked && pin.age ? `, ${pin.age}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">
                      {formatTenScale(pin.rating)}
                    </span>
                  </div>

                  <p className="truncate text-xs text-slate-300">
                    {display.displayCity} • {pin.metChannel} •{' '}
                    {t(STATUS_TRANSLATION_KEY[pin.relationshipStatus])}
                  </p>

                  {/* Chronological Encounter Date + Intimacy Date strip */}
                  <div
                    data-testid={`pokedex-card-dates-${pin.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-amber-400" aria-hidden="true" />
                      <span className="text-slate-400">{t('pokedex.card.encounterDate')}:</span>{' '}
                      <span className="font-mono text-slate-200">{encounterDateStr}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Flame className="h-3 w-3 text-rose-400" aria-hidden="true" />
                      <span className="text-slate-400">{t('pokedex.card.intimacyDate')}:</span>{' '}
                      <span className="font-mono text-rose-200">{intimacyDateStr}</span>
                    </span>
                  </div>

                  <p className="line-clamp-2 text-[11px] text-slate-400">
                    {display.displayNotes || t('pokedex.noPrivateNotes')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
