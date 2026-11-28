/**
 * @module features/map/components/DatedexMap
 * Production Datédex Monochrome 3D-to-2D-to-3D Mapbox GL JS v3+ component implementing
 * `IMapProvider` (`MapProviderProps`) with globe space fog, street-level 3D extrusions,
 * auto-pitch lifecycle, pointer-anchored map pins (flag + initials, zero score),
 * proximity clustering with zoom-to-expand, Vault/Discreet masking, and strict cleanup.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getCountryFlag } from '../../../domain/countries/countries';
import {
  EMPTY_CITY_FILTER,
  filterByActiveCityFilter,
  getCityOptionsForDimension,
  type ActiveCityFilter,
  type CityFilterDimension,
} from '../../../domain/filters/pinCityFilters';
import type { MapMarker, MapProviderProps } from '../../../domain/map/types';
import type { DecryptedPin } from '../../../domain/models/pin';
import { maskPinForDiscreet, type DisplayPin } from '../../../domain/vault/masking';
import { useTranslation } from '../../../platform/i18n/LanguageContext';
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
 * while supporting full pin masking via `maskPinForDiscreet`.
 */
export interface DatedexMapProps extends MapProviderProps {
  /** Optional full decrypted pins used by `maskPinForDiscreet` for vault aliases. */
  pins?: DecryptedPin[];
  /** Optional shared city filter synchronized with `Pokédex`. */
  cityFilter?: ActiveCityFilter;
  /** Callback when the user changes or clears the map city filter. */
  onCityFilterChange?: (next: ActiveCityFilter) => void;
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
  /** Original co-located center latitude when spiderfied into a radial ring at max zoom. */
  originLatitude?: number;
  /** Original co-located center longitude when spiderfied into a radial ring at max zoom. */
  originLongitude?: number;
  /** True when two or more co-located pins are fanned out in a circular ring. */
  isSpiderfied?: boolean;
  /** Screen-space pixel offset for spiderfied pins in the tokenless fallback canvas. */
  spiderfyOffsetPx?: { x: number; y: number };
}

/**
 * Grouped cluster renderable item returned by `clusterMapMarkers` when pins overlap or sit close together.
 */
export interface GroupedMapClusterItem {
  type: 'cluster';
  id: string;
  markers: MapMarker[];
  latitude: number;
  longitude: number;
}

/**
 * Union of individual pin and cluster items rendered on the map.
 */
export type MapRenderItem = SingleMapClusterItem | GroupedMapClusterItem;

interface MountedMarkerHandle {
  marker: mapboxgl.Marker;
  element: HTMLElement;
  onClick: () => void;
}

const DEFAULT_GLOBE_CENTER: [number, number] = [0, 20];
const CLUSTER_DISABLE_ZOOM = 15;
const CLUSTER_EXPANSION_MAX_ZOOM = 16;
const SPIDERFY_CO_LOCATED_THRESHOLD_DEG = 0.0008;
const SPIDERFY_LINES_SOURCE_ID = 'datedex-spiderfy-lines';
const SPIDERFY_LINES_LAYER_ID = 'datedex-spiderfy-lines-layer';

/**
 * Extracts 1- or 2-letter uppercase initials from a person's name:
 * first letter of the first word and first letter of the last/second word (if present).
 * @param {string} name - Full or masked display name (e.g. `"Julia Vance"` or `"Julia"`).
 * @returns {string} Uppercase initials (e.g. `"JV"` or `"J"`), or empty string if blank.
 */
export function extractPinInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((segment) => segment.length > 0);
  const first = parts[0];
  if (!first) return '';
  const firstChar = Array.from(first)[0] ?? '';
  if (parts.length === 1) {
    return firstChar.toUpperCase();
  }
  const last = parts[parts.length - 1] ?? '';
  const lastChar = Array.from(last)[0] ?? '';
  return `${firstChar}${lastChar}`.toUpperCase();
}

/**
 * Resolves a map marker through `maskPinForDiscreet` (`src/domain/vault/masking.ts`) so
 * Vault / Discreet mode redacts sensitive fields consistently across features.
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
 * Computes the angular clustering radius in degrees for a given zoom level (~56px screen proximity
 * on a 512px Web Mercator tile), preventing overlapping markers at globe, regional, and city zooms.
 * @param {number} zoom - Current map zoom level.
 * @returns {number} Angular grouping threshold in degrees.
 */
