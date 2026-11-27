/**
 * @module domain/models/pin
 * Pure TypeScript domain models and Zod validation schemas for Datédex pins,
 * multi-nationality & city fields, intimacy suite, encrypted sensitive envelopes,
 * chronological badge formatting, and rating display helpers.
 */
import { z } from 'zod';

/**
 * Valid relationship status / dynamic stages for a logged connection.
 */
export const RelationshipStatusSchema = z.enum([
  'talking',
  'first_date',
  'dating',
  'situationship',
  'exclusive',
  'standby_ghosted',
  'standby_ghosting',
  'friends',
  'archived',
]);

/**
 * Relationship stage union type.
 */
export type RelationshipStatus = z.infer<typeof RelationshipStatusSchema>;

/**
 * Valid intimacy progression levels (encrypted client-side before persistence).
 * Includes canonical 6-step Intimacy Suite values plus legacy aliases for backward compatibility.
 */
export const IntimacyLevelSchema = z.enum([
  'none',
  'kiss',
  'passionate_kiss',
  'hand_foreplay',
  'oral_foreplay',
  'sex',
  'second_base',
  'third_base',
  'home_run',
]);

/**
 * Intimacy progression level union type.
 */
export type IntimacyLevel = z.infer<typeof IntimacyLevelSchema>;

/**
 * Canonical 6-step intimacy options presented in the Intimacy Suite selector.
 */
export const CANONICAL_INTIMACY_LEVELS = [
  'none',
  'kiss',
  'passionate_kiss',
  'hand_foreplay',
  'oral_foreplay',
  'sex',
] as const;

/**
 * Canonical intimacy level type rendered in the editor UI.
 */
export type CanonicalIntimacyLevel = (typeof CANONICAL_INTIMACY_LEVELS)[number];

/**
 * Normalizes legacy intimacy level codes into their canonical Intimacy Suite values.
 * @param {IntimacyLevel} level - Stored intimacy level.
 * @returns {CanonicalIntimacyLevel} Canonical intimacy level for UI display/editing.
 */
export function normalizeIntimacyLevelForEditor(level: IntimacyLevel): CanonicalIntimacyLevel {
  if (level === 'second_base') return 'hand_foreplay';
  if (level === 'third_base') return 'oral_foreplay';
  if (level === 'home_run') return 'sex';
  return level;
}

/**
 * Valid acquisition / "How We Met" channels for a connection.
 * Includes canonical dropdown options plus legacy channels for backward compatibility.
 */
export const MetChannelSchema = z.enum([
  'Tinder',
  'Bumble',
  'Hinge',
  'Dating App',
  'IRL - Work',
  'Friends',
  'IRL - Other',
  'Instagram',
  'IRL',
  'Travel',
  'Other',
]);

/**
 * Meeting channel union type.
 */
export type MetChannel = z.infer<typeof MetChannelSchema>;

/**
 * Canonical ordered "How We Met" options shown in the New Connection modal.
 */
export const CANONICAL_MET_CHANNELS = [
  'Tinder',
  'Bumble',
  'Hinge',
  'Dating App',
  'IRL - Work',
  'Friends',
  'IRL - Other',
] as const;

/**
 * Supported currency codes for Total Spent on Dates.
 */
export const SpentCurrencySchema = z.enum(['EUR', 'USD', 'GBP']);

/**
 * Currency code union type.
 */
export type SpentCurrency = z.infer<typeof SpentCurrencySchema>;

/**
 * Dates2Bed (dates until intimacy) discrete dropdown options.
 */
export const DatesToBedSchema = z.enum(['0', '1', '2', '3', '4', '5+']);

/**
 * Dates2Bed option union type.
 */
export type DatesToBedOption = z.infer<typeof DatesToBedSchema>;

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
 * Sensitive & extended connection fields encrypted via Web Crypto AES-GCM
 * prior to IndexedDB or Postgres storage (ensuring zero plaintext leakage and
 * full cloud sync without requiring Postgres schema migrations).
 */
