/**
 * @module e2e/datedex.spec
 * Mobile-viewport (390x844) Playwright E2E suite verifying Map-first default launch,
 * pointer-anchored flag + initials pins (no score), proximity cluster zoom-to-expand,
 * removal of search/drop-pin/manual-coord/search-area controls, bottom-left `+` button,
 * 3-item floating glassmorphic dock (Pokédex, Map, Rizz AI), top-header Import button,
 * Settings Vault, sticky Sponsored banner, offline IndexedDB persistence, Discreet mode, and Pro gate.
 */
import { expect, test } from '@playwright/test';

test.describe('Datédex Mobile PWA E2E', () => {
  test('opens directly on Map tab with clean map pins, clustering, left + button, floating dock, and Settings Vault', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Signed-out launch opens directly on the Map tab with sticky top chrome & 3-item floating dock
    await expect(page.getByRole('heading', { name: 'Welcome to Datédex' })).toHaveCount(0);
    const stickyTop = page.getByTestId('sticky-top-chrome');
    await expect(stickyTop.getByTestId('hud-dates')).toHaveText('0');
    await expect(stickyTop.getByTestId('ad-banner-slot')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide HUD' })).toHaveCount(0);

    // Top-header Import button sits immediately to the left of Discreet
    const importBtn = stickyTop.getByRole('button', { name: 'Import' });
    const discreetBtn = stickyTop.getByRole('button', { name: 'Discreet' });
    await expect(importBtn).toBeVisible();
    const importBox = await importBtn.boundingBox();
    const discreetBox = await discreetBtn.boundingBox();
    expect(importBox).not.toBeNull();
    expect(discreetBox).not.toBeNull();
    expect((importBox?.x ?? 0) + (importBox?.width ?? 0)).toBeLessThanOrEqual(
      (discreetBox?.x ?? 0) + 1,
    );

    // Floating dock has exactly 3 tabs (Pokédex, Map, Rizz AI) — zero Vault or Import
    const floatingDock = page.getByTestId('floating-dock');
    await expect(floatingDock.getByRole('button')).toHaveCount(3);
    await expect(floatingDock.getByRole('button', { name: 'Pokédex' })).toBeVisible();
    await expect(floatingDock.getByRole('button', { name: 'Map' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(floatingDock.getByRole('button', { name: 'Rizz AI' })).toBeVisible();
    await expect(floatingDock.getByRole('button', { name: 'Vault' })).toHaveCount(0);
    await expect(floatingDock.getByRole('button', { name: 'Import' })).toHaveCount(0);

    // Map region renders with 3D toggle + zoom controls, and ZERO search/drop-pin/manual-coord/search-area UI
    const mapRegion = page.getByRole('region', { name: 'Datédex Monochrome 3D Map' });
    await expect(mapRegion).toBeVisible();
    await expect(mapRegion.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Toggle drop pin mode/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Manual latitude and longitude/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Search this area/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Disable 3D buildings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();

    // Floating '+' New Date button sits on the bottom-left with safe clearance above the floating dock
    const addBtn = page.getByRole('button', { name: 'Log new connection' });
    await expect(addBtn).toBeVisible();
    const addBox = await addBtn.boundingBox();
    const dockBox = await floatingDock.boundingBox();
    expect(addBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(addBox?.x ?? 999).toBeLessThan(80);
    expect((addBox?.y ?? 999) + (addBox?.height ?? 0)).toBeLessThanOrEqual((dockBox?.y ?? 0) + 1);

    // 2. Log first connection ("Julia Vance", Milan IT) using the bottom-left '+' button
    await addBtn.click();
    await expect(page.getByRole('heading', { name: 'New Connection' })).toBeVisible();
    await expect(page.getByTestId('zero-cloud-badge')).toContainText(
      'Stored on Device Only · Zero Cloud Upload',
    );

    await page.getByLabel('Name *').fill('Julia Vance');
    await page.getByLabel('Quick Search Country Filter Bar').fill('IT');
    await page.getByTestId('country-chip-IT').click();
    await page.getByLabel('City Where They Were Born').fill('Milan');
    await page.getByLabel('The Story / How It Went').fill('Brera espresso');
    await page.getByRole('button', { name: 'Save #1' }).click();

    // Close frequency-capped free-tier interstitial if opened
    const dismissInterstitial = page.getByRole('button', { name: 'Dismiss sponsored modal' });
    if (await dismissInterstitial.isVisible()) {
      await dismissInterstitial.click();
    }

    await expect(page.getByTestId('hud-dates')).toHaveText('1');
    await expect(page.getByTestId('hud-countries')).toHaveText('1');

    // 3. Verify IndexedDB persistence across reload & single pin renders flag + initials ONLY (no score)
    await page.reload();
    await expect(page.getByTestId('hud-dates')).toHaveText('1');
    await expect(page.getByTestId('floating-dock').getByRole('button', { name: 'Map' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(mapRegion).toBeVisible();
    const singlePin = mapRegion.locator('[data-pin-shape="teardrop"]').first();
    await expect(singlePin).toBeVisible();
    await expect(singlePin).toContainText('🇮🇹');
    await expect(singlePin).toContainText('JV');
    await expect(singlePin).not.toContainText('Julia');
    await expect(singlePin).not.toContainText('★');
    await expect(singlePin).not.toContainText('4.5');

    // 4. Add a second nearby connection ("Elena", France -> Paris capital fallback) -> clusters into 1 larger pin of 2 and zooms to expand on click
    await page.getByRole('button', { name: 'Log new connection' }).click();
    await page.getByLabel('Name *').fill('Elena');
    await page.getByLabel('Quick Search Country Filter Bar').fill('FR');
    await page.getByTestId('country-chip-FR').click();
    await page.getByRole('button', { name: 'Save #2' }).click();
    if (await dismissInterstitial.isVisible()) {
      await dismissInterstitial.click();
    }

    await expect(page.getByTestId('hud-dates')).toHaveText('2');
    const clusterPin = mapRegion.locator('[data-pin-shape="cluster-teardrop"]');
    await expect(clusterPin).toBeVisible();
    await expect(clusterPin).toContainText('2');
    await expect(clusterPin).toContainText('🇮🇹');
    await expect(clusterPin).toContainText('🇫🇷');

    // Clicking cluster zooms toward its center and expands into the 2 individual pins ("JV" & "E")
    await clusterPin.click();
    await expect(clusterPin).toHaveCount(0);
    await expect(mapRegion.locator('[data-pin-shape="teardrop"]')).toHaveCount(2);
    await expect(mapRegion).toContainText('JV');
    await expect(mapRegion).toContainText('E');

    // 5. On Map page, Discreet mode hides top statistics and map pin initials; sticky ad banner stays visible
    await page.getByRole('button', { name: 'Discreet' }).click();
    await expect(page.getByTestId('hud-stats-grid')).toHaveCount(0);
    await expect(page.getByTestId('sticky-top-chrome').getByTestId('ad-banner-slot')).toBeVisible();
    await expect(mapRegion).not.toContainText('JV');

    // Navigate to Pokédex tab while Discreet mode is active -> top stats stay hidden, sticky ad banner visible & cards masked
    await page.getByTestId('floating-dock').getByRole('button', { name: 'Pokédex' }).click();
    await expect(page.getByTestId('hud-stats-grid')).toHaveCount(0);
    await expect(page.getByTestId('sticky-top-chrome').getByTestId('ad-banner-slot')).toBeVisible();
    await expect(page.getByTestId('pokedex-cards')).not.toContainText('Julia Vance');

    // Turn Discreet mode back off -> top stats and unmasked cards reappear
    await page.getByRole('button', { name: 'Active' }).click();
    await expect(page.getByTestId('hud-stats-grid')).toBeVisible();
    await expect(page.getByTestId('pokedex-cards')).toContainText('Julia Vance');

    // 6. Settings pins Plan & Billing first (non-collapsible), supports collapsing other cards, and switches language
    await page.getByRole('button', { name: 'Account & Settings' }).click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
    const firstSectionTestId = await page
      .locator('[data-testid="settings-page"] main > section')
      .first()
      .getAttribute('data-testid');
    expect(firstSectionTestId).toBe('plan-billing-section');

    // Collapse & expand Vault section via aria-expanded chevron toggle
    const vaultSection = page.getByTestId('settings-vault-section');
    await expect(vaultSection).toBeVisible();
    await expect(vaultSection.getByRole('heading', { name: 'Vault, Encryption & Sync' })).toBeVisible();
    await expect(vaultSection.getByRole('button', { name: 'Download .json Backup' })).toBeVisible();
    const vaultToggle = page.getByRole('button', { name: 'Toggle Vault, Encryption & Sync section' });
    await expect(vaultToggle).toHaveAttribute('aria-expanded', 'true');
    await vaultToggle.click();
    await expect(vaultToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(vaultSection.getByRole('button', { name: 'Download .json Backup' })).toHaveCount(0);
    await vaultToggle.click();
    await expect(vaultToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(vaultSection.getByRole('button', { name: 'Download .json Backup' })).toBeVisible();

    // Switch language to Italian and confirm UI chrome translates while special terms stay untranslated
    await page.getByTestId('language-option-it').click();
    await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Piano e Fatturazione' })).toBeVisible();
    await page.getByRole('button', { name: 'Torna alla vista precedente' }).click();
    await expect(page.getByTestId('sticky-top-chrome').getByRole('button', { name: 'Importa' })).toBeVisible();
    await expect(page.getByTestId('sticky-top-chrome').getByRole('button', { name: 'Discreet' })).toBeVisible();
    await expect(page.getByTestId('floating-dock').getByRole('button', { name: 'Mappa' })).toBeVisible();
    await expect(page.getByTestId('floating-dock').getByRole('button', { name: 'Pokédex' })).toBeVisible();
    await expect(page.getByTestId('floating-dock').getByRole('button', { name: 'Rizz AI' })).toBeVisible();
    await expect(page.getByTestId('sticky-top-chrome').getByRole('button', { name: 'Go Pro' })).toBeVisible();

    // Switch back to English for remaining E2E checks
    await page.getByRole('button', { name: 'Account e Impostazioni' }).click();
    await page.getByTestId('language-option-en').click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide HUD' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Hide Dock' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to previous view' }).click();

    // 7. Zero-free-message Rizz Coach Pro gate (sticky ad banner persists across tabs)
    await page.getByTestId('floating-dock').getByRole('button', { name: 'Rizz AI' }).click();
    await expect(page.getByTestId('sticky-top-chrome').getByTestId('ad-banner-slot')).toBeVisible();
    await expect(page.getByText('Strictly 0 free messages')).toBeVisible();

    // 8. Top-header Import button opens full-page Import screen with starter template & Back return
    await page.getByTestId('sticky-top-chrome').getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('import-page')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Starter Template (.xlsx)' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to previous view' }).click();
    await expect(page.getByTestId('import-page')).toHaveCount(0);
  });
});
