/**
 * @module domain/models/profile
 * Zod schemas and types for user onboarding, Vault settings, and encrypted local JSON backups.
 */
import { z } from 'zod';
import { EncryptedEnvelopeSchema, StoredPinSchema } from './pin';

/**
 * User profile schema stored locally in Dexie and optionally synced to Supabase.
 */
export const UserProfileSchema = z.object({
  id: z.literal('local-profile').default('local-profile'),
  displayName: z.string().trim().min(1).max(80),
  homeCountry: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  syncPhotos: z.boolean().default(false),
  vaultEnabled: z.boolean().default(false),
  onboardingCompleted: z.boolean().default(false),
  privacyPledgeAccepted: z.boolean().default(false),
  updatedAt: z.string(),
});

/**
 * Consumer profile preferences type.
 */
export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * Onboarding step submission schema.
 */
export const OnboardingInputSchema = z.object({
  displayName: z.string().trim().min(1, 'Display name is required').max(80),
  homeCountry: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Choose a valid home country'),
  privacyPledgeAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Accept the local-first privacy pledge to continue' }),
  }),
  vaultPassphrase: z.string().max(128).optional(),
});

/**
 * Validated onboarding submission payload.
 */
export type OnboardingInput = z.infer<typeof OnboardingInputSchema>;

/**
 * Local UI discreet & Vault lock settings.
 */
export const VaultSettingsSchema = z.object({
  discreetMode: z.boolean().default(false),
  hasPassphraseLock: z.boolean().default(false),
  passphraseHash: z.string().nullable().default(null),
  passphraseSalt: z.string().nullable().default(null),
});

/**
 * Vault & Discreet UI state.
 */
export type VaultSettings = z.infer<typeof VaultSettingsSchema>;

/**
 * Plaintext structure before passphrase-protected backup export encryption.
 */
export const BackupPayloadSchema = z.object({
  exportedAt: z.string(),
  appVersion: z.literal('1.0.0'),
  profile: UserProfileSchema.nullable(),
  pins: z.array(StoredPinSchema),
  photos: z.record(z.string(), z.string()),
});

/**
 * Unencrypted backup payload wrapped inside `EncryptedBackupBundleSchema`.
 */
export type BackupPayload = z.infer<typeof BackupPayloadSchema>;

/**
 * Portable encrypted JSON backup file format for offline-first users.
 */
export const EncryptedBackupBundleSchema = z.object({
  format: z.literal('datedex-encrypted-backup'),
  version: z.literal(1),
  createdAt: z.string(),
  envelope: EncryptedEnvelopeSchema,
});

/**
 * Portable encrypted JSON backup bundle exported to disk.
 */
export type EncryptedBackupBundle = z.infer<typeof EncryptedBackupBundleSchema>;
