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
