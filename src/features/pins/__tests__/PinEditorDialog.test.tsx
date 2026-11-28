/**
 * @module features/pins/__tests__/PinEditorDialog.test
 * Component tests verifying the New Connection (Add / Edit Date) scrollable modal:
 * 1. Exact top-to-bottom section ordering, pronoun adaptation (`her`/`his`/`their`),
 *    and live chronological badge/numbering recalculation when inserting older dates.
 * 2. Section 2 has zero country search bar; Sections 2 and 4 use real-city selectors
 *    populated for the selected country/countries with `Main Roots` -> birth city -> capital fallback.
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

  it('renders sections in exact top-to-bottom order, adapts pronouns, and recalculates chronological #N badge dynamically for older dates', async () => {
    const user = userEvent.setup();
    const existingPins = [
      makeExistingPin({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Camille',
        dateMet: '2026-06-10',
        firstIntimateDate: '',
      }),
      makeExistingPin({
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Elena',
        dateMet: '2026-09-01',
        firstIntimateDate: '2026-09-12',
      }),
    ];

    const { rerender } = render(
      <LanguageProvider initialLocale="en">
        <PinEditorDialog
          open
          initialPin={null}
          droppedCoordinate={null}
          existingPins={existingPins}
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

    // Section 3 and modal chrome follow the pure-black, white, and red theme (no amber/slate accents)
    expect(header.className).toContain('bg-black');
    expect(footer.className).toContain('bg-black');
    const section3Heading = screen.getByRole('heading', { name: /3\. The Encounter/i });
    expect(section3Heading.className).toContain('text-red-500');
    expect(section3Heading.className).not.toContain('text-amber-400');

    // Pronoun adaptation: women -> her, men -> his, everyone -> their
    expect(screen.getByTestId('pin-editor-subtitle')).toHaveTextContent(/\bher\b/i);

    rerender(
      <LanguageProvider initialLocale="en">
        <PinEditorDialog
          open
          initialPin={null}
          droppedCoordinate={null}
          existingPins={existingPins}
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
          existingPins={existingPins}
          datingPreference="everyone"
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('pin-editor-subtitle')).toHaveTextContent(/\btheir\b/i);

    // Chronological badge recalculates dynamically:
    // Entering an earlier past memory (2026-03-05) becomes #1 and updates Save button to Save #1
    const dateMetInput = screen.getByLabelText('Date We Met (First Date) *');
    fireEvent.change(dateMetInput, { target: { value: '2026-03-05' } });
    expect(screen.getByTestId('pin-chronological-badge')).toHaveTextContent('#1 - 05/03/26');
    expect(screen.getByRole('button', { name: 'Save #1' })).toBeInTheDocument();

    // Setting First Intimate Date between Camille (06-10) and Elena (09-12) moves badge to #2
    const firstIntimateInput = screen.getByLabelText('First Intimate Date');
    fireEvent.change(firstIntimateInput, { target: { value: '2026-07-20' } });
    expect(screen.getByTestId('pin-chronological-badge')).toHaveTextContent('#2 - 20/07/26');
    expect(screen.getByRole('button', { name: 'Save #2' })).toBeInTheDocument();

    // Interactive Appearance Emoji Picker updates Live Emoji Avatar Box
    await user.click(screen.getByTestId('appearance-emoji-trigger'));
    const popover = screen.getByTestId('appearance-emoji-popover');
    expect(within(popover).getByTestId('appearance-gender-women')).toBeInTheDocument();
    expect(within(popover).getByTestId('appearance-gender-men')).toBeInTheDocument();
    await user.click(within(popover).getByRole('button', { name: /Latina\/Dancer/i }));
    expect(screen.getByTestId('pin-live-avatar')).toHaveTextContent('💃');
  });

  it('removes Section 2 search bar, populates real cities for Main Roots in Sections 2 & 4, and falls back to nationality capital when birth city is unset', async () => {
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

    // Section 2 must have ZERO search bar input
    const section2 = screen.getByTestId('pin-section-2');
    expect(within(section2).queryByRole('searchbox')).not.toBeInTheDocument();
    expect(within(section2).queryByTestId('country-quick-chips')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Name *'), 'Aiko');

    // Select Main Roots = Japan (JP)
    const mainRoots = screen.getByLabelText(/Main Roots/i);
    await user.selectOptions(mainRoots, 'JP');

    // Birth City selector populates real Japanese cities and defaults to Tokyo capital fallback
    const birthCitySelect = screen.getByLabelText('City Where They Were Born');
    expect(within(birthCitySelect).getByRole('option', { name: 'Tokyo' })).toBeInTheDocument();
    expect(within(birthCitySelect).getByRole('option', { name: 'Kyoto — Kansai' })).toBeInTheDocument();
    expect(screen.getByTestId('pin-resolved-location')).toHaveTextContent('Tokyo');
    expect(screen.getByTestId('pin-resolved-location')).toHaveTextContent('35.6762');

    // Add 2nd heritage root (France)
    await user.click(screen.getByTestId('add-heritage-root-btn'));
    const secondRoot = screen.getByLabelText('2nd Roots');
    await user.selectOptions(secondRoot, 'FR');

    // Select real cities for Living City, Met City, and Section 4 Hookup City
    await user.selectOptions(screen.getByLabelText('City Where They Live'), 'London');
    await user.selectOptions(screen.getByLabelText('City Where We Met'), 'Paris');
    const hookupCitySelect = screen.getByLabelText('Hookup City');
    expect(within(hookupCitySelect).getByRole('option', { name: /Kyoto/ })).toBeInTheDocument();
    await user.selectOptions(hookupCitySelect, 'Paris');

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
      hookupCity: 'Paris',
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

    expect(screen.queryByLabelText('Which Friend Introduced You?')).not.toBeInTheDocument();

    const howWeMet = screen.getByLabelText('How We Met');
    await user.selectOptions(howWeMet, 'Friends');
    const friendInput = screen.getByLabelText('Which Friend Introduced You?');
    expect(friendInput).toBeInTheDocument();
    await user.type(friendInput, 'Marco');

    await user.selectOptions(howWeMet, 'Tinder');
    expect(screen.queryByLabelText('Which Friend Introduced You?')).not.toBeInTheDocument();

    await user.selectOptions(howWeMet, 'Friends');
    await user.type(screen.getByLabelText('Name *'), 'Chiara');
    await user.selectOptions(screen.getByLabelText('City Where They Were Born'), 'Milan');
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
      birthCity: 'Milan',
      city: 'Milan',
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

    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save #/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('zero-cloud-badge')).toHaveTextContent(
      'Stored on Device Only · Zero Cloud Upload',
    );

    const fileInput = document.getElementById('pin-local-media-input') as HTMLInputElement;
    const imgFile = new File(['fake-image-bytes'], 'sunset.png', { type: 'image/png' });
    const vidFile = new File(['fake-video-bytes'], 'clip.mp4', { type: 'video/mp4' });

    await user.upload(fileInput, [imgFile, vidFile]);

    await waitFor(async () => {
      const stored = await listMediaItemsForPin(existingPin.id);
      expect(stored).toHaveLength(2);
    });

    await waitFor(() => {
      const avatarBox = screen.getByTestId('pin-live-avatar');
      expect(avatarBox.querySelector('img')).not.toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Delete media item sunset.png' }));
    await waitFor(async () => {
      const remaining = await listMediaItemsForPin(existingPin.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.kind).toBe('video');
    });
    expect(screen.getByTestId('pin-live-avatar')).toHaveTextContent('💃');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave.mock.calls[0]?.[1]).toBeNull();
  });

  it('supports smaller Italian towns (Olbia, Cannigione) and auto-populates First Intimate Date for Sex + Dates2Bed while permitting manual override', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <LanguageProvider initialLocale="en">
        <PinEditorDialog
          open
          initialPin={null}
          droppedCoordinate={null}
          nextEntryNumber={3}
          onClose={vi.fn()}
          onSave={onSave}
        />
      </LanguageProvider>,
    );

    await user.type(screen.getByLabelText('Name *'), 'Giulia');

    // Main Roots defaults to IT: Olbia & Cannigione appear with Sardinia region and resolve real coordinates
    const birthCitySelect = screen.getByLabelText('City Where They Were Born');
    expect(within(birthCitySelect).getByRole('option', { name: 'Olbia — Sardinia' })).toBeInTheDocument();
    expect(
      within(birthCitySelect).getByRole('option', { name: 'Cannigione — Sardinia' }),
    ).toBeInTheDocument();

    await user.selectOptions(birthCitySelect, 'Cannigione');
    expect(screen.getByTestId('pin-resolved-location')).toHaveTextContent('Cannigione');
    expect(screen.getByTestId('pin-resolved-location')).toHaveTextContent('41.1086');

    await user.selectOptions(screen.getByLabelText('Hookup City'), 'Olbia');

    // Set Date We Met = 2026-08-10 and Dates2Bed = '3' (+2 days)
    const dateMetInput = screen.getByLabelText('Date We Met (First Date) *');
    fireEvent.change(dateMetInput, { target: { value: '2026-08-10' } });
    await user.selectOptions(screen.getByLabelText('Dates2Bed (Dates to Intimacy)'), '3');

    // Selecting Intimacy Level = Sex automatically populates First Intimate Date -> 2026-08-12 and updates badge
    await user.selectOptions(screen.getByLabelText('Intimacy Level'), 'sex');
    const firstIntimateInput = screen.getByLabelText('First Intimate Date') as HTMLInputElement;
    expect(firstIntimateInput.value).toBe('2026-08-12');
    expect(screen.getByTestId('pin-chronological-badge')).toHaveTextContent('#3 - 12/08/26');

    // Manual edit overrides the auto-populated date and is NOT overwritten if dateMet changes afterward
    fireEvent.change(firstIntimateInput, { target: { value: '2026-08-25' } });
    expect(firstIntimateInput.value).toBe('2026-08-25');
    expect(screen.getByTestId('pin-chronological-badge')).toHaveTextContent('#3 - 25/08/26');

    fireEvent.change(dateMetInput, { target: { value: '2026-08-09' } });
    expect(firstIntimateInput.value).toBe('2026-08-25');

    await user.click(screen.getByRole('button', { name: 'Save #3' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      birthCity: 'Cannigione',
      city: 'Cannigione',
      hookupCity: 'Olbia',
      intimacyLevel: 'sex',
      datesToBed: '3',
      firstIntimateDate: '2026-08-25',
    });
  });

  it('uses a tall mobile modal sheet layout with fixed header/footer, scrollable body, and safe light-dismiss', () => {
    const onClose = vi.fn();
    render(
      <LanguageProvider initialLocale="en">
        <PinEditorDialog
          open
          initialPin={null}
          droppedCoordinate={null}
          nextEntryNumber={1}
          onClose={onClose}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />
      </LanguageProvider>,
    );

    const dialog = screen.getByTestId('pin-editor-dialog') as HTMLDialogElement;
    const header = screen.getByTestId('pin-editor-header');
    const scrollBody = screen.getByTestId('pin-editor-scroll-body');
    const footer = screen.getByTestId('pin-editor-footer');

    // Tall responsive mobile sheet + capped desktop sizing
    expect(dialog.className).toContain('h-[90dvh]');
    expect(dialog.className).toContain('max-h-[92dvh]');
    expect(dialog.className).toContain('w-[calc(100vw-1rem)]');
    expect(dialog.className).toContain('max-w-2xl');
    expect(dialog.className).toContain('sm:h-auto');
    expect(dialog.className).toContain('sm:max-h-[88dvh]');
    expect(dialog.className).toContain('overflow-hidden');

    // Fixed header/footer + scrollable overscroll-contained body
    expect(header.className).toContain('shrink-0');
    expect(footer.className).toContain('shrink-0');
    expect(scrollBody.className).toContain('flex-1');
    expect(scrollBody.className).toContain('min-h-0');
    expect(scrollBody.className).toContain('overflow-y-auto');
    expect(scrollBody.className).toContain('overscroll-contain');
    expect(scrollBody.className).toContain('pb-6');

    // Dragging starting inside a form input and releasing outside must NOT dismiss the dialog
    const nameInput = screen.getByLabelText('Name *');
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 40,
      right: 380,
      bottom: 800,
      width: 370,
      height: 760,
      x: 10,
      y: 40,
      toJSON: () => ({}),
    });
    const closeSpy = vi.fn();
    dialog.close = closeSpy;

    fireEvent(
      nameInput,
      new MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 120 }),
    );
    fireEvent(
      dialog,
      new MouseEvent('pointerup', { bubbles: true, clientX: 2, clientY: 10 }),
    );
    expect(closeSpy).not.toHaveBeenCalled();
  });
});
