/**
 * @module domain/analytics/pokedexStats
 * Pure calculators for Pokédex HUD metrics, world coverage, top nationalities,
 * rating distribution, achievement badges, and pin search/filtering.
 */
import type { DecryptedPin, MetChannel, RelationshipStatus } from '../models/pin';
import { COUNTRY_BY_CODE, TOTAL_UN_COUNTRIES, getCountryFlag } from '../countries/countries';

/**
 * Top HUD bar summary statistics.
 */
export interface HudStats {
  totalDates: number;
  countriesCount: number;
  avgRating: number;
  dates2BedPercent: number;
}

/**
 * World coverage progress breakdown.
 */
export interface WorldCoverageStats {
  unlockedCount: number;
  totalCountries: number;
  percentage: number;
}

/**
 * Ranked nationality frequency entry.
 */
export interface NationalityRank {
  code: string;
  name: string;
  flag: string;
  count: number;
  avgRating: number;
}

/**
 * Rating bucket count for 1-5 star distribution chart.
 */
export interface RatingBucket {
  star: 1 | 2 | 3 | 4 | 5;
  count: number;
  percentage: number;
}

/**
 * Achievement badge status.
 */
export interface AchievementBadge {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progressText: string;
}

/**
 * Filter criteria for searching the Pokédex pin list.
 */
export interface PokedexFilter {
  searchQuery: string;
  nationalityCode: string;
  status: RelationshipStatus | 'all';
  channel: MetChannel | 'all';
  minRating: number;
  sortBy: 'recent' | 'rating' | 'name';
}

/**
 * Computes top HUD metrics (`Dates`, `Countries`, `Avg Rating`, `Dates2Bed`).
 * @param {DecryptedPin[]} pins - Active decrypted pins.
 * @returns {HudStats} Calculated HUD statistics.
 */
export function computeHudStats(pins: readonly DecryptedPin[]): HudStats {
  const active = pins.filter((pin) => !pin.deletedAt);
  if (active.length === 0) {
    return {
      totalDates: 0,
      countriesCount: 0,
      avgRating: 0,
      dates2BedPercent: 0,
    };
  }

  const countries = new Set(active.map((pin) => pin.nationalityCode));
  const ratingSum = active.reduce((acc, pin) => acc + pin.rating, 0);
  const bedCount = active.filter(
    (pin) => pin.intimacyLevel === 'third_base' || pin.intimacyLevel === 'home_run',
  ).length;

  return {
    totalDates: active.length,
    countriesCount: countries.size,
    avgRating: Number((ratingSum / active.length).toFixed(1)),
    dates2BedPercent: Number(((bedCount / active.length) * 100).toFixed(1)),
  };
}

/**
 * Calculates percentage of world countries represented in the user's Pokédex.
 * @param {DecryptedPin[]} pins - Active decrypted pins.
 * @returns {WorldCoverageStats} Coverage count and percentage against 195 UN countries.
 */
export function computeWorldCoverage(pins: readonly DecryptedPin[]): WorldCoverageStats {
  const active = pins.filter((pin) => !pin.deletedAt);
  const unique = new Set(active.map((pin) => pin.nationalityCode));
  const unlockedCount = unique.size;
  const percentage = Number(((unlockedCount / TOTAL_UN_COUNTRIES) * 100).toFixed(1));
  return {
    unlockedCount,
    totalCountries: TOTAL_UN_COUNTRIES,
    percentage,
  };
}

/**
 * Ranks nationalities by frequency and average rating.
 * @param {DecryptedPin[]} pins - Active decrypted pins.
 * @param {number} [limit] - Maximum nationalities to return.
 * @returns {NationalityRank[]} Sorted nationality leaderboard.
 */
