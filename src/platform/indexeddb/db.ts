/**
 * @module platform/indexeddb/db
 * Dexie IndexedDB database definition enabling 100% offline-first storage
 * of encrypted pins, EXIF-stripped local photos, profile settings, and Vault metadata.
 */
import Dexie, { type Table } from 'dexie';
import type { StoredPin } from '../../domain/models/pin';
import type { UserProfile, VaultSettings } from '../../domain/models/profile';

/**
 * Locally cached photo data URL indexed by pin UUID.
 */
export interface LocalPinPhoto {
  pinId: string;
  dataUrl: string;
  updatedAt: string;
}

/**
 * Persisted Vault settings row stored under fixed key `'vault-settings'`.
 */
export interface StoredVaultRow extends VaultSettings {
  id: 'vault-settings';
}

/**
 * Dexie database schema for Datédex offline-first local storage.
 */
export class DatedexDb extends Dexie {
  pins!: Table<StoredPin, string>;
  pinPhotos!: Table<LocalPinPhoto, string>;
  profile!: Table<UserProfile, string>;
  vaultSettings!: Table<StoredVaultRow, string>;

  /**
   * Initializes Dexie stores and indexes.
   * @param {string} [name] - Optional database name (isolated in tests).
   */
  constructor(name: string = 'datedex_local_v1') {
    super(name);
    this.version(1).stores({
      pins: 'id, nationalityCode, dateMet, updatedAt, deletedAt, syncPending',
      pinPhotos: 'pinId, updatedAt',
      profile: 'id',
      vaultSettings: 'id',
    });
  }
}

/**
 * Default browser Dexie instance.
 */
export const datedexDb = new DatedexDb();
