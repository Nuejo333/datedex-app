/**
 * @module app/App
 * Top-level mobile-first Datédex application shell composing all isolated feature
 * slices via Dexie local-first state, Web Crypto encryption, and optional Supabase sync.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookHeart,
  FileSpreadsheet,
  Globe2,
  Plus,
  Shield,
  Sparkles,
} from 'lucide-react';
import type { Session, User, UserIdentity } from '@supabase/supabase-js';
import { computeHudStats } from '../domain/analytics/pokedexStats';
import type { MapCoordinate, MapMarker, MapViewport } from '../domain/map/types';
import {
  isProSubscriptionActive,
  type AffiliateOffer,
  type RizzCoachRequest,
  type RizzCoachResponse,
  type SubscriptionSummary,
} from '../domain/models/monetization';
import type { DecryptedPin, PinInput } from '../domain/models/pin';
import type { OnboardingInput, UserProfile, VaultSettings } from '../domain/models/profile';
import { canShowInterstitialAd } from '../platform/ads/adProvider';
import { webCryptoService } from '../platform/crypto/webCryptoService';
import { requestRizzCoachStrategies } from '../platform/gemini/rizzCoachClient';
import { DEFAULT_VAULT_SETTINGS, localPinRepository } from '../platform/indexeddb/pinRepository';
import { createBillingPortalSession, createProCheckoutSession } from '../platform/stripe/client';
import {
  extractAuthRedirectError,
  fetchUserIdentities,
  getActiveSession,
  hasGoogleIdentity,
  linkGoogleIdentity,
  sendMagicLink,
  signInWithGoogle,
  signOutCloud,
  subscribeAuthChanges,
} from '../platform/supabase/auth';
import { isSupabaseConfigured } from '../platform/supabase/client';
import { fetchActiveAffiliateOffers } from '../platform/supabase/monetization';
import {
  clearClientUserSessionData,
  getLastAuthenticatedUserId,
  isUserOnboardingCompletedLocally,
  isolateAccountOnSignIn,
  markUserOnboardingCompletedLocally,
} from '../platform/supabase/sessionCleanup';
import { getPrivatePinPhotoSignedUrl, uploadPrivatePinPhoto } from '../platform/supabase/storage';
import {
  fetchProfileFromCloud,
  fetchUserSubscription,
  syncEncryptedPinsWithCloud,
  syncProfileToCloud,
} from '../platform/supabase/sync';
const DatedexMap = lazy(() =>
  import('../features/map/components/DatedexMap').then((mod) => ({ default: mod.DatedexMap })),
);
import { AdBannerSlot } from '../features/monetization/AdBannerSlot';
import { AffiliateSlot } from '../features/monetization/AffiliateSlot';
import { InterstitialAdDialog } from '../features/monetization/InterstitialAdDialog';
import { OnboardingFlow } from '../features/onboarding/OnboardingFlow';
import { PinEditorDialog } from '../features/pins/PinEditorDialog';
import { HudStatsBar } from '../features/pokedex/HudStatsBar';
import { PokedexDashboard } from '../features/pokedex/PokedexDashboard';
import { RizzCoachPanel } from '../features/rizz-coach/RizzCoachPanel';
import { SpreadsheetPanel } from '../features/spreadsheet/SpreadsheetPanel';
import { SettingsView } from '../features/vault/SettingsView';
import { VaultLockDialog } from '../features/vault/VaultLockDialog';
import { VaultPanel } from '../features/vault/VaultPanel';

type ActiveTab = 'pokedex' | 'map' | 'rizz' | 'import' | 'vault';

/**
 * Root Datédex PWA component orchestrating local-first storage, Vault privacy controls,
 * and feature navigation without cross-feature coupling.
 * @returns {React.JSX.Element} Rendered application shell.
 */