export function getClusterThresholdDegrees(zoom: number): number {
  const clampedZoom = Math.max(0, zoom);
  return 39.375 / Math.pow(2, clampedZoom);
}

/**
 * Disaggregates co-located pins (sharing the same city/coordinates) into a clean,
 * evenly spaced circular ring around their shared center once the map reaches high/max zoom,
 * ensuring every overlapping pin is individually visible and tappable.
 * @param {MapMarker[]} markers - Active markers to position.
 * @param {number} zoom - Current map zoom level (`>= CLUSTER_DISABLE_ZOOM`).
 * @returns {SingleMapClusterItem[]} Standalone and circularly spiderfied pin items.
 */
export function spiderfyCoLocatedPins(
  markers: MapMarker[],
  zoom: number,
): SingleMapClusterItem[] {
  const groups: Array<{ markers: MapMarker[]; sumLat: number; sumLng: number }> = [];

  for (const marker of markers) {
    let matched: { markers: MapMarker[]; sumLat: number; sumLng: number } | null = null;
    for (const group of groups) {
      const centerLat = group.sumLat / group.markers.length;
      const centerLng = group.sumLng / group.markers.length;
      if (
        Math.hypot(marker.latitude - centerLat, marker.longitude - centerLng) <=
        SPIDERFY_CO_LOCATED_THRESHOLD_DEG
      ) {
        matched = group;
        break;
      }
    }
    if (matched) {
      matched.markers.push(marker);
      matched.sumLat += marker.latitude;
      matched.sumLng += marker.longitude;
    } else {
      groups.push({
        markers: [marker],
        sumLat: marker.latitude,
        sumLng: marker.longitude,
      });
    }
  }

  const clampedZoom = Math.max(CLUSTER_DISABLE_ZOOM, Math.min(20, zoom));
  const degPerPixel = 360 / (512 * Math.pow(2, clampedZoom));
  const results: SingleMapClusterItem[] = [];

  for (const group of groups) {
    const first = group.markers[0];
    if (group.markers.length === 1 && first) {
      results.push({
        type: 'pin',
        id: first.id,
        marker: first,
        latitude: first.latitude,
        longitude: first.longitude,
        isSpiderfied: false,
      });
      continue;
    }

    const centerLat = group.sumLat / group.markers.length;
    const centerLng = group.sumLng / group.markers.length;
    const screenRadiusPx = Math.min(72, 38 + group.markers.length * 5);
    const latRadiusDeg = degPerPixel * screenRadiusPx;
    const cosLat = Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));

    group.markers.forEach((marker, idx) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * idx) / group.markers.length;
      const offsetLat = Math.sin(angle) * latRadiusDeg;
      const offsetLng = (Math.cos(angle) * latRadiusDeg) / cosLat;
      results.push({
        type: 'pin',
        id: marker.id,
        marker,
        latitude: Number((centerLat + offsetLat).toFixed(6)),
        longitude: Number((centerLng + offsetLng).toFixed(6)),
        originLatitude: centerLat,
        originLongitude: centerLng,
        isSpiderfied: true,
        spiderfyOffsetPx: {
          x: Math.round(Math.cos(angle) * screenRadiusPx),
          y: Math.round(Math.sin(angle) * screenRadiusPx),
        },
      });
    });
  }

  return results;
}

/**
 * Clusters spatially close or overlapping pins at lower-to-mid zoom levels (`zoom < 15`)
 * and disaggregates co-located pins into a neat circular ring once at high/max zoom (`zoom >= 15`).
 * @param {MapMarker[]} markers - Active markers to plot.
 * @param {number} zoom - Current map zoom level.
 * @returns {MapRenderItem[]} Renderable clusters and standalone/spiderfied pins.
 */
