/**
 * @module domain/vault/masking
 * Pure discreet-mode masking transformers that redact sensitive names,
 * cities, notes, and intimacy ratios without mutating persisted data.
 */
import type { DecryptedPin } from '../models/pin';

/**
 * Masked representation of a pin when Vault / Discreet mode is active.
 */
export interface DisplayPin {
  id: string;
  displayName: string;
  displayCity: string;
  displayNotes: string;
  displayIntimacy: string;
  displayPhotoUrl: string | null;
  isMasked: boolean;
  pin: DecryptedPin;
}

/**
 * Transforms a decrypted pin for display, redacting PII and intimacy data in Discreet mode.
 * @param {DecryptedPin} pin - Decrypted pin record.
 * @param {boolean} discreetMode - Whether Vault / Discreet mode is currently active.
 * @returns {DisplayPin} Safe display projection.
 */
export function maskPinForDiscreet(pin: DecryptedPin, discreetMode: boolean): DisplayPin {
  const shouldMask = discreetMode || pin.vaultLocked;
  if (!shouldMask) {
    return {
      id: pin.id,
      displayName: pin.name,
      displayCity: pin.city,
      displayNotes: pin.notes,
      displayIntimacy: pin.intimacyLevel,
      displayPhotoUrl: pin.photoDataUrl,
      isMasked: false,
      pin,
    };
  }

  const codename = pin.vaultAlias.trim()
    ? pin.vaultAlias.trim()
    : `Entry #${pin.id.slice(0, 4).toUpperCase()}`;

  return {
    id: pin.id,
    displayName: codename,
    displayCity: discreetMode ? 'Private Location' : pin.city,
    displayNotes: 'Encrypted in Vault — unlock discreet mode to view.',
    displayIntimacy: 'Private',
    displayPhotoUrl: null,
    isMasked: true,
    pin,
  };
}

/**
 * Masks sensitive Dates2Bed conversion stat when Vault / Discreet mode is active.
 * @param {number} dates2BedPercent - Calculated Dates2Bed conversion percentage (0-100).
 * @param {boolean} discreetMode - Whether Vault / Discreet mode is active.
 * @returns {string} Display string for the HUD.
 */
export function formatHudDates2Bed(dates2BedPercent: number, discreetMode: boolean): string {
  if (discreetMode) return '•••';
  return `${dates2BedPercent.toFixed(0)}%`;
}
