/**
 * @module platform/supabase/auth
 * Passwordless Supabase authentication adapter supporting ONLY Google OAuth
 * and Email Magic Link (OTP) as required by AGENTS.md.
 */
import type { AuthChangeEvent, Session, User, UserIdentity } from '@supabase/supabase-js';
import { getSupabaseClient } from './client';

/**
 * Initiates Google OAuth sign-in via Supabase Auth.
 * @returns {Promise<void>}
 * @throws {Error} When Supabase is unconfigured or OAuth initiation fails.
 */
export async function signInWithGoogle(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Cloud sync is not configured yet. Continue offline or add Supabase keys.');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: globalThis.location?.origin,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Sends a passwordless Email Magic Link (OTP) via Supabase Auth.
 * @param {string} email - User email address.
 * @returns {Promise<void>}
 * @throws {Error} When email is invalid, Supabase is unconfigured, or OTP dispatch fails.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Enter a valid email address for the Magic Link');
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Cloud sync is not configured yet. Continue offline or add Supabase keys.');
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      emailRedirectTo: globalThis.location?.origin,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Signs the current user out of Supabase Auth.
 * @returns {Promise<void>}
 */
export async function signOutCloud(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Fetches the active Supabase session and user if signed in.
 * @returns {Promise<{ session: Session | null; user: User | null }>} Active auth state.
 */
export async function getActiveSession(): Promise<{ session: Session | null; user: User | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { session: null, user: null };
  const { data } = await supabase.auth.getSession();
  return {
    session: data.session ?? null,
    user: data.session?.user ?? null,
  };
}

/**
 * Subscribes to Supabase auth state transitions.
 * @param {(event: AuthChangeEvent, session: Session | null) => void} callback - State listener.
 * @returns {() => void} Unsubscribe cleanup function.
 */
export function subscribeAuthChanges(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

/**
 * Minimal shape for inspecting Supabase identity providers.
 */
export interface IdentityLike {
  provider?: string | null;
}

/**
 * Checks whether a list of Supabase user identities includes a linked Google identity.
 * @param {ReadonlyArray<IdentityLike> | null | undefined} identities - Linked user identities.
 * @returns {boolean} True when `provider === 'google'` is present.
 */
export function hasGoogleIdentity(
  identities: ReadonlyArray<IdentityLike> | null | undefined,
): boolean {
  if (!identities || identities.length === 0) return false;
  return identities.some((identity) => identity.provider === 'google');
}

/**
 * Fetches the authenticated user's linked identities via `supabase.auth.getUserIdentities()`,
 * gracefully falling back to `fallbackUser.identities` when offline or if the call fails.
 * @param {User | null | undefined} [fallbackUser] - Session user object with cached identities.
 * @returns {Promise<UserIdentity[]>} Linked identities for the signed-in user.
 */
export async function fetchUserIdentities(fallbackUser?: User | null): Promise<UserIdentity[]> {
  const fallback = fallbackUser?.identities ?? [];
  const supabase = getSupabaseClient();
  if (!supabase) return fallback;

  try {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error || !data?.identities) {
      return fallback;
    }
    return data.identities;
  } catch {
    return fallback;
  }
}

/**
 * Translates Supabase identity-linking errors into clear, actionable messages,
 * specifically highlighting conflicts when a Google account belongs to another user.
 * @param {string} rawMessage - Raw error message or error code from Supabase Auth.
 * @param {string} [errorCode] - Optional Supabase Auth error code (e.g. `identity_already_exists`).
 * @returns {string} User-friendly error description.
 */
export function formatLinkIdentityError(rawMessage: string, errorCode?: string): string {
  const normalizedCode = (errorCode ?? '').toLowerCase();
  const normalizedMsg = rawMessage.toLowerCase();

  if (
    normalizedCode === 'identity_already_exists' ||
    normalizedMsg.includes('identity is already linked') ||
    normalizedMsg.includes('identity_already_exists') ||
    normalizedMsg.includes('already linked to another')
  ) {
    return 'This Google account is already linked to another Datédex account. Sign out and sign in directly with Google, or pair a different Google account.';
  }

  if (
    normalizedCode === 'manual_linking_disabled' ||
    normalizedMsg.includes('manual linking is disabled')
  ) {
    return 'Manual Google pairing is disabled in Supabase Auth settings. Enable "Manual Linking" in Supabase Auth to pair Google with a different email.';
  }

  return rawMessage || 'Unable to pair Google account right now.';
}

/**
 * Initiates manual Google OAuth identity linking for the currently signed-in user
 * via `supabase.auth.linkIdentity({ provider: 'google' })`.
 * @returns {Promise<void>}
 * @throws {Error} When Supabase is unconfigured or linking fails (e.g. identity already linked).
 */
export async function linkGoogleIdentity(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Cloud sync is not configured yet. Continue offline or add Supabase keys.');
  }

  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: {
      redirectTo: globalThis.location?.origin,
    },
  });

  if (error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    throw new Error(formatLinkIdentityError(error.message, code));
  }
}

/**
 * Extracts and formats any Supabase OAuth/identity-linking error returned in the URL
 * query string or hash fragment after an OAuth redirect.
 * @param {{ search?: string; hash?: string } | undefined} [locationLike] - Window location object.
 * @returns {string | null} Formatted error message if an auth redirect error is present, else null.
 */
export function extractAuthRedirectError(
  locationLike: { search?: string; hash?: string } | undefined = globalThis.location,
): string | null {
  if (!locationLike) return null;
  const searchParams = new URLSearchParams(locationLike.search ?? '');
  const hashRaw = (locationLike.hash ?? '').replace(/^#/, '');
  const hashParams = new URLSearchParams(hashRaw);

  const errorCode =
    searchParams.get('error_code') ??
    hashParams.get('error_code') ??
    searchParams.get('error') ??
    hashParams.get('error');
  const errorDesc =
    searchParams.get('error_description') ?? hashParams.get('error_description') ?? '';

  if (!errorCode && !errorDesc) return null;
  return formatLinkIdentityError(errorDesc || errorCode || '', errorCode ?? undefined);
}
