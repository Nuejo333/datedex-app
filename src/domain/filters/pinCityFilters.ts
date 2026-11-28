/**
 * @module domain/filters/pinCityFilters
 * Pure shared city filter predicates, active city filter state models, and facet extractors
 * supporting filtering by (a) city born (`birthCity`), (b) city lived in (`livingCity`),
 * (c) city met (`metCity`), or (d) any of the three (`all`) across both `Pokédex` (`DecryptedPin`)
 * and `Map` (`MapMarker`) without cross-feature imports.
 */
import { normalizeGeoText } from '../countries/countries';

/**
 * Minimal city-bearing pin/marker shape required by city filter predicates.
 */
export interface PinCityFields {
  city?: string;
  birthCity?: string;
  livingCity?: string;
  metCity?: string;
}

/**
 * Selectable city filter dimension shared across `Pokédex` and `Map`.
 */
export type CityFilterDimension = 'all' | 'birthCity' | 'livingCity' | 'metCity';

/**
 * Active UI city filter selection synchronized between `Pokédex` and `Map`.
 */
export interface ActiveCityFilter {
  dimension: CityFilterDimension;
  city: string;
}

/**
 * Default unfiltered city filter state.
 */
export const EMPTY_CITY_FILTER: ActiveCityFilter = {
  dimension: 'all',
  city: '',
};

/**
 * Filter criteria matching connections/markers by birth city, residence city, and met city.
 */
export interface PinCityFilterCriteria {
  /** Filter by city where the person was born (`birthCity`). */
  birthCity?: string;
  /** Filter by city where the person lives (`livingCity`). */
  livingCity?: string;
  /** Filter by city where the encounter happened (`metCity`). */
  metCity?: string;
  /** Filter where any of `birthCity`, `livingCity`, or `metCity` matches. */
  anyCity?: string;
  /** Matching strategy: `'contains'` (default, diacritic/case-insensitive) or `'exact'`. */
  matchMode?: 'contains' | 'exact';
}

/**
 * Unique sorted city options extracted for building Pokédex and Map city filter controls.
 */
export interface PinCityFacets {
  birthCities: string[];
  livingCities: string[];
  metCities: string[];
}

function matchesCityValue(
  candidate: string | undefined,
  query: string | undefined,
  mode: 'contains' | 'exact',
): boolean {
  const normQuery = normalizeGeoText(query ?? '');
  if (!normQuery) return true;
  const normCandidate = normalizeGeoText(candidate ?? '');
  if (!normCandidate) return false;
  return mode === 'exact' ? normCandidate === normQuery : normCandidate.includes(normQuery);
}

/**
 * Converts a UI `ActiveCityFilter` (`dimension` + `city`) into `PinCityFilterCriteria`.
 * @param {ActiveCityFilter} active - Active UI city filter state.
 * @returns {PinCityFilterCriteria} Normalized criteria object.
 */
export function toCityFilterCriteria(active: ActiveCityFilter): PinCityFilterCriteria {
  const trimmed = active.city.trim();
  if (!trimmed) return {};
  if (active.dimension === 'birthCity') return { birthCity: trimmed, matchMode: 'exact' };
  if (active.dimension === 'livingCity') return { livingCity: trimmed, matchMode: 'exact' };
  if (active.dimension === 'metCity') return { metCity: trimmed, matchMode: 'exact' };
  return { anyCity: trimmed, matchMode: 'exact' };
}

/**
 * Evaluates whether a pin or map marker matches the requested birth/living/met city filters.
 * Multiple active city filters combine with logical AND.
 * @param {PinCityFields} item - Pin or map marker carrying city metadata.
 * @param {PinCityFilterCriteria} criteria - Active birth, living, and met city filter values.
 * @returns {boolean} True when the item satisfies every active city filter criterion.
 */
