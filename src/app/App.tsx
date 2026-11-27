/**
 * @module app/App
 * Top-level mobile-first Datédex application shell composing all isolated feature
 * slices via Dexie local-first state, Web Crypto encryption, and optional Supabase sync.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookHeart,
  Globe2,
  Plus,
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
import { LanguageProvider, useTranslation } from '../platform/i18n/LanguageContext';
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
import { ImportView } from '../features/spreadsheet/SpreadsheetPanel';
import { SettingsView } from '../features/vault/SettingsView';
import { VaultLockDialog } from '../features/vault/VaultLockDialog';
import { VaultPanel } from '../features/vault/VaultPanel';

type ActiveTab = 'pokedex' | 'map' | 'rizz';

/**
 * Root Datédex PWA component orchestrating local-first storage, Vault privacy controls,
 * and feature navigation without cross-feature coupling.
 * @returns {React.JSX.Element} Rendered application shell.
 */
function AppShell(): React.JSX.Element {
  const { t } = useTranslation();
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
  const [importOpen, setImportOpen] = useState(false);
  const [interstitialOpen, setInterstitialOpen] = useState(false);
  const [viewport, setViewport] = useState<MapViewport>({ latitude: 20, longitude: 0, zoom: 1.8 });
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
    setImportOpen(false);
    setInterstitialOpen(false);
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
    setImportOpen(false);
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
      throw new Error(t('app.vaultPassphraseTooShort'));
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
      throw new Error(t('app.signInRequiredRizz'));
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
        {t('app.unlocking')}
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

  // Full-viewport Settings screen with embedded Vault / Encryption & Cloud Sync section
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
          vaultSection={
            <VaultPanel
              embeddedInSettings
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
                if (!session?.user) throw new Error(t('app.signInRequiredSync'));
                const res = await syncEncryptedPinsWithCloud(session.user.id, localPinRepository);
                await refreshLocalState();
                return t('app.syncSummary', { pushed: res.pushed, pulled: res.pulled });
              }}
              onSignOut={handleSignOut}
            />
          }
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

  // Full-viewport Import & Export screen opened from the top-header Import button
  if (importOpen) {
    return (
      <ImportView
        pins={pins}
        onBack={() => setImportOpen(false)}
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
    );
  }

  const navItems: Array<{ id: ActiveTab; label: string; icon: typeof BookHeart }> = [
    { id: 'pokedex', label: t('app.dock.pokedex'), icon: BookHeart },
    { id: 'map', label: t('app.dock.map'), icon: Globe2 },
    { id: 'rizz', label: t('app.dock.rizz'), icon: Sparkles },
  ];

  return (
    <div className="min-h-dvh bg-[#0b0d14] text-slate-100">
      {/* Persistently anchored top header, 4-card stats bar, and Sponsored banner */}
      <div
        data-testid="sticky-top-chrome"
        className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0d14]/95 backdrop-blur-md"
      >
        <HudStatsBar
          stats={hudStats}
          discreetMode={vaultSettings.discreetMode}
          hideStats={vaultSettings.discreetMode && (activeTab === 'map' || activeTab === 'pokedex')}
          isPro={isPro}
          isSignedIn={Boolean(session?.user)}
          signedInEmail={session?.user?.email ?? null}
          onOpenImport={() => {
            setSettingsOpen(false);
            setImportOpen(true);
          }}
          onToggleDiscreet={handleToggleDiscreet}
          onOpenSettings={() => {
            setImportOpen(false);
            setSettingsOpen(true);
          }}
        />
        {!isPro && (
          <div className="mx-auto max-w-2xl px-4 pb-3">
            <AdBannerSlot
              isPro={isPro}
              onUpgradeClick={() => setActiveTab('rizz')}
            />
          </div>
        )}
      </div>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-28">

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
                  {t('app.loadingGlobe')}
                </div>
              }
            >
              <DatedexMap
                markers={mapMarkers}
                pins={pins}
                selectedPinId={editingPin?.id ?? null}
                draftCoordinate={droppedCoord}
                discreetMode={vaultSettings.discreetMode}
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
              />
            </Suspense>
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
              onGoToVaultAuth={() => setSettingsOpen(true)}
            />
            <AffiliateSlot
              offers={affiliates}
              placement="rizz_footer"
              discreetMode={vaultSettings.discreetMode}
            />
          </div>
        )}
      </main>

      {/* One-handed Floating Add Button on bottom-left (cleared above floating dock) */}
      <button
        type="button"
        data-testid="floating-add-button"
        aria-label={t('app.logNewConnectionAria')}
        onClick={() => {
          setEditingPin(null);
          setDroppedCoord(null);
          setEditorOpen(true);
        }}
        className="fixed bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.75rem)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-xl shadow-rose-500/30 transition hover:scale-105"
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </button>

      {/* Floating Glassmorphic Pill Bottom Navigation Dock */}
      <nav
        aria-label={t('app.primaryNavAria')}
        data-testid="floating-dock"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-[#121622]/75 p-1.5 shadow-2xl shadow-black/60 ring-1 ring-white/5 backdrop-blur-xl"
      >
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex min-w-[78px] flex-col items-center justify-center gap-0.5 rounded-full px-3.5 py-1.5 text-[11px] font-medium transition ${
                  isActive
                    ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
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

/**
 * Root Datédex PWA component providing `LanguageProvider` (`en` / `it` / `es`)
 * around the local-first application shell.
 * @returns {React.JSX.Element} Root application wrapped in `LanguageProvider`.
 */
export function App(): React.JSX.Element {
  return (
    <LanguageProvider>
      <AppShell />
    </LanguageProvider>
  );
}
