/**
 * @module domain/models/pin
 * Pure TypeScript domain models and Zod validation schemas for Datédex pins,
 * encrypted sensitive envelopes, and rating display helpers.
 */
import { z } from 'zod';

/**
 * Valid relationship status stages for a logged connection.
 */
export const RelationshipStatusSchema = z.enum([
  'talking',
  'first_date',
  'dating',
  'situationship',
  'exclusive',
  'archived',
]);

/**
 * Relationship stage union type.
 */
export type RelationshipStatus = z.infer<typeof RelationshipStatusSchema>;

/**
 * Valid intimacy progression levels (encrypted client-side before persistence).
 */
export const IntimacyLevelSchema = z.enum([
  'none',
  'kiss',
  'second_base',
  'third_base',
  'home_run',
]);

/**
 * Intimacy progression level union type.
 */
export type IntimacyLevel = z.infer<typeof IntimacyLevelSchema>;

/**
 * Valid acquisition/meeting channels for a connection.
 */
export const MetChannelSchema = z.enum([
  'Tinder',
  'Hinge',
  'Bumble',
  'Instagram',
  'IRL',
  'Friends',
  'Travel',
  'Other',
]);

/**
 * Meeting channel union type.
 */
export type MetChannel = z.infer<typeof MetChannelSchema>;

/**
 * Authenticated AES-GCM ciphertext envelope stored locally and synced to Supabase.
 */
export const EncryptedEnvelopeSchema = z.object({
  version: z.literal(1),
  iv: z.string().min(12),
  salt: z.string().min(12),
  ciphertext: z.string().min(1),
});

/**
 * Client-side AES-GCM encrypted payload envelope.
 */
export type EncryptedEnvelope = z.infer<typeof EncryptedEnvelopeSchema>;

/**
 * Sensitive fields encrypted via Web Crypto AES-GCM prior to IndexedDB or Postgres storage.
 */
export const SensitivePinFieldsSchema = z.object({
  notes: z.string().max(4000).default(''),
  intimacyLevel: IntimacyLevelSchema.default('none'),
  vaultAlias: z.string().max(80).default(''),
});

/**
 * Decrypted sensitive fields attached to a pin in memory.
 */
export type SensitivePinFields = z.infer<typeof SensitivePinFieldsSchema>;

/**
 * User-supplied pin form/import input schema before encryption.
 */
export const PinInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name max 80 characters'),
  age: z
    .number()
    .int()
    .min(18, 'Age must be 18 or older')
    .max(120, 'Age must be 120 or under')
    .nullable()
    .optional(),
  nationalityCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a 2-letter ISO country code'),
  city: z.string().trim().min(1, 'City is required').max(120, 'City max 120 characters'),
  latitude: z
    .number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  longitude: z
    .number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  rating: z.number().min(1, 'Rating min 1.0').max(5, 'Rating max 5.0'),
  relationshipStatus: RelationshipStatusSchema,
  intimacyLevel: IntimacyLevelSchema,
  metChannel: MetChannelSchema,
  dateMet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format'),
  notes: z.string().max(4000, 'Notes max 4000 characters').default(''),
  vaultLocked: z.boolean().default(false),
  vaultAlias: z.string().max(80).default(''),
  photoDataUrl: z.string().max(2_500_000).nullable().optional(),
  photoStoragePath: z.string().max(260).nullable().optional(),
});

/**
 * Validated pin creation/update payload.
 */
export type PinInput = z.infer<typeof PinInputSchema>;

/**
 * Encrypted storage representation of a pin in IndexedDB and Supabase Postgres.
 */
export const StoredPinSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  age: z.number().int().min(18).max(120).nullable(),
  nationalityCode: z.string().regex(/^[A-Z]{2}$/),
  city: z.string().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  rating: z.number().min(1).max(5),
  relationshipStatus: RelationshipStatusSchema,
  metChannel: MetChannelSchema,
  dateMet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vaultLocked: z.boolean(),
  photoStoragePath: z.string().nullable(),
  encryptedSensitive: EncryptedEnvelopeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().default(null),
  syncPending: z.boolean().default(true),
});

/**
 * Encrypted pin persisted in Dexie or Postgres.
 */
export type StoredPin = z.infer<typeof StoredPinSchema>;

/**
 * Fully decrypted pin hydrated in client UI memory.
 */
export interface DecryptedPin {
  id: string;
  name: string;
  age: number | null;
  nationalityCode: string;
  city: string;
  latitude: number;
  longitude: number;
  rating: number;
  relationshipStatus: RelationshipStatus;
  intimacyLevel: IntimacyLevel;
  metChannel: MetChannel;
  dateMet: string;
  notes: string;
  vaultLocked: boolean;
  vaultAlias: string;
  photoDataUrl: string | null;
  photoStoragePath: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncPending: boolean;
}

/**
 * Converts a 1-5 star rating into a 10-point Datédex score string.
 * @param {number} rating - Numeric star rating between 1.0 and 5.0.
 * @returns {string} Formatted 10-scale score (e.g. "9.0 / 10").
 */
export function formatTenScale(rating: number): string {
  const clamped = Math.min(5, Math.max(1, rating));
  return `${(clamped * 2).toFixed(1)} / 10`;
}

/**
 * Formats a relationship status enum into a concise human-readable label.
 * @param {RelationshipStatus} status - Relationship status code.
 * @returns {string} Display label.
 */
export function formatRelationshipStatus(status: RelationshipStatus): string {
  const labels: Record<RelationshipStatus, string> = {
    talking: 'Talking',
    first_date: 'First Date',
    dating: 'Dating',
    situationship: 'Situationship',
    exclusive: 'Exclusive',
    archived: 'Archived',
  };
  return labels[status];
}

/**
 * Formats an intimacy level enum into a concise label.
 * @param {IntimacyLevel} level - Intimacy level enum value.
 * @returns {string} Display label.
 */
export function formatIntimacyLevel(level: IntimacyLevel): string {
  const labels: Record<IntimacyLevel, string> = {
    none: 'Coffee / Vibe',
    kiss: 'Spark / Kiss',
    second_base: 'Heated',
    third_base: 'Intimate',
    home_run: 'Home Run',
  };
  return labels[level];
}
