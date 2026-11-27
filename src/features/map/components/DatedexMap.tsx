/**
 * @module features/map/components/DatedexMap
 * Production Datédex Monochrome 3D-to-2D-to-3D Mapbox GL JS v3+ component implementing
 * `IMapProvider` (`MapProviderProps`) with globe space fog, street-level 3D extrusions,
 * auto-pitch lifecycle, pin clustering, 3-way coordinate entry, Vault masking, and strict cleanup.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import mapboxgl, { type LngLatBounds, type MapMouseEvent } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Compass, Crosshair, MapPin, Search, X } from 'lucide-react';
import { getCountryFlag, searchCities, type CityCoordinateEntry } from '../../../domain/countries/countries';
import type { MapCoordinate, MapMarker, MapProviderProps } from '../../../domain/map/types';
import type { DecryptedPin } from '../../../domain/models/pin';
import { maskPinForDiscreet, type DisplayPin } from '../../../domain/vault/masking';
import {
  AUTO_PITCH_ENTER_ZOOM,
  AUTO_PITCH_TARGET_DEGREES,
  BUILDINGS_3D_LAYER_ID,
  DEFAULT_GLOBE_ZOOM,
  MONOCHROME_BASE_STYLE,
  applyMonochromeStyle,
  evaluateAutoPitchTransition,
  type AutoPitchState,
} from '../utils/monochromeStyle';
import { MapFloatingControls } from './MapFloatingControls';

/**
 * Extended props for `DatedexMap`, strictly satisfying `MapProviderProps` (`IMapProvider`)
 * while supporting full pin masking and area bounds search.
 */
export interface DatedexMapProps extends MapProviderProps {
  /** Optional full decrypted pins used by `maskPinForDiscreet` for vault aliases and photo masking. */
  pins?: DecryptedPin[];
  /** Visual indicator that a "Search this area" bounds filter is active. */
  isAreaFiltered?: boolean;
  /** Invoked by the bottom-center "Search this area" pill with `map.getBounds()`. */
  onSearchBounds?: (bounds: LngLatBounds | null) => void;
  /** Optional token override; defaults strictly to `import.meta.env.VITE_MAPBOX_ACCESS_TOKEN`. */
  accessToken?: string;
}

/**
 * Single pin renderable item returned by `clusterMapMarkers`.
 */
export interface SingleMapClusterItem {
  type: 'pin';
  id: string;
  marker: MapMarker;
  latitude: number;
  longitude: number;
}

/**
 * Grouped cluster renderable item returned by `clusterMapMarkers` at globe zooms (`< 5`).
 */
export interface GroupedMapClusterItem {
  type: 'cluster';
  id: string;
  markers: MapMarker[];
  latitude: number;
  longitude: number;
}

/**
 * Union of individual pin and globe cluster items rendered on the map.
 */
export type MapRenderItem = SingleMapClusterItem | GroupedMapClusterItem;

interface MountedMarkerHandle {
  marker: mapboxgl.Marker;
  element: HTMLElement;
  onClick: () => void;
}

const DEFAULT_GLOBE_CENTER: [number, number] = [0, 20];
const CLUSTER_MAX_ZOOM = 5;

/**
 * Resolves a map marker through `maskPinForDiscreet` (`src/domain/vault/masking.ts`) so
 * Vault / Discreet mode redacts names, cities, and avatar photos consistently across features.
 * @param {MapMarker} marker - Lightweight `IMapProvider` marker.
 * @param {ReadonlyMap<string, DecryptedPin>} pinLookup - Optional lookup of full decrypted pins.
 * @param {boolean} discreetMode - Whether global Vault / Discreet mode is active.
 * @returns {DisplayPin} Masked or unmasked display projection.
 */