export function matchesPinCityFilter(
  item: PinCityFields,
  criteria: PinCityFilterCriteria,
): boolean {
  const mode = criteria.matchMode ?? 'contains';
  const matchesDimensions =
    matchesCityValue(item.birthCity, criteria.birthCity, mode) &&
    matchesCityValue(item.livingCity, criteria.livingCity, mode) &&
    matchesCityValue(item.metCity, criteria.metCity, mode);

  if (!matchesDimensions) return false;

  const anyQuery = normalizeGeoText(criteria.anyCity ?? '');
  if (!anyQuery) return true;

  return (
    matchesCityValue(item.birthCity, criteria.anyCity, mode) ||
    matchesCityValue(item.livingCity, criteria.anyCity, mode) ||
    matchesCityValue(item.metCity, criteria.anyCity, mode)
  );
}

/**
 * Filters a collection of pins (`Pokédex`) or map markers (`Map`) by birth city,
 * residence city, and/or met city without mutating the input array.
 * @template T
 * @param {readonly T[]} items - Pins or map markers to filter.
 * @param {PinCityFilterCriteria} criteria - Active birth, living, and met city filter values.
 * @returns {T[]} Matching items in original order.
 */
export function filterPinsByCity<T extends PinCityFields>(
  items: readonly T[],
  criteria: PinCityFilterCriteria,
): T[] {
  return items.filter((item) => matchesPinCityFilter(item, criteria));
}

/**
 * Filters pins or map markers using the shared UI `ActiveCityFilter` (`dimension` + `city`).
 * @template T
 * @param {readonly T[]} items - Pins or map markers to filter.
 * @param {ActiveCityFilter} active - Active UI city filter state.
 * @returns {T[]} Matching items.
 */
export function filterByActiveCityFilter<T extends PinCityFields>(
  items: readonly T[],
  active: ActiveCityFilter,
): T[] {
  if (!active.city.trim()) return [...items];
  return filterPinsByCity(items, toCityFilterCriteria(active));
}

/**
 * Extracts deduplicated, alphabetically sorted city lists for birth, living, and met dimensions
 * so both `Pokédex` and `Map` can render city filter selectors cleanly.
 * @template T
 * @param {readonly T[]} items - Active pins or map markers.
 * @returns {PinCityFacets} Distinct sorted city names per dimension.
 */
export function extractPinCityFacets<T extends PinCityFields>(
  items: readonly T[],
): PinCityFacets {
  const birthMap = new Map<string, string>();
  const livingMap = new Map<string, string>();
  const metMap = new Map<string, string>();

  for (const item of items) {
    const birth = (item.birthCity ?? '').trim();
    if (birth) birthMap.set(normalizeGeoText(birth), birth);

    const living = (item.livingCity ?? '').trim();
    if (living) livingMap.set(normalizeGeoText(living), living);

    const met = (item.metCity ?? '').trim();
    if (met) metMap.set(normalizeGeoText(met), met);
  }

  return {
    birthCities: Array.from(birthMap.values()).sort((a, b) => a.localeCompare(b)),
    livingCities: Array.from(livingMap.values()).sort((a, b) => a.localeCompare(b)),
    metCities: Array.from(metMap.values()).sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Returns the deduplicated, alphabetically sorted city values available for a specific
 * `CityFilterDimension` (`'all'` merges birth, living, and met cities).
 * @template T
 * @param {readonly T[]} items - Active pins or map markers.
 * @param {CityFilterDimension} dimension - Selected city dimension.
 * @returns {string[]} Sorted unique city labels for the dropdown.
 */
export function getCityOptionsForDimension<T extends PinCityFields>(
  items: readonly T[],
  dimension: CityFilterDimension,
): string[] {
  const facets = extractPinCityFacets(items);
  if (dimension === 'birthCity') return facets.birthCities;
  if (dimension === 'livingCity') return facets.livingCities;
  if (dimension === 'metCity') return facets.metCities;

  const merged = new Map<string, string>();
  for (const city of [...facets.birthCities, ...facets.livingCities, ...facets.metCities]) {
    merged.set(normalizeGeoText(city), city);
  }
  return Array.from(merged.values()).sort((a, b) => a.localeCompare(b));
}
