/**
 * @module domain/spreadsheet/__tests__/importer.test
 * Unit tests for column auto-detection, row validation, starter template, and export serialization.
 */
import { describe, expect, it } from 'vitest';
import {
  buildStarterTemplateRows,
  detectColumnMapping,
  parseSpreadsheetRows,
} from '../importer';

describe('spreadsheet importer', () => {
  it('auto-detects headers and validates valid rows with city coordinate fallback', () => {
    const headers = ['First Name', 'Country', 'City', 'Score', 'Channel', 'Date', 'Comments'];
    const mapping = detectColumnMapping(headers);

    expect(mapping.name).toBe('First Name');
    expect(mapping.nationalityCode).toBe('Country');
    expect(mapping.city).toBe('City');
    expect(mapping.rating).toBe('Score');

    const preview = parseSpreadsheetRows(
      [
        {
          'First Name': 'Aiko',
          Country: 'Japan',
          City: 'Tokyo',
          Score: 9, // 10-scale auto-normalized to 4.5
          Channel: 'IRL',
          Date: '2026-09-20',
          Comments: 'Shibuya coffee',
        },
        {
          'First Name': '', // invalid empty name
          Country: 'FR',
          City: 'Paris',
          Score: 4,
          Channel: 'Hinge',
          Date: '2026-09-21',
          Comments: '',
        },
      ],
      mapping,
    );

    expect(preview.validPins).toHaveLength(1);
    expect(preview.validPins[0]?.nationalityCode).toBe('JP');
    expect(preview.validPins[0]?.rating).toBe(4.5);
    expect(preview.validPins[0]?.latitude).toBeCloseTo(35.6762, 2);
    expect(preview.errors).toHaveLength(1);
    expect(preview.errors[0]?.rowIndex).toBe(3);
  });

  it('produces pre-formatted starter template rows that pass row validation', () => {
    const templateRows = buildStarterTemplateRows();
    const mapping = detectColumnMapping(Object.keys(templateRows[0] ?? {}));
    const preview = parseSpreadsheetRows(templateRows, mapping);

    expect(preview.validPins).toHaveLength(templateRows.length);
    expect(preview.errors).toHaveLength(0);
  });
});