export function resolveMaskedMapPin(
  marker: MapMarker,
  pinLookup: ReadonlyMap<string, DecryptedPin>,
  discreetMode: boolean,
): DisplayPin {
  const existing = pinLookup.get(marker.id);
  const pinRecord: DecryptedPin = existing ?? {
    id: marker.id,
    name: marker.label,
    age: null,
    nationalityCode: marker.nationalityCode,
    city: marker.city,
    latitude: marker.latitude,
    longitude: marker.longitude,
    rating: marker.rating,
    relationshipStatus: 'first_date',
    intimacyLevel: 'none',
    metChannel: 'Other',
    dateMet: '2026-01-01',
    notes: '',
    vaultLocked: marker.isVaultLocked,
    vaultAlias: '',
    photoDataUrl: null,
    photoStoragePath: null,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    syncPending: false,
  };

  return maskPinForDiscreet(pinRecord, discreetMode);
}

/**
 * Clusters spatially close pins at globe zoom (`zoom < 5`) and expands them to individual
 * flag/rating pins at country, city, and street zooms (`zoom >= 5`).
 * @param {MapMarker[]} markers - Active markers to plot.
 * @param {number} zoom - Current map zoom level.
 * @returns {MapRenderItem[]} Renderable clusters and standalone pins.
 */
export function clusterMapMarkers(markers: MapMarker[], zoom: number): MapRenderItem[] {
  if (zoom >= CLUSTER_MAX_ZOOM || markers.length <= 1) {
    return markers.map((marker) => ({
      type: 'pin',
      id: marker.id,
      marker,
      latitude: marker.latitude,
      longitude: marker.longitude,
    }));
  }

  // Angular grouping threshold in degrees, tightening smoothly as the user zooms toward Mercator
  const thresholdDeg = Math.max(5, 18 / Math.pow(2, Math.max(0, zoom - 1)));
  const buckets: Array<{ markers: MapMarker[]; sumLat: number; sumLng: number }> = [];

  for (const marker of markers) {
    let matchedBucket: { markers: MapMarker[]; sumLat: number; sumLng: number } | null = null;
    for (const bucket of buckets) {
      const centerLat = bucket.sumLat / bucket.markers.length;
      const centerLng = bucket.sumLng / bucket.markers.length;
      const dLat = marker.latitude - centerLat;
      const dLng = marker.longitude - centerLng;
      if (Math.hypot(dLat, dLng) <= thresholdDeg) {
        matchedBucket = bucket;
        break;
      }
    }

    if (matchedBucket) {
      matchedBucket.markers.push(marker);
      matchedBucket.sumLat += marker.latitude;
      matchedBucket.sumLng += marker.longitude;
    } else {
      buckets.push({
        markers: [marker],
        sumLat: marker.latitude,
        sumLng: marker.longitude,
      });
    }
  }

  return buckets.map((bucket) => {
    const first = bucket.markers[0];
    if (bucket.markers.length === 1 && first) {
      return {
        type: 'pin',
        id: first.id,
        marker: first,
        latitude: first.latitude,
        longitude: first.longitude,
      };
    }

    const avgLat = bucket.sumLat / bucket.markers.length;
    const avgLng = bucket.sumLng / bucket.markers.length;
    return {
      type: 'cluster',
      id: `cluster-${bucket.markers.map((m) => m.id).join('-')}`,
      markers: bucket.markers,
      latitude: avgLat,
      longitude: avgLng,
    };
  });
}

function buildPinMarkerElement(
  marker: MapMarker,
  display: DisplayPin,
  isSelected: boolean,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = `map-pin-${marker.id}`;
  button.dataset.masked = String(display.isMasked);
  button.setAttribute(
    'aria-label',
    `${display.displayName}, ${display.displayCity}, rated ${marker.rating.toFixed(1)}`,
  );
  button.className = [
    'group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
    'shadow-lg shadow-black/75 transition-transform focus-visible:outline-2 focus-visible:outline-white',
    isSelected
      ? 'scale-110 border-white bg-white text-black'
      : 'border-white/25 bg-[#111111]/95 text-white hover:scale-105 hover:border-white/60',
  ].join(' ');

  // Only render avatar image when unmasked (Vault / Discreet mode sets displayPhotoUrl to null)
  if (!display.isMasked && display.displayPhotoUrl) {
    const avatar = document.createElement('img');
    avatar.src = display.displayPhotoUrl;
    avatar.alt = '';
    avatar.className = 'h-4 w-4 rounded-full object-cover grayscale';
    button.appendChild(avatar);
  }

  const flagSpan = document.createElement('span');
  flagSpan.setAttribute('aria-hidden', 'true');
  flagSpan.textContent = getCountryFlag(marker.nationalityCode);
  button.appendChild(flagSpan);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'max-w-[76px] truncate';
  nameSpan.textContent = display.displayName;
  button.appendChild(nameSpan);

  const ratingSpan = document.createElement('span');
  ratingSpan.className = isSelected
    ? 'rounded-full bg-black/15 px-1.5 py-0.5 font-mono text-[10px] text-black'
    : 'rounded-full bg-white/15 px-1.5 py-0.5 font-mono text-[10px] text-neutral-200';
  ratingSpan.textContent = `★${marker.rating.toFixed(1)}`;
  button.appendChild(ratingSpan);

  return button;
}

