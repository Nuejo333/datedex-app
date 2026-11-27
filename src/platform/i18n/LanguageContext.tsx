/**
 * @module platform/i18n/LanguageContext
 * React context, provider, and `useTranslation` hook managing UI locale (`en`, `it`, `es`)
 * persisted in `localStorage` as a device UI preference preserved across logout.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  translate,
  type SupportedLocale,
  type TranslationKey,
} from './translations';

/**
 * LocalStorage key for persisting the user's selected UI language across sessions and logout.
 */
export const LANGUAGE_STORAGE_KEY = 'datedex.ui.language.v1';

/**
 * Type guard validating whether a string is a supported locale (`en`, `it`, `es`).
 * @param {unknown} value - Candidate value read from storage or user input.
 * @returns {boolean} True when value is `'en'`, `'it'`, or `'es'`.
 */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return value === 'en' || value === 'it' || value === 'es';
}

/**
 * Reads the persisted UI locale from `localStorage`, defaulting to `'en'`.
 * @returns {SupportedLocale} Stored locale or `'en'`.
 */
export function readStoredLocale(): SupportedLocale {
  try {
    const raw = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLocale(raw) ? raw : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Persists the selected UI locale to `localStorage`.
 * @param {SupportedLocale} locale - Selected language code.
 * @returns {void}
 */
export function persistLocale(locale: SupportedLocale): void {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

/**
 * Context value exposed by `LanguageProvider` and `useTranslation`.
 */
export interface LanguageContextValue {
  locale: SupportedLocale;
  setLocale: (next: SupportedLocale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const DEFAULT_CONTEXT: LanguageContextValue = {
  locale: 'en',
  setLocale: () => {},
  t: (key, params) => translate('en', key, params),
};

const LanguageContext = createContext<LanguageContextValue>(DEFAULT_CONTEXT);

/**
 * Props for `LanguageProvider`.
 */
export interface LanguageProviderProps {
  initialLocale?: SupportedLocale;
  children: ReactNode;
}

/**
 * Provides reactive UI locale state (`en`, `it`, `es`) backed by `localStorage`
 * and updates `document.documentElement.lang` whenever the locale changes.
 * @param {LanguageProviderProps} props - Optional initial locale override and children.
 * @returns {React.JSX.Element} Context provider wrapping the application tree.
 */
export function LanguageProvider({
  initialLocale,
  children,
}: LanguageProviderProps): React.JSX.Element {
  const [locale, setLocaleState] = useState<SupportedLocale>(
    () => initialLocale ?? readStoredLocale(),
  );

  const setLocale = useCallback((next: SupportedLocale): void => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string =>
      translate(locale, key, params),
    [locale],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * Hook returning the active UI locale, locale setter, and strictly-typed `t()` translator.
 * Falls back cleanly to English when rendered outside a `LanguageProvider` in isolated tests.
 * @returns {LanguageContextValue} Active locale, `setLocale`, and `t` helper.
 */
export function useTranslation(): LanguageContextValue {
  return useContext(LanguageContext);
}