export const SensitivePinFieldsSchema = z.object({
  notes: z.string().max(4000).default(''),
  intimacyLevel: IntimacyLevelSchema.default('none'),
  vaultAlias: z.string().max(80).default(''),
  // Identity & appearance metadata
  avatarEmoji: z.string().max(16).optional(),
  entryNumber: z.number().int().min(1).optional(),
  birthYearOrDob: z.string().max(32).optional(),
  heightCm: z.string().max(24).optional(),
  instagramHandle: z.string().max(64).optional(),
  personalityTags: z.array(z.string().max(48)).optional(),
  characterVote: z.number().min(0).max(10).optional(),
  mindVote: z.number().min(0).max(10).optional(),
  aestheticVote: z.number().min(0).max(10).optional(),
  // Multi-nationalities & cities
  nationalities: z.array(z.string().regex(/^[A-Z]{2}$/)).optional(),
  birthCity: z.string().max(120).optional(),
  livingCity: z.string().max(120).optional(),
  metCity: z.string().max(120).optional(),
  // Encounter & overall vote
  metChannelExact: MetChannelSchema.optional(),
  relationshipStatusExact: RelationshipStatusSchema.optional(),
  introducedByFriend: z.string().max(100).optional(),
  spentCurrency: SpentCurrencySchema.optional(),
  spentAmount: z.number().min(0).nullable().optional(),
  // Intimacy Suite
  datesToBed: DatesToBedSchema.nullable().optional(),
  firstIntimateDate: z.string().max(10).optional(),
  hookupCity: z.string().max(120).optional(),
  bedVote: z.number().min(0).max(10).optional(),
  hookupLocations: z.array(z.string().max(48)).optional(),
  intimateTags: z.array(z.string().max(48)).optional(),
  // Story & highlights
  highlights: z.string().max(2000).optional(),
  generalVote: z.number().min(0).max(10).optional(),
  // Local-only media vault item IDs (never uploaded to cloud)
  mediaItemIds: z.array(z.string().max(80)).optional(),
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
  entryNumber: z.number().int().min(1).optional(),
  avatarEmoji: z.string().trim().max(16).optional().default('👩'),
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name max 80 characters'),
  age: z
    .number()
    .int()
    .min(18, 'Age must be 18 or older')
    .max(120, 'Age must be 120 or under')
    .nullable()
    .optional(),
  birthYearOrDob: z.string().trim().max(32).optional().default(''),
  heightCm: z.string().trim().max(24).optional().default(''),
  instagramHandle: z.string().trim().max(64).optional().default(''),
  personalityTags: z.array(z.string().trim().min(1).max(48)).optional().default([]),
  characterVote: z.number().min(0).max(10).optional(),
  mindVote: z.number().min(0).max(10).optional(),
  aestheticVote: z.number().min(0).max(10).optional(),
  nationalityCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a 2-letter ISO country code'),
  nationalities: z
    .array(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/),
    )
    .optional(),
  city: z.string().trim().min(1, 'City is required').max(120, 'City max 120 characters'),
  birthCity: z.string().trim().max(120).optional().default(''),
  livingCity: z.string().trim().max(120).optional().default(''),
  metCity: z.string().trim().max(120).optional().default(''),
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
  introducedByFriend: z.string().trim().max(100).optional().default(''),
  spentCurrency: SpentCurrencySchema.optional().default('EUR'),
  spentAmount: z.number().min(0).nullable().optional().default(null),
  datesToBed: DatesToBedSchema.nullable().optional().default(null),
  firstIntimateDate: z
    .string()
    .trim()
    .refine((val) => val === '' || /^\d{4}-\d{2}-\d{2}$/.test(val), 'Use YYYY-MM-DD format')
    .optional()
    .default(''),
  hookupCity: z.string().trim().max(120).optional().default(''),
  bedVote: z.number().min(0).max(10).optional(),
  hookupLocations: z.array(z.string().trim().min(1).max(48)).optional().default([]),
  intimateTags: z.array(z.string().trim().min(1).max(48)).optional().default([]),
  dateMet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format'),
  notes: z.string().max(4000, 'Notes max 4000 characters').default(''),
  highlights: z.string().max(2000, 'Highlights max 2000 characters').optional().default(''),
  generalVote: z.number().min(0).max(10).optional(),
  vaultLocked: z.boolean().default(false),
  vaultAlias: z.string().max(80).default(''),
  mediaItemIds: z.array(z.string().max(80)).optional().default([]),
  photoDataUrl: z.string().max(2_500_000).nullable().optional(),
  photoStoragePath: z.string().max(260).nullable().optional(),
});

