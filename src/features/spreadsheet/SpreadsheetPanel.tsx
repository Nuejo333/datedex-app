/**
 * @module features/spreadsheet/SpreadsheetPanel
 * Excel (.xlsx) and CSV importer with live column auto-detection, mapping preview,
 * Zod row validation, pre-formatted starter template download, and current pin export.
 */
import { useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { ArrowLeft, Download, FileSpreadsheet, Upload } from 'lucide-react';
import type { DecryptedPin, PinInput } from '../../domain/models/pin';
import {
  buildStarterTemplateRows,
  detectColumnMapping,
  parseSpreadsheetRows,
  serializePinsForExport,
  type ColumnMapping,
  type SpreadsheetImportPreview,
  type TargetPinField,
} from '../../domain/spreadsheet/importer';

/**
 * Props for `SpreadsheetPanel`.
 */
export interface SpreadsheetPanelProps {
  pins: DecryptedPin[];
  onImportPins: (pins: PinInput[]) => Promise<number>;
}

const TARGET_FIELDS: Array<{ field: TargetPinField; label: string }> = [
  { field: 'name', label: 'Name *' },
  { field: 'age', label: 'Age' },
  { field: 'nationalityCode', label: 'Nationality / Country *' },
  { field: 'city', label: 'City *' },
  { field: 'latitude', label: 'Latitude' },
  { field: 'longitude', label: 'Longitude' },
  { field: 'rating', label: 'Rating' },
  { field: 'relationshipStatus', label: 'Status' },
  { field: 'intimacyLevel', label: 'Intimacy' },
  { field: 'metChannel', label: 'Met Channel' },
  { field: 'dateMet', label: 'Date Met' },
  { field: 'notes', label: 'Notes' },
];

/**
 * Renders Excel/CSV import, live mapping preview, starter template download, and export.
 * @param {SpreadsheetPanelProps} props - Active pins and batch import callback.
 * @returns {React.JSX.Element} Spreadsheet tooling panel.
 */
export function SpreadsheetPanel({ pins, onImportPins }: SpreadsheetPanelProps): React.JSX.Element {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, unknown>>>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<SpreadsheetImportPreview | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setFeedback(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('Spreadsheet contains no sheets');
      }
      const worksheet = workbook.Sheets[firstSheetName];
      if (!worksheet) {
        throw new Error('Unable to read spreadsheet worksheet');
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
      if (rows.length === 0) {
        throw new Error('Spreadsheet is empty');
      }
      const detectedHeaders = Object.keys(rows[0] ?? {});
      const autoMapping = detectColumnMapping(detectedHeaders);
      const nextPreview = parseSpreadsheetRows(rows, autoMapping);

      setHeaders(detectedHeaders);
      setRawRows(rows);
      setMapping(autoMapping);
      setPreview(nextPreview);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse spreadsheet');
    }
  };

  const handleMappingChange = (field: TargetPinField, headerName: string): void => {
    const nextMapping: ColumnMapping = {
      ...mapping,
      [field]: headerName || undefined,
    };
    setMapping(nextMapping);
    setPreview(parseSpreadsheetRows(rawRows, nextMapping));
  };

  const handleCommitImport = async (): Promise<void> => {
    if (!preview || preview.validPins.length === 0) return;
    setImporting(true);
    setErrorMsg(null);
    try {
      const importedCount = await onImportPins(preview.validPins);
      setFeedback(`Imported ${importedCount} validated entries into encrypted storage.`);
      setPreview(null);
      setRawRows([]);
      setHeaders([]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = (): void => {
    const sheet = XLSX.utils.json_to_sheet(buildStarterTemplateRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'DatedexTemplate');
    XLSX.writeFile(wb, 'datedex-starter-template.xlsx');
  };

  const handleExportPins = (format: 'xlsx' | 'csv'): void => {
    const rows = serializePinsForExport(pins);
    const sheet = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Datedex');
    XLSX.writeFile(wb, `datedex-export-${new Date().toISOString().slice(0, 10)}.${format}`);
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#121622] p-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          <h2 className="text-sm font-bold text-white">Excel / CSV Import & Export</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-400">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Import .xlsx / .csv
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => void handleFileChange(e)}
              className="sr-only"
            />
          </label>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Starter Template (.xlsx)
          </button>

          <button
            type="button"
            disabled={pins.length === 0}
            onClick={() => handleExportPins('xlsx')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            Export .xlsx ({pins.length})
          </button>

          <button
            type="button"
            disabled={pins.length === 0}
            onClick={() => handleExportPins('csv')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            Export .csv
          </button>
        </div>
      </section>

      {preview && (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-[#121622] p-4">
          <h3 className="text-xs font-bold tracking-wide text-amber-300 uppercase">
            Column Auto-Detection & Live Preview
          </h3>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TARGET_FIELDS.map(({ field, label }) => (
              <div key={field}>
                <label
                  htmlFor={`map-${field}`}
                  className="mb-1 block text-[11px] font-medium text-slate-300"
                >
                  {label}
                </label>
                <select
                  id={`map-${field}`}
                  value={mapping[field] ?? ''}
                  onChange={(e) => handleMappingChange(field, e.target.value)}
                  className="dd-input text-xs"
                >
                  <option value="">(Skip)</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3 text-xs">
            <p className="font-semibold text-emerald-300">
              {preview.validPins.length} valid row(s) ready to import
            </p>
            {preview.errors.length > 0 && (
              <ul className="mt-1.5 space-y-1 text-rose-300">
                {preview.errors.slice(0, 5).map((err) => (
                  <li key={`${err.rowIndex}-${err.message}`}>
                    Row {err.rowIndex}: {err.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            disabled={importing || preview.validPins.length === 0}
            onClick={() => void handleCommitImport()}
            className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {importing ? 'Encrypting & Importing...' : `Import ${preview.validPins.length} Valid Pins`}
          </button>
        </section>
      )}

      {feedback && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-2.5 text-xs text-emerald-200">
          {feedback}
        </p>
      )}
      {errorMsg && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

/**
 * Props for `ImportView`.
 */
export interface ImportViewProps extends SpreadsheetPanelProps {
  onBack: () => void;
}

/**
 * Full-viewport Import & Export screen opened from the top-header Import button
 * with a sticky Back return path to the active tab.
 * @param {ImportViewProps} props - Active pins, batch import callback, and back handler.
 * @returns {React.JSX.Element} Full-page Import screen.
 */
export function ImportView({ pins, onImportPins, onBack }: ImportViewProps): React.JSX.Element {
  return (
    <div data-testid="import-page" className="min-h-dvh bg-[#0b0d14] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0d14]/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to previous view"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/15 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </button>

          <h1 className="text-base font-bold tracking-tight text-white">Import &amp; Export</h1>

          <span className="w-16" aria-hidden="true" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 pb-14">
        <SpreadsheetPanel pins={pins} onImportPins={onImportPins} />
      </main>
    </div>
  );
}
