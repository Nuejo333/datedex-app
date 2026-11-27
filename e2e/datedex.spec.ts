/**
 * @module e2e/datedex.spec
 * Mobile-viewport (390x844) Playwright E2E suite verifying Map-first default launch,
 * permanently visible HUD & bottom dock (no Hide HUD/Dock controls), offline IndexedDB
 * pin persistence, Vault / Discreet mode, zero-free-message Rizz Coach gate, and CSV import.
 */
import { expect, test } from '@playwright/test';

test.describe('Datédex Mobile PWA E2E', () => {
  test('opens directly on Map tab with permanent HUD/dock, logs pin offline, toggles Discreet, and verifies Pro gate', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Signed-out launch opens directly on the Map tab (no onboarding) with permanent HUD & dock
    await expect(page.getByRole('heading', { name: 'Welcome to Datédex' })).toHaveCount(0);
    await expect(page.getByTestId('hud-dates')).toHaveText('0');
    await expect(page.getByRole('button', { name: 'Hide HUD' })).toHaveCount(0);
    await expect(page.getByTestId('ad-banner-slot')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('region', { name: 'Datédex Monochrome 3D Map' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Toggle drop pin mode' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search this area' })).toBeVisible();

    // 2. Log a new connection using city autocomplete + reload persistence
    await page.getByRole('button', { name: 'Log new connection' }).click();
    await expect(page.getByRole('heading', { name: 'Log New Connection' })).toBeVisible();

    await page.getByLabel('Name *').fill('Sofia');
    await page.getByLabel('City Autocomplete (offline global directory)').fill('Milan');
    await page.getByRole('button', { name: 'Milan, IT' }).click();
    await page.getByLabel('Private Notes (AES-GCM encrypted locally)').fill('Brera espresso');
    await page.getByRole('button', { name: 'Save to Datédex' }).click();

    // Close frequency-capped free-tier interstitial if opened
    const dismissInterstitial = page.getByRole('button', { name: 'Dismiss sponsored modal' });
    if (await dismissInterstitial.isVisible()) {
      await dismissInterstitial.click();
    }

    await expect(page.getByTestId('hud-dates')).toHaveText('1');
    await expect(page.getByTestId('hud-countries')).toHaveText('1');

    // 3. Verify IndexedDB persistence across full page reload (still defaults to Map tab)
    await page.reload();
    await expect(page.getByTestId('hud-dates')).toHaveText('1');
    await expect(page.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('region', { name: 'Datédex Monochrome 3D Map' })).toBeVisible();

    // Navigate to Pokédex tab to inspect logged card & verify Discreet masking
    await page.getByRole('button', { name: 'Pokédex' }).click();
    await expect(page.getByTestId('pokedex-cards')).toContainText('Sofia');

    // 4. Vault / Discreet mode masks sensitive info and hides ads
    await page.getByRole('button', { name: 'Discreet' }).click();
    await expect(page.getByTestId('hud-dates2bed')).toHaveText('•••');
    await expect(page.getByTestId('ad-banner-slot')).toHaveCount(0);
    await expect(page.getByTestId('pokedex-cards')).not.toContainText('Sofia');

    // Turn Discreet mode back off
    await page.getByRole('button', { name: 'Active' }).click();
    await expect(page.getByTestId('pokedex-cards')).toContainText('Sofia');

    // 5. Vault tab and Settings view contain zero Hide HUD / Hide Dock toggles
    await page.getByRole('button', { name: 'Vault' }).click();
    await expect(page.getByRole('button', { name: 'Hide HUD' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Hide Dock' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Account & Settings' }).click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide HUD' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to previous view' }).click();

    // 6. Zero-free-message Rizz Coach Pro gate
    await page.getByRole('button', { name: 'Rizz AI' }).click();
    await expect(page.getByText('Strictly 0 free messages')).toBeVisible();

    // 7. Spreadsheet Import tab renders starter template button
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('button', { name: 'Starter Template (.xlsx)' })).toBeVisible();
  });
});
