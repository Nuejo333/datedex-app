/**
 * @module features/pokedex/__tests__/HudStatsBar.test
 * Unit tests verifying the top HUD header bar controls including the Settings
 * icon button and its signed-in visual indicator.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HudStatsBar } from '../HudStatsBar';

const SAMPLE_STATS = {
  totalDates: 12,
  countriesCount: 5,
  avgRating: 8.8,
  dates2BedPercent: 42,
};

afterEach(() => {
  cleanup();
});

describe('HudStatsBar', () => {
  it('renders Import to the left of Discreet and Settings without Hide HUD, invoking handlers on click', async () => {
    const user = userEvent.setup();
    const onOpenImport = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <HudStatsBar
        stats={SAMPLE_STATS}
        discreetMode={false}
        isPro={false}
        isSignedIn={false}
        signedInEmail={null}
        onOpenImport={onOpenImport}
        onToggleDiscreet={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    );

    const importBtn = screen.getByRole('button', { name: 'Import' });
    const discreetBtn = screen.getByRole('button', { name: 'Discreet' });
    const settingsBtn = screen.getByRole('button', { name: 'Account & Settings' });
    expect(importBtn).toBeInTheDocument();
    expect(settingsBtn).toBeInTheDocument();
    expect(
      Boolean(importBtn.compareDocumentPosition(discreetBtn) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Hide HUD' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-signed-in-indicator')).not.toBeInTheDocument();

    await user.click(importBtn);
    expect(onOpenImport).toHaveBeenCalledTimes(1);

    await user.click(settingsBtn);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('displays the signed-in visual indicator and accessible label when authenticated', () => {
    render(
      <HudStatsBar
        stats={SAMPLE_STATS}
        discreetMode={false}
        isPro={true}
        isSignedIn={true}
        signedInEmail="alex@example.com"
        onOpenImport={vi.fn()}
        onToggleDiscreet={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    const settingsBtn = screen.getByRole('button', { name: 'Account & Settings (Signed in)' });
    expect(settingsBtn).toHaveAttribute('title', 'Account & Settings (alex@example.com)');
    expect(screen.getByTestId('settings-signed-in-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('hud-stats-grid')).toBeInTheDocument();
  });

  it('hides the main statistics grid when hideStats is true while keeping header controls visible', () => {
    render(
      <HudStatsBar
        stats={SAMPLE_STATS}
        discreetMode={true}
        hideStats={true}
        isPro={false}
        isSignedIn={false}
        signedInEmail={null}
        onOpenImport={vi.fn()}
        onToggleDiscreet={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('hud-stats-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hud-dates')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account & Settings' })).toBeInTheDocument();
  });
});
