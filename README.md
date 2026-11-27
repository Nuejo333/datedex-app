# Datédex — Track Your Dating Journey

Mobile-first, local-first encrypted dating Pokédex & romantic passport built with **React 19**, **TypeScript (`strict: true`)**, **Tailwind CSS v4**, **Vite PWA**, **Dexie IndexedDB + Web Crypto AES-GCM**, **Supabase** (passwordless auth + RLS + private Storage), **Stripe Checkout/Webhooks**, and server-side **Gemini 2.5 Flash** (`@google/genai`).

> **Public Repo Notice:** This repository (`datedex-app`) contains **zero** admin UI, admin routes, or secrets. The founder's private local-only dashboard (`datedex-admin`) lives in a separate repository sharing only versioned Supabase SQL migrations.

---

## Architecture (SoC-006)

- [`src/domain/`](src/domain): Pure TypeScript types, Zod schemas, Pokédex/Dates2Bed calculators, country/city directory, spreadsheet importer, discreet masking, and `IMapProvider` / `ICryptoService` contracts. **Zero** imports from React, `platform/`, or `features/`.
- [`src/platform/`](src/platform): Web Crypto AES-GCM (`webCryptoService.ts`), Dexie IndexedDB (`db.ts`, `pinRepository.ts`), Canvas EXIF-stripping photo compressor (`imageProcessor.ts`), Supabase passwordless auth/sync/storage/monetization, Stripe/Gemini API clients, and AdSense/interstitial controller.
- [`src/features/`](src/features): Isolated vertical slices (no cross-feature imports, enforced by `.dependency-cruiser.cjs`):
  - `onboarding/`, `pins/`, `map/`, `pokedex/`, `vault/`, `spreadsheet/`, `rizz-coach/`, `monetization/`.
- [`api/`](api): Vercel Serverless Functions (`rizz-coach.ts`, `stripe-checkout.ts`, `stripe-portal.ts`, `stripe-webhook.ts`).

---

## Local Development

```bash
npm install
cp .env.example .env.local   # Optional: app runs 100% offline without keys
npm run dev
```

### Verification Commands

```bash
npm run ci          # typecheck + eslint/jsdoc + dependency-cruiser + vitest + secret scan + build
npm run test:e2e    # Playwright mobile-viewport (390x844) E2E suite
```

---

## Vercel + Supabase + Stripe Setup Runbook

1. **Supabase Project & Migration (Founder-Gated):**
   - Review [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql).
   - Apply via `supabase db push` or Supabase SQL Editor once approved.
   - Enable **Google OAuth** and **Email Magic Link (OTP)** in Supabase Auth; leave Email/Password disabled.
   - Verify the `pin-photos` bucket is created with `public = false`.
2. **Stripe Product & Webhook (Founder-Gated):**
   - Create a recurring €2.99/month Price in Stripe (`STRIPE_PRO_PRICE_ID`).
   - Point a Stripe Webhook endpoint to `https://<your-vercel-domain>/api/stripe-webhook` subscribing to:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
3. **Vercel Deployment:**
   - Connect `datedex-app` to Vercel (`main` = Production, `feat/*` = Preview Deployments).
   - Configure public `VITE_*` variables and server-only variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `APP_URL`) in Vercel Project Settings.

---

## Mapbox Follow-Up Swap Guide

[`src/features/map/PlaceholderMapAdapter.tsx`](src/features/map/PlaceholderMapAdapter.tsx) implements [`MapProviderProps`](src/domain/map/types.ts). In the dedicated Mapbox prompt, swap in a `MapboxMapAdapter` implementing the exact same `IMapProvider` contract inside `src/features/map/` with zero changes to `src/domain/` or `src/features/pins/`.

---

## Security Audit Report (Public-Repo Readiness)

| Security Control | Implementation & Verification |
| --- | --- |
| **Public-Repo Secret Hygiene** | `.gitignore` excludes `.env` and `.env.*` (keeping only `.env.example`). `scripts/check-secrets.mjs` runs in `npm run ci` and GitHub Actions to block tracked `.env` files, live key prefixes (`sk_live_`, `whsec_`, `AIza`, `sb_secret_`), and any `VITE_` server-secret variables. `.dependency-cruiser.cjs` blocks `@google/genai`, `stripe`, and `api/` from ever entering `src/`. |
| **Authentication Policy** | Passwordless-only (`signInWithGoogle` and `sendMagicLink` in `src/platform/supabase/auth.ts`). Zero password registration forms or password storage anywhere in client, API, or SQL. |
| **Database RLS & Least Privilege** | Every table in `supabase/migrations/001_init.sql` enables RLS using `(select auth.uid()) = user_id` and explicit `TO authenticated`/`TO anon` clauses. `subscriptions` has **no** client write policies. `admin_analytics` schema is revoked from `PUBLIC`, `anon`, and `authenticated` and accessible only to `service_role`. |
| **Zero-Free-Message AI Gate** | `api/rizz-coach.ts` validates input with Zod (`400`), verifies Supabase JWT (`401`), and queries `public.subscriptions` server-side (`403` unless `active` or `trialing` and unexpired). Tested in `api/__tests__/rizzCoach.test.ts`. |
| **Stripe Webhook Verification** | `api/stripe-webhook.ts` disables body parsing (`bodyParser: false`), reads the raw UTF-8 buffer, and calls `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` before any `subscriptions` upsert. Tested in `api/__tests__/stripeWebhook.test.ts`. |
| **Client-Side AES-GCM & EXIF Stripping** | `src/platform/crypto/webCryptoService.ts` encrypts `notes`, `intimacyLevel`, and `vaultAlias` with AES-256-GCM + random 12-byte IV + PBKDF2-SHA256 before Dexie or Supabase persistence. `src/platform/media/imageProcessor.ts` re-encodes uploads through HTML5 Canvas (`<= 1024px`) to strip all EXIF/GPS metadata prior to saving or uploading to private Storage (`pin-photos`, 5-min signed URLs). |
| **XSS & Header Hardening** | Zero `dangerouslySetInnerHTML` usage; React escapes all user strings; Zod validates every form/API/spreadsheet input; `vercel.json` sets strict CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy`. |
