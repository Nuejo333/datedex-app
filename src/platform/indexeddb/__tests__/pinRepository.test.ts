/**
 * @module platform/indexeddb/__tests__/pinRepository.test
 * Integration tests for local-first Dexie persistence, encrypted storage,
 * and encrypted JSON backup export/restore round-trip.
 */
import { describe, expect, it } from 'vitest';
import { WebCryptoService } from '../../crypto/webCryptoService';
import { DatedexDb } from '../db';
import { LocalPinRepository } from '../pinRepository';

describe('LocalPinRepository', () => {
  it('encrypts sensitive fields at rest in Dexie and supports encrypted backup restore', async () => {
    const db1 = new DatedexDb(`test_db_${crypto.randomUUID()}`);
    const cryptoSvc = new WebCryptoService(() => 'repo-test-secret-key-001');
    const repo1 = new LocalPinRepository(db1, cryptoSvc);

    const saved = await repo1.savePin({
      name: 'Elena',
      age: 27,
      nationalityCode: 'ES',
      city: 'Barcelona',
      latitude: 41.3874,
      longitude: 2.1686,
      rating: 4.5,
      relationshipStatus: 'dating',
      intimacyLevel: 'third_base',
      metChannel: 'Hinge',
      dateMet: '2026-10-05',
      notes: 'Tapas in El Born',
      vaultLocked: false,
      vaultAlias: '',
    });

    const rawRows = await repo1.listRawStoredPins();
    expect(rawRows).toHaveLength(1);
    expect(rawRows[0]?.encryptedSensitive.ciphertext).not.toContain('Tapas in El Born');

    const loaded = await repo1.listPins();
    expect(loaded[0]?.id).toBe(saved.id);
    expect(loaded[0]?.notes).toBe('Tapas in El Born');
    expect(loaded[0]?.intimacyLevel).toBe('third_base');

    // Export and restore into a brand new Dexie DB
    const bundle = await repo1.exportEncryptedBackup('strong-passphrase');
    const db2 = new DatedexDb(`test_db_${crypto.randomUUID()}`);
    const repo2 = new LocalPinRepository(db2, cryptoSvc);
    const restored = await repo2.restoreEncryptedBackup(bundle, 'strong-passphrase');

    expect(restored.restoredPins).toBe(1);
    const reloaded = await repo2.listPins();
    expect(reloaded[0]?.name).toBe('Elena');
    expect(reloaded[0]?.notes).toBe('Tapas in El Born');

    await db1.delete();
    await db2.delete();
  });
});
