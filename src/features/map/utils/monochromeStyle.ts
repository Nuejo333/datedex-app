/**
 * @module features/map/utils/monochromeStyle
 * Programmatic black-on-black monochrome Mapbox GL JS v3+ style transformer,
 * 3D space-fog atmosphere preset, 3D building extrusion layer specification,
 * and 3D-to-2D-to-3D auto-pitch lifecycle state machine.
 */
import type {
  ExpressionSpecification,
  FillExtrusionLayerSpecification,
  FogSpecification,
  LayerSpecification,
  LayoutSpecification,
  LightsSpecification,
  PaintSpecification,
} from 'mapbox-gl';

/**
 * Base Mapbox GL v3 dark style URI stripped to strict grayscale on `style.load`.
 */
export const MONOCHROME_BASE_STYLE = 'mapbox://styles/mapbox/dark-v11';

/**
 * Layer ID for the Datédex 3D building `fill-extrusion` layer.
 */
export const BUILDINGS_3D_LAYER_ID = 'datedex-3d-buildings';

/**
 * Default initial globe zoom level.
 */
export const DEFAULT_GLOBE_ZOOM = 1.8;

/**
 * Zoom threshold above which the camera automatically eases into 3D street pitch.
 */
export const AUTO_PITCH_ENTER_ZOOM = 15;

/**
 * Zoom threshold below which the camera automatically flattens back to top-down 2D.
 */
export const AUTO_PITCH_EXIT_ZOOM = 13.5;

/**
 * Target street-level 3D tilt angle in degrees when auto-pitch triggers.
 */
export const AUTO_PITCH_TARGET_DEGREES = 55;

/**
 * Strict grayscale color tokens enforced across every base style layer.
 */
export const MONOCHROME_PALETTE = {
  waterDeep: '#050505',
  waterShallow: '#0a0a0a',
  landGlobe: '#1a1a1a',
  landStreet: '#3a3a3a',
  landDetail: '#262626',
  building2D: '#2c2c2c',
  building3D: '#333333',
  roadMinor: '#555555',
  roadMajor: '#707070',
  roadCasing: '#262626',
  border: '#666666',
  labelPrimary: '#888888',
  labelSecondary: '#707070',
  labelWater: '#555555',
  labelHalo: '#0a0a0a',
} as const;

/**
 * Zoom-interpolated land fill expression transitioning from `#1a1a1a` at globe zoom (`<= 5`)
 * to matte dark gray `#3a3a3a` at street zoom (`>= 14`).
 */
export const MONOCHROME_LAND_COLOR_EXPRESSION: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  5,
  MONOCHROME_PALETTE.landGlobe,
  14,
  MONOCHROME_PALETTE.landStreet,
];

/**
 * Zoom-interpolated ocean and water color expression strictly within `#050505`–`#0a0a0a`.
 */
export const MONOCHROME_WATER_COLOR_EXPRESSION: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  2,
  MONOCHROME_PALETTE.waterDeep,
  14,
  MONOCHROME_PALETTE.waterShallow,
];

/**
 * Mapbox GL v3 globe space atmosphere and starfield fog configuration.
 */
export const MONOCHROME_FOG_SPEC: FogSpecification = {
  'star-intensity': 0.35,
  'space-color': '#141414',
  color: '#2a2a2a',
  'high-color': '#1a1a1a',
  'horizon-blend': 0.08,
};

/**
 * Neutral monochrome directional and ambient lighting giving matte 3D buildings crisp depth.
 */
export const MONOCHROME_LIGHTS_SPEC: LightsSpecification[] = [
  {
    id: 'datedex-ambient',
    type: 'ambient',
    properties: {
      color: '#dcdcdc',
      intensity: 0.45,
    },
  },
  {
    id: 'datedex-directional',
    type: 'directional',
    properties: {
      color: '#ffffff',
      intensity: 0.65,
      direction: [210, 42],
      'cast-shadows': true,
      'shadow-intensity': 0.35,
    },
  },
];

/**
 * Minimal structural subset of `mapboxgl.Map` required for monochrome styling and 3D buildings.
 * Decouples pure styling utilities from WebGL internals for deterministic unit testing.
 */
