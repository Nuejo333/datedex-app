/**
 * @module features/pins/PinEditorDialog
 * Accessible native `<dialog>` for creating or editing a Datédex connection pin
 * with 3-way coordinate input (map tap, city autocomplete, numeric lat/lng),
 * EXIF-stripped photo upload, and client-side encrypted notes/intimacy fields.
 */
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, Lock, MapPin, Search, Trash2, X } from 'lucide-react';
import { COUNTRIES, searchCities } from '../../domain/countries/countries';
import type { MapCoordinate } from '../../domain/map/types';
import {
  IntimacyLevelSchema,
  MetChannelSchema,
  PinInputSchema,
  RelationshipStatusSchema,
  formatTenScale,
  type DecryptedPin,
  type IntimacyLevel,
  type MetChannel,
  type PinInput,
  type RelationshipStatus,
} from '../../domain/models/pin';
import { useTranslation } from '../../platform/i18n/LanguageContext';
import type { TranslationKey } from '../../platform/i18n/translations';
import { stripExifAndCompressImage } from '../../platform/media/imageProcessor';
import { useNativeModalDialog } from '../../platform/ui/dialogUtils';

const STATUS_KEYS: Record<RelationshipStatus, TranslationKey> = {
  talking: 'status.talking',
  first_date: 'status.first_date',
  dating: 'status.dating',
  situationship: 'status.situationship',
  exclusive: 'status.exclusive',
  archived: 'status.archived',
};

const INTIMACY_KEYS: Record<IntimacyLevel, TranslationKey> = {
  none: 'intimacy.none',
  kiss: 'intimacy.kiss',
  second_base: 'intimacy.second_base',
  third_base: 'intimacy.third_base',
  home_run: 'intimacy.home_run',
};

/**
 * Props for `PinEditorDialog`.
 */
export interface PinEditorDialogProps {
  open: boolean;
  initialPin: DecryptedPin | null;
  droppedCoordinate: MapCoordinate | null;
  onClose: () => void;
  onSave: (
    input: PinInput,
    processedBlob?: { blob: Blob; mimeType: 'image/webp' | 'image/jpeg' } | null,
  ) => Promise<void>;
  onDelete?: (pinId: string) => Promise<void>;
}

/**
 * Native modal dialog for adding or editing a Datédex pin with 3-way coordinate input.
 * @param {PinEditorDialogProps} props - Dialog state and CRUD callbacks.
 * @returns {React.JSX.Element} Pin editor modal dialog.
 */
