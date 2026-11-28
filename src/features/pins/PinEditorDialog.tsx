/**
 * @module features/pins/PinEditorDialog
 * Accessible scrollable native `<dialog>` for creating or editing a Datédex connection
 * rendered in exact top-to-bottom order:
 * Top Header & Live Preview Strip -> Section 1 (Identity & Appearance) ->
 * Section 2 (Multi-Nationalities & Cities) -> Section 3 (The Encounter & Overall Vote) ->
 * Section 4 (Intimacy Suite) -> Section 5 (Story, Highlights, Vibe & Theme) ->
 * Section 6 (Private Local Media Vault) -> Footer Action Bar.
 */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  Calendar,
  Camera,
  ChevronDown,
  Flame,
  Globe2,
  Heart,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { previewChronologicalEntryNumber } from '../../domain/analytics/chronology';
import { COUNTRIES, COUNTRY_BY_CODE } from '../../domain/countries/countries';
import { resolvePinLocation } from '../../domain/countries/locationResolver';
import type { MapCoordinate } from '../../domain/map/types';
import {
  CANONICAL_INTIMACY_LEVELS,
  CANONICAL_MET_CHANNELS,
  PinInputSchema,
  RelationshipStatusSchema,
  SpentCurrencySchema,
  formatChronologicalBadge,
  generalVoteToFiveScale,
  normalizeIntimacyLevelForEditor,
  type CanonicalIntimacyLevel,
  type DatesToBedOption,
  type DecryptedPin,
  type MetChannel,
  type PinInput,
  type RelationshipStatus,
  type SpentCurrency,
} from '../../domain/models/pin';
import {
  getDatingPreferencePronouns,
  type DatingPreference,
} from '../../domain/models/profile';
import { useTranslation } from '../../platform/i18n/LanguageContext';
import type { TranslationKey } from '../../platform/i18n/translations';
import type { LocalMediaRecord } from '../../platform/indexeddb/db';
import {
  deleteMediaItem,
  deleteMediaItemsForPin,
  listMediaItemsForPin,
  saveMediaItem,
} from '../../platform/indexeddb/mediaVault';
import { useNativeModalDialog } from '../../platform/ui/dialogUtils';
import {
  HAIR_LOOK_PRESETS,
  HEIGHT_OPTIONS,
  HOOKUP_LOCATION_PRESETS,
  INTIMATE_TAG_PRESETS,
  PERSONALITY_VIBE_TAGS,
  VIBE_AESTHETIC_PRESETS,
  type AppearanceGenderMode,
} from './appearancePresets';
import { RealCitySelector } from './RealCitySelector';

const STATUS_KEYS: Record<RelationshipStatus, TranslationKey> = {
  talking: 'status.talking',
  first_date: 'status.first_date',
  dating: 'status.dating',
  situationship: 'status.situationship',
  exclusive: 'status.exclusive',
  standby_ghosted: 'status.standby_ghosted',
  standby_ghosting: 'status.standby_ghosting',
  friends: 'status.friends',
  archived: 'status.archived',
};

const INTIMACY_KEYS: Record<CanonicalIntimacyLevel, TranslationKey> = {
  none: 'intimacy.none',
  kiss: 'intimacy.kiss',
  passionate_kiss: 'intimacy.passionate_kiss',
  hand_foreplay: 'intimacy.hand_foreplay',
  oral_foreplay: 'intimacy.oral_foreplay',
  sex: 'intimacy.sex',
};

const CURRENCY_LABELS: Record<SpentCurrency, string> = {
  EUR: '€ EUR',
  USD: '$ USD',
  GBP: '£ GBP',
};

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getOrdinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

/**
 * Props for `PinEditorDialog`.
 */
export interface PinEditorDialogProps {
  open: boolean;
  initialPin: DecryptedPin | null;
  droppedCoordinate: MapCoordinate | null;
  /** All currently saved connections used to dynamically calculate chronological `#N` position. */
  existingPins?: readonly DecryptedPin[];
  /** Fallback sequential entry number when `existingPins` is not supplied. */
  nextEntryNumber?: number;
  /** User's dating preference driving dynamic pronouns (`her` / `his` / `their`). */
  datingPreference?: DatingPreference;
  onClose: () => void;
  onSave: (
    input: PinInput,
    processedBlob?: { blob: Blob; mimeType: 'image/webp' | 'image/jpeg' } | null,
  ) => Promise<void>;
  onDelete?: (pinId: string) => Promise<void>;
}

/**
 * Native modal dialog for creating or editing a Datédex connection in exact section order.
 * @param {PinEditorDialogProps} props - Dialog state, dating preference, and CRUD callbacks.
 * @returns {React.JSX.Element} Scrollable connection editor modal dialog.
 */