function buildClusterMarkerElement(cluster: GroupedMapClusterItem): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = `map-cluster-${cluster.markers.length}`;
  button.setAttribute('aria-label', `Zoom into cluster of ${cluster.markers.length} connections`);
  button.className = [
    'inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-[#111111]/95 px-2.5 py-1.5',
    'text-xs font-bold text-white shadow-xl shadow-black/80 transition-transform hover:scale-105',
    'focus-visible:outline-2 focus-visible:outline-white',
  ].join(' ');

  const uniqueFlags = Array.from(
    new Set(cluster.markers.map((m) => getCountryFlag(m.nationalityCode))),
  ).slice(0, 3);

  const flagsSpan = document.createElement('span');
  flagsSpan.setAttribute('aria-hidden', 'true');
  flagsSpan.className = 'text-xs leading-none';
  flagsSpan.textContent = uniqueFlags.join('');
  button.appendChild(flagsSpan);

  const countSpan = document.createElement('span');
  countSpan.className =
    'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 font-mono text-[10px] font-bold text-black';
  countSpan.textContent = String(cluster.markers.length);
  button.appendChild(countSpan);

  return button;
}

function buildDraftMarkerElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.dataset.testid = 'map-draft-marker';
  el.className =
    'pointer-events-none flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-black/80 text-white shadow-lg';
  el.textContent = '+';
  return el;
}

function projectLngToPercent(lng: number): number {
  return ((lng + 180) / 360) * 100;
}

function projectLatToPercent(lat: number): number {
  return ((90 - lat) / 180) * 100;
}

/**
 * Datédex Monochrome 3D-to-2D-to-3D Mapbox GL JS v3+ component implementing `IMapProvider`.
 * Gracefully degrades to an interactive monochrome fallback when `VITE_MAPBOX_ACCESS_TOKEN` is absent.
 * @param {DatedexMapProps} props - Map markers, Vault flags, viewport, and interaction callbacks.
 * @returns {React.JSX.Element} Rendered Mapbox GL canvas or monochrome fallback.
 */