/**
 * Validated pin creation/update payload.
 */
export type PinInput = z.input<typeof PinInputSchema>;

/**
 * Parsed pin input with all defaults populated.
 */
export type ParsedPinInput = z.infer<typeof PinInputSchema>;

/**
 * Encrypted storage representation of a pin in IndexedDB and Supabase Postgres.
 */
export const StoredPinSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  age: z.number().int().min(18).max(120).nullable(),
  nationalityCode: z.string().regex(/^[A-Z]{2}$/),
  city: z.string().min(1).max(120),
  birthCity: z.string().max(120).optional().default(''),
  livingCity: z.string().max(120).optional().default(''),
  metCity: z.string().max(120).optional().default(''),
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
  entryNumber?: number;
  avatarEmoji?: string;
  name: string;
  age: number | null;
  birthYearOrDob?: string;
  heightCm?: string;
  instagramHandle?: string;
  personalityTags?: string[];
  characterVote?: number;
  mindVote?: number;
  aestheticVote?: number;
  nationalityCode: string;
  nationalities?: string[];
  city: string;
  birthCity?: string;
  livingCity?: string;
  metCity?: string;
  latitude: number;
  longitude: number;
  rating: number;
  relationshipStatus: RelationshipStatus;
  intimacyLevel: IntimacyLevel;
  metChannel: MetChannel;
  introducedByFriend?: string;
  spentCurrency?: SpentCurrency;
  spentAmount?: number | null;
  datesToBed?: DatesToBedOption | null;
  firstIntimateDate?: string;
  hookupCity?: string;
  bedVote?: number;
  hookupLocations?: string[];
  intimateTags?: string[];
  dateMet: string;
  notes: string;
  highlights?: string;
  generalVote?: number;
  vaultLocked: boolean;
  vaultAlias: string;
  mediaItemIds?: string[];
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
 * Converts a 0–10 general vote slider value into a valid 1.0–5.0 star rating
 * compatible with HUD averages, rating histograms, and Postgres constraints.
 * @param {number} generalVote - Score on the 0–10 scale.
 * @returns {number} Star rating clamped between 1.0 and 5.0.
 */
export function generalVoteToFiveScale(generalVote: number): number {
  const clamped = Math.min(10, Math.max(0, generalVote));
  return Number(Math.min(5, Math.max(1, clamped / 2)).toFixed(1));
}

/**
 * Formats an ISO `YYYY-MM-DD` date string into compact `DD/MM/YY` badge format.
 * @param {string | null | undefined} isoDate - ISO date string.
 * @returns {string} Formatted `DD/MM/YY` string or empty string when invalid.
 */
export function formatCompactBadgeDate(isoDate?: string | null): string {
  if (!isoDate) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  const year = match?.[1];
  const month = match?.[2];
  const day = match?.[3];
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year.slice(2)}`;
}

/**
 * Formats the Top Header chronological number badge (`#N - DD/MM/YY`), prioritizing
 * the first intimate date when set and falling back cleanly to the encounter/first date.
 * @param {number} entryNumber - Sequential connection number (1-indexed).
 * @param {string | null | undefined} firstIntimateDate - Optional first intimate date (`YYYY-MM-DD`).
 * @param {string | null | undefined} dateMet - Encounter / first date (`YYYY-MM-DD`).
 * @returns {string} Formatted badge string (e.g. `"#11 - 27/11/26"`).
 */
export function formatChronologicalBadge(
  entryNumber: number,
  firstIntimateDate?: string | null,
  dateMet?: string | null,
): string {
  const effectiveDate =
    formatCompactBadgeDate(firstIntimateDate) || formatCompactBadgeDate(dateMet);
  return effectiveDate ? `#${entryNumber} - ${effectiveDate}` : `#${entryNumber}`;
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
    standby_ghosted: 'Standby - Ghosted',
    standby_ghosting: 'Standby - Ghosting',
    friends: 'Friends',
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
    none: 'No Intimacy',
    kiss: 'Kiss',
    passionate_kiss: 'Passionate Kiss',
    hand_foreplay: 'Hand Foreplay',
    oral_foreplay: 'Oral Foreplay',
    sex: 'Sex',
    second_base: 'Hand Foreplay',
    third_base: 'Oral Foreplay',
    home_run: 'Sex',
  };
  return labels[level];
}
