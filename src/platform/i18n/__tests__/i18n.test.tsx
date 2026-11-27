/**
 * @module platform/i18n/__tests__/i18n.test
 * Unit tests verifying strict en/it/es dictionary parity, live language switching,
 * preservation of untranslated brand/product terms, and persistence across logout.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebCryptoService } from '../../crypto/webCryptoService';
import { DatedexDb } from '../../indexeddb/db';
import { LocalPinRepository } from '../../indexeddb/pinRepository';
import { clearClientUserSessionData } from '../../supabase/sessionCleanup';
import {
  LANGUAGE_STORAGE_KEY,
  LanguageProvider,
  readStoredLocale,
  useTranslation,
} from '../LanguageContext';
import { TRANSLATIONS, en, es, it as itDict } from '../translations';

function I18nProbe(): React.JSX.Element {
  const { locale, setLocale, t } = useTranslation();
  return (
    <div>
      <span data-testid="active-locale">{locale}</span>
      <span data-testid="translated-import">{t('header.import')}</span>
      <span data-testid="translated-dates">{t('hud.dates')}</span>
      <span data-testid="translated-countries">{t('hud.countries')}</span>
      <span data-testid="translated-map">{t('app.dock.map')}</span>
      <span data-testid="translated-search-area">{t('map.searchArea')}</span>
      <span data-testid="brand-pokedex">{t('app.dock.pokedex')}</span>
      <span data-testid="brand-rizz">{t('app.dock.rizz')}</span>
      <span data-testid="brand-dates2bed">{t('hud.dates2Bed')}</span>
      <span data-testid="brand-discreet">{t('header.discreet')}</span>
      <span data-testid="brand-gopro">{t('ad.goPro')}</span>
      <span data-testid="brand-vault">{t('vault.toggleLabel')}</span>
      <span data-testid="brand-datedex">{t('onboarding.welcome')}</span>
      <button type="button" onClick={() => setLocale('it')}>
        Switch IT
      </button>
      <button type="button" onClick={() => setLocale('es')}>
        Switch ES
      </button>
      <button type="button" onClick={() => setLocale('en')}>
        Switch EN
      </button>
    </div>
  );
}

describe('i18n dictionaries and LanguageProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('maintains 100% key parity and non-empty strings across en, it, and es', () => {
    const enKeys = Object.keys(en).sort();
    const itKeys = Object.keys(itDict).sort();
    const esKeys = Object.keys(es).sort();

    expect(itKeys).toEqual(enKeys);
    expect(esKeys).toEqual(enKeys);

    for (const locale of ['en', 'it', 'es'] as const) {
      for (const [key, value] of Object.entries(TRANSLATIONS[locale])) {
        expect(value.trim().length, `${locale}.${key} should be non-empty`).toBeGreaterThan(0);
      }
    }
  });

  it('switches between en, it, and es while preserving brand/product terms untranslated', async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <I18nProbe />
      </LanguageProvider>,
    );

    // Default English
    expect(screen.getByTestId('active-locale')).toHaveTextContent('en');
    expect(screen.getByTestId('translated-import')).toHaveTextContent('Import');
    expect(screen.getByTestId('translated-dates')).toHaveTextContent('Dates');
    expect(screen.getByTestId('translated-map')).toHaveTextContent('Map');
    expect(screen.getByTestId('translated-search-area')).toHaveTextContent('Search this area');

    // Switch to Italian
    await user.click(screen.getByRole('button', { name: 'Switch IT' }));
    expect(screen.getByTestId('active-locale')).toHaveTextContent('it');
    expect(screen.getByTestId('translated-import')).toHaveTextContent('Importa');
    expect(screen.getByTestId('translated-dates')).toHaveTextContent('Incontri');
    expect(screen.getByTestId('translated-countries')).toHaveTextContent('Paesi');
    expect(screen.getByTestId('translated-map')).toHaveTextContent('Mappa');
    expect(screen.getByTestId('translated-search-area')).toHaveTextContent('Cerca in questa zona');
    expect(screen.getByTestId('brand-pokedex')).toHaveTextContent('Pokédex');
    expect(screen.getByTestId('brand-rizz')).toHaveTextContent('Rizz AI');
    expect(screen.getByTestId('brand-dates2bed')).toHaveTextContent('Dates2Bed');
    expect(screen.getByTestId('brand-discreet')).toHaveTextContent('Discreet');
    expect(screen.getByTestId('brand-gopro')).toHaveTextContent('Go Pro');
    expect(screen.getByTestId('brand-vault')).toHaveTextContent('Vault / Discreet');
    expect(screen.getByTestId('brand-datedex')).toHaveTextContent('Datédex');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('it');

    // Switch to Spanish
    await user.click(screen.getByRole('button', { name: 'Switch ES' }));
    expect(screen.getByTestId('active-locale')).toHaveTextContent('es');
    expect(screen.getByTestId('translated-import')).toHaveTextContent('Importar');
    expect(screen.getByTestId('translated-dates')).toHaveTextContent('Citas');
    expect(screen.getByTestId('translated-countries')).toHaveTextContent('Países');
    expect(screen.getByTestId('translated-map')).toHaveTextContent('Mapa');
    expect(screen.getByTestId('translated-search-area')).toHaveTextContent('Buscar en esta zona');
    expect(screen.getByTestId('brand-pokedex')).toHaveTextContent('Pokédex');
    expect(screen.getByTestId('brand-rizz')).toHaveTextContent('Rizz AI');
    expect(screen.getByTestId('brand-dates2bed')).toHaveTextContent('Dates2Bed');
    expect(screen.getByTestId('brand-discreet')).toHaveTextContent('Discreet');
    expect(screen.getByTestId('brand-gopro')).toHaveTextContent('Go Pro');
    expect(screen.getByTestId('brand-vault')).toHaveTextContent('Vault / Discreet');
    expect(screen.getByTestId('brand-datedex')).toHaveTextContent('Datédex');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es');
  });

  it('persists selected UI language across logout session data cleanup', async () => {
    const user = userEvent.setup();
    const db = new DatedexDb(`i18n_logout_${crypto.randomUUID()}`);
    const cryptoSvc = new WebCryptoService(() => 'i18n-logout-secret-32-chars-min');
    const repo = new LocalPinRepository(db, cryptoSvc);

    render(
      <LanguageProvider>
        <I18nProbe />
      </LanguageProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Switch IT' }));
    expect(readStoredLocale()).toBe('it');

    // Simulate logout cleanup
    await clearClientUserSessionData(repo);

    // Language preference survives logout untouched
    expect(readStoredLocale()).toBe('it');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('it');

    await db.delete();
  });
});
