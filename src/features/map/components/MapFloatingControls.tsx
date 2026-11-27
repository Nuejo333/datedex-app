/**
 * @module features/map/components/MapFloatingControls
 * Monochrome floating map overlays: bottom-center "Search this area" white pill
 * and bottom-right stacked `#111111` controls (3D buildings toggle, zoom +/- pill,
 * and geolocation / recenter-to-globe trigger), respecting Vault Hide HUD and mobile safe areas.
 */
import { Box, Globe2, LocateFixed, Minus, Plus } from 'lucide-react';

/**
 * Props for `MapFloatingControls`.
 */
export interface MapFloatingControlsProps {
  /** When `true`, hides all floating map HUD controls immediately. */
  hideHud: boolean;
  /** Whether the mobile bottom navigation dock is hidden (adjusts bottom clearance). */
  hideDock: boolean;
  /** Whether the 3D buildings `fill-extrusion` layer and auto-tilt are active. */
  show3DBuildings: boolean;
  /** Whether an area bounds filter is currently active. */
  isAreaFiltered?: boolean;
  /** Whether the map is currently zoomed past globe overview (`zoom >= 4`). */
  isZoomedIn: boolean;
  /** Invoked when the user taps the bottom-center "Search this area" white pill. */
  onSearchArea: () => void;
  /** Invoked when the user toggles the 3D-buildings / layer button. */
  onToggle3DBuildings: () => void;
  /** Invoked when the user taps `+` to zoom in. */
  onZoomIn: () => void;
  /** Invoked when the user taps `-` to zoom out. */
  onZoomOut: () => void;
  /** Invoked when the user taps geolocation / recenter-to-globe. */
  onLocateOrRecenter: () => void;
}

/**
 * Renders Datédex monochrome floating map controls with safe-area bottom clearance
 * above the mobile dock and instant suppression when Hide HUD is active.
 * @param {MapFloatingControlsProps} props - Control states and map action callbacks.
 * @returns {React.JSX.Element | null} Floating controls overlay or `null` when HUD is hidden.
 */
export function MapFloatingControls({
  hideHud,
  hideDock,
  show3DBuildings,
  isAreaFiltered = false,
  isZoomedIn,
  onSearchArea,
  onToggle3DBuildings,
  onZoomIn,
  onZoomOut,
  onLocateOrRecenter,
}: MapFloatingControlsProps): React.JSX.Element | null {
  if (hideHud) {
    return null;
  }

  // Safe-area clearance ensures controls never collide with the mobile bottom dock or iOS home indicator
  const centerBottomClass = hideDock
    ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)]'
    : 'bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)]';

  const rightStackBottomClass = hideDock
    ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)]'
    : 'bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)]';

  return (
    <div
      data-testid="map-floating-controls"
      className="pointer-events-none absolute inset-0 z-20"
    >
      {/* Bottom-Center: High-contrast white pill ("Search this area") with black text */}
      <div
        className={`pointer-events-auto absolute left-1/2 -translate-x-1/2 ${centerBottomClass}`}
      >
        <button
          type="button"
          onClick={onSearchArea}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold tracking-tight text-black shadow-xl shadow-black/60 ring-1 ring-black/15 transition hover:bg-neutral-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span>Search this area</span>
          {isAreaFiltered && (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-black"
            />
          )}
        </button>
      </div>

      {/* Bottom-Right: Vertically stacked #111111 controls with white icons */}
      <div
        className={`pointer-events-auto absolute right-3 flex flex-col items-center gap-2 ${rightStackBottomClass}`}
      >
        {/* (1) 3D-buildings / layer toggle */}
        <button
          type="button"
          aria-label={show3DBuildings ? 'Disable 3D buildings' : 'Enable 3D buildings'}
          aria-pressed={show3DBuildings}
          title={show3DBuildings ? '3D Buildings On' : '3D Buildings Off'}
          onClick={onToggle3DBuildings}
          className={`flex h-10 w-10 items-center justify-center rounded-full bg-[#111111] text-white shadow-lg shadow-black/70 transition hover:bg-[#1f1f1f] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            show3DBuildings
              ? 'ring-2 ring-white/80'
              : 'border border-white/15 text-neutral-400'
          }`}
        >
          <Box className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* (2) + / - Zoom Pill */}
        <div
          role="group"
          aria-label="Map zoom controls"
          className="flex flex-col overflow-hidden rounded-full border border-white/15 bg-[#111111] text-white shadow-lg shadow-black/70"
        >
          <button
            type="button"
            aria-label="Zoom in"
            onClick={onZoomIn}
            className="flex h-10 w-10 items-center justify-center transition hover:bg-[#1f1f1f] active:bg-[#2a2a2a] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-white"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="mx-2 h-px bg-white/15" aria-hidden="true" />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={onZoomOut}
            className="flex h-10 w-10 items-center justify-center transition hover:bg-[#1f1f1f] active:bg-[#2a2a2a] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-white"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* (3) Geolocation / Recenter-to-Globe button */}
        <button
          type="button"
          aria-label={isZoomedIn ? 'Recenter to 3D globe' : 'Locate me or recenter globe'}
          title={isZoomedIn ? 'Recenter to 3D Globe' : 'Locate Me / Recenter Globe'}
          onClick={onLocateOrRecenter}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-[#111111] text-white shadow-lg shadow-black/70 transition hover:bg-[#1f1f1f] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {isZoomedIn ? (
            <Globe2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
