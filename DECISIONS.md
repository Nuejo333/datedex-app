# DECISIONS.md

## 2026-11-26 — Datédex Public App Architecture & Security Rebuild
- **Assumptions:** App must function 100% offline in IndexedDB with Web Crypto encryption while cleanly supporting optional Supabase cloud sync, Stripe Pro billing, and a future Mapbox GL swap.
- **Trade-offs:** Chose client-side Canvas re-encoding for EXIF GPS stripping (`src/platform/media/imageProcessor.ts:104`) instead of a binary EXIF parser library, trading original resolution (>1024px) for guaranteed removal of all metadata segments.
- **Trade-offs:** Built `src/features/map/PlaceholderMapAdapter.tsx:26` against `MapProviderProps` (`src/domain/map/types.ts:36`) so Mapbox can replace only the map feature without touching pins, domain, or shell state.
- **Security:** Enforced zero free messages in `api/rizz-coach.ts:106-140` (JWT `401` + `subscriptions` check `403`) and strict SoC-006 isolation in `.dependency-cruiser.cjs:6-36`.
- **Pointers:** `supabase/migrations/001_init.sql:1`, `src/platform/crypto/webCryptoService.ts:95`, `src/platform/indexeddb/pinRepository.ts:36`, `api/stripe-webhook.ts:88`.

## 2026-11-27 — Monochrome 3D-to-2D-to-3D Mapbox GL JS v3 Module
- **Assumptions:** `VITE_MAPBOX_ACCESS_TOKEN` is the sole public token source; tokenless/offline sessions must still render an interactive monochrome fallback without instantiating Mapbox GL.
- **Trade-offs:** Used DOM `mapboxgl.Marker` badges with client-side angular globe clustering (`src/features/map/components/DatedexMap.tsx:130`) instead of WebGL SDF symbol sprites so Unicode nationality flags, rating pills, and `maskPinForDiscreet` photo/name redaction render consistently across iOS/Android/desktop without XSS (`textContent` only).
- **Trade-offs:** Extended `MapProviderProps` inside `DatedexMapProps` rather than modifying `src/domain/map/types.ts`, preserving strict layer boundaries while supporting `hideHud`, `hideDock`, full Vault aliases, and `onSearchBounds(map.getBounds())`.
- **Lifecycle:** Stripped `dark-v11` accent layers and mounted `minzoom: 14` matte `#333333` 3D extrusions + space fog on `style.load` (`src/features/map/utils/monochromeStyle.ts:292`), paired with hysteresis auto-pitch (`>15` -> `55°`, `<13.5` -> `0°`) and user manual-tilt override (`src/features/map/utils/monochromeStyle.ts:437`).
- **Pointers:** `src/features/map/utils/monochromeStyle.ts:292`, `src/features/map/components/DatedexMap.tsx:298`, `src/features/map/components/MapFloatingControls.tsx:41`, `src/app/App.tsx:380`.

## 2026-11-27 — Production CSP Update for Mapbox GL JS v3
- **Assumptions:** `vercel.json` is the sole CSP source (`index.html` defines no CSP meta tag) governing both `https://www.date-dex.com` and `https://datedex-app.vercel.app`.
- **Trade-offs:** Added `worker-src 'self' blob:` (needed for Mapbox GL JS blob Web Workers) and scoped Mapbox endpoints (`https://*.mapbox.com`, `https://api.mapbox.com`, `https://events.mapbox.com`) to `connect-src` and `https://*.mapbox.com` to `img-src` rather than relaxing `default-src` or `script-src`.
- **Security:** Kept `frame-ancestors 'none'`, `base-uri 'self'`, `script-src`, Supabase, AdSense, and Stripe directives intact.
- **Pointers:** `vercel.json:25-26`, `index.html:1-19`.

