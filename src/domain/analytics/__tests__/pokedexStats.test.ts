/**
 * @module domain/analytics/__tests__/pokedexStats.test
 * Unit tests for HUD stats, world coverage, top nationalities, rating histogram, badges, and filtering.
 */
import { describe, expect, it } from 'vitest';
import type { DecryptedPin } from '../../models/pin';
import {
  computeBadges,
  computeHudStats,
  computeRatingDistribution,
  computeTopNationalities,
  computeWorldCoverage,
  filterPins,
} from '../pokedexStats';

function makePin(overrides: Partial<DecryptedPin> = {}): DecryptedPin {
  return {
    id: crypto.randomUUID(),
    name: 'Sofia',
    age: 26,
    nationalityCode: 'IT',
    city: 'Milan',
    latitude: 45.4642,
    longitude: 9.19,
    rating: 4.5,
    relationshipStatus: 'dating',
    intimacyLevel: 'kiss',
    metChannel: 'Hinge',
    dateMet: '2026-09-14',
    notes: 'Great espresso',
    vaultLocked: false,
    vaultAlias: '',
    photoDataUrl: null,
    photoStoragePath: null,
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
    deletedAt: null,
    syncPending: true,
    ...overrides,
  };
}

describe('pokedexStats', () => {
  it('computes HUD metrics including Dates2Bed conversion ratio', () => {
    const pins = [
      makePin({ nationalityCode: 'IT', rating: 5, intimacyLevel: 'home_run' }),
      makePin({ nationalityCode: 'FR', rating: 4, intimacyLevel: 'third_base' }),
      makePin({ nationalityCode: 'IT', rating: 3, intimacyLevel: 'none' }),
      makePin({ deletedAt: '2026-10-01T00:00:00.000Z', rating: 1 }),
    ];

    const stats = computeHudStats(pins);
    expect(stats.totalDates).toBe(3);
    expect(stats.countriesCount).toBe(2);
    expect(stats.avgRating).toBe(4);
    expect(stats.dates2BedPercent).toBe(66.7);
  });

  it('calculates world coverage, top nationalities, rating distribution, and badges', () => {
    const pins = [
      makePin({ nationalityCode: 'FR', city: 'Paris', rating: 5, metChannel: 'IRL' }),
      makePin({ nationalityCode: 'FR', city: 'Nice', rating: 4.5, metChannel: 'IRL' }),
      makePin({ nationalityCode: 'JP', city: 'Tokyo', rating: 4.5, metChannel: 'Travel' }),
      makePin({ nationalityCode: 'BR', city: 'Rio de Janeiro', rating: 4, metChannel: 'Hinge' }),
      makePin({ nationalityCode: 'ES', city: 'Madrid', rating: 3, metChannel: 'Tinder' }),
    ];

    const coverage = computeWorldCoverage(pins);
    expect(coverage.unlockedCount).toBe(4);
    expect(coverage.totalCountries).toBe(195);
    expect(coverage.percentage).toBe(2.1);

    const top = computeTopNationalities(pins, 2);
    expect(top[0]?.code).toBe('FR');
    expect(top[0]?.count).toBe(2);

    const dist = computeRatingDistribution(pins);
    expect(dist.find((b) => b.star === 5)?.count).toBe(3);

    const badges = computeBadges(pins);
    expect(badges.every((b) => b.unlocked)).toBe(true);
  });

  it('filters and sorts Pokédex entries accurately', () => {
    const pins = [
      makePin({ name: 'Camille', nationalityCode: 'FR', city: 'Paris', rating: 5, dateMet: '2026-10-02' }),
      makePin({ name: 'Elena', nationalityCode: 'ES', city: 'Madrid', rating: 3.5, dateMet: '2026-09-01' }),
    ];

    const results = filterPins(pins, {
      searchQuery: 'paris',
      nationalityCode: 'ALL',
      status: 'all',
      channel: 'all',
      minRating: 4,
      sortBy: 'rating',
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Camille');
  });
});
