/**
 * @module domain/spreadsheet/importer
 * Pure column auto-detection, row validation, starter template generation,
 * and export serialization for Excel (.xlsx) and CSV files.
 */
import {
  IntimacyLevelSchema,
  MetChannelSchema,
  PinInputSchema,
  RelationshipStatusSchema,
  type DecryptedPin,
  type PinInput,
} from '../models/pin';
import { GLOBAL_CITIES, findCountryByQuery } from '../countries/countries';

/**
 * Target Datédex fields mappable from spreadsheet columns.
 */
export type TargetPinField =
  | 'name'
  | 'age'
  | 'nationalityCode'
  | 'city'
  | 'latitude'
  | 'longitude'
  | 'rating'
  | 'relationshipStatus'
  | 'intimacyLevel'
  | 'metChannel'
  | 'dateMet'
  | 'notes';

/**
 * Auto-detected mapping from source spreadsheet header to target Datédex field.
 */
export type ColumnMapping = Partial<Record<TargetPinField, string>>;

/**
 * Result of validating parsed spreadsheet rows against `PinInputSchema`.
 */
export interface SpreadsheetImportPreview {
  validPins: PinInput[];
  errors: Array<{ rowIndex: number; message: string }>;
}

const HEADER_ALIASES: Record<TargetPinField, string[]> = {
  name: ['name', 'first name', 'nickname', 'person', 'match'],
  age: ['age', 'years'],
  nationalityCode: ['nationality', 'country', 'country code', 'iso', 'origin', 'flag'],
  city: ['city', 'location', 'place', 'town'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lng', 'lon', 'long'],
  rating: ['rating', 'score', 'stars', 'vibe'],
  relationshipStatus: ['status', 'relationship status', 'stage', 'relationship_status'],
  intimacyLevel: ['intimacy', 'intimacy level', 'intimacy_level', 'base'],
  metChannel: ['channel', 'met channel', 'met_channel', 'app', 'source', 'how we met'],
  dateMet: ['date', 'date met', 'date_met', 'met on', 'when'],
  notes: ['notes', 'note', 'comments', 'memory', 'story'],
};

/**
 * Auto-detects the best matching spreadsheet column for each Datédex field.
 * @param {string[]} headers - Column headers parsed from row 1 of the sheet.
 * @returns {ColumnMapping} Mapping of Datédex field keys to source column names.
 */
export function detectColumnMapping(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedHeaders = headers.map((h) => ({
    raw: h,
    clean: h.trim().toLowerCase().replace(/[_-]+/g, ' '),
  }));

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[TargetPinField, string[]]>) {
    const exactMatch = normalizedHeaders.find((h) => aliases.includes(h.clean));
    if (exactMatch) {
      mapping[field] = exactMatch.raw;
      continue;
    }
    const partialMatch = normalizedHeaders.find((h) =>
      aliases.some((alias) => h.clean.includes(alias)),
    );
    if (partialMatch) {
      mapping[field] = partialMatch.raw;
    }
  }

  return mapping;
}

function normalizeStatus(raw: unknown): string {
  const val = String(raw ?? 'first_date')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const parsed = RelationshipStatusSchema.safeParse(val);
  return parsed.success ? parsed.data : 'first_date';
}

function normalizeIntimacy(raw: unknown): string {
  const val = String(raw ?? 'none')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const parsed = IntimacyLevelSchema.safeParse(val);
  return parsed.success ? parsed.data : 'none';
}

function normalizeChannel(raw: unknown): string {
  const clean = String(raw ?? 'Other').trim().toLowerCase();
  const matched = MetChannelSchema.options.find((opt) => opt.toLowerCase() === clean);
  return matched ?? 'Other';
}

