/**
 * @module features/map/__tests__/DatedexMap.test
 * Vitest unit and integration test suite verifying Datédex Mapbox GL v3 monochrome overrides,
 * space fog, 3D building fill-extrusion (minzoom 14), auto-pitch lifecycle (>15 -> 55°, <13.5 -> 0°),
 * "Search this area" bounds callback, Vault / Discreet masking, and map.remove() cleanup.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapMarker } from '../../../domain/map/types';
import type { DecryptedPin } from '../../../domain/models/pin';
import {
  BUILDINGS_3D_LAYER_ID,
  DEFAULT_GLOBE_ZOOM,
  MONOCHROME_BASE_STYLE,
  MONOCHROME_FOG_SPEC,
  MONOCHROME_LAND_COLOR_EXPRESSION,
  MONOCHROME_WATER_COLOR_EXPRESSION,
} from '../utils/monochromeStyle';

type EventHandler = (event?: unknown) => void;

interface MockMapInstance {
  options: Record<string, unknown>;
  handlers: Map<string, Set<EventHandler>>;
  layers: Map<string, unknown>;
  zoomValue: number;
  pitchValue: number;
  boundsValue: {
    getNorth: () => number;
    getSouth: () => number;
    getEast: () => number;
    getWest: () => number;
  };
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: (event: string, payload?: unknown) => void;
  getStyle: ReturnType<typeof vi.fn>;
  getLayer: ReturnType<typeof vi.fn>;
  addLayer: ReturnType<typeof vi.fn>;
  setPaintProperty: ReturnType<typeof vi.fn>;
  setLayoutProperty: ReturnType<typeof vi.fn>;
  setFog: ReturnType<typeof vi.fn>;
  setLights: ReturnType<typeof vi.fn>;
  getZoom: ReturnType<typeof vi.fn>;
  getPitch: ReturnType<typeof vi.fn>;
  getCenter: ReturnType<typeof vi.fn>;
  getBounds: ReturnType<typeof vi.fn>;
  easeTo: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  zoomIn: ReturnType<typeof vi.fn>;
  zoomOut: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

interface MockMarkerInstance {
  element: HTMLElement;
  lngLat: [number, number] | null;
  setLngLat: ReturnType<typeof vi.fn>;
  addTo: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

const mapMockState = vi.hoisted(() => ({
  createdMaps: [] as MockMapInstance[],
  createdMarkers: [] as MockMarkerInstance[],
  accessToken: '',
}));

vi.mock('mapbox-gl', () => {
  class MockMap {
    options: Record<string, unknown>;
    handlers = new Map<string, Set<EventHandler>>();
    layers = new Map<string, unknown>();
    zoomValue: number;
    pitchValue: number;
    boundsValue = {
      getNorth: () => 49.0,
      getSouth: () => 48.5,
      getEast: () => 2.6,
      getWest: () => 2.1,
    };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.zoomValue = typeof options.zoom === 'number' ? options.zoom : 1.8;
      this.pitchValue = typeof options.pitch === 'number' ? options.pitch : 0;
      mapMockState.createdMaps.push(this as unknown as MockMapInstance);
    }

    on = vi.fn((event: string, handler: EventHandler) => {
      const bucket = this.handlers.get(event) ?? new Set<EventHandler>();
      bucket.add(handler);
      this.handlers.set(event, bucket);
      return this;
    });

    off = vi.fn((event: string, handler: EventHandler) => {
      this.handlers.get(event)?.delete(handler);
      return this;
    });

    emit = (event: string, payload?: unknown): void => {
      const bucket = this.handlers.get(event);
      if (!bucket) return;
      for (const fn of bucket) {
        fn(payload);
      }
    };

    getStyle = vi.fn(() => ({
      layers: [
        { id: 'land', type: 'background' },
        { id: 'water', type: 'fill' },
        { id: 'waterway', type: 'line' },
        { id: 'landuse', type: 'fill' },
        { id: 'road-primary', type: 'line' },
        { id: 'road-street', type: 'line' },
        { id: 'admin-0-boundary', type: 'line' },
        { id: 'poi-label', type: 'symbol', layout: { 'icon-image': 'cafe-15', 'text-field': ['get', 'name'] } },
        { id: 'road-number-shield', type: 'symbol', layout: { 'icon-image': 'us-interstate' } },
        { id: 'settlement-major-label', type: 'symbol', layout: { 'text-field': ['get', 'name'] } },
      ],
    }));

    getLayer = vi.fn((id: string) => this.layers.get(id));

    addLayer = vi.fn((layer: { id: string }) => {
      this.layers.set(layer.id, layer);
      return this;
    });

    setPaintProperty = vi.fn();
    setLayoutProperty = vi.fn();
    setFog = vi.fn();
    setLights = vi.fn();
    getZoom = vi.fn(() => this.zoomValue);
    getPitch = vi.fn(() => this.pitchValue);
    getCenter = vi.fn(() => ({ lat: 48.8566, lng: 2.3522 }));
    getBounds = vi.fn(() => this.boundsValue);

    easeTo = vi.fn((opts: { pitch?: number }) => {
      if (typeof opts.pitch === 'number') {
        this.pitchValue = opts.pitch;
      }
      return this;
    });

    flyTo = vi.fn();
    zoomIn = vi.fn();
    zoomOut = vi.fn();
    remove = vi.fn();
  }

  class MockMarker {
    element: HTMLElement;
    lngLat: [number, number] | null = null;

    constructor(options?: { element?: HTMLElement }) {
      this.element = options?.element ?? document.createElement('div');
      mapMockState.createdMarkers.push(this as unknown as MockMarkerInstance);
    }

    setLngLat = vi.fn((coords: [number, number]) => {
      this.lngLat = coords;
      return this;
    });

    addTo = vi.fn(() => {
      document.body.appendChild(this.element);
      return this;
    });

    remove = vi.fn(() => {
      this.element.remove();
      return this;
    });
  }

  const defaultExport = {
    get accessToken(): string {
      return mapMockState.accessToken;
    },
    set accessToken(value: string) {
      mapMockState.accessToken = value;
    },
    Map: MockMap,
    Marker: MockMarker,
  };

  return {
    default: defaultExport,
    Map: MockMap,
    Marker: MockMarker,
  };
});

import { DatedexMap } from '../components/DatedexMap';

const SAMPLE_PINS: DecryptedPin[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Sofia',
    age: 26,
    nationalityCode: 'IT',
    city: 'Milan',
    latitude: 45.4642,
    longitude: 9.19,
    rating: 4.5,
    relationshipStatus: 'dating',
    intimacyLevel: 'kiss',
    metChannel: 'Hinge',
    dateMet: '2026-05-10',
    notes: 'Brera espresso',
    vaultLocked: false,
    vaultAlias: 'Milan Espresso',
    photoDataUrl: 'data:image/webp;base64,AAAA',
    photoStoragePath: null,
    createdAt: '2026-05-10T10:00:00Z',
    updatedAt: '2026-05-10T10:00:00Z',
    deletedAt: null,
    syncPending: false,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Elena',
    age: 28,
    nationalityCode: 'FR',
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    rating: 5.0,
    relationshipStatus: 'exclusive',
    intimacyLevel: 'home_run',
    metChannel: 'IRL',
    dateMet: '2026-06-14',
    notes: 'Marais gallery',
    vaultLocked: true,
    vaultAlias: 'Marais Velvet',
    photoDataUrl: 'data:image/webp;base64,BBBB',
    photoStoragePath: null,
    createdAt: '2026-06-14T10:00:00Z',
    updatedAt: '2026-06-14T10:00:00Z',
    deletedAt: null,
    syncPending: false,
  },
];

const SAMPLE_MARKERS: MapMarker[] = SAMPLE_PINS.map((pin) => ({
  id: pin.id,
  label: pin.name,
  city: pin.city,
  nationalityCode: pin.nationalityCode,
  latitude: pin.latitude,
  longitude: pin.longitude,
  rating: pin.rating,
  isVaultLocked: pin.vaultLocked,
}));

function latestMap(): MockMapInstance {
  const map = mapMockState.createdMaps[mapMockState.createdMaps.length - 1];
  if (!map) {
    throw new Error('Expected a mock Mapbox instance to be initialized');
  }
  return map;
}

describe('DatedexMap (Mapbox GL v3 Monochrome 3D-to-2D-to-3D)', () => {
  beforeEach(() => {
    mapMockState.createdMaps = [];
    mapMockState.createdMarkers = [];
    mapMockState.accessToken = '';
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.test_public_token_for_vitest');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders graceful monochrome fallback when VITE_MAPBOX_ACCESS_TOKEN is missing', () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '');

    render(
      <DatedexMap
        markers={SAMPLE_MARKERS}
        pins={SAMPLE_PINS}
        discreetMode={false}
        viewport={{ latitude: 20, longitude: 0, zoom: DEFAULT_GLOBE_ZOOM }}
        onViewportChange={vi.fn()}
        onSelectMarker={vi.fn()}
        onMapClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('mapbox-missing-token-fallback')).toBeInTheDocument();
    expect(screen.getByText(/VITE_MAPBOX_ACCESS_TOKEN/)).toBeInTheDocument();
    expect(mapMockState.createdMaps).toHaveLength(0);
  });

  it('initializes globe projection, applies strict monochrome overrides, setFog, directional lights, and minzoom 14 3D buildings on style.load', () => {
    render(
      <DatedexMap
        markers={SAMPLE_MARKERS}
        pins={SAMPLE_PINS}
        discreetMode={false}
        viewport={{ latitude: 20, longitude: 0, zoom: DEFAULT_GLOBE_ZOOM }}
        onViewportChange={vi.fn()}
        onSelectMarker={vi.fn()}
        onMapClick={vi.fn()}
      />,
    );

    const map = latestMap();
    expect(map.options).toMatchObject({
      style: MONOCHROME_BASE_STYLE,
      projection: 'globe',
      zoom: 1.8,
      pitch: 0,
      bearing: 0,
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true,
      touchZoomRotate: true,
    });

    // Trigger Mapbox style.load lifecycle event
    map.emit('style.load');

    // Space fog atmosphere
    expect(map.setFog).toHaveBeenCalledWith(MONOCHROME_FOG_SPEC);
    expect(map.setLights).toHaveBeenCalled();

    // Grayscale overrides for land, water, roads, borders, and labels
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'land',
      'background-color',
      MONOCHROME_LAND_COLOR_EXPRESSION,
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'water',
      'fill-color',
      MONOCHROME_WATER_COLOR_EXPRESSION,
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith('waterway', 'line-color', '#0a0a0a');
    expect(map.setPaintProperty).toHaveBeenCalledWith('road-primary', 'line-color', '#707070');
    expect(map.setPaintProperty).toHaveBeenCalledWith('road-street', 'line-color', '#555555');
    expect(map.setPaintProperty).toHaveBeenCalledWith('admin-0-boundary', 'line-color', '#666666');
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'settlement-major-label',
      'text-color',
      '#888888',
    );

    // Commercial POIs and highway shields hidden
    expect(map.setLayoutProperty).toHaveBeenCalledWith('poi-label', 'visibility', 'none');
    expect(map.setLayoutProperty).toHaveBeenCalledWith('road-number-shield', 'visibility', 'none');

    // 3D fill-extrusion layer mounted with minzoom 14 and matte #333333 color below labels
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: BUILDINGS_3D_LAYER_ID,
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 14,
        paint: expect.objectContaining({
          'fill-extrusion-color': '#333333',
        }),
      }),
      'settlement-major-label',
    );
  });

  it('auto-eases pitch to 55° above zoom 15, eases back to 0° below zoom 13.5, and respects manual pitch override', () => {
    render(
      <DatedexMap
        markers={SAMPLE_MARKERS}
        pins={SAMPLE_PINS}
        discreetMode={false}
        viewport={{ latitude: 48.8566, longitude: 2.3522, zoom: 12 }}
        onViewportChange={vi.fn()}
        onSelectMarker={vi.fn()}
        onMapClick={vi.fn()}
      />,
    );

    const map = latestMap();

    // Cross zoom > 15 -> auto-ease pitch to 55°
    act(() => {
      map.zoomValue = 15.4;
      map.pitchValue = 0;
      map.emit('zoom');
    });
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: 55 }));

    // Simulate moveend clearing internal auto-ease flag
    act(() => {
      map.emit('moveend');
    });
    map.easeTo.mockClear();

    // Zoom out below 13.5 -> smoothly flatten back to 0°
    act(() => {
      map.zoomValue = 13.0;
      map.pitchValue = 55;
      map.emit('zoom');
    });
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: 0 }));

    act(() => {
      map.emit('moveend');
    });
    map.easeTo.mockClear();

    // Manual pitch gesture overrides auto-pitch when crossing > 15
    act(() => {
      map.emit('pitchstart', { originalEvent: new MouseEvent('mousedown') });
      map.zoomValue = 16.0;
      map.pitchValue = 25;
      map.emit('zoom');
    });
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it('invokes onSearchBounds(map.getBounds()) when "Search this area" is clicked and keeps map controls visible', () => {
    const onSearchBounds = vi.fn();
    render(
      <DatedexMap
        markers={SAMPLE_MARKERS}
        pins={SAMPLE_PINS}
        discreetMode={false}
        viewport={{ latitude: 48.8566, longitude: 2.3522, zoom: 12 }}
        onViewportChange={vi.fn()}
        onSelectMarker={vi.fn()}
        onMapClick={vi.fn()}
        onSearchBounds={onSearchBounds}
      />,
    );

    const map = latestMap();
    const searchAreaBtn = screen.getByRole('button', { name: /Search this area/i });
    fireEvent.click(searchAreaBtn);

    expect(map.getBounds).toHaveBeenCalled();
    expect(onSearchBounds).toHaveBeenCalledWith(map.boundsValue);

    // Toggle 3D buildings off -> hides extrusion layer and flattens pitch
    act(() => {
      map.emit('style.load');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Disable 3D buildings' }));
    expect(map.setLayoutProperty).toHaveBeenCalledWith(BUILDINGS_3D_LAYER_ID, 'visibility', 'none');
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: 0 }));

    // Recenter to globe button flies back to globe overview when zoomed in
    fireEvent.click(screen.getByRole('button', { name: 'Recenter to 3D globe' }));
    expect(map.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: DEFAULT_GLOBE_ZOOM, pitch: 0, bearing: 0 }),
    );

    // Floating zoom controls work
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(map.zoomIn).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(map.zoomOut).toHaveBeenCalled();

    expect(screen.getByTestId('map-floating-controls')).toBeInTheDocument();
    expect(screen.getByTestId('map-top-toolbar')).toBeInTheDocument();
  });

  it('hides pin names on the map in Discreet mode while preserving flags, ratings, and non-vault-locked avatars', () => {
    const { rerender } = render(
      <DatedexMap
        markers={SAMPLE_MARKERS}
        pins={SAMPLE_PINS}
        discreetMode={false}
        viewport={{ latitude: 47, longitude: 6, zoom: 6 }}
        onViewportChange={vi.fn()}
        onSelectMarker={vi.fn()}
        onMapClick={vi.fn()}
      />,
    );

    // Unmasked Sofia shows name + avatar + rating; Vault-locked Elena shows alias & no avatar
    const sofiaPin = screen.getByTestId(`map-pin-${SAMPLE_PINS[0]!.id}`);
    expect(sofiaPin).toHaveTextContent('Sofia');
    expect(sofiaPin).toHaveTextContent('★4.5');
    expect(sofiaPin.querySelector('img')).not.toBeNull();

    const elenaPin = screen.getByTestId(`map-pin-${SAMPLE_PINS[1]!.id}`);
    expect(elenaPin).not.toHaveTextContent('Elena');
    expect(elenaPin).toHaveTextContent('Marais Velvet');
    expect(elenaPin.querySelector('img')).toBeNull();

    // Enable global Discreet mode -> hides pin names on the map while keeping ratings/flags and non-vault avatars
    rerender(
      <DatedexMap
        markers={SAMPLE_MARKERS}
        pins={SAMPLE_PINS}
        discreetMode={true}
        viewport={{ latitude: 47, longitude: 6, zoom: 6 }}
        onViewportChange={vi.fn()}
        onSelectMarker={vi.fn()}
        onMapClick={vi.fn()}
      />,
    );

    const discreetSofia = screen.getByTestId(`map-pin-${SAMPLE_PINS[0]!.id}`);
    expect(discreetSofia).not.toHaveTextContent('Sofia');
    expect(discreetSofia).not.toHaveTextContent('Milan Espresso');
    expect(discreetSofia).toHaveTextContent('★4.5');
    expect(discreetSofia.querySelector('img')).not.toBeNull();

    const discreetElena = screen.getByTestId(`map-pin-${SAMPLE_PINS[1]!.id}`);
    expect(discreetElena).not.toHaveTextContent('Elena');
    expect(discreetElena).not.toHaveTextContent('Marais Velvet');
    expect(discreetElena).toHaveTextContent('★5.0');
    expect(discreetElena.querySelector('img')).toBeNull();
  });

  it('clusters nearby pins at globe zoom (< 5) and supports tap-to-drop-pin mode', () => {
    const onMapClick = vi.fn();

    render(
      <DatedexMap
        markers={SAMPLE_MARKERS}
        pins={SAMPLE_PINS}
        discreetMode={false}
        viewport={{ latitude: 20, longitude: 0, zoom: 1.8 }}
        onViewportChange={vi.fn()}
        onSelectMarker={vi.fn()}
        onMapClick={onMapClick}
      />,
    );

    const map = latestMap();

    // Milan & Paris are within globe clustering threshold at zoom 1.8
    const clusterBtn = screen.getByTestId('map-cluster-2');
    expect(clusterBtn).toHaveTextContent('2');
    fireEvent.click(clusterBtn);
    expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 6 }));

    // Toggle drop-pin mode and tap map canvas
    fireEvent.click(screen.getByRole('button', { name: 'Toggle drop pin mode' }));
    act(() => {
      map.emit('click', { lngLat: { lat: 35.6762, lng: 139.6503 } });
    });
    expect(onMapClick).toHaveBeenCalledWith({ latitude: 35.6762, longitude: 139.6503 });
  });

  it('removes all listeners, clears markers, and calls map.remove() on unmount', () => {
    const { unmount } = render(
      <DatedexMap
        markers={SAMPLE_MARKERS}
        pins={SAMPLE_PINS}
        draftCoordinate={{ latitude: 40.7128, longitude: -74.006 }}
        discreetMode={false}
        viewport={{ latitude: 47, longitude: 6, zoom: 6 }}
        onViewportChange={vi.fn()}
        onSelectMarker={vi.fn()}
        onMapClick={vi.fn()}
      />,
    );

    const map = latestMap();
    const mountedMarkers = [...mapMockState.createdMarkers];
    expect(mountedMarkers.length).toBeGreaterThanOrEqual(3); // 2 pins + 1 draft marker

    unmount();

    expect(map.off).toHaveBeenCalledWith('style.load', expect.any(Function));
    expect(map.off).toHaveBeenCalledWith('pitchstart', expect.any(Function));
    expect(map.off).toHaveBeenCalledWith('zoom', expect.any(Function));
    expect(map.off).toHaveBeenCalledWith('moveend', expect.any(Function));
    expect(map.off).toHaveBeenCalledWith('click', expect.any(Function));
    expect(map.remove).toHaveBeenCalledTimes(1);

    for (const marker of mountedMarkers) {
      expect(marker.remove).toHaveBeenCalled();
    }
  });
});
