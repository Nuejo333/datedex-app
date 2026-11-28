/**
 * @module features/pins/RealCitySelector
 * Structured real-city `<select>` backed by the offline world city + coordinates dataset,
 * grouping real cities for the selected country/countries (`Main Roots` + secondary roots)
 * at the top, optionally exposing all world cities for travel/residence/hookup locations,
 * plus an explicit custom-city text fallback for smaller towns.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  COUNTRY_BY_CODE,
  GLOBAL_CITIES,
  getCitiesForCountries,
  getCountryFlag,
  normalizeGeoText,
  type CityCoordinateEntry,
} from '../../domain/countries/countries';
import { useTranslation } from '../../platform/i18n/LanguageContext';

const CUSTOM_CITY_SENTINEL = '__custom__';

const FEATURED_WORLD_HUBS: ReadonlyArray<string> = [
  'London',
  'Paris',
  'New York',
  'Milan',
  'Rome',
  'Madrid',
  'Barcelona',
  'Lisbon',
  'Amsterdam',
  'Berlin',
  'Zurich',
  'Tokyo',
  'Seoul',
  'Dubai',
  'Singapore',
  'Bangkok',
  'Sydney',
  'Los Angeles',
  'Miami',
  'Toronto',
  'Mexico City',
  'Medellín',
  'Buenos Aires',
  'Rio de Janeiro',
  'Istanbul',
  'Cape Town',
];

const FEATURED_WORLD_HUB_SET = new Set(FEATURED_WORLD_HUBS.map(normalizeGeoText));

/**
 * Props for `RealCitySelector`.
 */
export interface RealCitySelectorProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (nextCity: string) => void;
  /** Ordered ISO alpha-2 country codes whose real cities appear first. */
  countryCodes: readonly string[];
  /** Whether to also include an optgroup of all world cities (for traveling/living/hookups). */
  allowAllCountries?: boolean;
  /** Placeholder text for the empty `""` option. */
  emptyOptionLabel: string;
  /** Optional test ID applied to the wrapper. */
  testId?: string;
}

/**
 * Renders a country-aware real-city selector with optional world-city optgroup
 * and custom-city input fallback for unlisted smaller towns.
 * @param {RealCitySelectorProps} props - Field metadata, active country roots, and change handler.
 * @returns {React.JSX.Element} Structured real-city selector control.
 */
export function RealCitySelector({
  id,
  name,
  label,
  value,
  onChange,
  countryCodes,
  allowAllCountries = true,
  emptyOptionLabel,
  testId,
}: RealCitySelectorProps): React.JSX.Element {
  const { t } = useTranslation();

  const { countryGroups, worldCities, knownCityNorms } = useMemo(() => {
    const orderedCodes = Array.from(
      new Set(countryCodes.map((c) => c.trim().toUpperCase()).filter((c) => COUNTRY_BY_CODE.has(c))),
    );
    const primaryList = getCitiesForCountries(orderedCodes);

    const groups: Array<{ code: string; groupLabel: string; cities: CityCoordinateEntry[] }> = [];
    const seenNorms = new Set<string>();

    for (const code of orderedCodes) {
      const country = COUNTRY_BY_CODE.get(code);
      if (!country) continue;
      const cities = primaryList.filter((entry) => entry.countryCode === code);
      if (cities.length === 0) continue;
      for (const entry of cities) {
        seenNorms.add(normalizeGeoText(entry.city));
      }
      groups.push({
        code,
        groupLabel: `${country.flag} ${country.name}`,
        cities,
      });
    }

    const otherWorld: CityCoordinateEntry[] = [];
    if (allowAllCountries) {
      for (const entry of GLOBAL_CITIES) {
        const norm = normalizeGeoText(entry.city);
        if (!seenNorms.has(norm) && FEATURED_WORLD_HUB_SET.has(norm)) {
          seenNorms.add(norm);
          otherWorld.push(entry);
        }
      }
    }

    return {
      countryGroups: groups,
      worldCities: otherWorld,
      knownCityNorms: seenNorms,
    };
  }, [countryCodes, allowAllCountries]);

  const trimmedValue = value.trim();
  const isKnownCity = trimmedValue.length > 0 && knownCityNorms.has(normalizeGeoText(trimmedValue));

  const [customMode, setCustomMode] = useState<boolean>(
    trimmedValue.length > 0 && !isKnownCity,
  );

  // Sync customMode when value changes externally (e.g. modal reopened for another pin)
  useEffect(() => {
    if (trimmedValue.length === 0) {
      setCustomMode(false);
    } else if (!isKnownCity) {
      setCustomMode(true);
    } else {
      setCustomMode(false);
    }
  }, [trimmedValue, isKnownCity]);

  const selectValue = customMode ? CUSTOM_CITY_SENTINEL : isKnownCity ? trimmedValue : '';

  return (
    <div data-testid={testId} className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-slate-300">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={selectValue}
        onChange={(e) => {
          const picked = e.target.value;
          if (picked === CUSTOM_CITY_SENTINEL) {
            setCustomMode(true);
            if (isKnownCity) {
              onChange('');
            }
            return;
          }
          setCustomMode(false);
          onChange(picked);
        }}
        className="dd-input text-sm"
      >
        <option value="">{emptyOptionLabel}</option>
        {countryGroups.map((group) => (
          <optgroup key={group.code} label={group.groupLabel}>
            {group.cities.map((entry) => (
              <option key={`${entry.city}-${entry.countryCode}`} value={entry.city}>
                {entry.city}
              </option>
            ))}
          </optgroup>
        ))}
        {allowAllCountries && worldCities.length > 0 && (
          <optgroup label={t('citySelector.worldCitiesGroup')}>
            {worldCities.map((entry) => (
              <option key={`${entry.city}-${entry.countryCode}`} value={entry.city}>
                {entry.city} ({getCountryFlag(entry.countryCode)} {entry.countryCode})
              </option>
            ))}
          </optgroup>
        )}
        <option value={CUSTOM_CITY_SENTINEL}>{t('citySelector.customOption')}</option>
      </select>

      {customMode && (
        <input
          type="text"
          name={`${name}Custom`}
          maxLength={120}
          aria-label={t('citySelector.customInputAria', { label })}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('citySelector.customInputPlaceholder')}
          className="dd-input text-sm"
        />
      )}
    </div>
  );
}