## 2026-11-27 — Top-Bar Account & Settings Auth Modal
- **Assumptions:** Users expect immediate access to Google OAuth, Email Magic Link, and Sign Out from the sticky top header without navigating to the Vault tab, while offline-only builds must degrade gracefully when Supabase env vars are absent.
- **Trade-offs:** Placed `AccountSettingsDialog` in `src/features/vault/AccountSettingsDialog.tsx` and composed it alongside `HudStatsBar` in `src/app/App.tsx` rather than importing across features, preserving strict SoC-006 isolation in `.dependency-cruiser.cjs`.
- **Trade-offs:** Reused `signInWithGoogle`, `sendMagicLink`, and a hoisted `handleSignOut` in `App.tsx` (shared with `VaultPanel`) instead of creating a second Supabase client or duplicating session hooks.
- **Accessibility:** Used native `<dialog closedby="any">` via `useNativeModalDialog`, semantic `<form>` with `autocomplete="username"` and `spellCheck={false}`, and post-interaction `aria-invalid` + dynamic `aria-describedby` error linking.
- **Pointers:** `src/features/vault/AccountSettingsDialog.tsx:41`, `src/features/pokedex/HudStatsBar.tsx:86`, `src/app/App.tsx:315`, `src/platform/supabase/auth.ts:14`.

## 2026-11-27 — Logout Session Cleanup, First-Sign-In Onboarding Gate & Full-Page Settings View
- **Assumptions:** Signing out or switching Supabase accounts must wipe local pins/photos/profile/vault state and in-memory keys without ever triggering onboarding while signed out; onboarding should run once per authenticated `user.id`.
- **Trade-offs:** Tracked per-user onboarding completion via `user_profiles.onboarding_completed` and a non-sensitive `datedex_onboarding_completed_${user.id}` flag (`src/platform/supabase/sessionCleanup.ts:18`) preserved across logout, while `datedex.auth.lastUserId` isolates accounts without affecting offline-only IndexedDB persistence.
- **Trade-offs:** Replaced the compact `AccountSettingsDialog` modal with a full-viewport dark-mode `SettingsView` (`src/features/vault/SettingsView.tsx:52`) structured into Account & Authentication, Connected Accounts, Plan & Billing, and Privacy & Preferences with sticky `← Back` navigation preserving `activeTab`.
- **Auth & Crypto:** Scoped `WebCryptoService` in-memory key caching strictly to device-secret fields (purged via `clearInMemoryKeys()` on logout) and combined `user.identities` + `supabase.auth.getUserIdentities()` + `linkIdentity({ provider: 'google' })` with friendly `identity_already_exists` error handling.
- **Pointers:** `src/features/vault/SettingsView.tsx:52`, `src/platform/supabase/sessionCleanup.ts:18`, `src/platform/supabase/auth.ts:109`, `src/app/App.tsx:137`.

## 2026-11-27 — Permanent HUD/Dock Visibility & Map-First Default Home Tab
- **Assumptions:** Top HUD stats bar, bottom navigation dock, and floating map controls should remain permanently visible with zero Hide HUD/Dock toggles anywhere in the header, Vault, or Settings; the app should open directly on the `Map` tab (`map`) on launch, after onboarding, and after sign-in/sign-out.
- **Trade-offs:** Removed `hideHud` and `hideDock` from `VaultSettingsSchema` (`src/domain/models/profile.ts:55`) rather than keeping dead defaults; Zod's default `.parse()` strips legacy keys from existing IndexedDB `vaultSettings` rows cleanly without requiring a Dexie schema migration.
- **Trade-offs:** Reset `activeTab` to `'map'` on initial mount, `handleCompleteOnboarding`, `resetSignedOutState`, account switches, and `SIGNED_IN` auth events (`src/app/App.tsx:87-340`), avoiding resets on `TOKEN_REFRESHED` so active browsing on other tabs is uninterrupted.
- **Verification:** Updated unit, integration, and mobile Playwright E2E suites (`HudStatsBar.test.tsx`, `DatedexMap.test.tsx`, `AppAuthCleanup.test.tsx`, `e2e/datedex.spec.ts`) to assert Map-first launch and permanent HUD/dock visibility.
- **Pointers:** `src/app/App.tsx:87`, `src/features/pokedex/HudStatsBar.tsx:28`, `src/features/map/components/DatedexMap.tsx:31`, `src/features/map/components/MapFloatingControls.tsx:35`, `e2e/datedex.spec.ts:10`.