export function DatedexMap({
  markers,
  pins,
  selectedPinId = null,
  draftCoordinate = null,
  discreetMode,
  isAreaFiltered = false,
  viewport,
  onViewportChange,
  onSelectMarker,
  onMapClick,
  onSearchBounds,
  accessToken,
}: DatedexMapProps): React.JSX.Element {
  // Security: read public token strictly from Vite env (never hardcoded)
  const resolvedToken = (accessToken ?? import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '').trim();
  const hasMapboxToken = resolvedToken.length > 0;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mountedMarkersRef = useRef<MountedMarkerHandle[]>([]);
  const draftMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const autoPitchStateRef = useRef<AutoPitchState>({ manualOverride: false, regime: 'flat' });
  const isAutoEasingPitchRef = useRef(false);

  const [show3DBuildings, setShow3DBuildings] = useState(true);
  const [dropPinMode, setDropPinMode] = useState(false);
  const [manualCoordOpen, setManualCoordOpen] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualCoordError, setManualCoordError] = useState<string | null>(null);
  const [liveZoom, setLiveZoom] = useState<number>(viewport.zoom || DEFAULT_GLOBE_ZOOM);

  const show3DBuildingsRef = useRef(show3DBuildings);
  show3DBuildingsRef.current = show3DBuildings;

  const dropPinModeRef = useRef(dropPinMode);
  dropPinModeRef.current = dropPinMode;

  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const onSelectMarkerRef = useRef(onSelectMarker);
  onSelectMarkerRef.current = onSelectMarker;

  const initialViewportRef = useRef(viewport);

  const pinLookup = useMemo(() => {
    const map = new Map<string, DecryptedPin>();
    if (pins) {
      for (const pin of pins) {
        map.set(pin.id, pin);
      }
    }
    return map;
  }, [pins]);

  const placeSuggestions = useMemo(
    () => (placeQuery.trim().length > 0 ? searchCities(placeQuery, 5) : []),
    [placeQuery],
  );

  const clearMountedMarkers = useCallback((): void => {
    for (const handle of mountedMarkersRef.current) {
      handle.element.removeEventListener('click', handle.onClick);
      handle.marker.remove();
    }
    mountedMarkersRef.current = [];
  }, []);

  // Initialize Mapbox GL JS v3+ globe instance and wire lifecycle listeners + unmount cleanup
  useEffect(() => {
    if (!hasMapboxToken || !containerRef.current) {
      return;
    }

    mapboxgl.accessToken = resolvedToken;

    const initialZoom =
      Number.isFinite(initialViewportRef.current.zoom) && initialViewportRef.current.zoom > 0
        ? initialViewportRef.current.zoom
        : DEFAULT_GLOBE_ZOOM;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MONOCHROME_BASE_STYLE,
      projection: 'globe',
      center: [initialViewportRef.current.longitude, initialViewportRef.current.latitude],
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
      antialias: true,
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true,
      touchZoomRotate: true,
      attributionControl: true,
    });

    mapRef.current = map;
    autoPitchStateRef.current = { manualOverride: false, regime: 'flat' };

    const handleStyleLoad = (): void => {
      applyMonochromeStyle(map, { show3DBuildings: show3DBuildingsRef.current });
    };

    const handlePitchStart = (event: unknown): void => {
      // Mark manual override whenever tilt originates from user pointer/touch gesture
      const hasUserOrigin =
        typeof event === 'object' &&
        event !== null &&
        'originalEvent' in event &&
        Boolean((event as { originalEvent?: unknown }).originalEvent);

      if (hasUserOrigin || !isAutoEasingPitchRef.current) {
        autoPitchStateRef.current = {
          ...autoPitchStateRef.current,
          manualOverride: true,
        };
      }
    };

    const handleZoom = (): void => {
      const currentZoom = map.getZoom();
      const currentPitch = map.getPitch();

      const decision = evaluateAutoPitchTransition(
        currentZoom,
        currentPitch,
        show3DBuildingsRef.current,
        autoPitchStateRef.current,
      );
      autoPitchStateRef.current = decision.nextState;

      if (decision.targetPitch !== null) {
        isAutoEasingPitchRef.current = true;
        map.easeTo({ pitch: decision.targetPitch, duration: 650 });
      }

      // Sync zoom state on bucket transitions to update globe clustering without excessive renders
      setLiveZoom((prev) => (Math.floor(prev) !== Math.floor(currentZoom) ? currentZoom : prev));
    };

    const handleMoveEnd = (): void => {
      isAutoEasingPitchRef.current = false;
      const center = map.getCenter();
      const zoom = map.getZoom();
      setLiveZoom(zoom);
      onViewportChangeRef.current({
        latitude: Number(center.lat.toFixed(5)),
        longitude: Number(center.lng.toFixed(5)),
        zoom: Number(zoom.toFixed(2)),
      });
    };

    const handleMapClick = (event: MapMouseEvent): void => {
      if (!dropPinModeRef.current) return;
      const coord: MapCoordinate = {
        latitude: Number(event.lngLat.lat.toFixed(5)),
        longitude: Number(event.lngLat.lng.toFixed(5)),
      };
      setDropPinMode(false);
      onMapClickRef.current(coord);
    };

    map.on('style.load', handleStyleLoad);
    map.on('pitchstart', handlePitchStart);
    map.on('zoom', handleZoom);
    map.on('moveend', handleMoveEnd);
    map.on('click', handleMapClick);

    return () => {
      clearMountedMarkers();
      if (draftMarkerRef.current) {
        draftMarkerRef.current.remove();
        draftMarkerRef.current = null;
      }
      map.off('style.load', handleStyleLoad);
      map.off('pitchstart', handlePitchStart);
      map.off('zoom', handleZoom);
      map.off('moveend', handleMoveEnd);
      map.off('click', handleMapClick);
      map.remove();
      mapRef.current = null;
    };
  }, [hasMapboxToken, resolvedToken, clearMountedMarkers]);

  // Synchronize pin & cluster markers with Vault/Discreet masking
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    clearMountedMarkers();
    const renderItems = clusterMapMarkers(markers, liveZoom);

    for (const item of renderItems) {
      if (item.type === 'cluster') {
        const element = buildClusterMarkerElement(item);
        const onClick = (): void => {
          const nextZoom = Math.min(Math.max(map.getZoom() + 3.5, 6), 12);
          map.flyTo({
            center: [item.longitude, item.latitude],
            zoom: nextZoom,
            duration: 850,
            essential: true,
          });
        };
        element.addEventListener('click', onClick);
        const mapboxMarker = new mapboxgl.Marker({ element, anchor: 'center' })
          .setLngLat([item.longitude, item.latitude])
          .addTo(map);
        mountedMarkersRef.current.push({ marker: mapboxMarker, element, onClick });
      } else {
        const display = resolveMaskedMapPin(item.marker, pinLookup, discreetMode);
        const element = buildPinMarkerElement(
          item.marker,
          display,
          item.marker.id === selectedPinId,
        );
        const onClick = (): void => {
          map.flyTo({
            center: [item.longitude, item.latitude],
            zoom: Math.max(map.getZoom(), 14.5),
            duration: 900,
            essential: true,
          });
          onSelectMarkerRef.current(item.marker.id);
        };
        element.addEventListener('click', onClick);
        const mapboxMarker = new mapboxgl.Marker({ element, anchor: 'bottom' })
          .setLngLat([item.longitude, item.latitude])
          .addTo(map);
        mountedMarkersRef.current.push({ marker: mapboxMarker, element, onClick });
      }
    }

    return () => {
      clearMountedMarkers();
    };
  }, [markers, pinLookup, discreetMode, selectedPinId, liveZoom, clearMountedMarkers, hasMapboxToken]);

  // Synchronize draft coordinate crosshair marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (draftMarkerRef.current) {
      draftMarkerRef.current.remove();
      draftMarkerRef.current = null;
    }

    if (draftCoordinate) {
      draftMarkerRef.current = new mapboxgl.Marker({
        element: buildDraftMarkerElement(),
        anchor: 'center',
      })
        .setLngLat([draftCoordinate.longitude, draftCoordinate.latitude])
        .addTo(map);
    }

    return () => {
      if (draftMarkerRef.current) {
        draftMarkerRef.current.remove();
        draftMarkerRef.current = null;
      }
    };
  }, [draftCoordinate, hasMapboxToken]);

  // Smoothly flyTo when an external pin selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPinId) return;
    const found = markers.find((m) => m.id === selectedPinId);
    if (!found) return;
    map.flyTo({
      center: [found.longitude, found.latitude],
      zoom: Math.max(map.getZoom(), 14),
      duration: 850,
      essential: true,
    });
  }, [selectedPinId, markers]);

  const handleToggle3DBuildings = useCallback((): void => {
    setShow3DBuildings((prev) => {
      const next = !prev;
      const map = mapRef.current;
      if (map) {
        if (map.getLayer(BUILDINGS_3D_LAYER_ID)) {
          map.setLayoutProperty(
            BUILDINGS_3D_LAYER_ID,
            'visibility',
            next ? 'visible' : 'none',
          );
        }
        if (!next) {
          isAutoEasingPitchRef.current = true;
          autoPitchStateRef.current = { manualOverride: false, regime: 'flat' };
          map.easeTo({ pitch: 0, duration: 500 });
        } else if (map.getZoom() > AUTO_PITCH_ENTER_ZOOM) {
          isAutoEasingPitchRef.current = true;
          autoPitchStateRef.current = { manualOverride: false, regime: 'tilted' };
          map.easeTo({ pitch: AUTO_PITCH_TARGET_DEGREES, duration: 500 });
        }
      }
      return next;
    });
  }, []);

  const handleSearchArea = useCallback((): void => {
    const bounds = mapRef.current ? mapRef.current.getBounds() : null;
    onSearchBounds?.(bounds);
  }, [onSearchBounds]);

  const handleZoomIn = useCallback((): void => {
    if (mapRef.current) {
      mapRef.current.zoomIn({ duration: 300 });
      return;
    }
    const nextZoom = Math.min(18, Number((liveZoom + 1).toFixed(2)));
    setLiveZoom(nextZoom);
    onViewportChange({ ...viewport, zoom: nextZoom });
  }, [liveZoom, viewport, onViewportChange]);

  const handleZoomOut = useCallback((): void => {
    if (mapRef.current) {
      mapRef.current.zoomOut({ duration: 300 });
      return;
    }
    const nextZoom = Math.max(1, Number((liveZoom - 1).toFixed(2)));
    setLiveZoom(nextZoom);
    onViewportChange({ ...viewport, zoom: nextZoom });
  }, [liveZoom, viewport, onViewportChange]);

  const flyToGlobeOverview = useCallback((): void => {
    const map = mapRef.current;
    autoPitchStateRef.current = { manualOverride: false, regime: 'flat' };
    if (map) {
      isAutoEasingPitchRef.current = true;
      map.flyTo({
        center: DEFAULT_GLOBE_CENTER,
        zoom: DEFAULT_GLOBE_ZOOM,
        pitch: 0,
        bearing: 0,
        duration: 1000,
        essential: true,
      });
    } else {
      setLiveZoom(DEFAULT_GLOBE_ZOOM);
      onViewportChange({
        latitude: DEFAULT_GLOBE_CENTER[1],
        longitude: DEFAULT_GLOBE_CENTER[0],
        zoom: DEFAULT_GLOBE_ZOOM,
      });
    }
  }, [onViewportChange]);

  const handleLocateOrRecenter = useCallback((): void => {
    const map = mapRef.current;
    const currentZoom = map ? map.getZoom() : liveZoom;

    // When zoomed in, recenter directly to the 3D space globe overview
    if (currentZoom >= 4) {
      flyToGlobeOverview();
      return;
    }

    // At globe overview, attempt browser geolocation with graceful fallback to globe recenter
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          if (mapRef.current) {
            mapRef.current.flyTo({
              center: [longitude, latitude],
              zoom: 13.5,
              pitch: 0,
              duration: 1000,
              essential: true,
            });
          } else {
            setLiveZoom(13.5);
            onViewportChange({ latitude, longitude, zoom: 13.5 });
          }
        },
        () => {
          flyToGlobeOverview();
        },
        { enableHighAccuracy: false, timeout: 6000 },
      );
      return;
    }

    flyToGlobeOverview();
  }, [liveZoom, flyToGlobeOverview, onViewportChange]);

  const handleSelectPlace = useCallback(
    (entry: CityCoordinateEntry): void => {
      setPlaceQuery('');
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [entry.longitude, entry.latitude],
          zoom: 12.5,
          duration: 950,
          essential: true,
        });
      } else {
        setLiveZoom(12.5);
        onViewportChange({
          latitude: entry.latitude,
          longitude: entry.longitude,
          zoom: 12.5,
        });
      }
    },
    [onViewportChange],
  );

  const handleManualCoordinateAction = useCallback(
    (action: 'fly' | 'drop'): void => {
      const lat = Number(manualLat);
      const lng = Number(manualLng);
      if (
        !manualLat.trim() ||
        !manualLng.trim() ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        setManualCoordError('Enter valid lat (-90..90) & lng (-180..180).');
        return;
      }

      setManualCoordError(null);
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [lng, lat],
          zoom: Math.max(mapRef.current.getZoom(), 14),
          duration: 900,
          essential: true,
        });
      } else {
        onViewportChange({ latitude: lat, longitude: lng, zoom: 14 });
      }

      if (action === 'drop') {
        setManualCoordOpen(false);
        onMapClick({ latitude: Number(lat.toFixed(5)), longitude: Number(lng.toFixed(5)) });
      }
    },
    [manualLat, manualLng, onMapClick, onViewportChange],
  );

  const handleFallbackCanvasClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!dropPinMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xRatio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const yRatio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const longitude = Number((xRatio * 360 - 180).toFixed(4));
    const latitude = Number((90 - yRatio * 180).toFixed(4));
    setDropPinMode(false);
    onMapClick({ latitude, longitude });
  };

  return (
    <section
      aria-label="Datédex Monochrome 3D Map"
      className="relative h-[min(74dvh,640px)] min-h-[460px] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#050505]"
    >
      {/* Top 3-Way Coordinate & Search Toolbar */}
      <div
        data-testid="map-top-toolbar"
        className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col gap-2"
      >
          <div className="pointer-events-auto flex items-center gap-1.5">
            {/* Place search input (Way 2 of 3-way coordinate entry) */}
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-2.5 left-3 h-3.5 w-3.5 text-neutral-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                aria-label="Search city or place on map"
                placeholder="Fly to city (Tokyo, Milan, Lisbon)..."
                className="h-9 w-full rounded-full border border-white/15 bg-[#111111]/95 pr-3 pl-8 text-xs text-white placeholder:text-neutral-500 shadow-lg backdrop-blur focus-visible:outline-2 focus-visible:outline-white"
              />
            </div>

            {/* Tap-to-drop-pin mode toggle (Way 1 of 3-way coordinate entry) */}
            <button
              type="button"
              aria-pressed={dropPinMode}
              aria-label="Toggle drop pin mode"
              onClick={() => setDropPinMode((prev) => !prev)}
              className={`inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold shadow-lg transition focus-visible:outline-2 focus-visible:outline-white ${
                dropPinMode
                  ? 'border-white bg-white text-black'
                  : 'border-white/15 bg-[#111111]/95 text-white hover:bg-[#1f1f1f]'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{dropPinMode ? 'Tap Map' : 'Drop Pin'}</span>
            </button>

            {/* Manual Lat/Lng toggle (Way 3 of 3-way coordinate entry) */}
            <button
              type="button"
              aria-expanded={manualCoordOpen}
              aria-label="Manual latitude and longitude entry"
              onClick={() => setManualCoordOpen((prev) => !prev)}
              className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-lg transition focus-visible:outline-2 focus-visible:outline-white ${
                manualCoordOpen
                  ? 'border-white bg-white text-black'
                  : 'border-white/15 bg-[#111111]/95 text-white hover:bg-[#1f1f1f]'
              }`}
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Offline city search dropdown */}
          {placeSuggestions.length > 0 && (
            <div className="pointer-events-auto flex flex-wrap gap-1.5 rounded-2xl border border-white/15 bg-[#111111]/95 p-2 shadow-xl backdrop-blur">
              {placeSuggestions.map((entry) => (
                <button
                  key={`${entry.city}-${entry.countryCode}`}
                  type="button"
                  onClick={() => handleSelectPlace(entry)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[11px] font-medium text-neutral-200 hover:border-white/50 hover:text-white"
                >
                  <span>{getCountryFlag(entry.countryCode)}</span>
                  <span>{entry.city}</span>
                </button>
              ))}
            </div>
          )}

          {/* Manual Lat/Lng numeric jump/drop bar */}
          {manualCoordOpen && (
            <div className="pointer-events-auto space-y-2 rounded-2xl border border-white/15 bg-[#111111]/95 p-3 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between text-[11px] font-medium text-neutral-300">
                <span>Manual Coordinates (WGS84)</span>
                <button
                  type="button"
                  aria-label="Close manual coordinate panel"
                  onClick={() => setManualCoordOpen(false)}
                  className="rounded-full p-0.5 text-neutral-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="Lat (e.g. 48.8566)"
                  aria-label="Manual latitude"
                  className="h-8 rounded-lg border border-white/15 bg-black/80 px-2.5 font-mono text-xs text-white placeholder:text-neutral-500"
                />
                <input
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  placeholder="Lng (e.g. 2.3522)"
                  aria-label="Manual longitude"
                  className="h-8 rounded-lg border border-white/15 bg-black/80 px-2.5 font-mono text-xs text-white placeholder:text-neutral-500"
                />
              </div>
              {manualCoordError && (
                <p role="alert" className="text-[11px] text-neutral-300">
                  {manualCoordError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleManualCoordinateAction('fly')}
                  className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium text-white hover:bg-white/10"
                >
                  Fly Here
                </button>
                <button
                  type="button"
                  onClick={() => handleManualCoordinateAction('drop')}
                  className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-black hover:bg-neutral-200"
                >
                  Drop Pin
                </button>
              </div>
            </div>
          )}

          {dropPinMode && (
            <div className="pointer-events-none self-center rounded-full border border-white/30 bg-black/85 px-3 py-1 text-[11px] font-medium text-white shadow">
              Tap anywhere on the map to place a connection pin
            </div>
          )}
      </div>

      {/* Mapbox GL JS v3 Canvas OR Graceful Monochrome Fallback when Token Missing */}
      {hasMapboxToken ? (
        <div
          ref={containerRef}
          data-testid="mapbox-canvas"
          className={`h-full w-full ${dropPinMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        />
      ) : (
        <div
          data-testid="mapbox-missing-token-fallback"
          role="region"
          aria-label="Monochrome map fallback"
          onClick={handleFallbackCanvasClick}
          className={`relative flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_45%,#1a1a1a_0%,#0a0a0a_58%,#050505_100%)] ${
            dropPinMode ? 'cursor-crosshair' : ''
          }`}
        >
          {/* Subtle grayscale globe graticule */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:16.666%_25%]"
          />

          {/* Render masked/unmasked pins even in tokenless offline fallback */}
          {markers.map((marker) => {
            const display = resolveMaskedMapPin(marker, pinLookup, discreetMode);
            const left = projectLngToPercent(marker.longitude);
            const top = projectLatToPercent(marker.latitude);
            const isSelected = marker.id === selectedPinId;
            return (
              <button
                key={marker.id}
                type="button"
                data-testid={`fallback-pin-${marker.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMarker(marker.id);
                }}
                style={{ left: `${left}%`, top: `${top}%` }}
                className={`absolute z-10 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-md ${
                  isSelected
                    ? 'border-white bg-white text-black'
                    : 'border-white/25 bg-[#111111]/95 text-white'
                }`}
              >
                <span>{getCountryFlag(marker.nationalityCode)}</span>
                <span className="max-w-[70px] truncate">{display.displayName}</span>
                <span className="font-mono text-[10px] opacity-80">★{marker.rating.toFixed(1)}</span>
              </button>
            );
          })}

          {draftCoordinate && (
            <div
              style={{
                left: `${projectLngToPercent(draftCoordinate.longitude)}%`,
                top: `${projectLatToPercent(draftCoordinate.latitude)}%`,
              }}
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 text-white"
            >
              <Crosshair className="h-5 w-5" aria-hidden="true" />
            </div>
          )}

          <div className="pointer-events-none relative z-10 mx-6 max-w-xs rounded-2xl border border-white/15 bg-[#111111]/90 px-4 py-3 text-center backdrop-blur">
            <p className="text-xs font-semibold text-white">Monochrome 3D Globe Ready</p>
            <p className="mt-1 text-[11px] text-neutral-400">
              Add <code className="font-mono text-neutral-200">VITE_MAPBOX_ACCESS_TOKEN</code> to
              enable live Mapbox GL v3 tiles and 3D buildings.
            </p>
          </div>
        </div>
      )}

      {/* Floating Bottom-Center & Bottom-Right Monochrome Controls */}
      <MapFloatingControls
        show3DBuildings={show3DBuildings}
        isAreaFiltered={isAreaFiltered}
        isZoomedIn={liveZoom >= 4}
        onSearchArea={handleSearchArea}
        onToggle3DBuildings={handleToggle3DBuildings}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onLocateOrRecenter={handleLocateOrRecenter}
      />
    </section>
  );
}
