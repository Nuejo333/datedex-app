/**
 * @module domain/vault/__tests__/masking.test
 * Unit tests for Vault / Discreet mode masking and HUD redaction.
 */
import { describe, expect, it } from 'vitest';
import type { DecryptedPin } from '../../models/pin';
import { formatHudDates2Bed, maskPinForDiscreet } from '../masking';

const samplePin: DecryptedPin = {
  id: '12345678-1234-1234-1234-1234567890ab',
  name: 'Camille',
  age: 25,
  nationalityCode: 'FR',
  city: 'Paris',
  latitude: 48.8566,
  longitude: 2.3522,
  rating: 5,
  relationshipStatus: 'dating',
  intimacyLevel: 'home_run',
  metChannel: 'IRL',
  dateMet: '2026-10-01',
  notes: 'Private wine bar note',
  vaultLocked: false,
  vaultAlias: 'Le Marais Vinyl',
  photoDataUrl: 'data:image/webp;base64,AAAA',
  photoStoragePath: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  deletedAt: null,
  syncPending: false,
};

describe('vault discreet masking', () => {
  it('masks names, notes, photos, and intimacy when discreet mode is active', () => {
    const masked = maskPinForDiscreet(samplePin, true);
    expect(masked.isMasked).toBe(true);
    expect(masked.displayName).toBe('Le Marais Vinyl');
    expect(masked.displayCity).toBe('Private Location');
    expect(masked.displayPhotoUrl).toBeNull();
    expect(masked.displayNotes).not.toContain('Private wine bar note');
    expect(formatHudDates2Bed(64.5, true)).toBe('•••');
  });

  it('reveals full details when discreet mode is off and pin is unlocked', () => {
    const visible = maskPinForDiscreet(samplePin, false);
    expect(visible.isMasked).toBe(false);
    expect(visible.displayName).toBe('Camille');
    expect(visible.displayPhotoUrl).toBe('data:image/webp;base64,AAAA');
    expect(formatHudDates2Bed(64.5, false)).toBe('65%');
  });
});
