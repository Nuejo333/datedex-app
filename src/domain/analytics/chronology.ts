/**
 * @module domain/analytics/chronology
 * Pure chronological ordering and dynamic profile numbering (`#1`, `#2`, `#3`, ...)
 * anchored on each connection's first intimate date (when recorded) with clean fallback
 * to the encounter/first date (`dateMet`) and deterministic tie-breaking.
 */

/**
 * Minimal fields needed to compute chronological ordering and `#N` profile numbers.
 */
export interface ChronologicalEntryLike {
  id: string;
  name: string;
  dateMet: string;
  firstIntimateDate?: string | null;
  createdAt?: string;
  deletedAt?: string | null;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Deterministic day offset table used to compute a default First Intimate Date
 * from the encounter/first date (`dateMet`) and `Dates2Bed` when Intimacy Level is `Sex`:
 * - `'0'` (Same night) -> `+0` days
 * - `'1'` (First date) -> `+0` days
 * - `'2'` -> `+1` day
 * - `'3'` -> `+2` days
 * - `'4'` -> `+3` days
 * - `'5+'` -> `+4` days
 */
const DATES_TO_BED_DAY_OFFSETS: Record<string, number> = {
  '0': 0,
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5+': 4,
};

/**
 * Computes the default First Intimate Date (`YYYY-MM-DD`) from an encounter/first date
 * and a `Dates2Bed` selection using UTC calendar arithmetic (immune to local DST shifts).
 * Returns an empty string when `dateMet` is not a valid `YYYY-MM-DD` date.
 * @param {string} dateMet - Encounter / first date in `YYYY-MM-DD` format.
 * @param {string | null | undefined} datesToBed - Selected `Dates2Bed` value (`'0'`, `'1'`, `'2'`, `'3'`, `'4'`, `'5+'`).
 * @returns {string} Computed ISO `YYYY-MM-DD` first intimate date.
 */
export function computeAutoFirstIntimateDate(
  dateMet: string,
  datesToBed?: string | null,
): string {
  const clean = dateMet.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (!match || !match[1] || !match[2] || !match[3]) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const offsetDays = DATES_TO_BED_DAY_OFFSETS[(datesToBed ?? '').trim()] ?? 0;

  const target = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return target.toISOString().slice(0, 10);
}

/**
 * Returns the chronological anchor date (`YYYY-MM-DD`) for a connection:
 * prioritizes `firstIntimateDate` when validly recorded, otherwise falls back to `dateMet`.
 * @param {Pick<ChronologicalEntryLike, 'firstIntimateDate' | 'dateMet'>} entry - Connection date fields.
 * @returns {string} Canonical ISO `YYYY-MM-DD` anchor date.
 */
export function getChronologicalAnchorDate(
  entry: Pick<ChronologicalEntryLike, 'firstIntimateDate' | 'dateMet'>,
): string {
  const intimate = (entry.firstIntimateDate ?? '').trim();
  if (ISO_DATE_PATTERN.test(intimate)) {
    return intimate;
  }
  return (entry.dateMet ?? '').trim();
}

/**
 * Deterministic ascending chronological comparator (`#1` oldest -> `#N` newest).
 * Tie-breaks by `dateMet`, `createdAt`, `name`, and `id`.
 * @param {ChronologicalEntryLike} a - First connection entry.
 * @param {ChronologicalEntryLike} b - Second connection entry.
 * @returns {number} Negative if `a` precedes `b`, positive if `b` precedes `a`, else 0.
 */
export function comparePinsChronologically(
  a: ChronologicalEntryLike,
  b: ChronologicalEntryLike,
): number {
  const anchorA = getChronologicalAnchorDate(a);
  const anchorB = getChronologicalAnchorDate(b);
  const anchorCmp = anchorA.localeCompare(anchorB);
  if (anchorCmp !== 0) return anchorCmp;

  const metCmp = a.dateMet.localeCompare(b.dateMet);
  if (metCmp !== 0) return metCmp;

  const createdCmp = (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  if (createdCmp !== 0) return createdCmp;

  const nameCmp = a.name.localeCompare(b.name);
  if (nameCmp !== 0) return nameCmp;

  return a.id.localeCompare(b.id);
}

/**
 * Sorts all non-deleted connections chronologically and recalculates sequential
 * 1-indexed profile numbers (`#1`, `#2`, `#3`, ...).
 * @template T
 * @param {readonly T[]} pins - Active (or mixed) connection entries.
 * @returns {Array<T & { entryNumber: number }>} Chronologically sorted entries with recalculated `entryNumber`.
 */
export function assignChronologicalNumbers<T extends ChronologicalEntryLike>(
  pins: readonly T[],
): Array<T & { entryNumber: number }> {
  const active = pins.filter((pin) => !pin.deletedAt);
  const sorted = [...active].sort(comparePinsChronologically);
  return sorted.map((pin, idx) => ({
    ...pin,
    entryNumber: idx + 1,
  }));
}

/**
 * Computes the live chronological profile number (`#N`) that a new or edited connection
 * will occupy among `existingPins` given its current `dateMet` and optional `firstIntimateDate`.
 * @param {readonly ChronologicalEntryLike[]} existingPins - All currently saved connections.
 * @param {object} draft - Draft connection currently open in the editor modal.
 * @param {string} [draft.id] - Existing pin UUID when editing (excluded from duplicates).
 * @param {string} draft.dateMet - Draft encounter / first date (`YYYY-MM-DD`).
 * @param {string} [draft.firstIntimateDate] - Optional draft first intimate date (`YYYY-MM-DD`).
 * @param {string} [draft.name] - Draft name for deterministic same-day tie-breaking.
 * @param {string} [draft.createdAt] - Original `createdAt` when editing.
 * @returns {number} 1-indexed chronological position (`#1`, `#2`, ...).
 */
export function previewChronologicalEntryNumber(
  existingPins: readonly ChronologicalEntryLike[],
  draft: {
    id?: string;
    dateMet: string;
    firstIntimateDate?: string;
    name?: string;
    createdAt?: string;
  },
): number {
  const draftId = draft.id || '__draft_preview__';
  const others = existingPins.filter((pin) => !pin.deletedAt && pin.id !== draftId);
  const draftEntry: ChronologicalEntryLike = {
    id: draftId,
    name: (draft.name ?? '').trim() || '\uffff',
    dateMet: draft.dateMet,
    firstIntimateDate: draft.firstIntimateDate ?? '',
    // Brand-new entries sort after already-created entries on the exact same date
    createdAt: draft.createdAt ?? '\uffff',
    deletedAt: null,
  };

  const ordered = [...others, draftEntry].sort(comparePinsChronologically);
  const idx = ordered.findIndex((item) => item.id === draftId);
  return idx >= 0 ? idx + 1 : ordered.length;
}
