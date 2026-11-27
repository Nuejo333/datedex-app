# HANDOFF.md

## Current State (Branch: `feat/datedex-rebuild`)
- Complete rebuild of **Datédex** inside `datedex-app/` (`datedex-admin/` untouched and empty).
- Implemented full domain layer (`src/domain/`), local-first AES-GCM + Dexie persistence (`src/platform/`), passwordless Supabase auth/sync/storage, Canvas EXIF stripping, Vercel serverless endpoints (`api/`), isolated React 19 UI features (`src/features/`), native `<dialog>` accessibility, CI workflow (`.github/workflows/ci.yml`), `vercel.json`, and `supabase/migrations/001_init.sql`.
- Replaced `PlaceholderMapAdapter.tsx` with the production monochrome 3D-to-2D-to-3D Mapbox GL JS v3+ module (`src/features/map/utils/monochromeStyle.ts`, `src/features/map/components/DatedexMap.tsx`, `src/features/map/components/MapFloatingControls.tsx`, and `src/features/map/__tests__/DatedexMap.test.tsx`), wired into `src/app/App.tsx`.
- Verified via `npm run ci` (`typecheck`, `lint`, `check:boundaries`, `vitest`, `check:secrets`, `vite build`).

## Pending Founder-Gated Actions (Section 6 of `AGENTS.md`)
1. **Database Migration (Gate #3):** Review and apply `supabase/migrations/001_init.sql` to the live Supabase project, and verify Google OAuth + Email Magic Link redirect URLs.
2. **Stripe & Secrets (Gate #1):** Create the €2.99/mo Pro price in Stripe, register `/api/stripe-webhook`, and add server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`) in Vercel Project Settings, plus public `VITE_MAPBOX_ACCESS_TOKEN` for live Mapbox tiles.
3. **Production Release (Gate #2):** Push `feat/datedex-rebuild` for a Vercel Preview Deployment QA check, then approve merging into `main`.
4. **E2E Follow-Up Note:** `e2e/datedex.spec.ts:81` still asserts the legacy placeholder text `'IMapProvider Canvas'`; update that selector in a follow-up E2E pass if running Playwright against the Map tab.
