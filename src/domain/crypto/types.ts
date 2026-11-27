/**
 * @module domain/crypto/types
 * Pure interface contracts for client-side authenticated encryption.
 */
import type { EncryptedEnvelope, SensitivePinFields } from '../models/pin';
import type { BackupPayload, EncryptedBackupBundle } from '../models/profile';

/**
 * Abstraction over client-side AES-GCM encryption and passphrase verification.
 */
export interface ICryptoService {
  /**
   * Encrypts sensitive pin fields using the local device or vault key.
   * @param {SensitivePinFields} payload - Plaintext sensitive fields.
   * @returns {Promise<EncryptedEnvelope>} Authenticated AES-GCM ciphertext envelope.
   */
  encryptSensitiveFields(payload: SensitivePinFields): Promise<EncryptedEnvelope>;

  /**
   * Decrypts a stored AES-GCM envelope into sensitive pin fields.
   * @param {EncryptedEnvelope} envelope - Stored encrypted envelope.
   * @returns {Promise<SensitivePinFields>} Decrypted sensitive fields.
   */
  decryptSensitiveFields(envelope: EncryptedEnvelope): Promise<SensitivePinFields>;

  /**
   * Derives a salted hash for a local Vault lock passphrase.
   * @param {string} passphrase - User-chosen Vault passphrase.
   * @returns {Promise<{ hash: string; salt: string }>} Base64 hash and salt.
   */
  hashPassphrase(passphrase: string): Promise<{ hash: string; salt: string }>;

  /**
   * Verifies a candidate passphrase against a stored salted hash.
   * @param {string} passphrase - Candidate passphrase.
   * @param {string} hash - Stored base64 PBKDF2 hash.
   * @param {string} salt - Stored base64 salt.
   * @returns {Promise<boolean>} True if the passphrase matches.
   */
  verifyPassphrase(passphrase: string, hash: string, salt: string): Promise<boolean>;

  /**
   * Encrypts an entire local backup payload with a user-supplied backup passphrase.
   * @param {BackupPayload} payload - Plaintext backup payload.
   * @param {string} passphrase - User-supplied backup passphrase.
   * @returns {Promise<EncryptedBackupBundle>} Portable encrypted JSON bundle.
   */
  encryptBackupBundle(payload: BackupPayload, passphrase: string): Promise<EncryptedBackupBundle>;

  /**
   * Decrypts an encrypted backup bundle using the user-supplied passphrase.
   * @param {EncryptedBackupBundle} bundle - Parsed encrypted backup JSON.
   * @param {string} passphrase - Passphrase used during export.
   * @returns {Promise<BackupPayload>} Validated decrypted backup payload.
   */
  decryptBackupBundle(bundle: EncryptedBackupBundle, passphrase: string): Promise<BackupPayload>;
}
