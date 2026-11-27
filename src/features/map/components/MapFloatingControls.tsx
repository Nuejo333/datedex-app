/**
 * @module features/map/components/MapFloatingControls
 * Monochrome floating map overlays: bottom-right stacked `#111111` controls
 * (3D buildings toggle above zoom +/- pill and geolocation / recenter-to-globe trigger)
 * positioned cleanly above the permanent bottom dock.
 */
import { Box, Globe2, LocateFixed, Minus, Plus } from 'lucide-react';
import { useTranslation } from '../../../platform/i18n/LanguageContext';

/**
 * Props for `MapFloatingControls`.
 */
export interface MapFloatingControlsProps {
  /** Whether the 3D buildings `fill-extrusion` layer and auto-tilt are active. */
  show3DBuildings: boolean;
  /** Whether the map is currently zoomed past globe overview (`zoom >= 4`). */
  isZoomedIn: boolean;
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
 * above the permanently visible mobile bottom dock.
 * @param {MapFloatingControlsProps} props - Control states and map action callbacks.
 * @returns {React.JSX.Element} Floating controls overlay.
 */
export function MapFloatingControls({
  show3DBuildings,
  isZoomedIn,
  onToggle3DBuildings,
  onZoomIn,
  onZoomOut,
  onLocateOrRecenter,
}: MapFloatingControlsProps): React.JSX.Element {
  const { t } = useTranslation();
  // Safe-area clearance ensures controls never collide with the mobile bottom dock or Mapbox attribution
  const rightStackBottomClass = 'bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)]';

  return (
    <div
      data-testid="map-floating-controls"
      className="pointer-events-none absolute inset-0 z-20"
    >
      {/* Bottom-Right: Vertically stacked #111111 controls with white icons */}
      <div
        className={`pointer-events-auto absolute right-3 flex flex-col items-center gap-2 ${rightStackBottomClass}`}
      >
        {/* (1) 3D-buildings / layer toggle */}
        <button
          type="button"
          aria-label={show3DBuildings ? t('map.disable3DAria') : t('map.enable3DAria')}
          aria-pressed={show3DBuildings}
          title={show3DBuildings ? t('map.buildingsOnTitle') : t('map.buildingsOffTitle')}
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
          aria-label={t('map.zoomControlsAria')}
          className="flex flex-col overflow-hidden rounded-full border border-white/15 bg-[#111111] text-white shadow-lg shadow-black/70"
        >
          <button
            type="button"
            aria-label={t('map.zoomInAria')}
            onClick={onZoomIn}
            className="flex h-10 w-10 items-center justify-center transition hover:bg-[#1f1f1f] active:bg-[#2a2a2a] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-white"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="mx-2 h-px bg-white/15" aria-hidden="true" />
          <button
            type="button"
            aria-label={t('map.zoomOutAria')}
            onClick={onZoomOut}
            className="flex h-10 w-10 items-center justify-center transition hover:bg-[#1f1f1f] active:bg-[#2a2a2a] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-white"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* (3) Geolocation / Recenter-to-Globe button */}
        <button
          type="button"
          aria-label={isZoomedIn ? t('map.recenterGlobeAria') : t('map.locateOrRecenterAria')}
          title={isZoomedIn ? t('map.recenterGlobeTitle') : t('map.locateOrRecenterTitle')}
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
