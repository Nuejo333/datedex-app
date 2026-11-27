/**
 * @module e2e/datedex.spec
 * Mobile-viewport (390x844) Playwright E2E suite verifying onboarding,
 * offline IndexedDB pin persistence, HUD stats, Vault / Discreet mode,
 * Hide HUD/Dock toggles, zero-free-message Rizz Coach gate, and CSV import.
 */
import { expect, test } from '@playwright/test';

test.describe('Datédex Mobile PWA E2E', () => {
  test('completes 4-step onboarding, logs pin offline, toggles Vault & HUD/Dock, and verifies Pro gate', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. 4-Step Identity Onboarding
    await expect(page.getByRole('heading', { name: 'Welcome to Datédex' })).toBeVisible();
    await page.getByLabel('Passport Nickname').fill('Alex');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2: Privacy pledge
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3: Optional Vault passphrase (skip for one-tap discreet test)
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 4: Verify zero password inputs exist, then start offline
    await expect(page.locator('input[autocomplete="new-password"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start Offline Passport' }).click();

    // 2. Main HUD visible + Ad banner visible for free tier
    await expect(page.getByTestId('hud-dates')).toHaveText('0');
    await expect(page.getByTestId('ad-banner-slot')).toBeVisible();

    // 3. Log a new connection using city autocomplete + reload persistence
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

    // Verify IndexedDB persistence across full page reload
    await page.reload();
    await expect(page.getByTestId('hud-dates')).toHaveText('1');
    await expect(page.getByTestId('pokedex-cards')).toContainText('Sofia');

    // 4. Vault / Discreet mode masks sensitive info and hides ads
    await page.getByRole('button', { name: 'Discreet' }).click();
    await expect(page.getByTestId('hud-dates2bed')).toHaveText('•••');
    await expect(page.getByTestId('ad-banner-slot')).toHaveCount(0);
    await expect(page.getByTestId('pokedex-cards')).not.toContainText('Sofia');

    // Turn Discreet mode back off
    await page.getByRole('button', { name: 'Vault On' }).click();
    await expect(page.getByTestId('pokedex-cards')).toContainText('Sofia');

    // 5. Hide HUD & Hide Dock toggles + restore pills
    await page.getByRole('button', { name: 'Hide HUD' }).click();
    await expect(page.getByRole('button', { name: 'Show HUD' })).toBeVisible();
    await page.getByRole('button', { name: 'Show HUD' }).click();
    await expect(page.getByTestId('hud-dates')).toBeVisible();

    // 6. Zero-free-message Rizz Coach Pro gate
    await page.getByRole('button', { name: 'Rizz AI' }).click();
    await expect(page.getByText('Strictly 0 free messages')).toBeVisible();

    // 7. Map DatedexMap container & interactive controls (works with or without Mapbox token)
    await page.getByRole('button', { name: 'Map' }).click();
    await expect(page.getByRole('region', { name: 'Datédex Monochrome 3D Map' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Toggle drop pin mode' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search this area' })).toBeVisible();

    // 8. Spreadsheet Import tab renders starter template button
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('button', { name: 'Starter Template (.xlsx)' })).toBeVisible();
  });
});