export function PinEditorDialog({
  open,
  initialPin,
  droppedCoordinate,
  onClose,
  onSave,
  onDelete,
}: PinEditorDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useNativeModalDialog(dialogRef, open, onClose, true);

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [nationalityCode, setNationalityCode] = useState('FR');
  const [city, setCity] = useState('Paris');
  const [cityQuery, setCityQuery] = useState('');
  const [latitude, setLatitude] = useState('48.8566');
  const [longitude, setLongitude] = useState('2.3522');
  const [rating, setRating] = useState(4.5);
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus>('first_date');
  const [intimacyLevel, setIntimacyLevel] = useState<IntimacyLevel>('none');
  const [metChannel, setMetChannel] = useState<MetChannel>('Hinge');
  const [dateMet, setDateMet] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [vaultLocked, setVaultLocked] = useState(false);
  const [vaultAlias, setVaultAlias] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<{
    blob: Blob;
    mimeType: 'image/webp' | 'image/jpeg';
  } | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setPhotoNotice(null);
    setProcessedBlob(null);

    if (initialPin) {
      setName(initialPin.name);
      setAge(initialPin.age !== null ? String(initialPin.age) : '');
      setNationalityCode(initialPin.nationalityCode);
      setCity(initialPin.city);
      setCityQuery(initialPin.city);
      setLatitude(String(initialPin.latitude));
      setLongitude(String(initialPin.longitude));
      setRating(initialPin.rating);
      setRelationshipStatus(initialPin.relationshipStatus);
      setIntimacyLevel(initialPin.intimacyLevel);
      setMetChannel(initialPin.metChannel);
      setDateMet(initialPin.dateMet);
      setNotes(initialPin.notes);
      setVaultLocked(initialPin.vaultLocked);
      setVaultAlias(initialPin.vaultAlias);
      setPhotoDataUrl(initialPin.photoDataUrl);
      return;
    }

    setName('');
    setAge('');
    setNationalityCode('FR');
    setCity(droppedCoordinate ? 'Pinned Location' : 'Paris');
    setCityQuery('');
    setLatitude(String(droppedCoordinate?.latitude ?? 48.8566));
    setLongitude(String(droppedCoordinate?.longitude ?? 2.3522));
    setRating(4.5);
    setRelationshipStatus('first_date');
    setIntimacyLevel('none');
    setMetChannel('Hinge');
    setDateMet(new Date().toISOString().slice(0, 10));
    setNotes('');
    setVaultLocked(false);
    setVaultAlias('');
    setPhotoDataUrl(null);
  }, [open, initialPin, droppedCoordinate]);

  const citySuggestions = searchCities(cityQuery, 6);

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setPhotoNotice(t('pinEditor.photoProcessing'));
    try {
      const processed = await stripExifAndCompressImage(file);
      setPhotoDataUrl(processed.dataUrl);
      setProcessedBlob({ blob: processed.blob, mimeType: processed.mimeType });
      setPhotoNotice(
        t('pinEditor.photoProcessed', {
          width: processed.width,
          height: processed.height,
          kb: Math.round(processed.blob.size / 1024),
        }),
      );
    } catch (err) {
      setPhotoNotice(null);
      setErrorMsg(err instanceof Error ? err.message : t('pinEditor.photoError'));
    }
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setErrorMsg(null);

    const parsed = PinInputSchema.safeParse({
      id: initialPin?.id,
      name: name.trim(),
      age: age.trim() ? Number(age) : null,
      nationalityCode,
      city: city.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      rating: Number(rating),
      relationshipStatus,
      intimacyLevel,
      metChannel,
      dateMet,
      notes,
      vaultLocked,
      vaultAlias,
      photoDataUrl,
      photoStoragePath: initialPin?.photoStoragePath ?? null,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues.map((i) => i.message).join(' • '));
      return;
    }

    setSaving(true);
    try {
      await onSave(parsed.data, processedBlob);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('pinEditor.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="pin-editor-title"
      className="dd-dialog"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h1 id="pin-editor-title" className="text-base font-bold text-white">
          {initialPin
            ? t('pinEditor.editTitle', { name: initialPin.name })
            : t('pinEditor.newTitle')}
        </h1>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={t('pinEditor.closeAria')}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label htmlFor="pin-name" className="mb-1 block text-xs font-medium text-slate-300">
              {t('pinEditor.nameLabel')}
            </label>
            <input
              id="pin-name"
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

          <div>
            <label htmlFor="pin-age" className="mb-1 block text-xs font-medium text-slate-300">
              {t('pinEditor.ageLabel')}
            </label>
            <input
              id="pin-age"
              type="number"
              min={18}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="26"
              className="dd-input"
            />
            <span className="dd-error-msg">{t('pinEditor.ageError')}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pin-nationality" className="mb-1 block text-xs font-medium text-slate-300">
              {t('pinEditor.nationalityLabel')}
            </label>
            <select
              id="pin-nationality"
              value={nationalityCode}
              onChange={(e) => setNationalityCode(e.target.value)}
              className="dd-input"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pin-date" className="mb-1 block text-xs font-medium text-slate-300">
              {t('pinEditor.dateMetLabel')}
            </label>
            <input
              id="pin-date"
              type="date"
              required
              value={dateMet}
              onChange={(e) => setDateMet(e.target.value)}
              className="dd-input"
            />
          </div>
        </div>

        {/* 3-Way Coordinate Entry: (a) Map Drop, (b) City Autocomplete, (c) Direct Lat/Lng */}
        <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {t('pinEditor.coordsHeader')}
            </span>
          </div>

          <div>
            <label htmlFor="pin-city-search" className="mb-1 block text-[11px] text-slate-400">
              {t('pinEditor.citySearchLabel')}
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="pin-city-search"
                type="search"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder={t('pinEditor.citySearchPlaceholder')}
                className="dd-input pl-9"
              />
            </div>
            {cityQuery.trim().length > 0 && citySuggestions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {citySuggestions.map((entry) => (
                  <button
                    key={`${entry.city}-${entry.countryCode}`}
                    type="button"
                    onClick={() => {
                      setCity(entry.city);
                      setNationalityCode(entry.countryCode);
                      setLatitude(String(entry.latitude));
                      setLongitude(String(entry.longitude));
                      setCityQuery('');
                    }}
                    className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
                  >
                    {entry.city}, {entry.countryCode}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="pin-city" className="mb-1 block text-[11px] text-slate-300">
                {t('pinEditor.cityLabel')}
              </label>
              <input
                id="pin-city"
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="dd-input text-xs"
              />
            </div>
            <div>
              <label htmlFor="pin-lat" className="mb-1 block text-[11px] text-slate-300">
                {t('pinEditor.latitudeLabel')}
              </label>
              <input
                id="pin-lat"
                type="number"
                step="any"
                min={-90}
                max={90}
                required
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="dd-input font-mono text-xs"
              />
            </div>
            <div>
              <label htmlFor="pin-lng" className="mb-1 block text-[11px] text-slate-300">
                {t('pinEditor.longitudeLabel')}
              </label>
              <input
                id="pin-lng"
                type="number"
                step="any"
                min={-180}
                max={180}
                required
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="dd-input font-mono text-xs"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="pin-rating" className="font-medium text-slate-300">
              {t('pinEditor.ratingLabel', { rating: rating.toFixed(1) })}
            </label>
            <span className="font-semibold text-amber-300">{formatTenScale(rating)}</span>
          </div>
          <input
            id="pin-rating"
            type="range"
            min={1}
            max={5}
            step={0.5}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor="pin-status" className="mb-1 block text-xs font-medium text-slate-300">
              {t('pinEditor.statusLabel')}
            </label>
            <select
              id="pin-status"
              value={relationshipStatus}
              onChange={(e) => setRelationshipStatus(e.target.value as RelationshipStatus)}
              className="dd-input text-xs"
            >
              {RelationshipStatusSchema.options.map((opt) => (
                <option key={opt} value={opt}>
                  {t(STATUS_KEYS[opt])}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pin-intimacy" className="mb-1 block text-xs font-medium text-slate-300">
              {t('pinEditor.intimacyLabel')}
            </label>
            <select
              id="pin-intimacy"
              value={intimacyLevel}
              onChange={(e) => setIntimacyLevel(e.target.value as IntimacyLevel)}
              className="dd-input text-xs"
            >
              {IntimacyLevelSchema.options.map((opt) => (
                <option key={opt} value={opt}>
                  {t(INTIMACY_KEYS[opt])}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pin-channel" className="mb-1 block text-xs font-medium text-slate-300">
              {t('pinEditor.channelLabel')}
            </label>
            <select
              id="pin-channel"
              value={metChannel}
              onChange={(e) => setMetChannel(e.target.value as MetChannel)}
              className="dd-input text-xs"
            >
              {MetChannelSchema.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Photo upload with EXIF stripping */}
        <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="pin-photo-upload"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
            >
              <Camera className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
              {photoDataUrl ? t('pinEditor.replacePhoto') : t('pinEditor.addPhoto')}
            </label>
            <input
              id="pin-photo-upload"
              type="file"
              accept="image/*"
              onChange={(e) => void handlePhotoChange(e)}
              className="sr-only"
            />
            {photoDataUrl && (
              <button
                type="button"
                onClick={() => {
                  setPhotoDataUrl(null);
                  setProcessedBlob(null);
                  setPhotoNotice(null);
                }}
                className="text-xs text-rose-300 hover:underline"
              >
                {t('pinEditor.removePhoto')}
              </button>
            )}
          </div>
          {photoNotice && <p className="text-[11px] text-emerald-300">{photoNotice}</p>}
          {photoDataUrl && (
            <img
              src={photoDataUrl}
              alt={t('pinEditor.photoPreviewAlt')}
              className="h-28 w-full rounded-lg object-cover"
            />
          )}
        </div>

        <div>
          <label htmlFor="pin-notes" className="mb-1 block text-xs font-medium text-slate-300">
            {t('pinEditor.notesLabel')}
          </label>
          <textarea
            id="pin-notes"
            rows={3}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('pinEditor.notesPlaceholder')}
            className="dd-input resize-y"
          />
        </div>

        <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-amber-200">
            <input
              type="checkbox"
              checked={vaultLocked}
              onChange={(e) => setVaultLocked(e.target.checked)}
              className="dd-checkbox h-4 w-4"
            />
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            {t('pinEditor.vaultLockLabel')}
          </label>
          {vaultLocked && (
            <input
              type="text"
              maxLength={80}
              value={vaultAlias}
              onChange={(e) => setVaultAlias(e.target.value)}
              placeholder={t('pinEditor.vaultAliasPlaceholder')}
              aria-label={t('pinEditor.vaultAliasAria')}
              className="dd-input text-xs"
            />
          )}
        </div>

        {errorMsg && (
          <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          {initialPin && onDelete ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setSaving(true);
                void onDelete(initialPin.id)
                  .then(() => onClose())
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
                  ? t('pinEditor.updateEntry')
                  : t('pinEditor.saveToDatedex')}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
