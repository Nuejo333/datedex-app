/**
 * @module platform/supabase/__tests__/sessionCleanup.test
 * Integration tests verifying sign-out local data cleanup, in-memory crypto key
 * clearing, storage cache purging, and account-switching isolation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markInterstitialAdShown } from '../../ads/adProvider';
import { WebCryptoService } from '../../crypto/webCryptoService';
import { DatedexDb } from '../../indexeddb/db';
import { DEFAULT_VAULT_SETTINGS, LocalPinRepository } from '../../indexeddb/pinRepository';
import {
  clearClientUserSessionData,
  getLastAuthenticatedUserId,
  isolateAccountOnSignIn,
  setLastAuthenticatedUserId,
} from '../sessionCleanup';

describe('sessionCleanup & account isolation', () => {
  let db: DatedexDb;
  let cryptoSvc: WebCryptoService;
  let repo: LocalPinRepository;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    db = new DatedexDb(`cleanup_test_${crypto.randomUUID()}`);
    cryptoSvc = new WebCryptoService(() => 'cleanup-test-device-secret-32chars');
    repo = new LocalPinRepository(db, cryptoSvc);
  });

  afterEach(async () => {
    await db.delete();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('clears IndexedDB pins/photos/profile/vault, in-memory crypto keys, and storage caches on logout', async () => {
    await repo.saveProfile({
      id: 'local-profile',
      displayName: 'Account A',
      homeCountry: 'FR',
      syncPhotos: true,
      vaultEnabled: true,
      onboardingCompleted: true,
      privacyPledgeAccepted: true,
      updatedAt: new Date().toISOString(),
    });

    await repo.saveVaultSettings({
      ...DEFAULT_VAULT_SETTINGS,
      discreetMode: true,
      hasPassphraseLock: true,
      passphraseHash: 'hash-a',
      passphraseSalt: 'salt-a',
    });

    await repo.savePin({
      name: 'Camille',
      age: 26,
      nationalityCode: 'FR',
      city: 'Paris',
      latitude: 48.8566,
      longitude: 2.3522,
      rating: 5,
      relationshipStatus: 'dating',
      intimacyLevel: 'third_base',
      metChannel: 'Hinge',
      dateMet: '2026-11-20',
      notes: 'Confidential rooftop notes',
      vaultLocked: true,
      vaultAlias: 'Le Marais',
      photoDataUrl: 'data:image/jpeg;base64,abc123',
    });

    setLastAuthenticatedUserId('user-a-uuid');
    markInterstitialAdShown(Date.now());
    sessionStorage.setItem('datedex.temp.draft', 'secret-draft');

    // Confirm data and in-memory keys exist prior to logout
    expect(await repo.listPins()).toHaveLength(1);
    expect(await repo.getProfile()).not.toBeNull();
    expect(cryptoSvc.hasInMemoryKeys()).toBe(true);
    expect(getLastAuthenticatedUserId()).toBe('user-a-uuid');

    // Execute logout cleanup
    await clearClientUserSessionData(repo);

    // Every local artifact and in-memory crypto key must be wiped
    expect(await repo.listPins()).toHaveLength(0);
    expect(await repo.listRawStoredPins()).toHaveLength(0);
    expect(await repo.getProfile()).toBeNull();
    expect(await repo.getVaultSettings()).toEqual(DEFAULT_VAULT_SETTINGS);
    expect(cryptoSvc.hasInMemoryKeys()).toBe(false);
    expect(getLastAuthenticatedUserId()).toBeNull();
    expect(localStorage.getItem('datedex.interstitial.lastShownMs')).toBeNull();
    expect(sessionStorage.getItem('datedex.temp.draft')).toBeNull();
  });

  it('isolates accounts by wiping previous account data when switching to a different userId', async () => {
    await isolateAccountOnSignIn('user-a', repo);

    await repo.savePin({
      name: 'Account A Date',
      age: 25,
      nationalityCode: 'IT',
      city: 'Milan',
      latitude: 45.4642,
      longitude: 9.19,
      rating: 4.5,
      relationshipStatus: 'first_date',
      intimacyLevel: 'none',
      metChannel: 'IRL',
      dateMet: '2026-11-10',
      notes: 'Account A private note',
      vaultLocked: false,
      vaultAlias: '',
    });

    // Re-entering as same user preserves local data
    const sameUserResult = await isolateAccountOnSignIn('user-a', repo);
    expect(sameUserResult.switchedAccount).toBe(false);
    expect(await repo.listPins()).toHaveLength(1);

    // Switching to Account B immediately wipes Account A's cached data and keys
    const switchResult = await isolateAccountOnSignIn('user-b', repo);
    expect(switchResult.switchedAccount).toBe(true);
    expect(await repo.listPins()).toHaveLength(0);
    expect(await repo.listRawStoredPins()).toHaveLength(0);
    expect(cryptoSvc.hasInMemoryKeys()).toBe(false);
    expect(getLastAuthenticatedUserId()).toBe('user-b');
  });
});
