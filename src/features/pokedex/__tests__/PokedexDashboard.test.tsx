/**
 * @module features/pokedex/__tests__/PokedexDashboard.test
 * Component tests verifying chronological mini-card ordering, Encounter + Intimacy date
 * display across locales, and city dimension filtering (`All Cities`, `Born in`, `Lives in`, `Met in`).
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DecryptedPin } from '../../../domain/models/pin';
import { LanguageProvider } from '../../../platform/i18n/LanguageContext';
import { PokedexDashboard } from '../PokedexDashboard';

function makePin(overrides: Partial<DecryptedPin> = {}): DecryptedPin {
  return {
    id: crypto.randomUUID(),
    name: 'Sofia',
    age: 26,
    nationalityCode: 'IT',
    city: 'Milan',
    birthCity: 'Milan',
    livingCity: 'London',
    metCity: 'Lisbon',
    latitude: 45.4642,
    longitude: 9.19,
    rating: 4.5,
    relationshipStatus: 'dating',
    intimacyLevel: 'kiss',
    metChannel: 'Hinge',
    dateMet: '2026-09-14',
    firstIntimateDate: '',
    notes: 'Great espresso',
    vaultLocked: false,
    vaultAlias: '',
    photoDataUrl: null,
    photoStoragePath: null,
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
    deletedAt: null,
    syncPending: true,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('PokedexDashboard', () => {
  const samplePins: DecryptedPin[] = [
    makePin({
      id: 'pin-newer',
      name: 'Elena',
      nationalityCode: 'FR',
      city: 'Paris',
      birthCity: 'Lyon',
      livingCity: 'Paris',
      metCity: 'Madrid',
      dateMet: '2026-10-02',
      firstIntimateDate: '2026-10-05',
    }),
    makePin({
      id: 'pin-older',
      name: 'Sofia',
      nationalityCode: 'IT',
      city: 'Milan',
      birthCity: 'Milan',
      livingCity: 'London',
      metCity: 'Lisbon',
      dateMet: '2026-03-11',
      firstIntimateDate: '',
    }),
  ];

  it('displays mini cards in chronological order with recalculated #1..#N badges and both Encounter & Intimacy dates', () => {
    render(
      <LanguageProvider initialLocale="en">
        <PokedexDashboard pins={samplePins} discreetMode={false} onSelectPin={vi.fn()} />
      </LanguageProvider>,
    );

    const cardsContainer = screen.getByTestId('pokedex-cards');
    const buttons = within(cardsContainer).getAllByRole('button');
    expect(buttons).toHaveLength(2);

    // Sofia (March) must appear first as #1; Elena (October) second as #2
    expect(buttons[0]).toHaveTextContent('#1');
    expect(buttons[0]).toHaveTextContent('Sofia');
    expect(screen.getByTestId('pokedex-card-dates-pin-older')).toHaveTextContent('First Date: 11/03/26');
    expect(screen.getByTestId('pokedex-card-dates-pin-older')).toHaveTextContent('Intimacy: None yet');

    expect(buttons[1]).toHaveTextContent('#2');
    expect(buttons[1]).toHaveTextContent('Elena');
    expect(screen.getByTestId('pokedex-card-dates-pin-newer')).toHaveTextContent('First Date: 02/10/26');
    expect(screen.getByTestId('pokedex-card-dates-pin-newer')).toHaveTextContent('Intimacy: 05/10/26');

    // 1–5 star Rating Distribution widget is completely removed; 0–10 is the sole official scale
    expect(screen.queryByRole('heading', { name: /Rating Distribution/i })).not.toBeInTheDocument();
    expect(screen.queryByText('5★')).not.toBeInTheDocument();
    expect(buttons[0]).toHaveTextContent('/ 10');
  });

  it('localizes Encounter & Intimacy dates in Italian and Spanish', () => {
    const { unmount } = render(
      <LanguageProvider initialLocale="it">
        <PokedexDashboard pins={samplePins} discreetMode={false} onSelectPin={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('pokedex-card-dates-pin-older')).toHaveTextContent('Primo Incontro: 11/03/26');
    expect(screen.getByTestId('pokedex-card-dates-pin-older')).toHaveTextContent('Intimità: Non ancora');

    unmount();
    render(
      <LanguageProvider initialLocale="es">
        <PokedexDashboard pins={samplePins} discreetMode={false} onSelectPin={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('pokedex-card-dates-pin-newer')).toHaveTextContent('Primera Cita: 02/10/26');
    expect(screen.getByTestId('pokedex-card-dates-pin-newer')).toHaveTextContent('Intimidad: 05/10/26');
  });

  it('filters Pokédex cards by birthCity, livingCity, and metCity and resets with Clear', async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider initialLocale="en">
        <PokedexDashboard pins={samplePins} discreetMode={false} onSelectPin={vi.fn()} />
      </LanguageProvider>,
    );

    const dimensionSelect = screen.getByTestId('pokedex-city-dimension');
    const citySelect = screen.getByTestId('pokedex-city-value');

    // Born in Lyon -> only Elena
    await user.selectOptions(dimensionSelect, 'birthCity');
    await user.selectOptions(citySelect, 'Lyon');
    expect(screen.getByTestId('pokedex-cards')).toHaveTextContent('Elena');
    expect(screen.getByTestId('pokedex-cards')).not.toHaveTextContent('Sofia');

    // Lives in London -> only Sofia
    await user.selectOptions(dimensionSelect, 'livingCity');
    await user.selectOptions(citySelect, 'London');
    expect(screen.getByTestId('pokedex-cards')).toHaveTextContent('Sofia');
    expect(screen.getByTestId('pokedex-cards')).not.toHaveTextContent('Elena');

    // Met in Madrid -> only Elena
    await user.selectOptions(dimensionSelect, 'metCity');
    await user.selectOptions(citySelect, 'Madrid');
    expect(screen.getByTestId('pokedex-cards')).toHaveTextContent('Elena');
    expect(screen.getByTestId('pokedex-cards')).not.toHaveTextContent('Sofia');

    // Clear resets back to both entries
    await user.click(screen.getByTestId('pokedex-city-filter-clear'));
    expect(screen.getByTestId('pokedex-cards')).toHaveTextContent('Sofia');
    expect(screen.getByTestId('pokedex-cards')).toHaveTextContent('Elena');
  });
});
