/**
 * @module domain/analytics/__tests__/pokedexStats.test
 * Unit tests for HUD stats (official 0–10 rating scale), world coverage,
 * top nationalities, badges, and filtering.
 */
import { describe, expect, it } from 'vitest';
import type { DecryptedPin } from '../../models/pin';
import {
  computeBadges,
  computeHudStats,
  computeTopNationalities,
  computeWorldCoverage,
  filterPins,
  getPinTenScaleScore,
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
    generalVote: 9,
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
  it('computes HUD metrics on the official 0–10 rating scale including Dates2Bed conversion ratio', () => {
    const pins = [
      makePin({ nationalityCode: 'IT', rating: 5, generalVote: 10, intimacyLevel: 'home_run' }),
      makePin({ nationalityCode: 'FR', rating: 4, generalVote: 8, intimacyLevel: 'third_base' }),
      makePin({ nationalityCode: 'IT', rating: 3, generalVote: 6, intimacyLevel: 'none' }),
      makePin({ deletedAt: '2026-10-01T00:00:00.000Z', rating: 1, generalVote: 2 }),
    ];

    const stats = computeHudStats(pins);
    expect(stats.totalDates).toBe(3);
    expect(stats.countriesCount).toBe(2);
    expect(stats.avgRating).toBe(8);
    expect(stats.dates2BedPercent).toBe(66.7);
  });

  it('calculates world coverage, top nationalities on 0–10 scale, and badges', () => {
    const pins = [
      makePin({ nationalityCode: 'FR', city: 'Paris', rating: 5, generalVote: 10, metChannel: 'IRL' }),
      makePin({ nationalityCode: 'FR', city: 'Nice', rating: 4.5, generalVote: 9, metChannel: 'IRL' }),
      makePin({ nationalityCode: 'JP', city: 'Tokyo', rating: 4.5, generalVote: 9, metChannel: 'Travel' }),
      makePin({ nationalityCode: 'BR', city: 'Rio de Janeiro', rating: 4, generalVote: 8, metChannel: 'Hinge' }),
      makePin({ nationalityCode: 'ES', city: 'Madrid', rating: 3, generalVote: 6, metChannel: 'Tinder' }),
    ];

    const coverage = computeWorldCoverage(pins);
    expect(coverage.unlockedCount).toBe(4);
    expect(coverage.totalCountries).toBe(195);
    expect(coverage.percentage).toBe(2.1);

    const top = computeTopNationalities(pins, 2);
    expect(top[0]?.code).toBe('FR');
    expect(top[0]?.count).toBe(2);
    expect(top[0]?.avgRating).toBe(9.5);

    expect(getPinTenScaleScore({ rating: 4.5, generalVote: undefined })).toBe(9);
    expect(getPinTenScaleScore({ rating: 4, generalVote: 7.5 })).toBe(7.5);

    const badges = computeBadges(pins);
    expect(badges.every((b) => b.unlocked)).toBe(true);
  });

  it('filters and sorts Pokédex entries accurately on the 0–10 rating scale', () => {
    const pins = [
      makePin({ name: 'Camille', nationalityCode: 'FR', city: 'Paris', rating: 5, generalVote: 10, dateMet: '2026-10-02' }),
      makePin({ name: 'Elena', nationalityCode: 'ES', city: 'Madrid', rating: 3.5, generalVote: 7, dateMet: '2026-09-01' }),
    ];

    const results = filterPins(pins, {
      searchQuery: 'paris',
      nationalityCode: 'ALL',
      status: 'all',
      channel: 'all',
      minRating: 8,
      sortBy: 'rating',
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Camille');
  });
});
