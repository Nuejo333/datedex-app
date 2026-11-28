/**
 * @module platform/indexeddb/pinRepository
 * Local-first encrypted repository bridging Dexie IndexedDB and Web Crypto AES-GCM,
 * plus encrypted JSON backup export/restore for offline-only users.
 */
import { assignChronologicalNumbers } from '../../domain/analytics/chronology';
import type { ICryptoService } from '../../domain/crypto/types';
import {
  PinInputSchema,
  type DecryptedPin,
  type PinInput,
  type SensitivePinFields,
  type StoredPin,
} from '../../domain/models/pin';
import {
  UserProfileSchema,
  VaultSettingsSchema,
  type BackupPayload,
  type EncryptedBackupBundle,
  type UserProfile,
  type UserProfileInput,
  type VaultSettings,
} from '../../domain/models/profile';
import { datedexDb, type DatedexDb } from './db';
import { webCryptoService } from '../crypto/webCryptoService';

/**
 * Default fallback Vault settings when none are stored yet.
 */
export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  discreetMode: false,
  hasPassphraseLock: false,
  passphraseHash: null,
  passphraseSalt: null,
};

/**
 * Repository managing encrypted pin CRUD, profile settings, Vault lock state,
 * and portable encrypted JSON backups in IndexedDB.
 */
export class LocalPinRepository {
  private readonly db: DatedexDb;
  private readonly crypto: ICryptoService;

  /**
   * Creates a repository backed by the given Dexie DB and crypto service.
   * @param {DatedexDb} [db] - Dexie instance.
   * @param {ICryptoService} [crypto] - AES-GCM encryption service.
   */
  constructor(db: DatedexDb = datedexDb, crypto: ICryptoService = webCryptoService) {
    this.db = db;
    this.crypto = crypto;
  }

  /**
   * Lists and decrypts all non-deleted pins from IndexedDB.
   * @returns {Promise<DecryptedPin[]>} Decrypted pins sorted by most recent dateMet.
   */
  async listPins(): Promise<DecryptedPin[]> {
    const storedRows = await this.db.pins.toArray();
    const activeRows = storedRows.filter((row) => !row.deletedAt);
    const photos = await this.db.pinPhotos.toArray();
    const photoMap = new Map(photos.map((p) => [p.pinId, p.dataUrl]));

    const decrypted: DecryptedPin[] = [];
    for (const row of activeRows) {
      let sensitive: SensitivePinFields = {
        notes: '',
        intimacyLevel: 'none',
        vaultAlias: '',
      };
      try {
        sensitive = await this.crypto.decryptSensitiveFields(row.encryptedSensitive);
      } catch {
        // Preserve record visibility if device key rotated; user can restore backup
        sensitive = {
          notes: '[Encrypted with a different device key]',
          intimacyLevel: 'none',
          vaultAlias: '',
        };
      }

      const nationalities =
        sensitive.nationalities && sensitive.nationalities.length > 0
          ? sensitive.nationalities
          : [row.nationalityCode];

      decrypted.push({
        id: row.id,
        entryNumber: sensitive.entryNumber,
        avatarEmoji: sensitive.avatarEmoji,
        name: row.name,
        age: row.age,
        birthYearOrDob: sensitive.birthYearOrDob ?? '',
        heightCm: sensitive.heightCm ?? '',
        instagramHandle: sensitive.instagramHandle ?? '',
        personalityTags: sensitive.personalityTags ?? [],
        characterVote: sensitive.characterVote,
        mindVote: sensitive.mindVote,
        aestheticVote: sensitive.aestheticVote,
        nationalityCode: row.nationalityCode,
        nationalities,
        city: row.city,
        birthCity: row.birthCity ?? sensitive.birthCity ?? '',
        livingCity: row.livingCity ?? sensitive.livingCity ?? '',
        metCity: row.metCity ?? sensitive.metCity ?? '',
        latitude: row.latitude,
        longitude: row.longitude,
        rating: row.rating,
        relationshipStatus: sensitive.relationshipStatusExact ?? row.relationshipStatus,
        intimacyLevel: sensitive.intimacyLevel,
        metChannel: sensitive.metChannelExact ?? row.metChannel,
        introducedByFriend: sensitive.introducedByFriend ?? '',
        spentCurrency: sensitive.spentCurrency ?? 'EUR',
        spentAmount: sensitive.spentAmount ?? null,
        datesToBed: sensitive.datesToBed ?? null,
        firstIntimateDate: sensitive.firstIntimateDate ?? '',
        hookupCity: sensitive.hookupCity ?? '',
        bedVote: sensitive.bedVote,
        hookupLocations: sensitive.hookupLocations ?? [],
        intimateTags: sensitive.intimateTags ?? [],
        dateMet: row.dateMet,
        notes: sensitive.notes,
        highlights: sensitive.highlights ?? '',
        generalVote: sensitive.generalVote,
        vaultLocked: row.vaultLocked,
        vaultAlias: sensitive.vaultAlias,
        mediaItemIds: sensitive.mediaItemIds ?? [],
        photoDataUrl: photoMap.get(row.id) ?? null,
        photoStoragePath: row.photoStoragePath,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
        syncPending: row.syncPending,
      });
    }

    // Recompute sequential #1..#N profile numbers in deterministic chronological order
    return assignChronologicalNumbers(decrypted);
  }

