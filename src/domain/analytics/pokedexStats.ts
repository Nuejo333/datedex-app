/**
 * @module domain/analytics/pokedexStats
 * Pure calculators for Pokédex HUD metrics (official 0–10 rating scale), world coverage,
 * top nationalities, achievement badges, and pin search/filtering.
 */
import type { DecryptedPin, MetChannel, RelationshipStatus } from '../models/pin';
import { COUNTRY_BY_CODE, TOTAL_UN_COUNTRIES, getCountryFlag } from '../countries/countries';
import { matchesPinCityFilter } from '../filters/pinCityFilters';
import { comparePinsChronologically } from './chronology';

/**
 * Top HUD bar summary statistics (using the official 0–10 rating scale).
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
 * Ranked nationality frequency entry (average score on the official 0–10 scale).
 */
export interface NationalityRank {
  code: string;
  name: string;
  flag: string;
  count: number;
  avgRating: number;
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
  sortBy: 'chronological' | 'recent' | 'rating' | 'name';
  birthCity?: string;
  livingCity?: string;
  metCity?: string;
  anyCity?: string;
}

/**
 * Resolves a connection's official `0–10` score, preferring explicit `generalVote`
 * and seamlessly converting legacy `1–5` ratings (`rating * 2`).
 * @param {Pick<DecryptedPin, 'generalVote' | 'rating'>} pin - Pin rating fields.
 * @returns {number} Official score clamped to `0.0–10.0`.
 */
export function getPinTenScaleScore(
  pin: Pick<DecryptedPin, 'generalVote' | 'rating'>,
): number {
  if (typeof pin.generalVote === 'number' && Number.isFinite(pin.generalVote)) {
    return Number(Math.min(10, Math.max(0, pin.generalVote)).toFixed(1));
  }
  const clampedFive = Math.min(5, Math.max(1, pin.rating));
  return Number((clampedFive * 2).toFixed(1));
}

/**
 * Computes top HUD metrics (`Dates`, `Countries`, `Avg /10`, `Dates2Bed`).
 * @param {DecryptedPin[]} pins - Active decrypted pins.
 * @returns {HudStats} Calculated HUD statistics on the official 0–10 rating scale.
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
  const ratingSum = active.reduce((acc, pin) => acc + getPinTenScaleScore(pin), 0);
  const bedCount = active.filter(
    (pin) =>
      pin.intimacyLevel === 'third_base' ||
      pin.intimacyLevel === 'home_run' ||
      pin.intimacyLevel === 'oral_foreplay' ||
      pin.intimacyLevel === 'sex',
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
 * Ranks nationalities by frequency and average 0–10 score.
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
    current.ratingSum += getPinTenScaleScore(pin);
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
 * Evaluates Pokédex milestone achievement badges using the official 0–10 rating scale.
 * @param {DecryptedPin[]} pins - Active decrypted pins.
 * @returns {AchievementBadge[]} List of achievement badges with unlock state.
 */
export function computeBadges(pins: readonly DecryptedPin[]): AchievementBadge[] {
  const active = pins.filter((pin) => !pin.deletedAt);
  const countries = new Set(active.map((pin) => pin.nationalityCode)).size;
  const cities = new Set(active.map((pin) => pin.city.trim().toLowerCase())).size;
  const highScoreCount = active.filter((pin) => getPinTenScaleScore(pin) >= 9.0).length;
  const irlCount = active.filter(
    (pin) =>
      pin.metChannel === 'IRL' ||
      pin.metChannel === 'IRL - Work' ||
      pin.metChannel === 'IRL - Other',
  ).length;

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
      description: 'Record 3 entries rated 9.0+ / 10',
      unlocked: highScoreCount >= 3,
      progressText: `${Math.min(highScoreCount, 3)}/3`,
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
    if (getPinTenScaleScore(pin) < filter.minRating) {
      return false;
    }
    if (
      !matchesPinCityFilter(pin, {
        birthCity: filter.birthCity,
        livingCity: filter.livingCity,
        metCity: filter.metCity,
        anyCity: filter.anyCity,
      })
    ) {
      return false;
    }
    if (query) {
      const countryName = (COUNTRY_BY_CODE.get(pin.nationalityCode)?.name ?? '').toLowerCase();
      const haystack = `${pin.name} ${pin.city} ${pin.birthCity ?? ''} ${pin.livingCity ?? ''} ${pin.metCity ?? ''} ${countryName} ${pin.metChannel} ${pin.notes}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    if (filter.sortBy === 'chronological') return comparePinsChronologically(a, b);
    if (filter.sortBy === 'rating') {
      return (
        getPinTenScaleScore(b) - getPinTenScaleScore(a) ||
        b.dateMet.localeCompare(a.dateMet)
      );
    }
    if (filter.sortBy === 'name') return a.name.localeCompare(b.name);
    return b.dateMet.localeCompare(a.dateMet) || b.updatedAt.localeCompare(a.updatedAt);
  });
}
