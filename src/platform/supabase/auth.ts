/**
 * @module platform/supabase/auth
 * Passwordless Supabase authentication adapter supporting ONLY Google OAuth
 * and Email Magic Link (OTP) as required by AGENTS.md.
 */
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
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
