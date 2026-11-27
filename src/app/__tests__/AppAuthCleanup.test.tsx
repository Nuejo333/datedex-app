/**
 * @module app/__tests__/AppAuthCleanup.test
 * Integration tests verifying:
 * (a) Signed-out loads and Sign Out (button + SIGNED_OUT event) clear all user data
 *     without ever triggering onboarding.
 * (b) First-time authenticated users see onboarding once, tracked per-user via
 *     `user_profiles` and `datedex_onboarding_completed_${user.id}`.
 * (c) Full-page Settings view displays Google identity pairing state and returns
 *     cleanly to the previous tab via Back.
 */
import type { AuthChangeEvent, Session, UserIdentity } from '@supabase/supabase-js';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../domain/models/profile';
import { localPinRepository } from '../../platform/indexeddb/pinRepository';
import {
  getUserOnboardingStorageKey,
  markUserOnboardingCompletedLocally,
} from '../../platform/supabase/sessionCleanup';

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

const mocks = vi.hoisted(() => ({
  authListener: null as AuthListener | null,
  activeSession: null as Session | null,
  identities: [] as UserIdentity[],
  cloudProfile: null as UserProfile | null,
  signOutCloud: vi.fn().mockResolvedValue(undefined),
  linkGoogleIdentity: vi.fn().mockResolvedValue(undefined),
  syncProfileToCloud: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../platform/supabase/client', () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => null,
}));

vi.mock('../../platform/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/supabase/auth')>();
  return {
    ...actual,
    getActiveSession: vi.fn(async () => ({
      session: mocks.activeSession,
      user: mocks.activeSession?.user ?? null,
    })),
    fetchUserIdentities: vi.fn(async () => mocks.identities),
    subscribeAuthChanges: vi.fn((cb: AuthListener) => {
      mocks.authListener = cb;
      return () => {
        mocks.authListener = null;
      };
    }),
    signOutCloud: mocks.signOutCloud,
    linkGoogleIdentity: mocks.linkGoogleIdentity,
  };
});

vi.mock('../../platform/supabase/sync', () => ({
  fetchProfileFromCloud: vi.fn(async () => mocks.cloudProfile),
  fetchUserSubscription: vi.fn().mockResolvedValue({
    status: 'inactive',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  }),
  syncEncryptedPinsWithCloud: vi.fn().mockResolvedValue({ pushed: 0, pulled: 0 }),
  syncProfileToCloud: mocks.syncProfileToCloud,
}));

vi.mock('../../platform/supabase/monetization', () => ({
  fetchActiveAffiliateOffers: vi.fn().mockResolvedValue([]),
  recordMonetizationEvent: vi.fn().mockResolvedValue(undefined),
}));

import { App } from '../App';

function buildMockSession(userId: string, email: string, identities: UserIdentity[]): Session {
  return {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      email,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-11-01T00:00:00.000Z',
      identities,
    },
  };
}