export function PinEditorDialog({
  open,
  initialPin,
  droppedCoordinate,
  existingPins,
  nextEntryNumber = 1,
  datingPreference = 'everyone',
  onClose,
  onSave,
  onDelete,
}: PinEditorDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emojiPanelId = useId();
  const savedRef = useRef(false);
  const draftPinIdRef = useRef<string>('');

  const handleDialogClose = (): void => {
    // Clean up unsaved local media uploads if user dismissed a brand-new connection
    if (!initialPin && !savedRef.current && draftPinIdRef.current) {
      void deleteMediaItemsForPin(draftPinIdRef.current).catch(() => {});
    }
    setEmojiPickerOpen(false);
    onClose();
  };

  useNativeModalDialog(dialogRef, open, handleDialogClose, true);

  // Header & Identity (Section 1)
  const [avatarEmoji, setAvatarEmoji] = useState('👩');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [appearanceGender, setAppearanceGender] = useState<AppearanceGenderMode>(
    datingPreference === 'men' ? 'men' : 'women',
  );
  const [customEmojiInput, setCustomEmojiInput] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [birthYearOrDob, setBirthYearOrDob] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [personalityTags, setPersonalityTags] = useState<string[]>([]);
  const [customTrait, setCustomTrait] = useState('');
  const [characterVote, setCharacterVote] = useState(7);
  const [mindVote, setMindVote] = useState(7);
  const [aestheticVote, setAestheticVote] = useState(7);

  // Multi-Nationalities & Cities (Section 2)
  const [nationalities, setNationalities] = useState<string[]>(['IT']);
  const [birthCity, setBirthCity] = useState('');
  const [livingCity, setLivingCity] = useState('');
  const [metCity, setMetCity] = useState('');

  // The Encounter & Overall Vote (Section 3)
  const [dateMet, setDateMet] = useState(getTodayIsoDate);
  const [metChannel, setMetChannel] = useState<MetChannel>('Hinge');
  const [introducedByFriend, setIntroducedByFriend] = useState('');
  const [spentCurrency, setSpentCurrency] = useState<SpentCurrency>('EUR');
  const [spentAmount, setSpentAmount] = useState('');
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus>('first_date');

  // Intimacy Suite (Section 4)
  const [intimacyLevel, setIntimacyLevel] = useState<CanonicalIntimacyLevel>('none');
  const [datesToBed, setDatesToBed] = useState<DatesToBedOption | ''>('');
  const [firstIntimateDate, setFirstIntimateDate] = useState('');
  const [hookupCity, setHookupCity] = useState('');
  const [bedVote, setBedVote] = useState(7);
  const [hookupLocations, setHookupLocations] = useState<string[]>([]);
  const [customLocation, setCustomLocation] = useState('');
  const [intimateTags, setIntimateTags] = useState<string[]>([]);
  const [customIntimateTag, setCustomIntimateTag] = useState('');

  // Story, Highlights, Vibe & Theme (Section 5)
  const [notes, setNotes] = useState('');
  const [highlights, setHighlights] = useState('');
  const [generalVote, setGeneralVote] = useState(8);

  // Private Local Media Vault (Section 6)
  const [mediaItems, setMediaItems] = useState<LocalMediaRecord[]>([]);
  const [legacyPhotoDataUrl, setLegacyPhotoDataUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Preserved Vault fields + form feedback
  const [vaultLocked, setVaultLocked] = useState(false);
  const [vaultAlias, setVaultAlias] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Hydrate modal fields when opened or switching between new/edit targets
  useEffect(() => {
    if (!open) return;
    let active = true;
    savedRef.current = false;
    setErrorMsg(null);
    setMediaError(null);
    setEmojiPickerOpen(false);
    setCustomTrait('');
    setCustomLocation('');
    setCustomIntimateTag('');
    setCustomEmojiInput('');

    if (initialPin) {
      draftPinIdRef.current = initialPin.id;
      const roots =
        initialPin.nationalities && initialPin.nationalities.length > 0
          ? initialPin.nationalities
          : [initialPin.nationalityCode];

      setAvatarEmoji(initialPin.avatarEmoji || (datingPreference === 'men' ? '👨' : '👩'));
      setAppearanceGender(datingPreference === 'men' ? 'men' : 'women');
      setName(initialPin.name);
      setAge(initialPin.age !== null ? String(initialPin.age) : '');
      setBirthYearOrDob(initialPin.birthYearOrDob ?? '');
      setHeightCm(initialPin.heightCm ?? '');
      setInstagramHandle(initialPin.instagramHandle ?? '');
      setPersonalityTags(initialPin.personalityTags ?? []);
      setCharacterVote(initialPin.characterVote ?? 7);
      setMindVote(initialPin.mindVote ?? 7);
      setAestheticVote(initialPin.aestheticVote ?? 7);

      setNationalities(roots);
      setBirthCity(initialPin.birthCity ?? '');
      setLivingCity(initialPin.livingCity ?? '');
      setMetCity(initialPin.metCity ?? '');

      setDateMet(initialPin.dateMet);
      setMetChannel(initialPin.metChannel);
      setIntroducedByFriend(initialPin.introducedByFriend ?? '');
      setSpentCurrency(initialPin.spentCurrency ?? 'EUR');
      setSpentAmount(
        initialPin.spentAmount !== undefined && initialPin.spentAmount !== null
          ? String(initialPin.spentAmount)
          : '',
      );
      setRelationshipStatus(initialPin.relationshipStatus);

      setIntimacyLevel(normalizeIntimacyLevelForEditor(initialPin.intimacyLevel));
      setDatesToBed(initialPin.datesToBed ?? '');
      setFirstIntimateDate(initialPin.firstIntimateDate ?? '');
      setHookupCity(initialPin.hookupCity ?? '');
      setBedVote(initialPin.bedVote ?? 7);
      setHookupLocations(initialPin.hookupLocations ?? []);
      setIntimateTags(initialPin.intimateTags ?? []);

      setNotes(initialPin.notes);
      setHighlights(initialPin.highlights ?? '');
      setGeneralVote(initialPin.generalVote ?? Math.round(initialPin.rating * 2));

      setVaultLocked(initialPin.vaultLocked);
      setVaultAlias(initialPin.vaultAlias);
      setLegacyPhotoDataUrl(initialPin.photoDataUrl);
      setMediaItems([]);

      void listMediaItemsForPin(initialPin.id)
        .then((items) => {
          if (active) setMediaItems(items);
        })
        .catch(() => {});

      return () => {
        active = false;
      };
    }

    // Fresh New Connection state
    draftPinIdRef.current = globalThis.crypto.randomUUID();
    const defaultGender: AppearanceGenderMode = datingPreference === 'men' ? 'men' : 'women';
    setAppearanceGender(defaultGender);
    setAvatarEmoji(defaultGender === 'men' ? '👨' : '👩');
    setName('');
    setAge('');
    setBirthYearOrDob('');
    setHeightCm('');
    setInstagramHandle('');
    setPersonalityTags([]);
    setCharacterVote(7);
    setMindVote(7);
    setAestheticVote(7);

    setNationalities(['IT']);
    setBirthCity('');
    setLivingCity('');
    setMetCity('');

    setDateMet(getTodayIsoDate());
    setMetChannel('Hinge');
    setIntroducedByFriend('');
    setSpentCurrency('EUR');
    setSpentAmount('');
    setRelationshipStatus('first_date');

    setIntimacyLevel('none');
    setDatesToBed('');
    setFirstIntimateDate('');
    setHookupCity('');
    setBedVote(7);
    setHookupLocations([]);
    setIntimateTags([]);

    setNotes('');
    setHighlights('');
    setGeneralVote(8);

    setVaultLocked(false);
    setVaultAlias('');
    setLegacyPhotoDataUrl(null);
    setMediaItems([]);

    return () => {
      active = false;
    };
  }, [open, initialPin, datingPreference]);

  // Dismiss emoji picker popover on outside pointerdown or Escape key
  useEffect(() => {
    if (!emojiPickerOpen) return;
    const handlePointerDown = (event: PointerEvent): void => {
      if (
        emojiPickerRef.current &&
        event.target instanceof Node &&
        !emojiPickerRef.current.contains(event.target)
      ) {
        setEmojiPickerOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [emojiPickerOpen]);

  const pronouns = useMemo(
    () => getDatingPreferencePronouns(datingPreference),
    [datingPreference],
  );

  const effectiveEntryNumber = useMemo(() => {
    if (existingPins && existingPins.length > 0) {
      return previewChronologicalEntryNumber(existingPins, {
        id: initialPin?.id,
        dateMet,
        firstIntimateDate,
        name,
        createdAt: initialPin?.createdAt,
      });
    }
    return initialPin?.entryNumber ?? nextEntryNumber;
  }, [existingPins, initialPin, dateMet, firstIntimateDate, name, nextEntryNumber]);

  const chronologicalBadge = useMemo(
    () => formatChronologicalBadge(effectiveEntryNumber, firstIntimateDate, dateMet),
    [effectiveEntryNumber, firstIntimateDate, dateMet],
  );

  // First uploaded image thumbnail from Local Media Vault acts as live avatar preview
  const firstImageThumbnail = useMemo(() => {
    const firstImg = mediaItems.find((item) => item.kind === 'image');
    return firstImg?.dataUrl ?? legacyPhotoDataUrl;
  }, [mediaItems, legacyPhotoDataUrl]);

  // Pin coordinate & default city resolution hierarchy: birthCity -> Main Roots capital -> secondary roots
  const resolvedLocation = useMemo(
    () =>
      resolvePinLocation({
        birthCity,
        nationalities,
        fallbackCoordinate: droppedCoordinate,
      }),
    [birthCity, nationalities, droppedCoordinate],
  );

  const primaryCapitalName = useMemo(() => {
    const primaryCode = nationalities[0] ?? '';
    return COUNTRY_BY_CODE.get(primaryCode)?.capital ?? resolvedLocation.capitalCity ?? 'Capital';
  }, [nationalities, resolvedLocation.capitalCity]);

  const availableChannels = useMemo<MetChannel[]>(() => {
    const base: MetChannel[] = [...CANONICAL_MET_CHANNELS];
    if (!base.includes(metChannel)) {
      base.push(metChannel);
    }
    return base;
  }, [metChannel]);

  const setRootAtIndex = (index: number, countryCode: string): void => {
    setNationalities((prev) => {
      const next = [...prev];
      next[index] = countryCode;
      return next;
    });
  };

  const handleAddRoot = (): void => {
    const used = new Set(nationalities);
    const nextFallback = COUNTRIES.find((c) => !used.has(c.code))?.code ?? 'FR';
    setNationalities((prev) => [...prev, nextFallback]);
  };

  const handleRemoveRoot = (index: number): void => {
    if (index === 0) return;
    setNationalities((prev) => prev.filter((_, idx) => idx !== index));
  };

  const toggleListValue = (
    list: string[],
    setter: (next: string[]) => void,
    value: string,
  ): void => {
    if (list.includes(value)) {
      setter(list.filter((item) => item !== value));
    } else {
      setter([...list, value]);
    }
  };

  const addCustomChip = (
    raw: string,
    clearInput: () => void,
    list: string[],
    setter: (next: string[]) => void,
  ): void => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    if (!list.some((item) => item.toLowerCase() === cleaned.toLowerCase())) {
      setter([...list, cleaned]);
    }
    clearInput();
  };

  const handleChipInputKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    raw: string,
    clearInput: () => void,
    list: string[],
    setter: (next: string[]) => void,
  ): void => {
    // Respect IME composition before treating Enter as add-tag action
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      addCustomChip(raw, clearInput, list, setter);
    }
  };

  const handleMediaUpload = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setMediaError(null);
    const targetPinId = draftPinIdRef.current || globalThis.crypto.randomUUID();
    draftPinIdRef.current = targetPinId;

    try {
      const created: LocalMediaRecord[] = [];
      for (const file of files) {
        const record = await saveMediaItem({ pinId: targetPinId, file });
        created.push(record);
      }
      setMediaItems((prev) => [...prev, ...created]);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : t('pinEditor.mediaError'));
    } finally {
      event.target.value = '';
    }
  };

  const handleDeleteMediaItem = async (mediaId: string): Promise<void> => {
    setMediaError(null);
    try {
      await deleteMediaItem(mediaId);
      setMediaItems((prev) => prev.filter((item) => item.id !== mediaId));
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : t('pinEditor.mediaError'));
    }
  };

  const getRootSlotLabel = (index: number): string => {
    if (index === 0) return t('pinEditor.mainRootsLabel');
    if (index === 1) return t('pinEditor.secondRootsLabel');
    if (index === 2) return t('pinEditor.thirdRootsLabel');
    return t('pinEditor.nthRootsLabel', { ordinal: getOrdinalSuffix(index + 1) });
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setErrorMsg(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg(t('pinEditor.nameError'));
      nameInputRef.current?.focus();
      return;
    }

    const parsedSpent =
      spentAmount.trim() === '' ? null : Number(spentAmount);

    const dedupedRoots = Array.from(
      new Set(
        nationalities
          .map((code) => code.trim().toUpperCase())
          .filter((code) => COUNTRY_BY_CODE.has(code)),
      ),
    );
    const primaryCode = dedupedRoots[0] ?? resolvedLocation.nationalityCode;
    const finalRoots = dedupedRoots.length > 0 ? dedupedRoots : [primaryCode];

    const parsed = PinInputSchema.safeParse({
      id: draftPinIdRef.current || initialPin?.id,
      entryNumber: effectiveEntryNumber,
      avatarEmoji: avatarEmoji.trim() || '👩',
      name: trimmedName,
      age: age.trim() ? Number(age) : null,
      birthYearOrDob: birthYearOrDob.trim(),
      heightCm,
      instagramHandle: instagramHandle.trim(),
      personalityTags,
      characterVote,
      mindVote,
      aestheticVote,
      nationalityCode: primaryCode,
      nationalities: finalRoots,
      city: resolvedLocation.city,
      birthCity: birthCity.trim(),
      livingCity: livingCity.trim(),
      metCity: metCity.trim(),
      latitude: resolvedLocation.latitude,
      longitude: resolvedLocation.longitude,
      rating: generalVoteToFiveScale(generalVote),
      relationshipStatus,
      intimacyLevel,
      metChannel,
      introducedByFriend: metChannel === 'Friends' ? introducedByFriend.trim() : '',
      spentCurrency,
      spentAmount: parsedSpent !== null && Number.isFinite(parsedSpent) ? parsedSpent : null,
      datesToBed: datesToBed === '' ? null : datesToBed,
      firstIntimateDate: firstIntimateDate.trim(),
      hookupCity: hookupCity.trim(),
      bedVote,
      hookupLocations,
      intimateTags,
      dateMet,
      notes,
      highlights,
      generalVote,
      vaultLocked,
      vaultAlias,
      mediaItemIds: mediaItems.map((item) => item.id),
      photoDataUrl: firstImageThumbnail,
      photoStoragePath: initialPin?.photoStoragePath ?? null,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues.map((i) => i.message).join(' • '));
      return;
    }

    setSaving(true);
    try {
      // Pass null for cloud processedBlob: Section 6 Local Media Vault is strictly device-only
      await onSave(parsed.data, null);
      savedRef.current = true;
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('pinEditor.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const allPersonalityTags = useMemo(
    () => Array.from(new Set([...PERSONALITY_VIBE_TAGS, ...personalityTags])),
    [personalityTags],
  );
  const allIntimateTags = useMemo(
    () => Array.from(new Set([...INTIMATE_TAG_PRESETS, ...intimateTags])),
    [intimateTags],
  );
  const customHookupLocations = useMemo(
    () =>
      hookupLocations.filter(
        (loc) => !HOOKUP_LOCATION_PRESETS.some((preset) => preset.label === loc),
      ),
    [hookupLocations],
  );

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="pin-editor-title"
      className="dd-dialog"
    >
      {open && (
        <>
          {/* Top Header & Live Preview Strip */}
      <header
        data-testid="pin-editor-header"
        className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#141927] px-5 py-4"
      >
        <div className="flex min-w-0 items-center gap-3">
          {/* 1. Live Emoji Avatar Box (first uploaded image thumbnail or selected emoji fallback) */}
          <div
            data-testid="pin-live-avatar"
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-slate-900/90 text-2xl shadow-inner"
          >
            {firstImageThumbnail ? (
              <img
                src={firstImageThumbnail}
                alt={name.trim() || t('pinEditor.newTitle')}
                className="h-full w-full object-cover"
              />
            ) : (
              <span aria-hidden="true">{avatarEmoji}</span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* 2. Chronological Number Badge */}
              <span
                data-testid="pin-chronological-badge"
                className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-400/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-amber-300"
              >
                {chronologicalBadge}
              </span>
              {/* 3. Dynamic Title */}
              <h1 id="pin-editor-title" className="truncate text-base font-bold text-white">
                {initialPin
                  ? t('pinEditor.editTitle', { name: initialPin.name })
                  : t('pinEditor.newTitle')}
              </h1>
            </div>
            {/* 3. Dynamic Subtitle adapting her / his / their pronouns */}
            <p data-testid="pin-editor-subtitle" className="mt-0.5 text-xs text-slate-400">
              {initialPin
                ? t('pinEditor.subtitleEdit', { pronoun: pronouns.possessive })
                : t('pinEditor.subtitleNew', { pronoun: pronouns.possessive })}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={t('pinEditor.closeAria')}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          data-testid="pin-editor-scroll-body"
          className="flex-1 space-y-6 overflow-y-auto px-5 py-4"
        >
          {/* ==============================================================
              SECTION 1: Identity & Appearance
             ============================================================== */}
          <section
            data-testid="pin-section-1"
            aria-labelledby="pin-section-1-title"
            className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/45 p-4"
          >
            <h2
              id="pin-section-1-title"
              className="flex items-center gap-2 text-xs font-bold tracking-wider text-rose-300 uppercase"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t('pinEditor.section1Title')}
            </h2>

            {/* Interactive Appearance Emoji Picker next to Name Input (Required) */}
            <div className="flex items-start gap-2.5">
              <div ref={emojiPickerRef} className="relative shrink-0 pt-5">
                <button
                  type="button"
                  data-testid="appearance-emoji-trigger"
                  aria-label={t('pinEditor.emojiPickerAria')}
                  aria-expanded={emojiPickerOpen}
                  aria-controls={emojiPanelId}
                  onClick={() => setEmojiPickerOpen((prev) => !prev)}
                  className="inline-flex h-[46px] items-center gap-1 rounded-xl border border-white/15 bg-slate-900 px-3 text-xl transition hover:border-rose-400/50 hover:bg-slate-800"
                >
                  <span>{avatarEmoji}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                </button>

                {emojiPickerOpen && (
                  <div
                    id={emojiPanelId}
                    data-testid="appearance-emoji-popover"
                    className="dd-popover-panel absolute top-full left-0 z-50 mt-2 w-[min(86vw,380px)] space-y-3 rounded-2xl border border-white/15 bg-[#121725] p-3.5 shadow-2xl shadow-black/80"
                  >
                    {/* Gender Toggle: Women 👩 / Men 👨 */}
                    <div
                      role="group"
                      aria-label="Appearance gender preset mode"
                      className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-900/80 p-1"
                    >
                      <button
                        type="button"
                        data-testid="appearance-gender-women"
                        aria-pressed={appearanceGender === 'women'}
                        onClick={() => setAppearanceGender('women')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          appearanceGender === 'women'
                            ? 'bg-rose-500/25 text-rose-200 ring-1 ring-rose-400/40'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        👩 {t('pinEditor.genderWomen')}
                      </button>
                      <button
                        type="button"
                        data-testid="appearance-gender-men"
                        aria-pressed={appearanceGender === 'men'}
                        onClick={() => setAppearanceGender('men')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          appearanceGender === 'men'
                            ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/40'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        👨 {t('pinEditor.genderMen')}
                      </button>
                    </div>

                    {/* Hair Color & Look Grid */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                        {t('pinEditor.hairLookHeading')}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {HAIR_LOOK_PRESETS[appearanceGender].map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setAvatarEmoji(preset.emoji);
                              setEmojiPickerOpen(false);
                            }}
                            className={`flex flex-col items-start rounded-xl border p-2 text-left transition ${
                              avatarEmoji === preset.emoji
                                ? 'border-rose-400/60 bg-rose-500/15'
                                : 'border-white/10 bg-slate-900/70 hover:border-white/25'
                            }`}
                          >
                            <span className="text-lg leading-none">{preset.emoji}</span>
                            <span className="mt-1 text-[11px] font-semibold text-white">
                              {preset.label}
                            </span>
                            <span className="line-clamp-1 text-[10px] text-slate-400">
                              {preset.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Vibe & Aesthetic Grid */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                        {t('pinEditor.vibeAestheticHeading')}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {VIBE_AESTHETIC_PRESETS[appearanceGender].map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setAvatarEmoji(preset.emoji);
                              setEmojiPickerOpen(false);
                            }}
                            className={`flex flex-col items-start rounded-xl border p-2 text-left transition ${
                              avatarEmoji === preset.emoji
                                ? 'border-amber-400/60 bg-amber-500/15'
                                : 'border-white/10 bg-slate-900/70 hover:border-white/25'
                            }`}
                          >
                            <span className="text-lg leading-none">{preset.emoji}</span>
                            <span className="mt-1 text-[11px] font-semibold text-white">
                              {preset.label}
                            </span>
                            <span className="line-clamp-1 text-[10px] text-slate-400">
                              {preset.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Emoji Input */}
                    <div className="space-y-1 border-t border-white/10 pt-2.5">
                      <label
                        htmlFor="pin-custom-emoji"
                        className="block text-[11px] font-medium text-slate-300"
                      >
                        {t('pinEditor.customEmojiLabel')}
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          id="pin-custom-emoji"
                          name="customEmoji"
                          type="text"
                          maxLength={12}
                          value={customEmojiInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomEmojiInput(val);
                            if (val.trim()) {
                              setAvatarEmoji(val.trim());
                            }
                          }}
                          placeholder={t('pinEditor.customEmojiPlaceholder')}
                          className="dd-input py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setEmojiPickerOpen(false)}
                          className="shrink-0 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15"
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <label
                  htmlFor="pin-name"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  {t('pinEditor.nameLabel')}
                </label>
                <input
                  ref={nameInputRef}
                  id="pin-name"
                  name="name"
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sofia"
                  className="dd-input"
                  autoFocus
                />
                <span className="dd-error-msg">{t('pinEditor.nameError')}</span>
              </div>
            </div>

            {/* Age (18-99), Birth Year / DOB */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="pin-age"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  {t('pinEditor.ageLabel')}
                </label>
                <input
                  id="pin-age"
                  name="age"
                  type="number"
                  inputMode="numeric"
                  min={18}
                  max={99}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="26"
                  className="dd-input"
                />
                <span className="dd-error-msg">{t('pinEditor.ageError')}</span>
              </div>

              <div>
                <label
                  htmlFor="pin-birth-dob"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  {t('pinEditor.birthYearDobLabel')}
                </label>
                <input
                  id="pin-birth-dob"
                  name="birthYearOrDob"
                  type="text"
                  maxLength={32}
                  value={birthYearOrDob}
                  onChange={(e) => setBirthYearOrDob(e.target.value)}
                  placeholder={t('pinEditor.birthYearDobPlaceholder')}
                  className="dd-input"
                />
              </div>
            </div>

            {/* Height Selector & Instagram Handle */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="pin-height"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  {t('pinEditor.heightLabel')}
                </label>
                <select
                  id="pin-height"
                  name="heightCm"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="dd-input text-xs"
                >
                  <option value="">{t('pinEditor.heightSelectPlaceholder')}</option>
                  {HEIGHT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="pin-instagram"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  {t('pinEditor.instagramLabel')}
                </label>
                <input
                  id="pin-instagram"
                  name="instagramHandle"
                  type="text"
                  maxLength={64}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={instagramHandle}
                  onChange={(e) => setInstagramHandle(e.target.value)}
                  placeholder={t('pinEditor.instagramPlaceholder')}
                  className="dd-input"
                />
              </div>
            </div>

            {/* Personality & Vibe Tags + custom trait input */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">
                {t('pinEditor.personalityTagsLabel')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {allPersonalityTags.map((tag) => {
                  const selected = personalityTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleListValue(personalityTags, setPersonalityTags, tag)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                        selected
                          ? 'border-amber-400/60 bg-amber-400/20 text-amber-200'
                          : 'border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="customTrait"
                  aria-label={t('pinEditor.customTraitPlaceholder')}
                  value={customTrait}
                  onChange={(e) => setCustomTrait(e.target.value)}
                  onKeyDown={(e) =>
                    handleChipInputKeyDown(
                      e,
                      customTrait,
                      () => setCustomTrait(''),
                      personalityTags,
                      setPersonalityTags,
                    )
                  }
                  placeholder={t('pinEditor.customTraitPlaceholder')}
                  className="dd-input flex-1 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    addCustomChip(
                      customTrait,
                      () => setCustomTrait(''),
                      personalityTags,
                      setPersonalityTags,
                    )
                  }
                  className="shrink-0 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15"
                >
                  {t('pinEditor.addTagBtn')}
                </button>
              </div>
            </div>

            {/* Character, Mind, Aesthetic Attractiveness Vote Sliders (Amber 0-10) */}
            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="pin-character-vote" className="font-medium text-slate-300">
                    {t('pinEditor.characterVoteLabel')}
                  </label>
                  <span className="font-mono font-bold text-amber-400">
                    {characterVote} / 10
                  </span>
                </div>
                <input
                  id="pin-character-vote"
                  name="characterVote"
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={characterVote}
                  onChange={(e) => setCharacterVote(Number(e.target.value))}
                  className="dd-range-amber w-full"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="pin-mind-vote" className="font-medium text-slate-300">
                    {t('pinEditor.mindVoteLabel')}
                  </label>
                  <span className="font-mono font-bold text-amber-400">{mindVote} / 10</span>
                </div>
                <input
                  id="pin-mind-vote"
                  name="mindVote"
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={mindVote}
                  onChange={(e) => setMindVote(Number(e.target.value))}
                  className="dd-range-amber w-full"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="pin-aesthetic-vote" className="font-medium text-slate-300">
                    {t('pinEditor.aestheticVoteLabel')}
                  </label>
                  <span className="font-mono font-bold text-amber-400">
                    {aestheticVote} / 10
                  </span>
                </div>
                <input
                  id="pin-aesthetic-vote"
                  name="aestheticVote"
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={aestheticVote}
                  onChange={(e) => setAestheticVote(Number(e.target.value))}
                  className="dd-range-amber w-full"
                />
              </div>
            </div>
          </section>

          {/* ==============================================================
              SECTION 2: Multi-Nationalities & Cities
             ============================================================== */}
          <section
            data-testid="pin-section-2"
            aria-labelledby="pin-section-2-title"
            className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/45 p-4"
          >
            <h2
              id="pin-section-2-title"
              className="flex items-center gap-2 text-xs font-bold tracking-wider text-sky-300 uppercase"
            >
              <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('pinEditor.section2Title')}
            </h2>

            {/* Multi-Nationality Stack (Main Roots, 2nd Roots, 3rd Roots, ...) */}
            <div className="space-y-2.5" data-testid="multi-nationality-stack">
              {nationalities.map((code, idx) => (
                <div key={`root-slot-${idx}`} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label
                      htmlFor={`pin-root-${idx}`}
                      className="mb-1 flex items-center justify-between text-xs font-medium text-slate-300"
                    >
                      <span>{getRootSlotLabel(idx)}</span>
                      {idx === 0 && (
                        <span className="text-[10px] text-sky-300">
                          {COUNTRY_BY_CODE.get(code)?.capital ?? ''}
                        </span>
                      )}
                    </label>
                    <select
                      id={`pin-root-${idx}`}
                      name={`nationalityRoot_${idx}`}
                      value={code}
                      onChange={(e) => setRootAtIndex(idx, e.target.value)}
                      className="dd-input text-xs"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.name} ({c.continent})
                        </option>
                      ))}
                    </select>
                  </div>
                  {idx > 0 && (
                    <button
                      type="button"
                      aria-label={t('pinEditor.removeRootAria')}
                      onClick={() => handleRemoveRoot(idx)}
                      className="mb-0.5 rounded-xl border border-rose-500/30 p-2.5 text-rose-300 hover:bg-rose-500/15"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                data-testid="add-heritage-root-btn"
                onClick={handleAddRoot}
                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/20"
              >
                {t('pinEditor.addRootBtn')}
              </button>
            </div>

            {/* City Where They Were Born (Real-City Selector + Capital Fallback) */}
            <RealCitySelector
              id="pin-birth-city"
              name="birthCity"
              label={t('pinEditor.birthCityLabel')}
              value={birthCity}
              onChange={setBirthCity}
              countryCodes={nationalities}
              allowAllCountries
              emptyOptionLabel={t('citySelector.capitalFallback', {
                capital: primaryCapitalName,
              })}
              testId="birth-city-selector"
            />

            {/* City Where They Live & City Where We Met (Real-City Selectors) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RealCitySelector
                id="pin-living-city"
                name="livingCity"
                label={t('pinEditor.livingCityLabel')}
                value={livingCity}
                onChange={setLivingCity}
                countryCodes={nationalities}
                allowAllCountries
                emptyOptionLabel={t('citySelector.noneSelected')}
                testId="living-city-selector"
              />

              <RealCitySelector
                id="pin-met-city"
                name="metCity"
                label={t('pinEditor.metCityLabel')}
                value={metCity}
                onChange={setMetCity}
                countryCodes={nationalities}
                allowAllCountries
                emptyOptionLabel={t('citySelector.noneSelected')}
                testId="met-city-selector"
              />
            </div>

            {/* Resolved Pin Coordinate Preview */}
            <div
              data-testid="pin-resolved-location"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-300"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
              <span>
                {resolvedLocation.source === 'birth_city'
                  ? t('pinEditor.pinResolvedBirthCity', {
                      city: resolvedLocation.city,
                      lat: resolvedLocation.latitude.toFixed(4),
                      lng: resolvedLocation.longitude.toFixed(4),
                    })
                  : t('pinEditor.pinResolvedCapital', {
                      city: resolvedLocation.city,
                      lat: resolvedLocation.latitude.toFixed(4),
                      lng: resolvedLocation.longitude.toFixed(4),
                    })}
              </span>
            </div>
          </section>

          {/* ==============================================================
              SECTION 3: The Encounter & Overall Vote (text-amber-400 styling)
             ============================================================== */}
          <section
            data-testid="pin-section-3"
            aria-labelledby="pin-section-3-title"
            className="space-y-4 rounded-2xl border border-amber-400/25 bg-amber-500/5 p-4"
          >
            <h2
              id="pin-section-3-title"
              className="flex items-center gap-2 text-xs font-bold tracking-wider text-amber-400 uppercase"
            >
              <Calendar className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              {t('pinEditor.section3Title')}
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="pin-date-met"
                  className="mb-1 block text-xs font-medium text-amber-400"
                >
                  {t('pinEditor.dateMetLabel')}
                </label>
                <input
                  id="pin-date-met"
                  name="dateMet"
                  type="date"
                  required
                  value={dateMet}
                  onChange={(e) => setDateMet(e.target.value)}
                  className="dd-input"
                />
              </div>

              <div>
                <label
                  htmlFor="pin-how-we-met"
                  className="mb-1 block text-xs font-medium text-amber-400"
                >
                  {t('pinEditor.howWeMetLabel')}
                </label>
                <select
                  id="pin-how-we-met"
                  name="metChannel"
                  value={metChannel}
                  onChange={(e) => setMetChannel(e.target.value as MetChannel)}
                  className="dd-input text-sm"
                >
                  {availableChannels.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Conditional "Which Friend Introduced You?" input when How We Met === Friends */}
            {metChannel === 'Friends' && (
              <div data-testid="friend-intro-field">
                <label
                  htmlFor="pin-friend-intro"
                  className="mb-1 block text-xs font-medium text-amber-400"
                >
                  {t('pinEditor.friendIntroLabel')}
                </label>
                <input
                  id="pin-friend-intro"
                  name="introducedByFriend"
                  type="text"
                  maxLength={100}
                  value={introducedByFriend}
                  onChange={(e) => setIntroducedByFriend(e.target.value)}
                  placeholder={t('pinEditor.friendIntroPlaceholder')}
                  className="dd-input"
                />
              </div>
            )}

            {/* Total Spent on Dates (Currency + Numeric Amount) & Status / Dynamic */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="pin-spent-amount"
                  className="mb-1 block text-xs font-medium text-amber-400"
                >
                  {t('pinEditor.totalSpentLabel')}
                </label>
                <div className="flex gap-2">
                  <select
                    id="pin-spent-currency"
                    name="spentCurrency"
                    aria-label={t('pinEditor.spentCurrencyAria')}
                    value={spentCurrency}
                    onChange={(e) => setSpentCurrency(e.target.value as SpentCurrency)}
                    className="dd-input w-28 shrink-0 text-xs"
                  >
                    {SpentCurrencySchema.options.map((curr) => (
                      <option key={curr} value={curr}>
                        {CURRENCY_LABELS[curr]}
                      </option>
                    ))}
                  </select>
                  <input
                    id="pin-spent-amount"
                    name="spentAmount"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={spentAmount}
                    onChange={(e) => setSpentAmount(e.target.value)}
                    placeholder={t('pinEditor.spentAmountPlaceholder')}
                    className="dd-input flex-1"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="pin-status"
                  className="mb-1 block text-xs font-medium text-amber-400"
                >
                  {t('pinEditor.statusDynamicLabel')}
                </label>
                <select
                  id="pin-status"
                  name="relationshipStatus"
                  value={relationshipStatus}
                  onChange={(e) =>
                    setRelationshipStatus(e.target.value as RelationshipStatus)
                  }
                  className="dd-input text-sm"
                >
                  {RelationshipStatusSchema.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {t(STATUS_KEYS[opt])}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* ==============================================================
              SECTION 4: Intimacy Suite
             ============================================================== */}
          <section
            data-testid="pin-section-4"
            aria-labelledby="pin-section-4-title"
            className="space-y-4 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4"
          >
            <h2
              id="pin-section-4-title"
              className="flex items-center gap-2 text-xs font-bold tracking-wider text-rose-300 uppercase"
            >
              <Flame className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
              {t('pinEditor.section4Title')}
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="pin-intimacy-level"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  {t('pinEditor.intimacyLevelLabel')}
                </label>
                <select
                  id="pin-intimacy-level"
                  name="intimacyLevel"
                  value={intimacyLevel}
                  onChange={(e) =>
                    setIntimacyLevel(e.target.value as CanonicalIntimacyLevel)
                  }
                  className="dd-input text-sm"
                >
                  {CANONICAL_INTIMACY_LEVELS.map((opt) => (
                    <option key={opt} value={opt}>
                      {t(INTIMACY_KEYS[opt])}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="pin-dates-to-bed"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  {t('pinEditor.dates2BedLabel')}
                </label>
                <select
                  id="pin-dates-to-bed"
                  name="datesToBed"
                  value={datesToBed}
                  onChange={(e) =>
                    setDatesToBed(e.target.value as DatesToBedOption | '')
                  }
                  className="dd-input text-sm"
                >
                  <option value="">{t('pinEditor.dates2BedUnset')}</option>
                  <option value="0">{t('pinEditor.dates2Bed0')}</option>
                  <option value="1">{t('pinEditor.dates2Bed1')}</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5+">5+</option>
                </select>
              </div>
            </div>

            {/* First Intimate Date (syncs header chronological badge) & Hookup City */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="pin-first-intimate-date"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  {t('pinEditor.firstIntimateDateLabel')}
                </label>
                <input
                  id="pin-first-intimate-date"
                  name="firstIntimateDate"
                  type="date"
                  value={firstIntimateDate}
                  onChange={(e) => setFirstIntimateDate(e.target.value)}
                  className="dd-input"
                />
              </div>

              <RealCitySelector
                id="pin-hookup-city"
                name="hookupCity"
                label={t('pinEditor.hookupCityLabel')}
                value={hookupCity}
                onChange={setHookupCity}
                countryCodes={nationalities}
                allowAllCountries
                emptyOptionLabel={t('citySelector.noneSelected')}
                testId="hookup-city-selector"
              />
            </div>

            {/* Bed Vote Slider (Rose 0-10) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="pin-bed-vote" className="font-medium text-slate-300">
                  {t('pinEditor.bedVoteLabel')}
                </label>
                <span className="font-mono font-bold text-rose-400">{bedVote} / 10</span>
              </div>
              <input
                id="pin-bed-vote"
                name="bedVote"
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={bedVote}
                onChange={(e) => setBedVote(Number(e.target.value))}
                className="dd-range-rose w-full"
              />
            </div>

            {/* Where We Hooked Up (Locations) + custom location input */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">
                {t('pinEditor.hookupLocationsLabel')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {HOOKUP_LOCATION_PRESETS.map((loc) => {
                  const selected = hookupLocations.includes(loc.label);
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        toggleListValue(hookupLocations, setHookupLocations, loc.label)
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        selected
                          ? 'border-rose-400/60 bg-rose-500/20 text-rose-100'
                          : 'border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {loc.emoji} {loc.label}
                    </button>
                  );
                })}
                {customHookupLocations.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    aria-pressed="true"
                    onClick={() => toggleListValue(hookupLocations, setHookupLocations, loc)}
                    className="rounded-full border border-rose-400/60 bg-rose-500/20 px-3 py-1 text-xs font-medium text-rose-100"
                  >
                    📍 {loc}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="customLocation"
                  aria-label={t('pinEditor.customLocationPlaceholder')}
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                  onKeyDown={(e) =>
                    handleChipInputKeyDown(
                      e,
                      customLocation,
                      () => setCustomLocation(''),
                      hookupLocations,
                      setHookupLocations,
                    )
                  }
                  placeholder={t('pinEditor.customLocationPlaceholder')}
                  className="dd-input flex-1 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    addCustomChip(
                      customLocation,
                      () => setCustomLocation(''),
                      hookupLocations,
                      setHookupLocations,
                    )
                  }
                  className="shrink-0 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15"
                >
                  {t('pinEditor.addTagBtn')}
                </button>
              </div>
            </div>

            {/* Positions & Intimate Tags + custom tag adder */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">
                {t('pinEditor.intimateTagsLabel')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {allIntimateTags.map((tag) => {
                  const selected = intimateTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleListValue(intimateTags, setIntimateTags, tag)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                        selected
                          ? 'border-rose-400/60 bg-rose-500/20 text-rose-100'
                          : 'border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="customIntimateTag"
                  aria-label={t('pinEditor.customIntimateTagPlaceholder')}
                  value={customIntimateTag}
                  onChange={(e) => setCustomIntimateTag(e.target.value)}
                  onKeyDown={(e) =>
                    handleChipInputKeyDown(
                      e,
                      customIntimateTag,
                      () => setCustomIntimateTag(''),
                      intimateTags,
                      setIntimateTags,
                    )
                  }
                  placeholder={t('pinEditor.customIntimateTagPlaceholder')}
                  className="dd-input flex-1 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    addCustomChip(
                      customIntimateTag,
                      () => setCustomIntimateTag(''),
                      intimateTags,
                      setIntimateTags,
                    )
                  }
                  className="shrink-0 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15"
                >
                  {t('pinEditor.addTagBtn')}
                </button>
              </div>
            </div>
          </section>

          {/* ==============================================================
              SECTION 5: Story, Highlights, Vibe & Theme
             ============================================================== */}
          <section
            data-testid="pin-section-5"
            aria-labelledby="pin-section-5-title"
            className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/45 p-4"
          >
            <h2
              id="pin-section-5-title"
              className="flex items-center gap-2 text-xs font-bold tracking-wider text-purple-300 uppercase"
            >
              <Heart className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
              {t('pinEditor.section5Title')}
            </h2>

            <div>
              <label
                htmlFor="pin-story"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                {t('pinEditor.storyLabel')}
              </label>
              <textarea
                id="pin-story"
                name="notes"
                rows={3}
                maxLength={4000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('pinEditor.storyPlaceholder')}
                className="dd-input resize-y"
              />
            </div>

            <div>
              <label
                htmlFor="pin-highlights"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                {t('pinEditor.highlightsLabel')}
              </label>
              <textarea
                id="pin-highlights"
                name="highlights"
                rows={2}
                maxLength={2000}
                value={highlights}
                onChange={(e) => setHighlights(e.target.value)}
                placeholder={t('pinEditor.highlightsPlaceholder')}
                className="dd-input resize-y"
              />
            </div>

            {/* General Vote Slider (Amber 0-10) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="pin-general-vote" className="font-medium text-slate-300">
                  {t('pinEditor.generalVoteLabel')}
                </label>
                <span className="font-mono font-bold text-amber-400">
                  {generalVote} / 10
                </span>
              </div>
              <input
                id="pin-general-vote"
                name="generalVote"
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={generalVote}
                onChange={(e) => setGeneralVote(Number(e.target.value))}
                className="dd-range-amber w-full"
              />
            </div>
          </section>

          {/* ==============================================================
              SECTION 6: Private Local Media Vault
             ============================================================== */}
          <section
            data-testid="pin-section-6"
            aria-labelledby="pin-section-6-title"
            className="space-y-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id="pin-section-6-title"
                className="flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-300 uppercase"
              >
                <Camera className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                {t('pinEditor.section6Title')}
              </h2>
              {/* Zero-Cloud Privacy Badge */}
              <span
                data-testid="zero-cloud-badge"
                className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t('pinEditor.zeroCloudBadge')}
              </span>
            </div>

            {mediaError && (
              <p role="alert" className="text-xs text-rose-300">
                {mediaError}
              </p>
            )}

            {/* Square Media Grid & Upload Tile */}
            <div
              data-testid="local-media-grid"
              className="grid grid-cols-3 gap-2.5 sm:grid-cols-4"
            >
              {mediaItems.map((item) => (
                <div
                  key={item.id}
                  data-testid={`local-media-tile-${item.id}`}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-white/15 bg-slate-900"
                >
                  {item.kind === 'image' ? (
                    <img
                      src={item.dataUrl}
                      alt={item.fileName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <video
                      src={item.dataUrl}
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDeleteMediaItem(item.id)}
                    aria-label={t('pinEditor.deleteMediaAria', { name: item.fileName })}
                    className="absolute top-1.5 right-1.5 rounded-lg bg-black/75 p-1.5 text-rose-300 opacity-90 transition hover:bg-rose-600 hover:text-white focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}

              <label
                htmlFor="pin-local-media-input"
                className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-400/40 bg-slate-900/60 p-2 text-center text-[11px] font-semibold text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-500/10"
              >
                <Plus className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                <span>{t('pinEditor.addMediaTile')}</span>
                <input
                  id="pin-local-media-input"
                  name="localMedia"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={(e) => void handleMediaUpload(e)}
                  className="sr-only"
                />
              </label>
            </div>
          </section>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200"
            >
              {errorMsg}
            </div>
          )}
        </div>

        {/* ==============================================================
            FOOTER ACTION BAR
           ============================================================== */}
        <footer
          data-testid="pin-editor-footer"
          className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 bg-[#141927] px-5 py-3.5"
        >
          {initialPin && onDelete ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setSaving(true);
                void onDelete(initialPin.id)
                  .then(() => {
                    savedRef.current = true;
                    onClose();
                  })
                  .finally(() => setSaving(false));
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 px-3 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/15"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('common.delete')}
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-white/5"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-rose-500/20 hover:brightness-110 disabled:opacity-60"
            >
              {saving
                ? t('pinEditor.encrypting')
                : initialPin
                  ? t('pinEditor.saveChanges')
                  : t('pinEditor.saveNumber', { number: effectiveEntryNumber })}
            </button>
          </div>
        </footer>
      </form>
        </>
      )}
    </dialog>
  );
}