  /**
   * Returns raw encrypted `StoredPin` rows for cloud sync.
   * @returns {Promise<StoredPin[]>} All encrypted pin rows including tombstones.
   */
  async listRawStoredPins(): Promise<StoredPin[]> {
    return this.db.pins.toArray();
  }

  /**
   * Validates, encrypts sensitive fields, and upserts a pin into IndexedDB.
   * @param {PinInput} input - User-supplied pin form/import input.
   * @returns {Promise<DecryptedPin>} Saved decrypted pin.
   * @throws {Error} When Zod validation fails.
   */
  async savePin(input: PinInput): Promise<DecryptedPin> {
    const parsed = PinInputSchema.parse(input);
    const now = new Date().toISOString();
    const id = parsed.id ?? globalThis.crypto.randomUUID();
    const existing = await this.db.pins.get(id);

    const nationalities =
      parsed.nationalities && parsed.nationalities.length > 0
        ? Array.from(new Set([parsed.nationalityCode, ...parsed.nationalities]))
        : [parsed.nationalityCode];

    const sensitivePayload: SensitivePinFields = {
      notes: parsed.notes,
      intimacyLevel: parsed.intimacyLevel,
      vaultAlias: parsed.vaultAlias,
      avatarEmoji: parsed.avatarEmoji,
      entryNumber: parsed.entryNumber,
      birthYearOrDob: parsed.birthYearOrDob,
      heightCm: parsed.heightCm,
      instagramHandle: parsed.instagramHandle,
      personalityTags: parsed.personalityTags,
      characterVote: parsed.characterVote,
      mindVote: parsed.mindVote,
      aestheticVote: parsed.aestheticVote,
      nationalities,
      birthCity: parsed.birthCity,
      livingCity: parsed.livingCity,
      metCity: parsed.metCity,
      metChannelExact: parsed.metChannel,
      relationshipStatusExact: parsed.relationshipStatus,
      introducedByFriend: parsed.introducedByFriend,
      spentCurrency: parsed.spentCurrency,
      spentAmount: parsed.spentAmount,
      datesToBed: parsed.datesToBed,
      firstIntimateDate: parsed.firstIntimateDate,
      hookupCity: parsed.hookupCity,
      bedVote: parsed.bedVote,
      hookupLocations: parsed.hookupLocations,
      intimateTags: parsed.intimateTags,
      highlights: parsed.highlights,
      generalVote: parsed.generalVote,
      mediaItemIds: parsed.mediaItemIds,
    };

    const encryptedSensitive = await this.crypto.encryptSensitiveFields(sensitivePayload);

    const stored: StoredPin = {
      id,
      name: parsed.name,
      age: parsed.age ?? null,
      nationalityCode: parsed.nationalityCode,
      city: parsed.city,
      birthCity: parsed.birthCity,
      livingCity: parsed.livingCity,
      metCity: parsed.metCity,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      rating: parsed.rating,
      relationshipStatus: parsed.relationshipStatus,
      metChannel: parsed.metChannel,
      dateMet: parsed.dateMet,
      vaultLocked: parsed.vaultLocked,
      photoStoragePath: parsed.photoStoragePath ?? existing?.photoStoragePath ?? null,
      encryptedSensitive,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
      syncPending: true,
    };

    await this.db.pins.put(stored);

    if (parsed.photoDataUrl === null) {
      await this.db.pinPhotos.delete(id);
    } else if (typeof parsed.photoDataUrl === 'string' && parsed.photoDataUrl.length > 0) {
      await this.db.pinPhotos.put({
        pinId: id,
        dataUrl: parsed.photoDataUrl,
        updatedAt: now,
      });
    }

    const currentPhoto = await this.db.pinPhotos.get(id);

    return {
      id: stored.id,
      entryNumber: parsed.entryNumber,
      avatarEmoji: parsed.avatarEmoji,
      name: stored.name,
      age: stored.age,
      birthYearOrDob: parsed.birthYearOrDob,
      heightCm: parsed.heightCm,
      instagramHandle: parsed.instagramHandle,
      personalityTags: parsed.personalityTags,
      characterVote: parsed.characterVote,
      mindVote: parsed.mindVote,
      aestheticVote: parsed.aestheticVote,
      nationalityCode: stored.nationalityCode,
      nationalities,
      city: stored.city,
      birthCity: parsed.birthCity,
      livingCity: parsed.livingCity,
      metCity: parsed.metCity,
      latitude: stored.latitude,
      longitude: stored.longitude,
      rating: stored.rating,
      relationshipStatus: stored.relationshipStatus,
      intimacyLevel: parsed.intimacyLevel,
      metChannel: stored.metChannel,
      introducedByFriend: parsed.introducedByFriend,
      spentCurrency: parsed.spentCurrency,
      spentAmount: parsed.spentAmount,
      datesToBed: parsed.datesToBed,
      firstIntimateDate: parsed.firstIntimateDate,
      hookupCity: parsed.hookupCity,
      bedVote: parsed.bedVote,
      hookupLocations: parsed.hookupLocations,
      intimateTags: parsed.intimateTags,
      dateMet: stored.dateMet,
      notes: parsed.notes,
      highlights: parsed.highlights,
      generalVote: parsed.generalVote,
      vaultLocked: stored.vaultLocked,
      vaultAlias: parsed.vaultAlias,
      mediaItemIds: parsed.mediaItemIds,
      photoDataUrl: currentPhoto?.dataUrl ?? null,
      photoStoragePath: stored.photoStoragePath,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      deletedAt: stored.deletedAt,
      syncPending: stored.syncPending,
    };
  }

