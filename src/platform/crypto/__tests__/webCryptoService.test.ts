/**
 * @module platform/crypto/__tests__/webCryptoService.test
 * Integration tests verifying Web Crypto AES-GCM encryption round-trips,
 * PBKDF2 passphrase hashing, and encrypted JSON backup export/restore.
 */
import { describe, expect, it } from 'vitest';
import { WebCryptoService } from '../webCryptoService';

describe('WebCryptoService', () => {
  it('encrypts and decrypts sensitive pin fields via AES-GCM', async () => {
    const cryptoSvc = new WebCryptoService(() => 'test-device-secret-32-chars-minimum');
    const envelope = await cryptoSvc.encryptSensitiveFields({
      notes: 'Secret rooftop conversation in Lisbon',
      intimacyLevel: 'third_base',
      vaultAlias: 'Tagus Sunset',
    });

    expect(envelope.version).toBe(1);
    expect(envelope.ciphertext).not.toContain('Lisbon');

    const decrypted = await cryptoSvc.decryptSensitiveFields(envelope);
    expect(decrypted.notes).toBe('Secret rooftop conversation in Lisbon');
    expect(decrypted.intimacyLevel).toBe('third_base');
    expect(decrypted.vaultAlias).toBe('Tagus Sunset');
  });

  it('verifies Vault passphrases and rejects wrong passphrases on encrypted backups', async () => {
    const cryptoSvc = new WebCryptoService(() => 'test-device-secret');
    const { hash, salt } = await cryptoSvc.hashPassphrase('my-vault-pin');
    expect(await cryptoSvc.verifyPassphrase('my-vault-pin', hash, salt)).toBe(true);
    expect(await cryptoSvc.verifyPassphrase('wrong-pin', hash, salt)).toBe(false);

    const bundle = await cryptoSvc.encryptBackupBundle(
      {
        exportedAt: new Date().toISOString(),
        appVersion: '1.0.0',
        profile: null,
        pins: [],
        photos: {},
      },
      'backup-pass-123',
    );

    const restored = await cryptoSvc.decryptBackupBundle(bundle, 'backup-pass-123');
    expect(restored.appVersion).toBe('1.0.0');

    await expect(cryptoSvc.decryptBackupBundle(bundle, 'wrong-passphrase')).rejects.toThrow();
  });
});