export interface MonochromeMapLike {
  getStyle: () => { layers?: LayerSpecification[] } | undefined | null;
  getLayer: (id: string) => unknown;
  addLayer: (layer: FillExtrusionLayerSpecification, beforeId?: string) => unknown;
  setPaintProperty: <T extends keyof PaintSpecification>(
    layerId: string,
    name: T,
    value: PaintSpecification[T],
  ) => unknown;
  setLayoutProperty: <T extends keyof LayoutSpecification>(
    layerId: string,
    name: T,
    value: LayoutSpecification[T],
  ) => unknown;
  setFog: (fog: FogSpecification) => unknown;
  setLights?: (lights: LightsSpecification[]) => unknown;
}

/**
 * Options for `applyMonochromeStyle`.
 */
export interface ApplyMonochromeOptions {
  /** Whether the 3D building extrusion layer should start visible (default `true`). */
  show3DBuildings?: boolean;
}

/**
 * Internal state tracked for the 3D-to-2D-to-3D auto-pitch lifecycle.
 */
export interface AutoPitchState {
  /** Whether the user manually tilted the camera via pointer/touch gesture. */
  manualOverride: boolean;
  /** Last automated pitch regime applied (`flat` = 0deg, `tilted` = 55deg). */
  regime: 'flat' | 'tilted';
}

/**
 * Result returned by `evaluateAutoPitchTransition`.
 */
export interface AutoPitchDecision {
  /** Next target pitch in degrees (`55` or `0`), or `null` when no automatic ease should run. */
  targetPitch: number | null;
  /** Updated auto-pitch state to persist across zoom frames. */
  nextState: AutoPitchState;
}

const HIDDEN_LAYER_PATTERN =
  /(^|[-_])(poi|shield|highway[-_]?shield|road[-_]?number|motorway[-_]?exit|transit[-_]?label|airport[-_]?label|landmark|commercial[-_]?icon)([-_]|$)/i;
const WATER_PATTERN = /(water|ocean|sea|lake|river|bay|pond|canal|reservoir|stream|drain)/i;
const BUILDING_PATTERN = /(building|structure)/i;
const BORDER_PATTERN = /(admin|boundary|border|country|state|disputed)/i;
const CASING_PATTERN = /(case|casing)/i;
const MAJOR_ROAD_PATTERN = /(motorway|trunk|primary|highway|freeway|expressway)/i;
const LAND_DETAIL_PATTERN =
  /(park|green|forest|wood|grass|landcover|landuse|pitch|cemetery|hospital|school|industrial|commercial|aeroway|runway|apron)/i;
const MAJOR_LABEL_PATTERN = /(country|state|settlement|city|place|continent)/i;

function safeSetPaintProperty<T extends keyof PaintSpecification>(
  map: MonochromeMapLike,
  layerId: string,
  property: T,
  value: PaintSpecification[T],
): void {
  try {
    map.setPaintProperty(layerId, property, value);
  } catch {
    // Ignore properties unsupported by a specific vector/raster sub-layer
  }
}

function safeSetLayoutProperty<T extends keyof LayoutSpecification>(
  map: MonochromeMapLike,
  layerId: string,
  property: T,
  value: LayoutSpecification[T],
): void {
  try {
    map.setLayoutProperty(layerId, property, value);
  } catch {
    // Ignore layout properties unsupported by a specific layer
  }
}

/**
 * Determines whether a Mapbox base layer represents a commercial POI or colored highway shield
 * that must be hidden in Datédex monochrome mode.
 * @param {LayerSpecification} layer - Mapbox style layer specification.
 * @returns {boolean} `true` when the layer should be hidden (`visibility: 'none'`).
 */
export function shouldHideLayerInMonochrome(layer: LayerSpecification): boolean {
  if (HIDDEN_LAYER_PATTERN.test(layer.id)) {
    return true;
  }

  // Hide icon-only symbol layers (e.g. highway shields, transit emblems, POI icons) without text labels
  if (layer.type === 'symbol') {
    const layout = layer.layout as Record<string, unknown> | undefined;
    const hasIcon = Boolean(layout && layout['icon-image']);
    const hasText = Boolean(layout && layout['text-field']);
    if (hasIcon && !hasText) {
      return true;
    }
  }

  return false;
}

/**
 * Creates the Mapbox GL v3 `fill-extrusion` specification for matte dark gray 3D street buildings
 * starting at `minzoom: 14` with smooth zoom-interpolated height transitions.
 * @returns {FillExtrusionLayerSpecification} Mapbox `fill-extrusion` layer specification.
 */
