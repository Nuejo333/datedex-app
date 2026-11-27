/**
 * @module domain/map/types
 * Clean IMapProvider contract decoupling UI features from the concrete map engine
 * (Placeholder adapter now; ready for dedicated Mapbox GL prompt).
 */

/**
 * Geographic coordinate pair in WGS84 degrees.
 */
export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

/**
 * Lightweight marker projection passed to `IMapProvider`.
 */
export interface MapMarker {
  id: string;
  label: string;
  city: string;
  birthCity?: string;
  livingCity?: string;
  metCity?: string;
  nationalityCode: string;
  latitude: number;
  longitude: number;
  rating: number;
  isVaultLocked: boolean;
}

/**
 * Viewport state for centering and zooming the map adapter.
 */
export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

/**
 * Props contract implemented by any `IMapProvider` component (Placeholder or Mapbox).
 */
export interface MapProviderProps {
  markers: MapMarker[];
  selectedPinId?: string | null;
  draftCoordinate?: MapCoordinate | null;
  discreetMode: boolean;
  viewport: MapViewport;
  onViewportChange: (next: MapViewport) => void;
  onSelectMarker: (pinId: string) => void;
  onMapClick: (coordinate: MapCoordinate) => void;
}
