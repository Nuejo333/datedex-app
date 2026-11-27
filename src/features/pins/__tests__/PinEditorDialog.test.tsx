/**
 * @module features/pins/__tests__/PinEditorDialog.test
 * Component tests verifying the New Connection (Add / Edit Date) scrollable modal:
 * 1. Exact top-to-bottom section ordering, pronoun adaptation (`her`/`his`/`their`),
 *    and chronological badge date updates from First Intimate Date.
 * 2. Multi-nationality stack (`Main Roots` updating coordinates/city), quick country search,
 *    and pin coordinate fallback to nationality capital when birth city is omitted.
 * 3. Conditional `"Which Friend Introduced You?"` input when `How We Met` is `Friends`.
 * 4. `Save #N` vs `Save Changes` footer labels and Private Local Media Vault storage (`saveMediaItem`).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecryptedPin } from '../../../domain/models/pin';
import { LanguageProvider } from '../../../platform/i18n/LanguageContext';
import { datedexDb } from '../../../platform/indexeddb/db';
import { listMediaItemsForPin } from '../../../platform/indexeddb/mediaVault';
import { PinEditorDialog } from '../PinEditorDialog';

function makeExistingPin(overrides: Partial<DecryptedPin> = {}): DecryptedPin {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    entryNumber: 7,
    avatarEmoji: '💃',
    name: 'Sofia',
    age: 26,
    birthYearOrDob: '1999',
    heightCm: '170 cm',
    instagramHandle: '@sofia',
    personalityTags: ['Adventurous', 'Dancer'],
    characterVote: 9,
    mindVote: 8.5,
    aestheticVote: 9.5,
    nationalityCode: 'IT',
    nationalities: ['IT', 'ES'],
    city: 'Milan',
    birthCity: 'Milan',
    livingCity: 'London',
    metCity: 'Lisbon',
    latitude: 45.4642,
    longitude: 9.19,
    rating: 4.5,
    relationshipStatus: 'dating',
    intimacyLevel: 'oral_foreplay',
    metChannel: 'Hinge',
    introducedByFriend: '',
    spentCurrency: 'EUR',
    spentAmount: 85,
    datesToBed: '1',
    firstIntimateDate: '2026-11-20',
    hookupCity: 'Lisbon',
    bedVote: 9,
    hookupLocations: ['Bed'],
    intimateTags: ['Sensual'],
    dateMet: '2026-11-14',
    notes: 'Rooftop jazz in Lisbon',
    highlights: 'Midnight tram ride',
    generalVote: 9,
    vaultLocked: false,
    vaultAlias: '',
    mediaItemIds: [],
    photoDataUrl: null,
    photoStoragePath: null,
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
    deletedAt: null,
    syncPending: true,
    ...overrides,
  };
}

describe('PinEditorDialog', () => {
  beforeEach(async () => {
    localStorage.clear();
    await datedexDb.localMedia.clear();
  });

  afterEach(async () => {
    cleanup();
    await datedexDb.localMedia.clear();
  });

  it('renders sections in exact top-to-bottom order, adapts pronouns, and syncs chronological badge from first intimate date', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <LanguageProvider initialLocale="en">
        <PinEditorDialog
          open
          initialPin={null}
          droppedCoordinate={null}
          nextEntryNumber={11}
          datingPreference="women"
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />
      </LanguageProvider>,
    );

    // Exact top-to-bottom DOM order: Header -> Section 1..6 -> Footer
    const header = screen.getByTestId('pin-editor-header');
    const scrollBody = screen.getByTestId('pin-editor-scroll-body');
    const footer = screen.getByTestId('pin-editor-footer');
    const sections = Array.from(scrollBody.querySelectorAll(':scope > section'));
    expect(sections.map((el) => el.getAttribute('data-testid'))).toEqual([
      'pin-section-1',
      'pin-section-2',
      'pin-section-3',
      'pin-section-4',
      'pin-section-5',
      'pin-section-6',
    ]);
    expect(
      Boolean(header.compareDocumentPosition(scrollBody) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      Boolean(scrollBody.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    // Section 3 has text-amber-400 styling
    expect(screen.getByRole('heading', { name: /3\. The Encounter/i }).className).toContain(
      'text-amber-400',
    );

    // Pronoun adaptation: women -> her, men -> his, everyone -> their
    expect(screen.getByTestId('pin-editor-subtitle')).toHaveTextContent(/\bher\b/i);

    rerender(
      <LanguageProvider initialLocale="en">
        <PinEditorDialog
          open
          initialPin={null}
          droppedCoordinate={null}
          nextEntryNumber={11}
          datingPreference="men"
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('pin-editor-subtitle')).toHaveTextContent(/\bhis\b/i);

    rerender(
      <LanguageProvider initialLocale="en">
        <PinEditorDialog
          open
          initialPin={null}
          droppedCoordinate={null}
          nextEntryNumber={11}
          datingPreference="everyone"
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('pin-editor-subtitle')).toHaveTextContent(/\btheir\b/i);

    // Chronological badge tracks Date We Met initially, then switches dynamically to First Intimate Date
    const dateMetInput = screen.getByLabelText('Date We Met (First Date) *');
    fireEvent.change(dateMetInput, { target: { value: '2026-11-15' } });
    expect(screen.getByTestId('pin-chronological-badge')).toHaveTextContent('#11 - 15/11/26');

    const firstIntimateInput = screen.getByLabelText('First Intimate Date');
    fireEvent.change(firstIntimateInput, { target: { value: '2026-11-27' } });
    expect(screen.getByTestId('pin-chronological-badge')).toHaveTextContent('#11 - 27/11/26');

    // Interactive Appearance Emoji Picker updates Live Emoji Avatar Box
    await user.click(screen.getByTestId('appearance-emoji-trigger'));
    const popover = screen.getByTestId('appearance-emoji-popover');
    expect(within(popover).getByTestId('appearance-gender-women')).toBeInTheDocument();
    expect(within(popover).getByTestId('appearance-gender-men')).toBeInTheDocument();
    await user.click(within(popover).getByRole('button', { name: /Latina\/Dancer/i }));
    expect(screen.getByTestId('pin-live-avatar')).toHaveTextContent('💃');
  });

  it('updates coordinates/city from Main Roots, falls back to nationality capital when birth city is missing, and persists birth/living/met cities', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <LanguageProvider initialLocale="en">
        <PinEditorDialog
          open
          initialPin={null}
          droppedCoordinate={null}
          nextEntryNumber={4}
          onClose={vi.fn()}
          onSave={onSave}
        />
      </LanguageProvider>,
    );

    await user.type(screen.getByLabelText('Name *'), 'Aiko');

    // Quick search for Japan by ISO code -> chip displays Flag + Name + Continent
    const countrySearch = screen.getByLabelText('Quick Search Country Filter Bar');
    await user.type(countrySearch, 'JP');
    const japanChip = screen.getByTestId('country-chip-JP');
    expect(japanChip).toHaveTextContent('🇯🇵');
    expect(japanChip).toHaveTextContent('Japan');
    expect(japanChip).toHaveTextContent('Asia');
    await user.click(japanChip);

    // Selecting Main Roots (JP) without a birth city falls back to Tokyo coordinates
    expect(screen.getByTestId('pin-resolved-location')).toHaveTextContent('Tokyo');
    expect(screen.getByTestId('pin-resolved-location')).toHaveTextContent('35.6762');

    // Add 2nd heritage root (France)
    await user.click(screen.getByTestId('add-heritage-root-btn'));
    const secondRoot = screen.getByLabelText('2nd Roots');
    await user.selectOptions(secondRoot, 'FR');

    // Fill optional Living & Met cities while leaving Birth City blank
    await user.type(screen.getByLabelText('City Where They Live'), 'London');
    await user.type(screen.getByLabelText('City Where We Met'), 'Paris');

    // Footer shows Save #4 for new entry
    const saveBtn = screen.getByRole('button', { name: 'Save #4' });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const savedPayload = onSave.mock.calls[0]?.[0];
    expect(savedPayload).toMatchObject({
      name: 'Aiko',
      entryNumber: 4,
      nationalityCode: 'JP',
      nationalities: ['JP', 'FR'],
      city: 'Tokyo',
      birthCity: '',
      livingCity: 'London',
      metCity: 'Paris',
    });
    expect(savedPayload.latitude).toBeCloseTo(35.6762, 3);
    expect(savedPayload.longitude).toBeCloseTo(139.6503, 3);
  });

  it('reveals "Which Friend Introduced You?" only when How We Met is Friends and renders localized Intimacy Suite options', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <LanguageProvider initialLocale="en">
        <PinEditorDialog
          open
          initialPin={null}
          droppedCoordinate={null}
          nextEntryNumber={2}
          onClose={vi.fn()}
          onSave={onSave}
        />
      </LanguageProvider>,
    );

    // Hidden initially when Hinge is selected
    expect(screen.queryByLabelText('Which Friend Introduced You?')).not.toBeInTheDocument();

    // Appears when Friends is selected
    const howWeMet = screen.getByLabelText('How We Met');
    await user.selectOptions(howWeMet, 'Friends');
    const friendInput = screen.getByLabelText('Which Friend Introduced You?');
    expect(friendInput).toBeInTheDocument();
    await user.type(friendInput, 'Marco');

    // Switching away hides it again
    await user.selectOptions(howWeMet, 'Tinder');
    expect(screen.queryByLabelText('Which Friend Introduced You?')).not.toBeInTheDocument();

    // Switch back to Friends and submit
    await user.selectOptions(howWeMet, 'Friends');
    await user.type(screen.getByLabelText('Name *'), 'Chiara');
    const intimacySelect = screen.getByLabelText('Intimacy Level');
    expect(within(intimacySelect).getByRole('option', { name: 'Hand Foreplay' })).toBeInTheDocument();
    expect(within(intimacySelect).getByRole('option', { name: 'Oral Foreplay' })).toBeInTheDocument();
    await user.selectOptions(intimacySelect, 'hand_foreplay');

    await user.click(screen.getByRole('button', { name: 'Save #2' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      metChannel: 'Friends',
      introducedByFriend: 'Marco',
      intimacyLevel: 'hand_foreplay',
    });
  });

  it('shows Save Changes when editing and stores/deletes Private Local Media Vault items via IndexedDB with avatar preview', async () => {
    const user = userEvent.setup();
    const existingPin = makeExistingPin();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <LanguageProvider initialLocale="en">
        <PinEditorDialog
          open
          initialPin={existingPin}
          droppedCoordinate={null}
          nextEntryNumber={12}
          onClose={vi.fn()}
          onSave={onSave}
        />
      </LanguageProvider>,
    );

    // Edit mode footer shows "Save Changes" instead of "Save #N"
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save #/ })).not.toBeInTheDocument();

    // Zero-Cloud Privacy Badge is clearly displayed
    expect(screen.getByTestId('zero-cloud-badge')).toHaveTextContent(
      'Stored on Device Only · Zero Cloud Upload',
    );

    // Upload a local image and video file into Section 6 Local Media Vault
    const fileInput = document.getElementById('pin-local-media-input') as HTMLInputElement;
    const imgFile = new File(['fake-image-bytes'], 'sunset.png', { type: 'image/png' });
    const vidFile = new File(['fake-video-bytes'], 'clip.mp4', { type: 'video/mp4' });

    await user.upload(fileInput, [imgFile, vidFile]);

    await waitFor(async () => {
      const stored = await listMediaItemsForPin(existingPin.id);
      expect(stored).toHaveLength(2);
    });

    // First uploaded image acts as live avatar preview in Top Header
    await waitFor(() => {
      const avatarBox = screen.getByTestId('pin-live-avatar');
      expect(avatarBox.querySelector('img')).not.toBeNull();
    });

    // Deleting the uploaded image removes it from IndexedDB and restores emoji avatar fallback
    await user.click(screen.getByRole('button', { name: 'Delete media item sunset.png' }));
    await waitFor(async () => {
      const remaining = await listMediaItemsForPin(existingPin.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.kind).toBe('video');
    });
    expect(screen.getByTestId('pin-live-avatar')).toHaveTextContent('💃');

    // Submit Save Changes -> passes null for cloud blob (zero cloud upload)
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave.mock.calls[0]?.[1]).toBeNull();
  });
});