export function create3DBuildingsLayer(): FillExtrusionLayerSpecification {
  return {
    id: BUILDINGS_3D_LAYER_ID,
    source: 'composite',
    'source-layer': 'building',
    filter: ['==', 'extrude', 'true'],
    type: 'fill-extrusion',
    minzoom: 14,
    layout: {
      visibility: 'visible',
    },
    paint: {
      'fill-extrusion-color': MONOCHROME_PALETTE.building3D,
      'fill-extrusion-height': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14,
        0,
        14.5,
        ['coalesce', ['get', 'height'], 0],
      ],
      'fill-extrusion-base': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14,
        0,
        14.5,
        ['coalesce', ['get', 'min_height'], 0],
      ],
      'fill-extrusion-opacity': 0.92,
      'fill-extrusion-vertical-gradient': true,
    },
  };
}

/**
 * Strips all accent colors from the loaded `dark-v11` style into strict black-on-black monochrome,
 * hides commercial POIs and colored highway shields, applies globe space fog and directional lights,
 * and mounts the `minzoom: 14` 3D buildings `fill-extrusion` layer below text labels.
 * @param {MonochromeMapLike} map - Active Mapbox GL map instance.
 * @param {ApplyMonochromeOptions} [options] - Optional visibility configuration for 3D buildings.
 * @returns {void}
 */
export function applyMonochromeStyle(
  map: MonochromeMapLike,
  options: ApplyMonochromeOptions = {},
): void {
  const show3DBuildings = options.show3DBuildings ?? true;

  // 1. Configure globe space atmosphere and starfield
  map.setFog(MONOCHROME_FOG_SPEC);

  // 2. Configure monochrome directional + ambient lighting for 3D street extrusions
  if (typeof map.setLights === 'function') {
    try {
      map.setLights(MONOCHROME_LIGHTS_SPEC);
    } catch {
      // Fallback safely when running under reduced mock styles
    }
  }

  const layers = map.getStyle()?.layers ?? [];
  let firstTextLabelLayerId: string | undefined;

  for (const layer of layers) {
    if (layer.id === BUILDINGS_3D_LAYER_ID) continue;

    // 3. Hide commercial POI icons and colored highway shields
    if (shouldHideLayerInMonochrome(layer)) {
      safeSetLayoutProperty(map, layer.id, 'visibility', 'none');
      continue;
    }

    switch (layer.type) {
      case 'background': {
        safeSetPaintProperty(map, layer.id, 'background-color', MONOCHROME_LAND_COLOR_EXPRESSION);
        break;
      }

      case 'fill': {
        if (WATER_PATTERN.test(layer.id)) {
          const waterValue = /shadow/i.test(layer.id)
            ? MONOCHROME_PALETTE.waterDeep
            : MONOCHROME_WATER_COLOR_EXPRESSION;
          safeSetPaintProperty(map, layer.id, 'fill-color', waterValue);
        } else if (BUILDING_PATTERN.test(layer.id)) {
          safeSetPaintProperty(map, layer.id, 'fill-color', MONOCHROME_PALETTE.building2D);
          safeSetPaintProperty(map, layer.id, 'fill-outline-color', '#383838');
        } else if (LAND_DETAIL_PATTERN.test(layer.id)) {
          safeSetPaintProperty(map, layer.id, 'fill-color', MONOCHROME_PALETTE.landDetail);
        } else {
          safeSetPaintProperty(map, layer.id, 'fill-color', MONOCHROME_LAND_COLOR_EXPRESSION);
        }
        break;
      }

      case 'line': {
        if (WATER_PATTERN.test(layer.id)) {
          safeSetPaintProperty(map, layer.id, 'line-color', MONOCHROME_PALETTE.waterShallow);
        } else if (BORDER_PATTERN.test(layer.id)) {
          safeSetPaintProperty(map, layer.id, 'line-color', MONOCHROME_PALETTE.border);
        } else if (CASING_PATTERN.test(layer.id)) {
          safeSetPaintProperty(map, layer.id, 'line-color', MONOCHROME_PALETTE.roadCasing);
        } else if (MAJOR_ROAD_PATTERN.test(layer.id)) {
          safeSetPaintProperty(map, layer.id, 'line-color', MONOCHROME_PALETTE.roadMajor);
        } else {
          safeSetPaintProperty(map, layer.id, 'line-color', MONOCHROME_PALETTE.roadMinor);
        }
        break;
      }

      case 'symbol': {
        const layout = layer.layout as Record<string, unknown> | undefined;
        if (!firstTextLabelLayerId && layout && layout['text-field']) {
          firstTextLabelLayerId = layer.id;
        }

        // Suppress any remaining inline symbol icons (shields/POIs) while keeping crisp grayscale text
        if (layout && layout['icon-image']) {
          safeSetPaintProperty(map, layer.id, 'icon-opacity', 0);
        }

        const textColor = WATER_PATTERN.test(layer.id)
          ? MONOCHROME_PALETTE.labelWater
          : MAJOR_LABEL_PATTERN.test(layer.id)
            ? MONOCHROME_PALETTE.labelPrimary
            : MONOCHROME_PALETTE.labelSecondary;

        safeSetPaintProperty(map, layer.id, 'text-color', textColor);
        safeSetPaintProperty(map, layer.id, 'text-halo-color', MONOCHROME_PALETTE.labelHalo);
        break;
      }

      case 'fill-extrusion': {
        safeSetPaintProperty(map, layer.id, 'fill-extrusion-color', MONOCHROME_PALETTE.building3D);
        break;
      }

      case 'hillshade': {
        safeSetPaintProperty(map, layer.id, 'hillshade-accent-color', '#222222');
        safeSetPaintProperty(map, layer.id, 'hillshade-highlight-color', '#444444');
        safeSetPaintProperty(map, layer.id, 'hillshade-shadow-color', '#0a0a0a');
        break;
      }

      case 'circle': {
        safeSetPaintProperty(map, layer.id, 'circle-color', '#666666');
        safeSetPaintProperty(map, layer.id, 'circle-stroke-color', '#1a1a1a');
        break;
      }

      case 'raster': {
        safeSetPaintProperty(map, layer.id, 'raster-saturation', -1);
        break;
      }

      case 'sky': {
        safeSetPaintProperty(map, layer.id, 'sky-atmosphere-color', '#1a1a1a');
        safeSetPaintProperty(map, layer.id, 'sky-atmosphere-halo-color', '#2a2a2a');
        break;
      }

      default:
        break;
    }
  }

  // 4. Mount 3D street-level buildings layer below text labels
  if (!map.getLayer(BUILDINGS_3D_LAYER_ID)) {
    map.addLayer(create3DBuildingsLayer(), firstTextLabelLayerId);
  }
  safeSetLayoutProperty(
    map,
    BUILDINGS_3D_LAYER_ID,
    'visibility',
    show3DBuildings ? 'visible' : 'none',
  );
}