describe('App onboarding gating, sign-out cleanup & full-page Settings integration', () => {
  beforeEach(async () => {
    // Force tokenless monochrome fallback in jsdom (no WebGL context available in Vitest)
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '');
    localStorage.clear();
    sessionStorage.clear();
    await localPinRepository.clearUserData();
    mocks.authListener = null;
    mocks.activeSession = null;
    mocks.identities = [];
    mocks.cloudProfile = null;
    mocks.signOutCloud.mockClear();
    mocks.linkGoogleIdentity.mockClear();
    mocks.syncProfileToCloud.mockClear();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    cleanup();
    await localPinRepository.clearUserData();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('never triggers onboarding when signed out initially or after clicking Sign Out in Settings', async () => {
    const user = userEvent.setup();
    const emailIdentity = {
      identity_id: 'id-email-1',
      id: 'id-email-1',
      user_id: 'user-1',
      provider: 'email',
      identity_data: { email: 'magic@example.com' },
    } as UserIdentity;

    mocks.identities = [emailIdentity];
    mocks.activeSession = buildMockSession('user-1', 'magic@example.com', [emailIdentity]);
    markUserOnboardingCompletedLocally('user-1');

    await localPinRepository.saveProfile({
      id: 'local-profile',
      displayName: 'Alex',
      homeCountry: 'US',
      syncPhotos: false,
      vaultEnabled: false,
      onboardingCompleted: true,
      privacyPledgeAccepted: true,
      updatedAt: new Date().toISOString(),
    });

    await localPinRepository.savePin({
      name: 'Secret Date Sofia',
      age: 26,
      nationalityCode: 'IT',
      city: 'Milan',
      latitude: 45.4642,
      longitude: 9.19,
      rating: 4.5,
      relationshipStatus: 'dating',
      intimacyLevel: 'second_base',
      metChannel: 'Hinge',
      dateMet: '2026-11-22',
      notes: 'Private espresso date',
      vaultLocked: false,
      vaultAlias: '',
    });

    render(<App />);

    // App opens on Map tab by default with signed-in pin visible and no Hide HUD button
    expect(await screen.findByRole('region', { name: 'Datédex Monochrome 3D Map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Hide HUD' })).not.toBeInTheDocument();
    expect(await screen.findByText(/Secret Date Sofia/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome to Datédex' })).not.toBeInTheDocument();

    // Switch to Pokédex before opening Settings to verify Sign Out resets activeTab to Map
    await user.click(screen.getByRole('button', { name: 'Pokédex' }));
    expect(screen.getByRole('button', { name: 'Pokédex' })).toHaveAttribute('aria-current', 'page');

    // Open full-page Settings view from top header gear button
    await user.click(screen.getByRole('button', { name: 'Account & Settings (Signed in)' }));
    expect(screen.getByTestId('settings-page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pair Google Account' })).toBeInTheDocument();

    // Sign Out clears dates/profile/IndexedDB without opening onboarding
    await user.click(screen.getByRole('button', { name: 'Sign Out' }));

    await waitFor(() => {
      expect(mocks.signOutCloud).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Welcome to Datédex' })).not.toBeInTheDocument();

    // Returning Back to main shell shows empty signed-out app on the default Map tab
    await user.click(screen.getByRole('button', { name: 'Back to previous view' }));
    expect(await screen.findByTestId('hud-dates')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('region', { name: 'Datédex Monochrome 3D Map' })).toBeInTheDocument();
    expect(screen.queryByText(/Secret Date Sofia/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome to Datédex' })).not.toBeInTheDocument();

    expect(await localPinRepository.listPins()).toHaveLength(0);
    expect(await localPinRepository.getProfile()).toBeNull();
  });

  it('triggers onboarding only once for a first-time authenticated user and defaults to Map after onboarding and sign-in', async () => {
    const user = userEvent.setup();
    const googleIdentity = {
      identity_id: 'id-google-new',
      id: 'id-google-new',
      user_id: 'first-time-user',
      provider: 'google',
      identity_data: { email: 'newuser@example.com' },
    } as UserIdentity;

    // Start signed out: opens directly on Map tab, onboarding must NOT open
    mocks.activeSession = null;
    render(<App />);
    expect(await screen.findByTestId('hud-dates')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('region', { name: 'Datédex Monochrome 3D Map' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome to Datédex' })).not.toBeInTheDocument();

    // First-time sign-in triggers onboarding
    mocks.identities = [googleIdentity];
    const newSession = buildMockSession('first-time-user', 'newuser@example.com', [googleIdentity]);
    await act(async () => {
      mocks.authListener?.('SIGNED_IN', newSession);
    });

    expect(await screen.findByRole('heading', { name: 'Welcome to Datédex' })).toBeInTheDocument();

    // Complete 4-step onboarding -> lands directly on Map tab
    await user.type(screen.getByLabelText('Passport Nickname'), 'Taylor');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Start Offline Passport' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Welcome to Datédex' })).not.toBeInTheDocument();
      expect(screen.getByTestId('hud-dates')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
    });
    expect(await screen.findByRole('region', { name: 'Datédex Monochrome 3D Map' })).toBeInTheDocument();

    expect(localStorage.getItem(getUserOnboardingStorageKey('first-time-user'))).toBe('true');
    expect(mocks.syncProfileToCloud).toHaveBeenCalledWith(
      'first-time-user',
      expect.objectContaining({ displayName: 'Taylor', onboardingCompleted: true }),
    );

    // Open Settings -> confirm Google Connected badge is shown
    await user.click(screen.getByRole('button', { name: 'Account & Settings (Signed in)' }));
    expect(screen.getByTestId('google-connected-badge')).toHaveTextContent('Google Connected');

    // External SIGNED_OUT clears user data without triggering onboarding
    await act(async () => {
      mocks.authListener?.('SIGNED_OUT', null);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Welcome to Datédex' })).not.toBeInTheDocument();

    // Signing back in as the same user does NOT re-trigger onboarding and returns to Map tab
    await act(async () => {
      mocks.authListener?.('SIGNED_IN', newSession);
    });

    await waitFor(() => {
      expect(screen.getByTestId('account-signed-in-email')).toHaveTextContent('newuser@example.com');
    });
    expect(screen.queryByRole('heading', { name: 'Welcome to Datédex' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }));
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('region', { name: 'Datédex Monochrome 3D Map' })).toBeInTheDocument();
  });
});
