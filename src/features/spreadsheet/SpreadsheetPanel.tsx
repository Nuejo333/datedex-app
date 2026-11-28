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
import { useTranslation } from '../../platform/i18n/LanguageContext';
import type { TranslationKey } from '../../platform/i18n/translations';

/**
 * Props for `SpreadsheetPanel`.
 */
export interface SpreadsheetPanelProps {
  pins: DecryptedPin[];
  onImportPins: (pins: PinInput[]) => Promise<number>;
}

const TARGET_FIELDS: Array<{ field: TargetPinField; labelKey: TranslationKey }> = [
  { field: 'name', labelKey: 'import.field.name' },
  { field: 'age', labelKey: 'import.field.age' },
  { field: 'nationalityCode', labelKey: 'import.field.nationalityCode' },
  { field: 'city', labelKey: 'import.field.city' },
  { field: 'latitude', labelKey: 'import.field.latitude' },
  { field: 'longitude', labelKey: 'import.field.longitude' },
  { field: 'rating', labelKey: 'import.field.rating' },
  { field: 'relationshipStatus', labelKey: 'import.field.relationshipStatus' },
  { field: 'intimacyLevel', labelKey: 'import.field.intimacyLevel' },
  { field: 'metChannel', labelKey: 'import.field.metChannel' },
  { field: 'dateMet', labelKey: 'import.field.dateMet' },
  { field: 'notes', labelKey: 'import.field.notes' },
];

/**
 * Renders Excel/CSV import, live mapping preview, starter template download, and export.
 * @param {SpreadsheetPanelProps} props - Active pins and batch import callback.
 * @returns {React.JSX.Element} Spreadsheet tooling panel.
 */
export function SpreadsheetPanel({ pins, onImportPins }: SpreadsheetPanelProps): React.JSX.Element {
  const { t } = useTranslation();
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
        throw new Error(t('import.errorNoSheets'));
      }
      const worksheet = workbook.Sheets[firstSheetName];
      if (!worksheet) {
        throw new Error(t('import.errorUnreadable'));
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
      if (rows.length === 0) {
        throw new Error(t('import.errorEmpty'));
      }
      const detectedHeaders = Object.keys(rows[0] ?? {});
      const autoMapping = detectColumnMapping(detectedHeaders);
      const nextPreview = parseSpreadsheetRows(rows, autoMapping);

      setHeaders(detectedHeaders);
      setRawRows(rows);
      setMapping(autoMapping);
      setPreview(nextPreview);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('import.errorParse'));
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
      setFeedback(t('import.success', { count: importedCount }));
      setPreview(null);
      setRawRows([]);
      setHeaders([]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('import.errorCommit'));
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
      <section className="space-y-3 rounded-2xl border border-white/15 bg-[#080808] p-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-red-500" aria-hidden="true" />
          <h2 className="text-sm font-bold text-white">{t('import.cardTitle')}</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-red-500">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {t('import.uploadBtn')}
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
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#111111] px-3.5 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10 hover:text-white"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {t('import.templateBtn')}
          </button>

          <button
            type="button"
            disabled={pins.length === 0}
            onClick={() => handleExportPins('xlsx')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#111111] px-3.5 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {t('import.exportXlsx', { count: pins.length })}
          </button>

          <button
            type="button"
            disabled={pins.length === 0}
            onClick={() => handleExportPins('csv')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#111111] px-3.5 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {t('import.exportCsv')}
          </button>
        </div>
      </section>

      {preview && (
        <section className="space-y-3 rounded-2xl border border-white/15 bg-[#080808] p-4">
          <h3 className="text-xs font-bold tracking-wide text-red-400 uppercase">
            {t('import.previewTitle')}
          </h3>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TARGET_FIELDS.map(({ field, labelKey }) => (
              <div key={field}>
                <label
                  htmlFor={`map-${field}`}
                  className="mb-1 block text-[11px] font-medium text-neutral-300"
                >
                  {t(labelKey)}
                </label>
                <select
                  id={`map-${field}`}
                  value={mapping[field] ?? ''}
                  onChange={(e) => handleMappingChange(field, e.target.value)}
                  className="dd-input text-xs"
                >
                  <option value="">{t('import.skipOption')}</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/15 bg-[#111111] p-3 text-xs">
            <p className="font-semibold text-white">
              {t('import.validRowsReady', { count: preview.validPins.length })}
            </p>
            {preview.errors.length > 0 && (
              <ul className="mt-1.5 space-y-1 text-red-400">
                {preview.errors.slice(0, 5).map((err) => (
                  <li key={`${err.rowIndex}-${err.message}`}>
                    {t('import.rowError', { row: err.rowIndex, message: err.message })}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            disabled={importing || preview.validPins.length === 0}
            onClick={() => void handleCommitImport()}
            className="w-full rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
          >
            {importing
              ? t('import.importing')
              : t('import.commitBtn', { count: preview.validPins.length })}
          </button>
        </section>
      )}

      {feedback && (
        <p className="rounded-xl border border-white/25 bg-[#111111] px-3.5 py-2.5 text-xs text-white">
          {feedback}
        </p>
      )}
      {errorMsg && (
        <p role="alert" className="rounded-xl border border-red-500/50 bg-red-950/50 px-3.5 py-2.5 text-xs text-red-200">
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
  const { t } = useTranslation();

  return (
    <div data-testid="import-page" className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-30 border-b border-white/15 bg-black/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.backAria')}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#111111] px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t('common.back')}
          </button>

          <h1 className="text-base font-bold tracking-tight text-white">{t('import.pageTitle')}</h1>

          <span className="w-16" aria-hidden="true" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 pb-14">
        <SpreadsheetPanel pins={pins} onImportPins={onImportPins} />
      </main>
    </div>
  );
}
