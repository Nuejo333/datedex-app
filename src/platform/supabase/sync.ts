/**
 * @module platform/supabase/sync
 * Encrypted cloud sync between local Dexie IndexedDB and Supabase Postgres,
 * plus client read-only subscription status lookup.
 */
import {
  EncryptedEnvelopeSchema,
  MetChannelSchema,
  RelationshipStatusSchema,
  type StoredPin,
} from '../../domain/models/pin';
import {
  SubscriptionStatusSchema,
  type SubscriptionSummary,
} from '../../domain/models/monetization';
import type { UserProfile } from '../../domain/models/profile';
import type { LocalPinRepository } from '../indexeddb/pinRepository';
import { getSupabaseClient } from './client';

interface RemotePinRow {
  id: string;
  user_id: string;
  name: string;
  age: number | null;
  nationality_code: string;
  city: string;
  latitude: number;
  longitude: number;
  rating: number;
  relationship_status: string;
  met_channel: string;
  date_met: string;
  vault_locked: boolean;
  photo_storage_path: string | null;
  encrypted_sensitive: unknown;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Pushes locally pending encrypted pins and pulls newer remote encrypted pins from Postgres.
 * Sensitive fields (`notes`, `intimacyLevel`, `vaultAlias`) remain AES-GCM encrypted in transit and at rest.
 * @param {string} userId - Authenticated Supabase user UUID.
 * @param {LocalPinRepository} repository - Local encrypted IndexedDB repository.
 * @returns {Promise<{ pushed: number; pulled: number }>} Sync summary counts.
 * @throws {Error} When Supabase sync fails.
 */
export async function syncEncryptedPinsWithCloud(
  userId: string,
  repository: LocalPinRepository,
): Promise<{ pushed: number; pulled: number }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { pushed: 0, pulled: 0 };

  const localRows = await repository.listRawStoredPins();
  const pendingRows = localRows.filter((row) => row.syncPending);

  if (pendingRows.length > 0) {
    const upsertPayload = pendingRows.map((pin) => ({
      id: pin.id,
      user_id: userId,
      name: pin.name,
      age: pin.age,
      nationality_code: pin.nationalityCode,
      city: pin.city,
      latitude: pin.latitude,
      longitude: pin.longitude,
      rating: pin.rating,
      relationship_status: pin.relationshipStatus,
      met_channel: pin.metChannel,
      date_met: pin.dateMet,
      vault_locked: pin.vaultLocked,
      photo_storage_path: pin.photoStoragePath,
      encrypted_sensitive: pin.encryptedSensitive,
      created_at: pin.createdAt,
      updated_at: pin.updatedAt,
      deleted_at: pin.deletedAt,
    }));

    const { error: upsertError } = await supabase
      .from('pins')
      .upsert(upsertPayload, { onConflict: 'id' });

    if (upsertError) {
      throw new Error(`Cloud pin upload failed: ${upsertError.message}`);
    }
    await repository.markPinsSynced(pendingRows.map((p) => p.id));
  }

  const { data: remoteRows, error: fetchError } = await supabase
    .from('pins')
    .select('*')
    .eq('user_id', userId);

  if (fetchError) {
    throw new Error(`Cloud pin fetch failed: ${fetchError.message}`);
  }

  const converted: StoredPin[] = [];
  for (const raw of (remoteRows ?? []) as RemotePinRow[]) {
    const envelope = EncryptedEnvelopeSchema.safeParse(raw.encrypted_sensitive);
    const status = RelationshipStatusSchema.safeParse(raw.relationship_status);
    const channel = MetChannelSchema.safeParse(raw.met_channel);
    if (!envelope.success || !status.success || !channel.success) continue;

    converted.push({
      id: raw.id,
      name: raw.name,
      age: raw.age,
      nationalityCode: raw.nationality_code,
      city: raw.city,
      latitude: raw.latitude,
      longitude: raw.longitude,
      rating: Number(raw.rating),
      relationshipStatus: status.data,
      metChannel: channel.data,
      dateMet: raw.date_met,
      vaultLocked: raw.vault_locked,
      photoStoragePath: raw.photo_storage_path,
      encryptedSensitive: envelope.data,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      deletedAt: raw.deleted_at,
      syncPending: false,
    });
  }

  if (converted.length > 0) {
    await repository.mergeRemotePins(converted);
  }

  return { pushed: pendingRows.length, pulled: converted.length };
}

/**
 * Syncs consumer profile settings (`displayName`, `homeCountry`, `syncPhotos`) to `user_profiles`.
 * @param {string} userId - Authenticated Supabase user UUID.
 * @param {UserProfile} profile - Local profile settings.
 * @returns {Promise<void>}
 */
export async function syncProfileToCloud(userId: string, profile: UserProfile): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  await supabase.from('user_profiles').upsert(
    {
      user_id: userId,
      display_name: profile.displayName,
      home_country: profile.homeCountry,
      sync_photos: profile.syncPhotos,
      vault_enabled: profile.vaultEnabled,
      onboarding_completed: profile.onboardingCompleted,
    },
    { onConflict: 'user_id' },
  );
}

/**
 * Reads the authenticated user's Stripe-synced subscription status from `public.subscriptions`.
 * Note: UI display only — `/api/rizz-coach` enforces Pro status independently server-side.
 * @param {string} userId - Authenticated Supabase user UUID.
 * @returns {Promise<SubscriptionSummary>} Subscription status summary.
 */
export async function fetchUserSubscription(userId: string): Promise<SubscriptionSummary> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { status: 'inactive', currentPeriodEnd: null, cancelAtPeriodEnd: false };
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, current_period_end, cancel_at_period_end')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return { status: 'inactive', currentPeriodEnd: null, cancelAtPeriodEnd: false };
  }

  const parsedStatus = SubscriptionStatusSchema.safeParse(data.status);
  return {
    status: parsedStatus.success ? parsedStatus.data : 'inactive',
    currentPeriodEnd: data.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
  };
}