function normalizeDate(raw: unknown): string {
  const str = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = Date.parse(str);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Validates and transforms raw spreadsheet row objects using a column mapping.
 * Falls back to curated city coordinates when latitude/longitude cells are blank.
 * @param {Array<Record<string, unknown>>} rows - Raw row objects parsed by `xlsx`.
 * @param {ColumnMapping} mapping - Active column mapping.
 * @returns {SpreadsheetImportPreview} Validated `PinInput` items and per-row errors.
 */
export function parseSpreadsheetRows(
  rows: ReadonlyArray<Record<string, unknown>>,
  mapping: ColumnMapping,
): SpreadsheetImportPreview {
  const validPins: PinInput[] = [];
  const errors: Array<{ rowIndex: number; message: string }> = [];

  rows.forEach((row, index) => {
    const read = (field: TargetPinField): unknown => {
      const col = mapping[field];
      return col ? row[col] : undefined;
    };

    const cityRaw = String(read('city') ?? '').trim();
    const cityMatch = GLOBAL_CITIES.find(
      (c) => c.city.toLowerCase() === cityRaw.toLowerCase(),
    );

    const countryRaw = String(read('nationalityCode') ?? '').trim();
    const resolvedCountry =
      findCountryByQuery(countryRaw) ?? cityMatch?.countryCode ?? '';

    const latRaw = read('latitude');
    const lngRaw = read('longitude');
    const parsedLat =
      latRaw !== undefined && String(latRaw).trim() !== ''
        ? Number(latRaw)
        : cityMatch?.latitude;
    const parsedLng =
      lngRaw !== undefined && String(lngRaw).trim() !== ''
        ? Number(lngRaw)
        : cityMatch?.longitude;

    const ratingRaw = Number(read('rating') ?? 4);
    // Support 10-scale numeric imports automatically by halving values > 5
    const normalizedRating =
      Number.isFinite(ratingRaw) && ratingRaw > 5 && ratingRaw <= 10
        ? Number((ratingRaw / 2).toFixed(1))
        : ratingRaw;

    const ageRaw = read('age');
    const parsedAge =
      ageRaw !== undefined && String(ageRaw).trim() !== '' ? Number(ageRaw) : null;

    const candidate = {
      name: String(read('name') ?? '').trim(),
      age: parsedAge,
      nationalityCode: resolvedCountry,
      city: cityRaw,
      latitude: parsedLat,
      longitude: parsedLng,
      rating: Number.isFinite(normalizedRating) ? normalizedRating : 4,
      relationshipStatus: normalizeStatus(read('relationshipStatus')),
      intimacyLevel: normalizeIntimacy(read('intimacyLevel')),
      metChannel: normalizeChannel(read('metChannel')),
      dateMet: normalizeDate(read('dateMet')),
      notes: String(read('notes') ?? '').trim(),
      vaultLocked: false,
      vaultAlias: '',
    };

    const result = PinInputSchema.safeParse(candidate);
    if (!result.success) {
      const msg = result.error.issues.map((issue) => issue.message).join('; ');
      errors.push({ rowIndex: index + 2, message: msg });
      return;
    }
    validPins.push(result.data);
  });

  return { validPins, errors };
}

/**
 * Generates pre-formatted starter template rows for `.xlsx` download.
 * @returns {Array<Record<string, string | number>>} Sample template rows.
 */
export function buildStarterTemplateRows(): Array<Record<string, string | number>> {
  return [
    {
      Name: 'Sofia',
      Age: 26,
      Nationality: 'IT',
      City: 'Milan',
      Latitude: 45.4642,
      Longitude: 9.19,
      Rating: 4.5,
      Status: 'dating',
      Intimacy: 'kiss',
      Channel: 'Hinge',
      Date: '2026-09-14',
      Notes: 'Aperitivo in Brera, amazing rooftop view',
    },
    {
      Name: 'Camille',
      Age: 25,
      Nationality: 'FR',
      City: 'Paris',
      Latitude: 48.8566,
      Longitude: 2.3522,
      Rating: 5,
      Status: 'first_date',
      Intimacy: 'none',
      Channel: 'IRL',
      Date: '2026-10-02',
      Notes: 'Met at a vinyl bookstore in Le Marais',
    },
  ];
}

/**
 * Serializes decrypted pins into flat spreadsheet export rows.
 * @param {DecryptedPin[]} pins - Active pins to export.
 * @returns {Array<Record<string, string | number>>} Flat export rows.
 */
export function serializePinsForExport(
  pins: readonly DecryptedPin[],
): Array<Record<string, string | number>> {
  return pins
    .filter((pin) => !pin.deletedAt)
    .map((pin) => ({
      Name: pin.name,
      Age: pin.age ?? '',
      Nationality: pin.nationalityCode,
      City: pin.city,
      Latitude: pin.latitude,
      Longitude: pin.longitude,
      Rating: pin.rating,
      Status: pin.relationshipStatus,
      Intimacy: pin.intimacyLevel,
      Channel: pin.metChannel,
      Date: pin.dateMet,
      Notes: pin.notes,
    }));
}