export function clusterMapMarkers(markers: MapMarker[], zoom: number): MapRenderItem[] {
  if (markers.length <= 1) {
    return markers.map((marker) => ({
      type: 'pin',
      id: marker.id,
      marker,
      latitude: marker.latitude,
      longitude: marker.longitude,
      isSpiderfied: false,
    }));
  }

  if (zoom >= CLUSTER_DISABLE_ZOOM) {
    return spiderfyCoLocatedPins(markers, zoom);
  }

  const thresholdDeg = getClusterThresholdDegrees(zoom);
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

/**
 * Calculates the target zoom level needed to expand a cluster into its constituent pins
 * (or progressive sub-clusters) when the user clicks the cluster marker.
 * @param {GroupedMapClusterItem} cluster - Clicked cluster group.
 * @param {number} currentZoom - Current map zoom level.
 * @returns {number} Target expansion zoom level (`<= 16`).
 */
export function computeClusterExpansionZoom(
  cluster: GroupedMapClusterItem,
  currentZoom: number,
): number {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const marker of cluster.markers) {
    if (marker.latitude < minLat) minLat = marker.latitude;
    if (marker.latitude > maxLat) maxLat = marker.latitude;
    if (marker.longitude < minLng) minLng = marker.longitude;
    if (marker.longitude > maxLng) maxLng = marker.longitude;
  }

  const spanDeg = Math.hypot(maxLat - minLat, maxLng - minLng);
  // Co-located pins expand directly past CLUSTER_DISABLE_ZOOM so individual markers appear
  if (spanDeg < 0.0005) {
    return CLUSTER_EXPANSION_MAX_ZOOM;
  }

  const minStepZoom = currentZoom < 4 ? Math.max(currentZoom + 3.5, 6) : currentZoom + 2.5;
  let targetZoom = Math.min(CLUSTER_EXPANSION_MAX_ZOOM, minStepZoom);

  // Advance zoom until clustering threshold drops below cluster spread so pins break apart cleanly
  while (
    targetZoom < CLUSTER_EXPANSION_MAX_ZOOM &&
    getClusterThresholdDegrees(targetZoom) > spanDeg * 0.45
  ) {
    targetZoom = Math.min(CLUSTER_EXPANSION_MAX_ZOOM, targetZoom + 1);
  }

  return Number(targetZoom.toFixed(1));
}

function buildPinMarkerElement(
  marker: MapMarker,
  display: DisplayPin,
  discreetMode: boolean,
  isSelected: boolean,
  isSpiderfied: boolean = false,
): HTMLButtonElement {
  const initials = discreetMode ? '' : extractPinInitials(display.displayName);

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = `map-pin-${marker.id}`;
  button.dataset.pinShape = 'teardrop';
  button.dataset.masked = String(display.isMasked);
  button.dataset.spiderfied = String(isSpiderfied);
  button.setAttribute(
    'aria-label',
    discreetMode ? `${marker.city}` : `${initials} — ${display.displayCity}`,
  );
  button.className = [
    'group relative inline-flex cursor-pointer flex-col items-center',
    'transition-transform hover:scale-105 focus-visible:outline-none',
    isSelected ? 'z-20 scale-110' : 'z-10',
  ].join(' ');

  // Teardrop / pointer-anchored pin head: flag + initials ONLY (zero numeric/star score)
  const head = document.createElement('span');
  head.className = [
    'relative z-10 inline-flex items-center justify-center gap-1 rounded-full border-2 text-xs font-bold leading-none',
    'shadow-xl shadow-black/85 group-focus-visible:ring-2 group-focus-visible:ring-white',
    initials ? 'px-2.5 py-1.5' : 'h-8 w-8 p-0',
    isSelected
      ? 'border-white bg-white text-black'
      : 'border-white/80 bg-[#111111]/95 text-white group-hover:border-white',
  ].join(' ');

  const flagSpan = document.createElement('span');
  flagSpan.setAttribute('aria-hidden', 'true');
  flagSpan.className = 'text-sm leading-none';
  flagSpan.textContent = getCountryFlag(marker.nationalityCode);
  head.appendChild(flagSpan);

  // On the map page, Discreet mode hides initials while keeping nationality flags visible
  if (initials) {
    const initialsSpan = document.createElement('span');
    initialsSpan.dataset.testid = `map-pin-initials-${marker.id}`;
    initialsSpan.className = 'tracking-wide uppercase';
    initialsSpan.textContent = initials;
    head.appendChild(initialsSpan);
  }

  button.appendChild(head);

  // Pointed pin tail seamlessly fused to the bottom of the pin head
  const pointer = document.createElement('span');
  pointer.setAttribute('aria-hidden', 'true');
  pointer.className = [
    '-mt-[5px] h-2.5 w-2.5 rotate-45 border-r-2 border-b-2 shadow-md',
    isSelected
      ? 'border-white bg-white'
      : 'border-white/80 bg-[#111111] group-hover:border-white',
  ].join(' ');
  button.appendChild(pointer);

  // Coordinate anchor dot directly at the bottom tip
  const anchorDot = document.createElement('span');
  anchorDot.setAttribute('aria-hidden', 'true');
  anchorDot.className = 'mt-0.5 h-1.5 w-1.5 rounded-full bg-white/80 shadow shadow-black';
  button.appendChild(anchorDot);

  return button;
}