export function App(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pins, setPins] = useState<DecryptedPin[]>([]);
  const [vaultSettings, setVaultSettings] = useState<VaultSettings>(DEFAULT_VAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPin, setEditingPin] = useState<DecryptedPin | null>(null);
  const [droppedCoord, setDroppedCoord] = useState<MapCoordinate | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interstitialOpen, setInterstitialOpen] = useState(false);
  const [viewport, setViewport] = useState<MapViewport>({ latitude: 20, longitude: 0, zoom: 1.8 });
  const [mapAreaBounds, setMapAreaBounds] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [linkedIdentities, setLinkedIdentities] = useState<UserIdentity[]>([]);
  const [identitiesLoading, setIdentitiesLoading] = useState(false);
  const [authRedirectError, setAuthRedirectError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [affiliates, setAffiliates] = useState<AffiliateOffer[]>([]);

  const supabaseConfigured = isSupabaseConfigured();
  const isPro = isProSubscriptionActive(subscription);
  const isGooglePaired = useMemo(() => hasGoogleIdentity(linkedIdentities), [linkedIdentities]);

  const refreshLocalState = useCallback(async () => {
    const [loadedProfile, loadedPins, loadedVault] = await Promise.all([
      localPinRepository.getProfile(),
      localPinRepository.listPins(),
      localPinRepository.getVaultSettings(),
    ]);

    // Hydrate signed URLs for synced private photos missing local base64 cache
    const hydratedPins = await Promise.all(
      loadedPins.map(async (pin) => {
        if (!pin.photoDataUrl && pin.photoStoragePath) {
          const signedUrl = await getPrivatePinPhotoSignedUrl(pin.photoStoragePath);
          return signedUrl ? { ...pin, photoDataUrl: signedUrl } : pin;
        }
        return pin;
      }),
    );

    setProfile(loadedProfile);
    setPins(hydratedPins);
    setVaultSettings(loadedVault);
  }, []);

  const resetSignedOutState = useCallback(async () => {
    // Clear all in-memory user data immediately so no previous account's dates flash on screen
    // and ensure onboarding NEVER opens when signed out.
    setSession(null);
    setNeedsOnboarding(false);
    setLinkedIdentities([]);
    setIdentitiesLoading(false);
    setSubscription(null);
    setPins([]);
    setProfile(null);
    setVaultSettings({ ...DEFAULT_VAULT_SETTINGS });
    setEditingPin(null);
    setEditorOpen(false);
    setDroppedCoord(null);
    setUnlockOpen(false);
    setInterstitialOpen(false);
    setMapAreaBounds(null);
    setActiveTab('map');

    // Wipe local IndexedDB tables, in-memory crypto keys, and user-specific storage caches
    await clearClientUserSessionData(localPinRepository);
  }, []);

  const hydrateAuthenticatedUser = useCallback(
    async (user: User, isMounted: () => boolean = () => true): Promise<void> => {
      // Seed immediately from session user identities while refreshing from Supabase Auth
      setLinkedIdentities(user.identities ?? []);
      setIdentitiesLoading(true);

      const { switchedAccount } = await isolateAccountOnSignIn(user.id, localPinRepository);
      if (switchedAccount && isMounted()) {
        setPins([]);
        setProfile(null);
        setVaultSettings({ ...DEFAULT_VAULT_SETTINGS });
        setEditingPin(null);
        setEditorOpen(false);
        setMapAreaBounds(null);
        setActiveTab('map');
      }

      const [sub, identities, cloudProfile] = await Promise.all([
        fetchUserSubscription(user.id),
        fetchUserIdentities(user),
        fetchProfileFromCloud(user.id),
      ]);

      if (!isMounted()) return;
      setSubscription(sub);
      setLinkedIdentities(identities);
      setIdentitiesLoading(false);

      // Pull encrypted pins for the authenticated account; fail softly if temporarily offline
      let pulledPins = 0;
      try {
        const syncResult = await syncEncryptedPinsWithCloud(user.id, localPinRepository);
        pulledPins = syncResult.pulled;
      } catch {
        // Offline or transient network error; local state remains available
      }

      // Determine per-user first-time onboarding status (localStorage + cloud user_profiles)
      const completedLocally = isUserOnboardingCompletedLocally(user.id);
      const completedInCloud = Boolean(cloudProfile?.onboardingCompleted) || pulledPins > 0;
      const alreadyOnboarded = completedLocally || completedInCloud;

      if (alreadyOnboarded) {
        markUserOnboardingCompletedLocally(user.id);
      }

      const localProfile = await localPinRepository.getProfile();
      if (!localProfile && alreadyOnboarded) {
        await localPinRepository.saveProfile(
          cloudProfile ?? {
            id: 'local-profile',
            displayName: user.email?.split('@')[0] || 'Explorer',
            homeCountry: 'US',
            syncPhotos: false,
            vaultEnabled: false,
            onboardingCompleted: true,
            privacyPledgeAccepted: true,
            updatedAt: new Date().toISOString(),
          },
        );
      }

      if (isMounted()) {
        setNeedsOnboarding(!alreadyOnboarded);
        await refreshLocalState();
      }
    },
    [refreshLocalState],
  );

  useEffect(() => {
    let mounted = true;
    const isMounted = (): boolean => mounted;

    const redirectErr = extractAuthRedirectError();
    if (redirectErr) {
      setAuthRedirectError(redirectErr);
      setSettingsOpen(true);
      if (typeof globalThis.history?.replaceState === 'function') {
        globalThis.history.replaceState({}, '', globalThis.location.pathname);
      }
    }

    const init = async (): Promise<void> => {
      // Load public affiliate offers asynchronously so slow/offline networks never block local-first boot
      void fetchActiveAffiliateOffers()
        .then((activeOffers) => {
          if (mounted) {
            setAffiliates(activeOffers);
          }
        })
        .catch(() => {
          // Offline or transient network error; leave affiliates empty
        });

      try {
        const authState = await getActiveSession();
        if (!mounted) return;
        setSession(authState.session);

        if (authState.user) {
          await hydrateAuthenticatedUser(authState.user, isMounted);
        } else {
          // If a previous cloud session expired/signed out while the app was closed, wipe its cache;
          // preserve local IndexedDB untouched for 100% offline-only users (lastUserId === null).
          if (getLastAuthenticatedUserId() !== null) {
            await clearClientUserSessionData(localPinRepository);
          }
          await refreshLocalState();
        }
      } catch {
        // Fallback to local-first IndexedDB state if session hydration throws offline
        if (mounted) {
          await refreshLocalState().catch(() => {});
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void init();

    const unsub = subscribeAuthChanges((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        void resetSignedOutState();
        return;
      }

      if (!nextSession?.user) {
        if (getLastAuthenticatedUserId() !== null) {
          void resetSignedOutState();
        } else {
          setSession(null);
          setNeedsOnboarding(false);
          setLinkedIdentities([]);
          setSubscription(null);
        }
        return;
      }

      setSession(nextSession);
      if (event === 'SIGNED_IN') {
        setActiveTab('map');
      }
      void hydrateAuthenticatedUser(nextSession.user, isMounted);
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [hydrateAuthenticatedUser, refreshLocalState, resetSignedOutState]);

  const hudStats = useMemo(() => computeHudStats(pins), [pins]);

  const mapMarkers: MapMarker[] = useMemo(
    () =>
      pins.map((p) => ({
        id: p.id,
        label: p.name,
        city: p.city,
        nationalityCode: p.nationalityCode,
        latitude: p.latitude,
        longitude: p.longitude,
        rating: p.rating,
        isVaultLocked: p.vaultLocked,
      })),
    [pins],
  );

  const handleCompleteOnboarding = async (input: OnboardingInput): Promise<void> => {
    const nextProfile: UserProfile = {
      id: 'local-profile',
      displayName: input.displayName,
      homeCountry: input.homeCountry,
      syncPhotos: false,
      vaultEnabled: Boolean(input.vaultPassphrase),
      onboardingCompleted: true,
      privacyPledgeAccepted: true,
      updatedAt: new Date().toISOString(),
    };
    await localPinRepository.saveProfile(nextProfile);

    if (input.vaultPassphrase && input.vaultPassphrase.trim().length >= 4) {
      const { hash, salt } = await webCryptoService.hashPassphrase(input.vaultPassphrase.trim());
      const nextVault: VaultSettings = {
        ...vaultSettings,
        hasPassphraseLock: true,
        passphraseHash: hash,
        passphraseSalt: salt,
      };
      await localPinRepository.saveVaultSettings(nextVault);
      setVaultSettings(nextVault);
    }

    setProfile(nextProfile);
    setNeedsOnboarding(false);
    setSettingsOpen(false);
    setActiveTab('map');
    if (session?.user) {
      markUserOnboardingCompletedLocally(session.user.id);
      await syncProfileToCloud(session.user.id, nextProfile);
    }
  };

  const handleSavePin = async (
    input: PinInput,
    processedBlob?: { blob: Blob; mimeType: 'image/webp' | 'image/jpeg' } | null,
  ): Promise<void> => {
    let saved = await localPinRepository.savePin(input);

    if (session?.user && profile?.syncPhotos && processedBlob) {
      const storagePath = await uploadPrivatePinPhoto(
        session.user.id,
        saved.id,
        processedBlob.blob,
        processedBlob.mimeType,
      );
      if (storagePath) {
        saved = await localPinRepository.savePin({
          ...input,
          id: saved.id,
          photoStoragePath: storagePath,
        });
      }
    }

    if (session?.user) {
      void syncEncryptedPinsWithCloud(session.user.id, localPinRepository);
    }

    await refreshLocalState();

    // Trigger frequency-capped interstitial only for Free users outside Discreet mode
    if (!editingPin && canShowInterstitialAd(isPro, vaultSettings.discreetMode)) {
      setInterstitialOpen(true);
    }
  };

  const handleDeletePin = async (pinId: string): Promise<void> => {
    await localPinRepository.deletePin(pinId);
    if (session?.user) {
      void syncEncryptedPinsWithCloud(session.user.id, localPinRepository);
    }
    await refreshLocalState();
  };

  const updateVault = async (patch: Partial<VaultSettings>): Promise<void> => {
    const next = await localPinRepository.saveVaultSettings({
      ...vaultSettings,
      ...patch,
    });
    setVaultSettings(next);
  };

  const handleToggleDiscreet = (): void => {
    if (vaultSettings.discreetMode && vaultSettings.hasPassphraseLock) {
      setUnlockOpen(true);
      return;
    }
    void updateVault({ discreetMode: !vaultSettings.discreetMode });
  };

  const handleVerifyUnlock = async (passphrase: string): Promise<boolean> => {
    if (!vaultSettings.passphraseHash || !vaultSettings.passphraseSalt) return true;
    const ok = await webCryptoService.verifyPassphrase(
      passphrase,
      vaultSettings.passphraseHash,
      vaultSettings.passphraseSalt,
    );
    if (ok) {
      await updateVault({ discreetMode: false });
    }
    return ok;
  };

  const handleSetPassphrase = async (passphrase: string): Promise<void> => {
    const trimmed = passphrase.trim();
    if (!trimmed) {
      await updateVault({
        hasPassphraseLock: false,
        passphraseHash: null,
        passphraseSalt: null,
      });
      return;
    }
    if (trimmed.length < 4) {
      throw new Error('Vault passphrase must be at least 4 characters');
    }
    const { hash, salt } = await webCryptoService.hashPassphrase(trimmed);
    await updateVault({
      hasPassphraseLock: true,
      passphraseHash: hash,
      passphraseSalt: salt,
    });
  };

  const handleUpgradeToPro = async (): Promise<void> => {
    if (!session?.access_token) {
      setSettingsOpen(true);
      return;
    }
    const checkoutUrl = await createProCheckoutSession(session.access_token);
    globalThis.location.assign(checkoutUrl);
  };

  const handleOpenPortal = async (): Promise<void> => {
    if (!session?.access_token) return;
    const portalUrl = await createBillingPortalSession(session.access_token);
    globalThis.location.assign(portalUrl);
  };

  const handleRequestCoaching = async (req: RizzCoachRequest): Promise<RizzCoachResponse> => {
    if (!session?.access_token) {
      throw new Error('Sign in required for AI Rizz Coach.');
    }
    return requestRizzCoachStrategies(session.access_token, req);
  };

  const handleSignOut = async (): Promise<void> => {
    await signOutCloud();
    await resetSignedOutState();
  };

  const handleCloseSettings = (): void => {
    setSettingsOpen(false);
    setAuthRedirectError(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-slate-400">
        Unlocking encrypted local Datédex...
      </div>
    );
  }

  // Onboarding opens ONLY after first sign-in for an authenticated user who has not completed it.
  // Signed-out sessions (including immediately after Sign Out) NEVER trigger onboarding.
  if (session?.user && needsOnboarding) {
    return (
      <OnboardingFlow
        supabaseConfigured={supabaseConfigured}
        onComplete={handleCompleteOnboarding}
        onGoogleSignIn={signInWithGoogle}
        onSendMagicLink={sendMagicLink}
      />
    );
  }

  // Full-viewport Settings screen (returns cleanly to the previous tab via Back)
  if (settingsOpen) {
    return (
      <>
        <SettingsView
          supabaseConfigured={supabaseConfigured}
          signedInEmail={session?.user?.email ?? null}
          isPro={isPro}
          isGooglePaired={isGooglePaired}
          identitiesLoading={identitiesLoading}
          discreetMode={vaultSettings.discreetMode}
          hasPassphraseLock={vaultSettings.hasPassphraseLock}
          localPinCount={pins.length}
          authRedirectError={authRedirectError}
          onBack={handleCloseSettings}
          onGoogleSignIn={signInWithGoogle}
          onSendMagicLink={sendMagicLink}
          onLinkGoogle={linkGoogleIdentity}
          onSignOut={handleSignOut}
          onUpgradeToPro={handleUpgradeToPro}
          onOpenBillingPortal={handleOpenPortal}
          onToggleDiscreet={handleToggleDiscreet}
        />
        <VaultLockDialog
          open={unlockOpen}
          onClose={() => setUnlockOpen(false)}
          onVerifyPassphrase={handleVerifyUnlock}
        />
      </>
    );
  }

  const navItems: Array<{ id: ActiveTab; label: string; icon: typeof BookHeart }> = [
    { id: 'pokedex', label: 'Pokédex', icon: BookHeart },
    { id: 'map', label: 'Map', icon: Globe2 },
    { id: 'rizz', label: 'Rizz AI', icon: Sparkles },
    { id: 'import', label: 'Import', icon: FileSpreadsheet },
    { id: 'vault', label: 'Vault', icon: Shield },
  ];

  return (
    <div className="min-h-dvh bg-[#0b0d14] text-slate-100">
      <HudStatsBar
        stats={hudStats}
        discreetMode={vaultSettings.discreetMode}
        isPro={isPro}
        isSignedIn={Boolean(session?.user)}
        signedInEmail={session?.user?.email ?? null}
        onToggleDiscreet={handleToggleDiscreet}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-28">
        <AdBannerSlot
          isPro={isPro}
          discreetMode={vaultSettings.discreetMode}
          onUpgradeClick={() => setActiveTab('rizz')}
        />

        {activeTab === 'pokedex' && (
          <>
            <PokedexDashboard
              pins={pins}
              discreetMode={vaultSettings.discreetMode}
              onSelectPin={(pin) => {
                setEditingPin(pin);
                setDroppedCoord(null);
                setEditorOpen(true);
              }}
            />
            <AffiliateSlot
              offers={affiliates}
              placement="pokedex_feed"
              discreetMode={vaultSettings.discreetMode}
            />
          </>
        )}

        {activeTab === 'map' && (
          <div className="space-y-4">
            <Suspense
              fallback={
                <div className="flex h-[min(74dvh,640px)] min-h-[460px] items-center justify-center rounded-2xl border border-white/10 bg-[#050505] text-xs text-neutral-400">
                  Loading monochrome 3D globe...
                </div>
              }
            >
              <DatedexMap
                markers={
                  mapAreaBounds
                    ? mapMarkers.filter(
                      (m) =>
                        m.latitude >= mapAreaBounds.south &&
                        m.latitude <= mapAreaBounds.north &&
                        m.longitude >= mapAreaBounds.west &&
                        m.longitude <= mapAreaBounds.east,
                    )
                    : mapMarkers
                }
                pins={pins}
                selectedPinId={editingPin?.id ?? null}
                draftCoordinate={droppedCoord}
                discreetMode={vaultSettings.discreetMode}
                isAreaFiltered={Boolean(mapAreaBounds)}
                viewport={viewport}
                onViewportChange={setViewport}
                onSelectMarker={(pinId) => {
                  const found = pins.find((p) => p.id === pinId) ?? null;
                  if (found) {
                    setEditingPin(found);
                    setDroppedCoord(null);
                    setEditorOpen(true);
                  }
                }}
                onMapClick={(coord) => {
                  setEditingPin(null);
                  setDroppedCoord(coord);
                  setEditorOpen(true);
                }}
                onSearchBounds={(bounds) => {
                  if (!bounds) {
                    setMapAreaBounds(null);
                    return;
                  }
                  setMapAreaBounds({
                    north: bounds.getNorth(),
                    south: bounds.getSouth(),
                    east: bounds.getEast(),
                    west: bounds.getWest(),
                  });
                }}
              />
            </Suspense>
            {mapAreaBounds && (
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-xs text-neutral-300">
                <span>Showing pins within searched map area</span>
                <button
                  type="button"
                  onClick={() => setMapAreaBounds(null)}
                  className="font-semibold text-white underline underline-offset-2 hover:text-neutral-200"
                >
                  Clear area filter
                </button>
              </div>
            )}
            <AffiliateSlot
              offers={affiliates}
              placement="map_drawer"
              discreetMode={vaultSettings.discreetMode}
            />
          </div>
        )}

        {activeTab === 'rizz' && (
          <div className="space-y-4">
            <RizzCoachPanel
              isAuthenticated={Boolean(session?.user)}
              isPro={isPro}
              onUpgradeToPro={handleUpgradeToPro}
              onOpenBillingPortal={handleOpenPortal}
              onRequestCoaching={handleRequestCoaching}
              onGoToVaultAuth={() => setActiveTab('vault')}
            />
            <AffiliateSlot
              offers={affiliates}
              placement="rizz_footer"
              discreetMode={vaultSettings.discreetMode}
            />
          </div>
        )}

        {activeTab === 'import' && (
          <SpreadsheetPanel
            pins={pins}
            onImportPins={async (batch) => {
              let count = 0;
              for (const item of batch) {
                await localPinRepository.savePin(item);
                count += 1;
              }
              if (session?.user) {
                void syncEncryptedPinsWithCloud(session.user.id, localPinRepository);
              }
              await refreshLocalState();
              return count;
            }}
          />
        )}

        {activeTab === 'vault' && (
          <VaultPanel
            vaultSettings={vaultSettings}
            supabaseConfigured={supabaseConfigured}
            signedInEmail={session?.user?.email ?? null}
            syncPhotos={profile?.syncPhotos ?? false}
            onToggleDiscreet={handleToggleDiscreet}
            onToggleSyncPhotos={async (next) => {
              const baseProfile: UserProfile = profile ?? {
                id: 'local-profile',
                displayName: session?.user?.email?.split('@')[0] || 'Explorer',
                homeCountry: 'US',
                syncPhotos: false,
                vaultEnabled: vaultSettings.hasPassphraseLock,
                onboardingCompleted: true,
                privacyPledgeAccepted: true,
                updatedAt: new Date().toISOString(),
              };
              const updated = await localPinRepository.saveProfile({
                ...baseProfile,
                syncPhotos: next,
                updatedAt: new Date().toISOString(),
              });
              setProfile(updated);
              if (session?.user) {
                await syncProfileToCloud(session.user.id, updated);
              }
            }}
            onSetPassphrase={handleSetPassphrase}
            onExportBackup={async (passphrase) => {
              const bundle = await localPinRepository.exportEncryptedBackup(passphrase);
              return JSON.stringify(bundle, null, 2);
            }}
            onRestoreBackup={async (jsonText, passphrase) => {
              const parsed = JSON.parse(jsonText);
              const res = await localPinRepository.restoreEncryptedBackup(parsed, passphrase);
              await refreshLocalState();
              return res.restoredPins;
            }}
            onGoogleSignIn={signInWithGoogle}
            onSendMagicLink={sendMagicLink}
            onSyncNow={async () => {
              if (!session?.user) throw new Error('Sign in required to sync');
              const res = await syncEncryptedPinsWithCloud(session.user.id, localPinRepository);
              await refreshLocalState();
              return `Synced ${res.pushed} uploaded, ${res.pulled} cloud entries.`;
            }}
            onSignOut={handleSignOut}
          />
        )}
      </main>

      {/* One-handed Floating Add Button */}
      <button
        type="button"
        aria-label="Log new connection"
        onClick={() => {
          setEditingPin(null);
          setDroppedCoord(null);
          setEditorOpen(true);
        }}
        className="fixed right-4 bottom-20 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-xl shadow-rose-500/30 transition hover:scale-105"
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </button>

      {/* Permanently Visible Bottom Navigation Dock */}
      <nav
        aria-label="Primary Navigation"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0b0d14]/95 px-2 pt-2 backdrop-blur-md"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition ${
                  isActive
                    ? 'bg-rose-500/15 text-rose-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <PinEditorDialog
        open={editorOpen}
        initialPin={editingPin}
        droppedCoordinate={droppedCoord}
        onClose={() => {
          setEditorOpen(false);
          setEditingPin(null);
          setDroppedCoord(null);
        }}
        onSave={handleSavePin}
        onDelete={handleDeletePin}
      />

      <VaultLockDialog
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        onVerifyPassphrase={handleVerifyUnlock}
      />

      <InterstitialAdDialog
        open={interstitialOpen}
        isPro={isPro}
        discreetMode={vaultSettings.discreetMode}
        onClose={() => setInterstitialOpen(false)}
        onUpgradeClick={() => setActiveTab('rizz')}
      />
    </div>
  );
}
