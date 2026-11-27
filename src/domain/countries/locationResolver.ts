/**
 * @module domain/countries/locationResolver
 * Pure pin coordinate & label resolution hierarchy:
 * (1) Geocodable `birthCity` -> city coordinates & label
 * (2) Fallback to capital of primary nationality (`Main Roots`), then secondary roots
 * (3) Final fallback coordinate if no valid nationality is supplied.
 */
import {
  COUNTRY_BY_CODE,
  GLOBAL_CITIES,
  normalizeGeoText,
  type CityCoordinateEntry,
  type CountryEntry,
} from './countries';

/**
 * Origin of the resolved WGS84 pin coordinates.
 */
export type LocationResolutionSource =
  | 'birth_city'
  | 'primary_nationality_capital'
  | 'secondary_nationality_capital'
  | 'fallback_coordinate';

/**
 * Input parameters for pin coordinate resolution.
 */
export interface PinLocationResolutionInput {
  /** Optional city where the person was born (sets primary pin label and preferred coordinates). */
  birthCity?: string;
  /** Ordered ISO alpha-2 heritage roots (`[mainRoots, secondRoots, thirdRoots, ...]`). */
  nationalities: readonly string[];
  /** Optional fallback coordinate (e.g. map-drop coordinate) used only if no roots match. */
  fallbackCoordinate?: { latitude: number; longitude: number } | null;
}

/**
 * Resolved pin display city label, WGS84 coordinates, and provenance.
 */
export interface ResolvedPinLocation {
  city: string;
  latitude: number;
  longitude: number;
  nationalityCode: string;
  source: LocationResolutionSource;
  capitalCity: string | null;
}

const DEFAULT_FALLBACK_COORDINATE = {
  city: 'Paris',
  nationalityCode: 'FR',
  latitude: 48.8566,
  longitude: 2.3522,
};

/**
 * Attempts offline geocoding of a city name against `GLOBAL_CITIES` (capitals + major hubs),
 * prioritizing entries matching the user's ordered nationality roots when city names collide.
 * @param {string} cityName - Raw city name typed or selected by the user.
 * @param {readonly string[]} [preferredCountries] - Ordered ISO alpha-2 country codes for tie-breaking.
 * @returns {CityCoordinateEntry | null} Matching city coordinate record or null when unknown.
 */
export function geocodeOfflineCity(
  cityName: string,
  preferredCountries: readonly string[] = [],
): CityCoordinateEntry | null {
  const normalized = normalizeGeoText(cityName);
  if (!normalized) return null;

  const preferredOrder = preferredCountries.map((code) => code.trim().toUpperCase());

  // Strip optional ", Country" suffix if user typed e.g. "Milan, Italy"
  const primarySegment = normalized.split(',')[0]?.trim() ?? normalized;

  const exactMatches = GLOBAL_CITIES.filter(
    (entry) => normalizeGeoText(entry.city) === primarySegment,
  );

  if (exactMatches.length === 1) {
    return exactMatches[0] ?? null;
  }

  if (exactMatches.length > 1) {
    for (const code of preferredOrder) {
      const preferred = exactMatches.find((entry) => entry.countryCode === code);
      if (preferred) return preferred;
    }
    return exactMatches[0] ?? null;
  }

  return null;
}

/**
 * Resolves the capital city entry for an ISO alpha-2 country code.
 * @param {string} countryCode - 2-letter ISO alpha-2 code.
 * @returns {CountryEntry | null} Matching country metadata with capital coordinates, or null.
 */
export function getCountryCapital(countryCode: string): CountryEntry | null {
  const normalized = countryCode.trim().toUpperCase();
  return COUNTRY_BY_CODE.get(normalized) ?? null;
}

/**
 * Resolves map pin coordinates and display city label using the Datédex hierarchy:
 * 1. If `birthCity` is provided and geocodable, pin uses that city's coordinates and label.
 * 2. Otherwise fall back to the capital of the primary nationality (`Main Roots`),
 *    then secondary roots (`2nd Roots`, `3rd Roots`, ...) if needed.
 *    If `birthCity` was provided as a non-geocodable label, keep it as the display label
 *    while anchoring coordinates on the nationality capital.
 * @param {PinLocationResolutionInput} input - Birth city and ordered nationality stack.
 * @returns {ResolvedPinLocation} Resolved city label, WGS84 coordinates, and resolution source.
 */
export function resolvePinLocation(input: PinLocationResolutionInput): ResolvedPinLocation {
  const normalizedRoots = input.nationalities
    .map((code) => code.trim().toUpperCase())
    .filter((code) => COUNTRY_BY_CODE.has(code));

  const trimmedBirthCity = (input.birthCity ?? '').trim();
  const primaryCode = (input.nationalities[0] ?? '').trim().toUpperCase();
  const primaryCountry = COUNTRY_BY_CODE.get(primaryCode) ?? null;

  // Step 1: Birth city wins when provided and geocodable
  if (trimmedBirthCity.length > 0) {
    const geocoded = geocodeOfflineCity(trimmedBirthCity, normalizedRoots);
    if (geocoded) {
      return {
        city: geocoded.city,
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
        nationalityCode: primaryCountry?.code ?? normalizedRoots[0] ?? geocoded.countryCode,
        source: 'birth_city',
        capitalCity: primaryCountry?.capital ?? COUNTRY_BY_CODE.get(geocoded.countryCode)?.capital ?? null,
      };
    }
  }

  // Step 2: Primary nationality capital (`Main Roots`) fallback
  if (primaryCountry) {
    return {
      city: trimmedBirthCity || primaryCountry.capital,
      latitude: primaryCountry.capitalLatitude,
      longitude: primaryCountry.capitalLongitude,
      nationalityCode: primaryCountry.code,
      source: 'primary_nationality_capital',
      capitalCity: primaryCountry.capital,
    };
  }

  // Step 3: Secondary roots fallback if primary root was absent or invalid
  for (let i = 1; i < input.nationalities.length; i += 1) {
    const candidateCode = (input.nationalities[i] ?? '').trim().toUpperCase();
    const secondary = COUNTRY_BY_CODE.get(candidateCode);
    if (secondary) {
      return {
        city: trimmedBirthCity || secondary.capital,
        latitude: secondary.capitalLatitude,
        longitude: secondary.capitalLongitude,
        nationalityCode: secondary.code,
        source: 'secondary_nationality_capital',
        capitalCity: secondary.capital,
      };
    }
  }

  // Step 4: Final fallback coordinate
  const fallback = input.fallbackCoordinate;
  return {
    city: trimmedBirthCity || DEFAULT_FALLBACK_COORDINATE.city,
    latitude: fallback?.latitude ?? DEFAULT_FALLBACK_COORDINATE.latitude,
    longitude: fallback?.longitude ?? DEFAULT_FALLBACK_COORDINATE.longitude,
    nationalityCode: DEFAULT_FALLBACK_COORDINATE.nationalityCode,
    source: 'fallback_coordinate',
    capitalCity: DEFAULT_FALLBACK_COORDINATE.city,
  };
}