function buildClusterMarkerElement(
  cluster: GroupedMapClusterItem,
  ariaLabel: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = `map-cluster-${cluster.markers.length}`;
  button.dataset.pinShape = 'cluster-teardrop';
  button.setAttribute('aria-label', ariaLabel);
  button.className = [
    'group relative inline-flex cursor-pointer flex-col items-center',
    'transition-transform hover:scale-105 focus-visible:outline-none z-20',
  ].join(' ');

  const uniqueFlags = Array.from(
    new Set(cluster.markers.map((m) => getCountryFlag(m.nationalityCode))),
  ).slice(0, 3);

  // Larger monochrome map-pin head displaying aggregated flags + count badge
  const head = document.createElement('span');
  head.className = [
    'relative z-10 inline-flex items-center gap-1.5 rounded-full border-2 border-white/90 bg-[#111111]/95',
    'px-3 py-1.5 text-xs font-bold text-white shadow-2xl shadow-black/90',
    'group-focus-visible:ring-2 group-focus-visible:ring-white',
  ].join(' ');

  const flagsSpan = document.createElement('span');
  flagsSpan.setAttribute('aria-hidden', 'true');
  flagsSpan.className = 'text-sm leading-none tracking-tight';
  flagsSpan.textContent = uniqueFlags.join('');
  head.appendChild(flagsSpan);

  const countSpan = document.createElement('span');
  countSpan.dataset.testid = 'map-cluster-count';
  countSpan.className =
    'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 font-mono text-[11px] font-extrabold text-black';
  countSpan.textContent = String(cluster.markers.length);
  head.appendChild(countSpan);

  button.appendChild(head);

  const pointer = document.createElement('span');
  pointer.setAttribute('aria-hidden', 'true');
  pointer.className = '-mt-[6px] h-3 w-3 rotate-45 border-r-2 border-b-2 border-white/90 bg-[#111111] shadow-md';
  button.appendChild(pointer);

  const anchorDot = document.createElement('span');
  anchorDot.setAttribute('aria-hidden', 'true');
  anchorDot.className = 'mt-0.5 h-1.5 w-1.5 rounded-full bg-white/85 shadow shadow-black';
  button.appendChild(anchorDot);

  return button;
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
  discreetMode,
  viewport,
  onViewportChange,
  onSelectMarker,
  cityFilter: controlledCityFilter,
  onCityFilterChange,
  accessToken,
}: DatedexMapProps): React.JSX.Element {
  const { t } = useTranslation();
  const [internalCityFilter, setInternalCityFilter] =
    useState<ActiveCityFilter>(EMPTY_CITY_FILTER);
  const activeCityFilter = controlledCityFilter ?? internalCityFilter;
  const updateCityFilter = onCityFilterChange ?? setInternalCityFilter;

  // Security: read public token strictly from Vite env (never hardcoded)
  const resolvedToken = (accessToken ?? import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '').trim();
  const hasMapboxToken = resolvedToken.length > 0;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mountedMarkersRef = useRef<MountedMarkerHandle[]>([]);

  const autoPitchStateRef = useRef<AutoPitchState>({ manualOverride: false, regime: 'flat' });
  const isAutoEasingPitchRef = useRef(false);

  const [show3DBuildings, setShow3DBuildings] = useState(true);
  const [liveZoom, setLiveZoom] = useState<number>(viewport.zoom || DEFAULT_GLOBE_ZOOM);

  const show3DBuildingsRef = useRef(show3DBuildings);
  show3DBuildingsRef.current = show3DBuildings;

  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const onSelectMarkerRef = useRef(onSelectMarker);
  onSelectMarkerRef.current = onSelectMarker;

  const translateRef = useRef(t);
  translateRef.current = t;

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

      // Sync zoom state on bucket transitions to update clustering without excessive renders
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

    map.on('style.load', handleStyleLoad);
    map.on('pitchstart', handlePitchStart);
    map.on('zoom', handleZoom);
    map.on('moveend', handleMoveEnd);

    return () => {
      clearMountedMarkers();
      map.off('style.load', handleStyleLoad);
      map.off('pitchstart', handlePitchStart);
      map.off('zoom', handleZoom);
      map.off('moveend', handleMoveEnd);
      map.remove();
      mapRef.current = null;
    };
  }, [hasMapboxToken, resolvedToken, clearMountedMarkers]);

  const cityFilterOptions = useMemo(
    () => getCityOptionsForDimension(markers, activeCityFilter.dimension),
    [markers, activeCityFilter.dimension],
  );

  const filteredMarkers = useMemo(
    () => filterByActiveCityFilter(markers, activeCityFilter),
    [markers, activeCityFilter],
  );

  const hasActiveCityFilter =
    activeCityFilter.dimension !== 'all' || activeCityFilter.city.trim().length > 0;

  const renderItems = useMemo(
    () => clusterMapMarkers(filteredMarkers, liveZoom),
    [filteredMarkers, liveZoom],
  );

  // Synchronize pin & cluster markers with Vault/Discreet masking
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    clearMountedMarkers();

    for (const item of renderItems) {
      if (item.type === 'cluster') {
        const element = buildClusterMarkerElement(
          item,
          translateRef.current('map.clusterAria', { count: item.markers.length }),
        );
        const onClick = (): void => {
          const nextZoom = computeClusterExpansionZoom(item, map.getZoom());
          map.flyTo({
            center: [item.longitude, item.latitude],
            zoom: nextZoom,
            duration: 850,
            essential: true,
          });
        };
        element.addEventListener('click', onClick);
        const mapboxMarker = new mapboxgl.Marker({ element, anchor: 'bottom' })
          .setLngLat([item.longitude, item.latitude])
          .addTo(map);
        mountedMarkersRef.current.push({ marker: mapboxMarker, element, onClick });
      } else {
        const display = resolveMaskedMapPin(item.marker, pinLookup, discreetMode);
        const element = buildPinMarkerElement(
          item.marker,
          display,
          discreetMode,
          item.marker.id === selectedPinId,
          Boolean(item.isSpiderfied),
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

    // Draw subtle leader spokes from the co-located city center to each spiderfied pin when supported
    const spiderfiedFeatures = renderItems
      .filter(
        (item): item is SingleMapClusterItem =>
          item.type === 'pin' &&
          Boolean(item.isSpiderfied) &&
          typeof item.originLatitude === 'number' &&
          typeof item.originLongitude === 'number',
      )
      .map((item) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [item.originLongitude!, item.originLatitude!],
            [item.longitude, item.latitude],
          ],
        },
      }));

    const syncSpiderfyLines = (): void => {
      if (
        typeof map.getSource !== 'function' ||
        typeof map.addSource !== 'function' ||
        typeof map.addLayer !== 'function'
      ) {
        return;
      }
      const featureCollection = {
        type: 'FeatureCollection' as const,
        features: spiderfiedFeatures,
      };
      const existingSource = map.getSource(SPIDERFY_LINES_SOURCE_ID) as
        | { setData?: (data: typeof featureCollection) => void }
        | undefined;
      if (existingSource && typeof existingSource.setData === 'function') {
        existingSource.setData(featureCollection);
      } else if (spiderfiedFeatures.length > 0 && map.isStyleLoaded?.()) {
        map.addSource(SPIDERFY_LINES_SOURCE_ID, {
          type: 'geojson',
          data: featureCollection,
        });
        if (!map.getLayer(SPIDERFY_LINES_LAYER_ID)) {
          map.addLayer({
            id: SPIDERFY_LINES_LAYER_ID,
            type: 'line',
            source: SPIDERFY_LINES_SOURCE_ID,
            paint: {
              'line-color': 'rgba(255, 255, 255, 0.45)',
              'line-width': 1.5,
              'line-dasharray': [2, 2],
            },
          });
        }
      }
    };

    try {
      syncSpiderfyLines();
    } catch {
      // Ignore if map style is mid-reload
    }

    return () => {
      clearMountedMarkers();
    };
  }, [renderItems, pinLookup, discreetMode, selectedPinId, clearMountedMarkers, hasMapboxToken]);

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

  return (
    <section
      aria-label={t('map.regionAria')}
      className="relative h-[min(74dvh,640px)] min-h-[460px] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#050505]"
    >
      {/* Mapbox GL JS v3 Canvas OR Graceful Monochrome Fallback when Token Missing */}
      {hasMapboxToken ? (
        <div
          ref={containerRef}
          data-testid="mapbox-canvas"
          className="h-full w-full cursor-grab active:cursor-grabbing"
        />
      ) : (
        <div
          data-testid="mapbox-missing-token-fallback"
          role="region"
          aria-label={t('map.fallbackAria')}
          className="relative flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_45%,#1a1a1a_0%,#0a0a0a_58%,#050505_100%)]"
        >
          {/* Subtle grayscale globe graticule */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:16.666%_25%]"
          />

          {/* Render clustered or individual map-pin markers in tokenless fallback */}
          {renderItems.map((item) => {
            const left = projectLngToPercent(item.longitude);
            const top = projectLatToPercent(item.latitude);

            if (item.type === 'cluster') {
              const uniqueFlags = Array.from(
                new Set(item.markers.map((m) => getCountryFlag(m.nationalityCode))),
              ).slice(0, 3);
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`fallback-cluster-${item.markers.length}`}
                  data-pin-shape="cluster-teardrop"
                  aria-label={t('map.clusterAria', { count: item.markers.length })}
                  onClick={() => {
                    const nextZoom = computeClusterExpansionZoom(item, liveZoom);
                    setLiveZoom(nextZoom);
                    onViewportChange({
                      latitude: item.latitude,
                      longitude: item.longitude,
                      zoom: nextZoom,
                    });
                  }}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  className="group absolute z-20 inline-flex -translate-x-1/2 -translate-y-full flex-col items-center transition-transform hover:scale-105"
                >
                  <span className="relative z-10 inline-flex items-center gap-1.5 rounded-full border-2 border-white/90 bg-[#111111]/95 px-3 py-1.5 text-xs font-bold text-white shadow-2xl shadow-black/90">
                    <span aria-hidden="true" className="text-sm leading-none tracking-tight">
                      {uniqueFlags.join('')}
                    </span>
                    <span
                      data-testid="fallback-cluster-count"
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 font-mono text-[11px] font-extrabold text-black"
                    >
                      {item.markers.length}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="-mt-[6px] h-3 w-3 rotate-45 border-r-2 border-b-2 border-white/90 bg-[#111111] shadow-md"
                  />
                  <span
                    aria-hidden="true"
                    className="mt-0.5 h-1.5 w-1.5 rounded-full bg-white/85 shadow shadow-black"
                  />
                </button>
              );
            }

            const marker = item.marker;
            const display = resolveMaskedMapPin(marker, pinLookup, discreetMode);
            const initials = discreetMode ? '' : extractPinInitials(display.displayName);
            const isSelected = marker.id === selectedPinId;
            const spiderOffset = item.isSpiderfied ? item.spiderfyOffsetPx : undefined;
            const anchorLeft = projectLngToPercent(item.originLongitude ?? item.longitude);
            const anchorTop = projectLatToPercent(item.originLatitude ?? item.latitude);
            return (
              <button
                key={marker.id}
                type="button"
                data-testid={`fallback-pin-${marker.id}`}
                data-pin-shape="teardrop"
                data-spiderfied={String(Boolean(item.isSpiderfied))}
                aria-label={discreetMode ? `${marker.city}` : `${initials} — ${display.displayCity}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMarker(marker.id);
                }}
                style={
                  spiderOffset
                    ? {
                        left: `${anchorLeft}%`,
                        top: `${anchorTop}%`,
                        transform: `translate(calc(-50% + ${spiderOffset.x}px), calc(-100% + ${spiderOffset.y}px))`,
                      }
                    : { left: `${left}%`, top: `${top}%` }
                }
                className={`group absolute inline-flex flex-col items-center transition-transform hover:scale-105 ${
                  spiderOffset ? '' : '-translate-x-1/2 -translate-y-full'
                } ${isSelected ? 'z-20 scale-110' : 'z-10'}`}
              >
                <span
                  className={`relative z-10 inline-flex items-center justify-center gap-1 rounded-full border-2 text-xs font-bold leading-none shadow-xl shadow-black/85 ${
                    initials ? 'px-2.5 py-1.5' : 'h-8 w-8 p-0'
                  } ${
                    isSelected
                      ? 'border-white bg-white text-black'
                      : 'border-white/80 bg-[#111111]/95 text-white'
                  }`}
                >
                  <span aria-hidden="true" className="text-sm leading-none">
                    {getCountryFlag(marker.nationalityCode)}
                  </span>
                  {initials && (
                    <span className="tracking-wide uppercase">{initials}</span>
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className={`-mt-[5px] h-2.5 w-2.5 rotate-45 border-r-2 border-b-2 shadow-md ${
                    isSelected ? 'border-white bg-white' : 'border-white/80 bg-[#111111]'
                  }`}
                />
                <span
                  aria-hidden="true"
                  className="mt-0.5 h-1.5 w-1.5 rounded-full bg-white/80 shadow shadow-black"
                />
              </button>
            );
          })}

          <div className="pointer-events-none relative z-10 mx-6 max-w-xs rounded-2xl border border-white/15 bg-[#111111]/90 px-4 py-3 text-center backdrop-blur">
            <p className="text-xs font-semibold text-white">{t('map.fallbackTitle')}</p>
            <p className="mt-1 text-[11px] text-neutral-400">
              {t('map.fallbackSubtitleBefore')}{' '}
              <code className="font-mono text-neutral-200">VITE_MAPBOX_ACCESS_TOKEN</code>{' '}
              {t('map.fallbackSubtitleAfter')}
            </p>
          </div>
        </div>
      )}

      {/* Compact Monochrome City Filter Pill (All Cities / Born in / Lives in / Met in) */}
      <div
        data-testid="map-city-filter"
        className="absolute top-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5 rounded-xl border border-white/15 bg-[#111111]/90 px-2 py-1.5 shadow-xl shadow-black/60 backdrop-blur-md"
      >
        <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-300" aria-hidden="true" />
        <select
          data-testid="map-city-dimension"
          aria-label={t('cityFilter.dimensionAria')}
          value={activeCityFilter.dimension}
          onChange={(e) => {
            const nextDimension = e.target.value as CityFilterDimension;
            const nextOptions = getCityOptionsForDimension(markers, nextDimension);
            const keepCity = nextOptions.includes(activeCityFilter.city)
              ? activeCityFilter.city
              : '';
            updateCityFilter({ dimension: nextDimension, city: keepCity });
          }}
          className="rounded-lg border border-white/15 bg-black/80 px-2 py-1 text-[11px] font-medium text-white focus-visible:outline-2 focus-visible:outline-white"
        >
          <option value="all">{t('cityFilter.allCities')}</option>
          <option value="birthCity">{t('cityFilter.bornIn')}</option>
          <option value="livingCity">{t('cityFilter.livesIn')}</option>
          <option value="metCity">{t('cityFilter.metIn')}</option>
        </select>

        <select
          data-testid="map-city-value"
          aria-label={t('cityFilter.cityAria')}
          value={activeCityFilter.city}
          onChange={(e) =>
            updateCityFilter({
              ...activeCityFilter,
              city: e.target.value,
            })
          }
          className="max-w-[140px] rounded-lg border border-white/15 bg-black/80 px-2 py-1 text-[11px] font-medium text-white focus-visible:outline-2 focus-visible:outline-white"
        >
          <option value="">{t('cityFilter.allValues')}</option>
          {cityFilterOptions.map((cityName) => (
            <option key={cityName} value={cityName}>
              {cityName}
            </option>
          ))}
        </select>

        {hasActiveCityFilter && (
          <button
            type="button"
            data-testid="map-city-filter-clear"
            aria-label={t('cityFilter.clearAria')}
            onClick={() => updateCityFilter(EMPTY_CITY_FILTER)}
            className="inline-flex items-center gap-0.5 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-medium text-white hover:bg-white/20"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            {t('cityFilter.clear')}
          </button>
        )}
      </div>

      {/* Floating Bottom-Right Monochrome Controls (3D toggle above +/- zoom & recenter) */}
      <MapFloatingControls
        show3DBuildings={show3DBuildings}
        isZoomedIn={liveZoom >= 4}
        onToggle3DBuildings={handleToggle3DBuildings}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onLocateOrRecenter={handleLocateOrRecenter}
      />
    </section>
  );
}
