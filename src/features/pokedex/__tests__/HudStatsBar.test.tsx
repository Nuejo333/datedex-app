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
  avgRating: 4.4,
  dates2BedPercent: 42,
};

afterEach(() => {
  cleanup();
});

describe('HudStatsBar', () => {
  it('renders the Settings button next to Discreet and Hide HUD and invokes onOpenSettings', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();

    render(
      <HudStatsBar
        stats={SAMPLE_STATS}
        discreetMode={false}
        isPro={false}
        isSignedIn={false}
        signedInEmail={null}
        onToggleDiscreet={vi.fn()}
        onToggleHideHud={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    );

    const settingsBtn = screen.getByRole('button', { name: 'Account & Settings' });
    expect(settingsBtn).toBeInTheDocument();
    expect(screen.queryByTestId('settings-signed-in-indicator')).not.toBeInTheDocument();

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
        onToggleDiscreet={vi.fn()}
        onToggleHideHud={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    const settingsBtn = screen.getByRole('button', { name: 'Account & Settings (Signed in)' });
    expect(settingsBtn).toHaveAttribute('title', 'Account & Settings (alex@example.com)');
    expect(screen.getByTestId('settings-signed-in-indicator')).toBeInTheDocument();
  });
});
