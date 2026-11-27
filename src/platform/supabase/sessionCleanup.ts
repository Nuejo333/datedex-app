/**
 * @module platform/supabase/sessionCleanup
 * Session-scoped client cleanup and account-isolation helpers ensuring that
 * signing out or switching Supabase accounts clears all user-specific IndexedDB
 * rows, in-memory crypto keys, and localStorage/sessionStorage caches.
 */
import { clearAdFrequencyCache } from '../ads/adProvider';
import { localPinRepository, type LocalPinRepository } from '../indexeddb/pinRepository';

const LAST_AUTH_USER_STORAGE_KEY = 'datedex.auth.lastUserId';
const ONBOARDING_COMPLETED_PREFIX = 'datedex_onboarding_completed_';
const SESSION_STORAGE_PREFIX = 'datedex.';

/**
 * Builds the per-user `localStorage` key recording that a given authenticated user
 * has completed first-time onboarding (`datedex_onboarding_completed_${userId}`).
 * @param {string} userId - Authenticated Supabase user UUID.
 * @returns {string} Storage key string.
 */
export function getUserOnboardingStorageKey(userId: string): string {
  return `${ONBOARDING_COMPLETED_PREFIX}${userId}`;
}

/**
 * Checks whether the given authenticated user has already completed onboarding locally.
 * Intentionally preserved across logout (keyed by `userId`, storing only `'true'`) so
 * returning users are not prompted with first-time onboarding again.
 * @param {string} userId - Authenticated Supabase user UUID.
 * @returns {boolean} True when local onboarding completion flag is recorded for `userId`.
 */
export function isUserOnboardingCompletedLocally(userId: string): boolean {
  try {
    return globalThis.localStorage?.getItem(getUserOnboardingStorageKey(userId)) === 'true';
  } catch {
    return false;
  }
}

/**
 * Records that the given authenticated user has completed first-time onboarding.
 * @param {string} userId - Authenticated Supabase user UUID.
 * @returns {void}
 */
export function markUserOnboardingCompletedLocally(userId: string): void {
  try {
    globalThis.localStorage?.setItem(getUserOnboardingStorageKey(userId), 'true');
  } catch {
    // Ignore private browsing / storage quota errors
  }
}

/**
 * Returns the last authenticated Supabase user ID recorded in `localStorage`, if any.
 * Used to distinguish an offline-only user from a previously signed-in cloud user
 * whose session expired or switched accounts.
 * @returns {string | null} Last authenticated user UUID or null.
 */
export function getLastAuthenticatedUserId(): string | null {
  try {
    const raw = globalThis.localStorage?.getItem(LAST_AUTH_USER_STORAGE_KEY);
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Records the currently active authenticated Supabase user ID in `localStorage`.
 * @param {string} userId - Authenticated Supabase user UUID.
 * @returns {void}
 */
export function setLastAuthenticatedUserId(userId: string): void {
  try {
    globalThis.localStorage?.setItem(LAST_AUTH_USER_STORAGE_KEY, userId);
  } catch {
    // Ignore private browsing / storage quota errors
  }
}

/**
 * Removes the stored authenticated user marker from `localStorage`.
 * @returns {void}
 */
export function clearLastAuthenticatedUserId(): void {
  try {
    globalThis.localStorage?.removeItem(LAST_AUTH_USER_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

function clearPrefixedSessionStorage(): void {
  try {
    const store = globalThis.sessionStorage;
    if (!store) return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && key.startsWith(SESSION_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      store.removeItem(key);
    }
  } catch {
    // Ignore sessionStorage restrictions
  }
}

/**
 * Clears all local user-specific data on sign-out:
 * - Wipes Dexie IndexedDB (`pins`, `pinPhotos`, `profile`, `vaultSettings`)
 * - Clears in-memory Web Crypto derived keys / cached secrets
 * - Removes user-specific `localStorage` & `sessionStorage` caches
 * @param {LocalPinRepository} [repository] - Repository instance to wipe (defaults to singleton).
 * @returns {Promise<void>}
 */
export async function clearClientUserSessionData(
  repository: LocalPinRepository = localPinRepository,
): Promise<void> {
  await repository.clearUserData();
  clearAdFrequencyCache();
  clearLastAuthenticatedUserId();
  clearPrefixedSessionStorage();
}

/**
 * Enforces account isolation whenever a Supabase user session becomes active.
 * If local storage previously held data for a different Supabase `userId`,
 * wipes the previous account's local IndexedDB/caches before syncing the new account.
 * @param {string} userId - Newly active authenticated user UUID.
 * @param {LocalPinRepository} [repository] - Local repository instance.
 * @returns {Promise<{ switchedAccount: boolean }>} Whether an account switch cleanup occurred.
 */
export async function isolateAccountOnSignIn(
  userId: string,
  repository: LocalPinRepository = localPinRepository,
): Promise<{ switchedAccount: boolean }> {
  const previousUserId = getLastAuthenticatedUserId();
  const switchedAccount = Boolean(previousUserId && previousUserId !== userId);

  if (switchedAccount) {
    await clearClientUserSessionData(repository);
  }

  setLastAuthenticatedUserId(userId);
  return { switchedAccount };
}