  /**
   * Soft-deletes a pin locally (preserves tombstone for cloud sync) and removes local media items.
   * @param {string} pinId - Pin UUID to delete.
   * @returns {Promise<void>}
   */
  async deletePin(pinId: string): Promise<void> {
    const existing = await this.db.pins.get(pinId);
    if (!existing) return;
    await this.db.pins.put({
      ...existing,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncPending: true,
    });
    await this.db.pinPhotos.delete(pinId);
    await this.db.localMedia.where('pinId').equals(pinId).delete();
  }

  /**
   * Merges encrypted pins pulled from Supabase into Dexie using latest `updatedAt` wins.
   * @param {StoredPin[]} remotePins - Encrypted pin rows from Postgres.
   * @returns {Promise<void>}
   */
  async mergeRemotePins(remotePins: StoredPin[]): Promise<void> {
    for (const remote of remotePins) {
      const local = await this.db.pins.get(remote.id);
      if (!local || remote.updatedAt > local.updatedAt) {
        await this.db.pins.put({ ...remote, syncPending: false });
      }
    }
  }

  /**
   * Marks local pins as synced after successful Postgres upsert.
   * @param {string[]} pinIds - Synced pin UUIDs.
   * @returns {Promise<void>}
   */
  async markPinsSynced(pinIds: string[]): Promise<void> {
    await this.db.transaction('rw', this.db.pins, async () => {
      for (const id of pinIds) {
        const row = await this.db.pins.get(id);
        if (row) {
          await this.db.pins.put({ ...row, syncPending: false });
        }
      }
    });
  }

  /**
   * Reads the local user profile if onboarding has started/completed.
   * @returns {Promise<UserProfile | null>} Local profile or null.
   */
  async getProfile(): Promise<UserProfile | null> {
    const row = await this.db.profile.get('local-profile');
    return row ?? null;
  }

