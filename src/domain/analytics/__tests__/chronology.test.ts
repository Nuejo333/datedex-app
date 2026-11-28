/**
 * @module domain/analytics/__tests__/chronology.test
 * Unit tests verifying chronological anchor date resolution, ascending re-numbering
 * when inserting older connections or editing dates, and live preview numbering.
 */
import { describe, expect, it } from 'vitest';
import {
  assignChronologicalNumbers,
  getChronologicalAnchorDate,
  previewChronologicalEntryNumber,
  type ChronologicalEntryLike,
} from '../chronology';

function makeEntry(overrides: Partial<ChronologicalEntryLike> = {}): ChronologicalEntryLike {
  return {
    id: crypto.randomUUID(),
    name: 'Sofia',
    dateMet: '2026-06-15',
    firstIntimateDate: '',
    createdAt: '2026-06-15T12:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('chronology ordering & dynamic profile numbering', () => {
  it('uses firstIntimateDate as chronological anchor when recorded, falling back to dateMet', () => {
    expect(
      getChronologicalAnchorDate({ dateMet: '2026-05-01', firstIntimateDate: '2026-05-12' }),
    ).toBe('2026-05-12');
    expect(getChronologicalAnchorDate({ dateMet: '2026-05-01', firstIntimateDate: '' })).toBe(
      '2026-05-01',
    );
  });

  it('recalculates sequential #1..#N profile numbers accurately when inserting an older connection', () => {
    const june = makeEntry({ id: 'a', name: 'Camille', dateMet: '2026-06-10' });
    const august = makeEntry({
      id: 'b',
      name: 'Elena',
      dateMet: '2026-08-01',
      firstIntimateDate: '2026-08-20',
    });
    const olderMemory = makeEntry({ id: 'c', name: 'Sofia', dateMet: '2026-03-04' });

    const numbered = assignChronologicalNumbers([june, august, olderMemory]);
    expect(numbered.map((p) => ({ name: p.name, entryNumber: p.entryNumber }))).toEqual([
      { name: 'Sofia', entryNumber: 1 },
      { name: 'Camille', entryNumber: 2 },
      { name: 'Elena', entryNumber: 3 },
    ]);
  });

  it('previews live chronological #N position for new past memories and edited date shifts', () => {
    const existing = [
      makeEntry({ id: 'pin-1', name: 'Camille', dateMet: '2026-06-10' }),
      makeEntry({ id: 'pin-2', name: 'Elena', dateMet: '2026-08-20' }),
    ];

    // New entry dated earlier than all existing entries -> #1
    expect(previewChronologicalEntryNumber(existing, { dateMet: '2026-02-14' })).toBe(1);

    // New entry whose firstIntimateDate lands between pin-1 and pin-2 -> #2
    expect(
      previewChronologicalEntryNumber(existing, {
        dateMet: '2026-05-01',
        firstIntimateDate: '2026-07-01',
      }),
    ).toBe(2);

    // New entry dated after all existing entries -> #3
    expect(previewChronologicalEntryNumber(existing, { dateMet: '2026-11-28' })).toBe(3);

    // Editing pin-2 to an earlier date moves it from #2 to #1
    expect(
      previewChronologicalEntryNumber(existing, {
        id: 'pin-2',
        name: 'Elena',
        dateMet: '2026-01-10',
      }),
    ).toBe(1);
  });
});
