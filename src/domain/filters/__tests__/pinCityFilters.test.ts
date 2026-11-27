/**
 * @module domain/filters/__tests__/pinCityFilters.test
 * Unit tests verifying birthCity, livingCity, and metCity filter predicates and
 * facet extractors across both Pokédex (`DecryptedPin`) and Map (`MapMarker`) projections.
 */
import { describe, expect, it } from 'vitest';
import { filterPins } from '../../analytics/pokedexStats';
import type { MapMarker } from '../../map/types';
import type { DecryptedPin } from '../../models/pin';
import {
  extractPinCityFacets,
  filterPinsByCity,
  matchesPinCityFilter,
} from '../pinCityFilters';

function makePin(overrides: Partial<DecryptedPin> = {}): DecryptedPin {
  return {
    id: crypto.randomUUID(),
    name: 'Sofia',
    age: 26,
    nationalityCode: 'IT',
    city: 'Milan',
    birthCity: 'Milan',
    livingCity: 'London',
    metCity: 'Lisbon',
    latitude: 45.4642,
    longitude: 9.19,
    rating: 4.5,
    relationshipStatus: 'dating',
    intimacyLevel: 'kiss',
    metChannel: 'Hinge',
    dateMet: '2026-10-12',
    notes: '',
    vaultLocked: false,
    vaultAlias: '',
    photoDataUrl: null,
    photoStoragePath: null,
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
    deletedAt: null,
    syncPending: true,
    ...overrides,
  };
}

describe('pinCityFilters', () => {
  const pins: DecryptedPin[] = [
    makePin({
      name: 'Sofia',
      birthCity: 'Milan',
      livingCity: 'London',
      metCity: 'Lisbon',
    }),
    makePin({
      name: 'Camille',
      nationalityCode: 'FR',
      city: 'Lyon',
      birthCity: 'Lyon',
      livingCity: 'Paris',
      metCity: 'Lisbon',
    }),
    makePin({
      name: 'Valentina',
      nationalityCode: 'CO',
      city: 'Medellín',
      birthCity: 'Medellín',
      livingCity: 'London',
      metCity: 'Madrid',
    }),
  ];

  it('filters DecryptedPin collections independently by birthCity, livingCity, and metCity', () => {
    expect(filterPinsByCity(pins, { birthCity: 'medellin' }).map((p) => p.name)).toEqual([
      'Valentina',
    ]);
    expect(filterPinsByCity(pins, { livingCity: 'London' }).map((p) => p.name)).toEqual([
      'Sofia',
      'Valentina',
    ]);
    expect(filterPinsByCity(pins, { metCity: 'Lisbon' }).map((p) => p.name)).toEqual([
      'Sofia',
      'Camille',
    ]);
    expect(
      filterPinsByCity(pins, { livingCity: 'London', metCity: 'Lisbon' }).map((p) => p.name),
    ).toEqual(['Sofia']);
  });

  it('supports MapMarker city filtering and extracts sorted facets for both Map and Pokédex', () => {
    const markers: MapMarker[] = pins.map((p) => ({
      id: p.id,
      label: p.name,
      city: p.city,
      birthCity: p.birthCity,
      livingCity: p.livingCity,
      metCity: p.metCity,
      nationalityCode: p.nationalityCode,
      latitude: p.latitude,
      longitude: p.longitude,
      rating: p.rating,
      isVaultLocked: p.vaultLocked,
    }));

    expect(filterPinsByCity(markers, { metCity: 'Madrid', matchMode: 'exact' })).toHaveLength(1);
    expect(matchesPinCityFilter(markers[0]!, { birthCity: 'Milan', livingCity: 'London' })).toBe(
      true,
    );

    const facets = extractPinCityFacets(markers);
    expect(facets.birthCities).toEqual(['Lyon', 'Medellín', 'Milan']);
    expect(facets.livingCities).toEqual(['London', 'Paris']);
    expect(facets.metCities).toEqual(['Lisbon', 'Madrid']);
  });

  it('integrates birthCity, livingCity, and metCity criteria inside Pokédex filterPins', () => {
    const results = filterPins(pins, {
      searchQuery: '',
      nationalityCode: 'ALL',
      status: 'all',
      channel: 'all',
      minRating: 1,
      sortBy: 'name',
      livingCity: 'London',
      metCity: 'Madrid',
    });

    expect(results.map((p) => p.name)).toEqual(['Valentina']);
  });
});
