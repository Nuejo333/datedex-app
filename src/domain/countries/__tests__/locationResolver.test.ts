/**
 * @module domain/countries/__tests__/locationResolver.test
 * Unit tests verifying country quick-search (name/ISO + continent metadata) and the
 * pin coordinate resolution hierarchy (birth city -> primary nationality capital -> secondary roots).
 */
import { describe, expect, it } from 'vitest';
import { COUNTRY_BY_CODE, getCitiesForCountries, searchCountries } from '../countries';
import { resolvePinLocation } from '../locationResolver';

describe('countries & locationResolver', () => {
  it('searches countries by ISO code or name and exposes flag, continent, and capital metadata', () => {
    const byCode = searchCountries('JP', 5);
    expect(byCode[0]?.code).toBe('JP');
    expect(byCode[0]?.name).toBe('Japan');
    expect(byCode[0]?.continent).toBe('Asia');
    expect(byCode[0]?.capital).toBe('Tokyo');
    expect(byCode[0]?.flag).toBe('🇯🇵');

    const byName = searchCountries('Brazil', 5);
    expect(byName[0]?.code).toBe('BR');
    expect(byName[0]?.continent).toBe('South America');
    expect(byName[0]?.capital).toBe('Brasília');
  });

  it('uses geocodable birthCity coordinates and label when provided', () => {
    const resolved = resolvePinLocation({
      birthCity: 'Milan',
      nationalities: ['IT', 'FR'],
    });

    expect(resolved.source).toBe('birth_city');
    expect(resolved.city).toBe('Milan');
    expect(resolved.nationalityCode).toBe('IT');
    expect(resolved.latitude).toBeCloseTo(45.4642, 3);
    expect(resolved.longitude).toBeCloseTo(9.19, 3);
  });

  it('falls back to primary nationality (Main Roots) capital when birthCity is empty', () => {
    const resolved = resolvePinLocation({
      birthCity: '',
      nationalities: ['IT', 'FR'],
    });

    const italy = COUNTRY_BY_CODE.get('IT');
    expect(resolved.source).toBe('primary_nationality_capital');
    expect(resolved.city).toBe('Rome');
    expect(resolved.nationalityCode).toBe('IT');
    expect(resolved.latitude).toBeCloseTo(italy!.capitalLatitude, 3);
    expect(resolved.longitude).toBeCloseTo(italy!.capitalLongitude, 3);
  });

  it('preserves custom non-geocodable birthCity label while anchoring coordinates on primary capital', () => {
    const resolved = resolvePinLocation({
      birthCity: 'Small Coastal Village',
      nationalities: ['PT'],
    });

    expect(resolved.source).toBe('primary_nationality_capital');
    expect(resolved.city).toBe('Small Coastal Village');
    expect(resolved.capitalCity).toBe('Lisbon');
    expect(resolved.latitude).toBeCloseTo(38.7223, 3);
    expect(resolved.longitude).toBeCloseTo(-9.1393, 3);
  });

  it('falls back to secondary roots capital when primary root is empty or invalid', () => {
    const resolved = resolvePinLocation({
      birthCity: '',
      nationalities: ['', 'ES'],
    });

    expect(resolved.source).toBe('secondary_nationality_capital');
    expect(resolved.city).toBe('Madrid');
    expect(resolved.nationalityCode).toBe('ES');
    expect(resolved.latitude).toBeCloseTo(40.4168, 3);
    expect(resolved.longitude).toBeCloseTo(-3.7038, 3);
  });

  it('resolves smaller towns such as Olbia and Cannigione with accurate coordinates and country/region context', () => {
    const italianCities = getCitiesForCountries(['IT']);
    const olbiaEntry = italianCities.find((c) => c.city === 'Olbia');
    const cannigioneEntry = italianCities.find((c) => c.city === 'Cannigione');

    expect(olbiaEntry).toMatchObject({
      city: 'Olbia',
      countryCode: 'IT',
      region: 'Sardinia',
    });
    expect(cannigioneEntry).toMatchObject({
      city: 'Cannigione',
      countryCode: 'IT',
      region: 'Sardinia',
    });

    const resolvedOlbia = resolvePinLocation({ birthCity: 'Olbia', nationalities: ['IT'] });
    expect(resolvedOlbia.source).toBe('birth_city');
    expect(resolvedOlbia.nationalityCode).toBe('IT');
    expect(resolvedOlbia.region).toBe('Sardinia');
    expect(resolvedOlbia.latitude).toBeCloseTo(40.9236, 3);
    expect(resolvedOlbia.longitude).toBeCloseTo(9.4964, 3);

    const resolvedCannigione = resolvePinLocation({
      birthCity: 'Cannigione',
      nationalities: ['IT'],
    });
    expect(resolvedCannigione.source).toBe('birth_city');
    expect(resolvedCannigione.nationalityCode).toBe('IT');
    expect(resolvedCannigione.region).toBe('Sardinia');
    expect(resolvedCannigione.latitude).toBeCloseTo(41.1086, 3);
    expect(resolvedCannigione.longitude).toBeCloseTo(9.4397, 3);
  });
});
