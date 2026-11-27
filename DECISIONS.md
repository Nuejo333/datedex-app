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

## 2026-11-27 — Discreet Mode Scoping on Map & Pokédex + Permanent Free-Tier Ad Banner
- **Assumptions:** Free-tier ad banner (`AdBannerSlot`) must remain visible even when Discreet mode is active (hidden only for Pro subscribers); on the Map page Discreet mode hides only the top 4-card statistics grid and map pin names, and on the Pokédex page it applies the same top statistics grid hiding alongside card masking.
- **Trade-offs:** Added an optional `hideStats` prop to `HudStatsBar` (`src/features/pokedex/HudStatsBar.tsx:16`) wired to `vaultSettings.discreetMode && (activeTab === 'map' || activeTab === 'pokedex')` in `App.tsx`, keeping the header brand/controls intact while hiding the 4-card statistics grid on both Map and Pokédex tabs.
- **Trade-offs:** Kept individual `vaultLocked` pin avatar redaction intact in `DatedexMap.tsx` while scoping global `discreetMode` on the map strictly to omitting the pin name span (and removing the name from pin `aria-label`) in both Mapbox and fallback pin renderers.
- **Pointers:** `src/features/monetization/AdBannerSlot.tsx:26`, `src/features/pokedex/HudStatsBar.tsx:100`, `src/features/map/components/DatedexMap.tsx:214`, `src/app/App.tsx:554`.

## 2026-11-27 — Floating 3-Tab Glassmorphic Dock, Header Import, Settings Vault & Sticky Sponsored Banner
- **Assumptions:** Primary navigation should focus on 3 core views (`Pokédex`, `Map` default, `Rizz AI`) in a centered floating glassmorphic pill dock, while utility workflows move to the top header (`Import` left of `Discreet`) and full-page `Settings` (`Vault, Encryption & Sync` card).
- **Trade-offs:** Composed `<VaultPanel embeddedInSettings />` into `SettingsView`'s `vaultSection` slot inside `src/app/App.tsx` (suppressing duplicate auth/sign-out controls already rendered in Settings' top card) rather than importing `VaultPanel` inside `SettingsView`, keeping `SettingsView` unit tests lightweight and `.dependency-cruiser.cjs` SoC-006 boundaries intact.
- **Trade-offs:** Exported `ImportView` alongside `SpreadsheetPanel` (`src/features/spreadsheet/SpreadsheetPanel.tsx:258`) with a sticky `← Back` header matching `SettingsView`, and wrapped `HudStatsBar` + `AdBannerSlot` inside a unified `sticky top-0 z-30` chrome container (`src/app/App.tsx:625`) so the Sponsored banner stays anchored directly beneath the stats bar across all primary tabs.
- **Pointers:** `src/app/App.tsx:511`, `src/features/pokedex/HudStatsBar.tsx:59`, `src/features/vault/SettingsView.tsx:652`, `src/features/spreadsheet/SpreadsheetPanel.tsx:258`, `e2e/datedex.spec.ts:10`.

## 2026-11-27 — Full App i18n (`en` / `it` / `es`) & Pinned Billing / Collapsible Settings Cards
- **Assumptions:** UI chrome across all views must translate live between English (`en` default), Italian (`it`), and Spanish (`es`), persisting in `localStorage` across logout while preserving brand/product terms (`Datédex`, `Pokédex`, `Rizz AI`, `Dates2Bed`, `Vault`, `Discreet`, `Go Pro`) untranslated.
- **Trade-offs:** Built a zero-dependency, compile-time-verified i18n module in `src/platform/i18n/` (`TranslationDictionary = Record<keyof typeof en, string>`) rather than installing an external i18n library, guaranteeing key parity at `tsc` time and zero cross-feature imports under `.dependency-cruiser.cjs`.
- **Trade-offs:** Persisted locale under `datedex.ui.language.v1` (intentionally excluded from `clearClientUserSessionData`) and provided an English fallback default on `LanguageContext` so isolated feature tests render cleanly without mandatory wrapper boilerplate.
- **Settings UX:** Pinned **Plan & Billing** permanently at the top of `SettingsView` without a collapse toggle, and added accessible `aria-expanded` / `aria-controls` chevron toggles to **Language**, **Account & Authentication**, **Connected Accounts**, **Privacy & Preferences**, and **Vault, Encryption & Sync**.
- **Pointers:** `src/platform/i18n/translations.ts:1`, `src/platform/i18n/LanguageContext.tsx:20`, `src/features/vault/SettingsView.tsx:261`, `src/app/App.tsx:853`.
