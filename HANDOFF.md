# HANDOFF.md

## Current State (Branch: `main`)
- Complete rebuild of **Datédex** inside `datedex-app/` (`datedex-admin/` untouched and empty), merged into `main`.
- Implemented full domain layer (`src/domain/`), local-first AES-GCM + Dexie persistence (`src/platform/`), passwordless Supabase auth/sync/storage, Canvas EXIF stripping, Vercel serverless endpoints (`api/`), isolated React 19 UI features (`src/features/`), native `<dialog>` accessibility, CI workflow (`.github/workflows/ci.yml`), `vercel.json`, and `supabase/migrations/001_init.sql`.
- Replaced `PlaceholderMapAdapter.tsx` with the production monochrome 3D-to-2D-to-3D Mapbox GL JS v3+ module (`src/features/map/utils/monochromeStyle.ts`, `src/features/map/components/DatedexMap.tsx`, `src/features/map/components/MapFloatingControls.tsx`, and `src/features/map/__tests__/DatedexMap.test.tsx`), wired into `src/app/App.tsx`.
- Added top-bar Settings gear button (`src/features/pokedex/HudStatsBar.tsx`) with signed-in indicator opening a full-viewport dark-mode Settings screen (`src/features/vault/SettingsView.tsx`) with `← Back` navigation and four cards (Account & Authentication, Connected Accounts / Google pairing via `linkIdentity`, Plan & Billing, Privacy & Preferences).
- Implemented comprehensive sign-out & account-switch cleanup (`src/platform/supabase/sessionCleanup.ts`, `LocalPinRepository.clearUserData()`, `WebCryptoService.clearInMemoryKeys()`, `clearAdFrequencyCache()`, and `SIGNED_OUT` handling in `src/app/App.tsx`) and gated onboarding strictly to first-time authenticated users (`session !== null` + per-user `user_profiles` / `datedex_onboarding_completed_${user.id}` tracking — never on logout).
- Verified via `npm run ci` (`typecheck`, `lint`, `check:boundaries`, `vitest`, `check:secrets`, `vite build`).

## Pending Founder-Gated Actions (Section 6 of `AGENTS.md`)
1. **Database Migration (Gate #3):** Review and apply `supabase/migrations/001_init.sql` to the live Supabase project, and verify Google OAuth + Email Magic Link redirect URLs.
2. **Stripe & Secrets (Gate #1):** Create the €2.99/mo Pro price in Stripe, register `/api/stripe-webhook`, and add server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`) in Vercel Project Settings, plus public `VITE_MAPBOX_ACCESS_TOKEN` for live Mapbox tiles.
3. **Production Release (Gate #2):** Push `feat/datedex-rebuild` for a Vercel Preview Deployment QA check, then approve merging into `main`.