export function computeTopNationalities(
  pins: readonly DecryptedPin[],
  limit: number = 5,
): NationalityRank[] {
  const active = pins.filter((pin) => !pin.deletedAt);
  const grouped = new Map<string, { count: number; ratingSum: number }>();

  for (const pin of active) {
    const current = grouped.get(pin.nationalityCode) ?? { count: 0, ratingSum: 0 };
    current.count += 1;
    current.ratingSum += pin.rating;
    grouped.set(pin.nationalityCode, current);
  }

  return Array.from(grouped.entries())
    .map(([code, agg]) => ({
      code,
      name: COUNTRY_BY_CODE.get(code)?.name ?? code,
      flag: getCountryFlag(code),
      count: agg.count,
      avgRating: Number((agg.ratingSum / agg.count).toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count || b.avgRating - a.avgRating)
    .slice(0, limit);
}

/**
 * Computes 1-to-5 star rating histogram buckets.
 * @param {DecryptedPin[]} pins - Active decrypted pins.
 * @returns {RatingBucket[]} Ordered buckets from 5 stars down to 1 star.
 */
export function computeRatingDistribution(pins: readonly DecryptedPin[]): RatingBucket[] {
  const active = pins.filter((pin) => !pin.deletedAt);
  const counts: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const pin of active) {
    const rounded = Math.min(5, Math.max(1, Math.round(pin.rating))) as 1 | 2 | 3 | 4 | 5;
    counts[rounded] += 1;
  }

  const stars: Array<1 | 2 | 3 | 4 | 5> = [5, 4, 3, 2, 1];
  return stars.map((star) => ({
    star,
    count: counts[star],
    percentage: active.length > 0 ? Math.round((counts[star] / active.length) * 100) : 0,
  }));
}

/**
 * Evaluates Pokédex milestone achievement badges.
 * @param {DecryptedPin[]} pins - Active decrypted pins.
 * @returns {AchievementBadge[]} List of achievement badges with unlock state.
 */
export function computeBadges(pins: readonly DecryptedPin[]): AchievementBadge[] {
  const active = pins.filter((pin) => !pin.deletedAt);
  const countries = new Set(active.map((pin) => pin.nationalityCode)).size;
  const cities = new Set(active.map((pin) => pin.city.trim().toLowerCase())).size;
  const fiveStarCount = active.filter((pin) => pin.rating >= 4.5).length;
  const irlCount = active.filter((pin) => pin.metChannel === 'IRL').length;

  return [
    {
      id: 'first-stamp',
      title: 'Passport Stamped',
      description: 'Log your very first Datédex entry',
      unlocked: active.length >= 1,
      progressText: `${Math.min(active.length, 1)}/1`,
    },
    {
      id: 'polyglot',
      title: 'Global Nomad',
      description: 'Connect across 3 different nationalities',
      unlocked: countries >= 3,
      progressText: `${Math.min(countries, 3)}/3`,
    },
    {
      id: 'jetsetter',
      title: 'City Hopper',
      description: 'Log pins in 5 distinct cities',
      unlocked: cities >= 5,
      progressText: `${Math.min(cities, 5)}/5`,
    },
    {
      id: 'chemistry',
      title: 'Electric Chemistry',
      description: 'Record 3 entries rated 4.5+ stars',
      unlocked: fiveStarCount >= 3,
      progressText: `${Math.min(fiveStarCount, 3)}/3`,
    },
    {
      id: 'irl-charm',
      title: 'Real-World Charmer',
      description: 'Meet 2 connections IRL off-app',
      unlocked: irlCount >= 2,
      progressText: `${Math.min(irlCount, 2)}/2`,
    },
  ];
}

/**
 * Filters and sorts decrypted pins based on Pokédex search controls.
 * @param {DecryptedPin[]} pins - Active decrypted pins.
 * @param {PokedexFilter} filter - Active filter and sort state.
 * @returns {DecryptedPin[]} Filtered and sorted pin list.
 */
export function filterPins(
  pins: readonly DecryptedPin[],
  filter: PokedexFilter,
): DecryptedPin[] {
  const query = filter.searchQuery.trim().toLowerCase();

  const filtered = pins.filter((pin) => {
    if (pin.deletedAt) return false;
    if (filter.nationalityCode !== 'ALL' && pin.nationalityCode !== filter.nationalityCode) {
      return false;
    }
    if (filter.status !== 'all' && pin.relationshipStatus !== filter.status) {
      return false;
    }
    if (filter.channel !== 'all' && pin.metChannel !== filter.channel) {
      return false;
    }
    if (pin.rating < filter.minRating) {
      return false;
    }
    if (query) {
      const countryName = (COUNTRY_BY_CODE.get(pin.nationalityCode)?.name ?? '').toLowerCase();
      const haystack = `${pin.name} ${pin.city} ${countryName} ${pin.metChannel} ${pin.notes}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    if (filter.sortBy === 'rating') return b.rating - a.rating || b.dateMet.localeCompare(a.dateMet);
    if (filter.sortBy === 'name') return a.name.localeCompare(b.name);
    return b.dateMet.localeCompare(a.dateMet) || b.updatedAt.localeCompare(a.updatedAt);
  });
}