/**
 * Evaluates whether the 3D-to-2D-to-3D zoom lifecycle should ease camera pitch
 * to `55°` (`zoom > 15`) or flatten back to `0°` (`zoom < 13.5`), respecting user pitch overrides.
 * @param {number} zoom - Current Mapbox camera zoom level.
 * @param {number} currentPitch - Current Mapbox camera pitch in degrees.
 * @param {boolean} show3DBuildings - Whether 3D buildings mode is enabled.
 * @param {AutoPitchState} state - Prior auto-pitch regime and manual override flag.
 * @returns {AutoPitchDecision} Optional pitch target and updated auto-pitch state.
 */
export function evaluateAutoPitchTransition(
  zoom: number,
  currentPitch: number,
  show3DBuildings: boolean,
  state: AutoPitchState,
): AutoPitchDecision {
  // Crossing street-level threshold (> 15): tilt to 55deg unless manually overridden or 3D disabled
  if (zoom > AUTO_PITCH_ENTER_ZOOM) {
    if (!show3DBuildings || state.manualOverride || state.regime === 'tilted') {
      return { targetPitch: null, nextState: state };
    }
    return {
      targetPitch: currentPitch < AUTO_PITCH_TARGET_DEGREES - 1 ? AUTO_PITCH_TARGET_DEGREES : null,
      nextState: { manualOverride: false, regime: 'tilted' },
    };
  }

  // Zooming out below 13.5: flatten smoothly back to top-down 2D (0deg) and clear manual override
  if (zoom < AUTO_PITCH_EXIT_ZOOM) {
    const needsFlatten = currentPitch > 0.5 && (state.regime === 'tilted' || state.manualOverride);
    return {
      targetPitch: needsFlatten ? 0 : null,
      nextState: { manualOverride: false, regime: 'flat' },
    };
  }

  // Hysteresis band [13.5, 15]: hold current pitch to prevent oscillation
  return { targetPitch: null, nextState: state };
}
