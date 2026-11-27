/**
 * @module domain/models/profile
 * Zod schemas and types for user onboarding, dating preference pronouns,
 * Vault settings, and encrypted local JSON backups.
 */
import { z } from 'zod';
import { EncryptedEnvelopeSchema, StoredPinSchema } from './pin';

/**
 * User dating preference driving dynamic pronouns (`her` / `his` / `their`) in connection UI.
 */
export const DatingPreferenceSchema = z.enum(['women', 'men', 'everyone']);

/**
 * Dating preference union type.
 */
export type DatingPreference = z.infer<typeof DatingPreferenceSchema>;

/**
 * Pronoun bundle derived from the user's dating preference.
 */
export interface DatingPronouns {
  object: 'her' | 'his' | 'their';
  possessive: 'her' | 'his' | 'their';
  subject: 'she' | 'he' | 'they';
}

/**
 * Maps a user's dating preference to localized English pronoun tokens (`her` / `his` / `their`).
 * @param {DatingPreference | null | undefined} preference - User dating preference.
 * @returns {DatingPronouns} Subject, object, and possessive pronouns.
 */
export function getDatingPreferencePronouns(
  preference?: DatingPreference | null,
): DatingPronouns {
  if (preference === 'women') {
    return { subject: 'she', object: 'her', possessive: 'her' };
  }
  if (preference === 'men') {
    return { subject: 'he', object: 'his', possessive: 'his' };
  }
  return { subject: 'they', object: 'their', possessive: 'their' };
}

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
  datingPreference: DatingPreferenceSchema.optional().default('everyone'),
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
 * Input shape accepted when saving a user profile (allows omitting fields with schema defaults).
 */
export type UserProfileInput = z.input<typeof UserProfileSchema>;

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
  datingPreference: DatingPreferenceSchema.optional(),
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