  /**
   * Saves the local user profile in Dexie.
   * @param {UserProfileInput} profile - Profile fields to persist.
   * @returns {Promise<UserProfile>} Validated saved profile.
   */
  async saveProfile(profile: UserProfileInput): Promise<UserProfile> {
    const validated = UserProfileSchema.parse(profile);
    await this.db.profile.put(validated);
    return validated;
  }

  /**
   * Reads Vault / Discreet settings from Dexie.
   * @returns {Promise<VaultSettings>} Stored or default Vault settings.
   */
  async getVaultSettings(): Promise<VaultSettings> {
    const row = await this.db.vaultSettings.get('vault-settings');
    if (!row) return { ...DEFAULT_VAULT_SETTINGS };
    return VaultSettingsSchema.parse(row);
  }

  /**
   * Persists updated Vault / Discreet settings to Dexie.
   * @param {VaultSettings} settings - Updated Vault settings.
   * @returns {Promise<VaultSettings>} Validated saved settings.
   */
  async saveVaultSettings(settings: VaultSettings): Promise<VaultSettings> {
    const validated = VaultSettingsSchema.parse(settings);
    await this.db.vaultSettings.put({
      ...validated,
      id: 'vault-settings',
    });
    return validated;
  }

  /**
   * Exports all local pins, photos, and profile into a passphrase-encrypted JSON bundle.
   * @param {string} passphrase - User-chosen backup passphrase (min 6 chars).
   * @returns {Promise<EncryptedBackupBundle>} Encrypted portable backup bundle.
   * @throws {Error} When passphrase validation fails.
   */
  async exportEncryptedBackup(passphrase: string): Promise<EncryptedBackupBundle> {
    const [profile, pins, photoRows] = await Promise.all([
      this.getProfile(),
      this.db.pins.toArray(),
      this.db.pinPhotos.toArray(),
    ]);

    const photos: Record<string, string> = {};
    for (const item of photoRows) {
      photos[item.pinId] = item.dataUrl;
    }

    const payload: BackupPayload = {
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      profile,
      pins,
      photos,
    };

    return this.crypto.encryptBackupBundle(payload, passphrase);
  }

  /**
   * Decrypts an encrypted JSON backup bundle and restores its pins, photos, and profile.
   * @param {EncryptedBackupBundle} bundle - Parsed backup JSON file.
   * @param {string} passphrase - Backup passphrase entered by the user.
   * @returns {Promise<{ restoredPins: number }>} Count of restored pins.
   * @throws {Error} When passphrase is incorrect or bundle format is invalid.
   */
  async restoreEncryptedBackup(
    bundle: EncryptedBackupBundle,
    passphrase: string,
  ): Promise<{ restoredPins: number }> {
    const payload = await this.crypto.decryptBackupBundle(bundle, passphrase);

    await this.db.transaction(
      'rw',
      this.db.pins,
      this.db.pinPhotos,
      this.db.profile,
      async () => {
        if (payload.profile) {
          await this.db.profile.put(payload.profile);
        }
        if (payload.pins.length > 0) {
          await this.db.pins.bulkPut(payload.pins);
        }
        const photoEntries = Object.entries(payload.photos).map(([pinId, dataUrl]) => ({
          pinId,
          dataUrl,
          updatedAt: new Date().toISOString(),
        }));
        if (photoEntries.length > 0) {
          await this.db.pinPhotos.bulkPut(photoEntries);
        }
      },
    );

    return { restoredPins: payload.pins.filter((p) => !p.deletedAt).length };
  }

  /**
   * Atomically wipes all user-specific IndexedDB tables (`pins`, `pinPhotos`, `localMedia`,
   * `profile`, `vaultSettings`) and clears any cached encryption keys in memory.
   * Invoked on sign-out and account switch so a previous account's dates never remain visible.
   * @returns {Promise<void>}
   */
  async clearUserData(): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.pins,
      this.db.pinPhotos,
      this.db.localMedia,
      this.db.profile,
      this.db.vaultSettings,
      async () => {
        await Promise.all([
          this.db.pins.clear(),
          this.db.pinPhotos.clear(),
          this.db.localMedia.clear(),
          this.db.profile.clear(),
          this.db.vaultSettings.clear(),
        ]);
      },
    );
    this.crypto.clearInMemoryKeys();
  }
}

/**
 * Shared singleton local pin repository.
 */
export const localPinRepository = new LocalPinRepository();
