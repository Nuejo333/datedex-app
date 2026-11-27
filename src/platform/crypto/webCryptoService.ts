/**
 * @module platform/crypto/webCryptoService
 * Web Crypto API (AES-GCM-256 + PBKDF2-SHA256) client-side encryption adapter.
 * Sensitive fields and local JSON backups are encrypted before persisting to IndexedDB
 * or syncing to Supabase Postgres.
 */
import type { ICryptoService } from '../../domain/crypto/types';
import {
  EncryptedEnvelopeSchema,
  SensitivePinFieldsSchema,
  type EncryptedEnvelope,
  type SensitivePinFields,
} from '../../domain/models/pin';
import {
  BackupPayloadSchema,
  EncryptedBackupBundleSchema,
  type BackupPayload,
  type EncryptedBackupBundle,
} from '../../domain/models/profile';

const LOCAL_MASTER_KEY_STORAGE = 'datedex.device.master.v1';
const PBKDF2_ITERATIONS = 100_000;

function getSubtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment');
  }
  return cryptoObj.subtle;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKeyFromSecret(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function getOrCreateDeviceSecret(): string {
  try {
    const existing = globalThis.localStorage?.getItem(LOCAL_MASTER_KEY_STORAGE);
    if (existing && existing.length >= 32) {
      return existing;
    }
    const randomBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(randomBytes);
    const created = toBase64(randomBytes);
    globalThis.localStorage?.setItem(LOCAL_MASTER_KEY_STORAGE, created);
    return created;
  } catch {
    return 'datedex-ephemeral-session-key-fallback';
  }
}

/**
 * Web Crypto implementation of `ICryptoService` using AES-256-GCM and PBKDF2-SHA256.
 */
export class WebCryptoService implements ICryptoService {
  private readonly deviceSecretProvider: () => string;

  /**
   * Constructs a `WebCryptoService` instance.
   * @param {() => string} [deviceSecretProvider] - Optional secret provider for deterministic tests.
   */
  constructor(deviceSecretProvider: () => string = getOrCreateDeviceSecret) {
    this.deviceSecretProvider = deviceSecretProvider;
  }

  /**
   * Encrypts an arbitrary JSON-serializable object with a passphrase or device secret.
   * @param {unknown} value - JSON-serializable payload.
   * @param {string} secret - Passphrase or device secret string.
   * @returns {Promise<EncryptedEnvelope>} Authenticated AES-GCM ciphertext envelope.
   */
  async encryptWithSecret(value: unknown, secret: string): Promise<EncryptedEnvelope> {
    const subtle = getSubtle();
    const salt = new Uint8Array(new ArrayBuffer(16));
    const iv = new Uint8Array(new ArrayBuffer(12));
    globalThis.crypto.getRandomValues(salt);
    globalThis.crypto.getRandomValues(iv);

    const key = await deriveAesKeyFromSecret(secret, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const cipherBuffer = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

    return {
      version: 1,
      iv: toBase64(iv),
      salt: toBase64(salt),
      ciphertext: toBase64(new Uint8Array(cipherBuffer)),
    };
  }

  /**
   * Decrypts an `EncryptedEnvelope` with the provided secret.
   * @param {EncryptedEnvelope} envelope - Stored encrypted envelope.
   * @param {string} secret - Passphrase or device secret used during encryption.
   * @returns {Promise<unknown>} Parsed JSON payload.
   * @throws {Error} When ciphertext authentication fails or envelope is malformed.
   */
  async decryptWithSecret(envelope: EncryptedEnvelope, secret: string): Promise<unknown> {
    const parsedEnvelope = EncryptedEnvelopeSchema.parse(envelope);
    const subtle = getSubtle();
    const salt = fromBase64(parsedEnvelope.salt);
    const iv = fromBase64(parsedEnvelope.iv);
    const cipherBytes = fromBase64(parsedEnvelope.ciphertext);

    const key = await deriveAesKeyFromSecret(secret, salt);
    const plainBuffer = await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
    const jsonText = new TextDecoder().decode(plainBuffer);
    return JSON.parse(jsonText) as unknown;
  }

  /**
   * Encrypts sensitive pin fields (`notes`, `intimacyLevel`, `vaultAlias`) with the device key.
   * @param {SensitivePinFields} payload - Sensitive pin fields.
   * @returns {Promise<EncryptedEnvelope>} AES-GCM envelope.
   */
  async encryptSensitiveFields(payload: SensitivePinFields): Promise<EncryptedEnvelope> {
    const validated = SensitivePinFieldsSchema.parse(payload);
    return this.encryptWithSecret(validated, this.deviceSecretProvider());
  }

  /**
   * Decrypts sensitive pin fields from an AES-GCM envelope.
   * @param {EncryptedEnvelope} envelope - Encrypted envelope.
   * @returns {Promise<SensitivePinFields>} Validated decrypted sensitive fields.
   * @throws {Error} When decryption fails on an invalid key or tampered payload.
   */
  async decryptSensitiveFields(envelope: EncryptedEnvelope): Promise<SensitivePinFields> {
    const raw = await this.decryptWithSecret(envelope, this.deviceSecretProvider());
    return SensitivePinFieldsSchema.parse(raw);
  }

  /**
   * Derives a salted PBKDF2-SHA256 verifier hash for a local Vault passphrase.
   * @param {string} passphrase - User-chosen Vault passphrase.
   * @returns {Promise<{ hash: string; salt: string }>} Base64 hash and salt.
   */
  async hashPassphrase(passphrase: string): Promise<{ hash: string; salt: string }> {
    const subtle = getSubtle();
    const salt = new Uint8Array(new ArrayBuffer(16));
    globalThis.crypto.getRandomValues(salt);

    const keyMaterial = await subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveBits'],
    );

    const bits = await subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      256,
    );

    return {
      hash: toBase64(new Uint8Array(bits)),
      salt: toBase64(salt),
    };
  }

  /**
   * Verifies a candidate Vault passphrase against a stored salted PBKDF2 hash.
   * @param {string} passphrase - Candidate passphrase input.
   * @param {string} hash - Stored base64 hash.
   * @param {string} salt - Stored base64 salt.
   * @returns {Promise<boolean>} True if constant-time equality matches.
   */
  async verifyPassphrase(passphrase: string, hash: string, salt: string): Promise<boolean> {
    const subtle = getSubtle();
    const saltBytes = fromBase64(salt);
    const keyMaterial = await subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveBits'],
    );
    const bits = await subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      256,
    );
    const candidate = toBase64(new Uint8Array(bits));
    if (candidate.length !== hash.length) return false;
    let diff = 0;
    for (let i = 0; i < candidate.length; i += 1) {
      diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
    }
    return diff === 0;
  }

  /**
   * Encrypts an entire local backup payload into a portable encrypted JSON bundle.
   * @param {BackupPayload} payload - Plaintext backup payload.
   * @param {string} passphrase - User-supplied backup passphrase.
   * @returns {Promise<EncryptedBackupBundle>} Encrypted backup bundle.
   * @throws {Error} When passphrase is shorter than 6 characters.
   */
  async encryptBackupBundle(
    payload: BackupPayload,
    passphrase: string,
  ): Promise<EncryptedBackupBundle> {
    if (passphrase.trim().length < 6) {
      throw new Error('Backup passphrase must be at least 6 characters');
    }
    const validPayload = BackupPayloadSchema.parse(payload);
    const envelope = await this.encryptWithSecret(validPayload, passphrase);
    return {
      format: 'datedex-encrypted-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      envelope,
    };
  }

  /**
   * Decrypts and validates a portable encrypted JSON backup bundle.
   * @param {EncryptedBackupBundle} bundle - Parsed backup JSON file.
   * @param {string} passphrase - User-supplied backup passphrase.
   * @returns {Promise<BackupPayload>} Validated decrypted backup payload.
   * @throws {Error} When passphrase is wrong or bundle format is invalid.
   */
  async decryptBackupBundle(
    bundle: EncryptedBackupBundle,
    passphrase: string,
  ): Promise<BackupPayload> {
    const parsedBundle = EncryptedBackupBundleSchema.parse(bundle);
    const raw = await this.decryptWithSecret(parsedBundle.envelope, passphrase);
    return BackupPayloadSchema.parse(raw);
  }
}

/**
 * Shared singleton Web Crypto service used by the IndexedDB repository and Vault UI.
 */
export const webCryptoService = new WebCryptoService();
