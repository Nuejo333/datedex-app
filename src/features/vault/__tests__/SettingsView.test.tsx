/**
 * @module features/vault/__tests__/SettingsView.test
 * Unit tests for the full-page SettingsView covering Back navigation, Account &
 * Authentication (Google OAuth, Magic Link validation/sent/error, Sign Out),
 * Connected Accounts (Google Connected vs Pair Google Account), Plan & Billing,
 * and Privacy & Preferences (Discreet Mode + Local Cache Status).
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../../platform/i18n/LanguageContext';
import { SettingsView, type SettingsViewProps } from '../SettingsView';

function buildProps(overrides: Partial<SettingsViewProps> = {}): SettingsViewProps {
  return {
    supabaseConfigured: true,
    signedInEmail: null,
    isPro: false,
    isGooglePaired: false,
    identitiesLoading: false,
    discreetMode: false,
    hasPassphraseLock: false,
    localPinCount: 0,
    authRedirectError: null,
    onBack: vi.fn(),
    onGoogleSignIn: vi.fn().mockResolvedValue(undefined),
    onSendMagicLink: vi.fn().mockResolvedValue(undefined),
    onLinkGoogle: vi.fn().mockResolvedValue(undefined),
    onSignOut: vi.fn().mockResolvedValue(undefined),
    onUpgradeToPro: vi.fn().mockResolvedValue(undefined),
    onOpenBillingPortal: vi.fn().mockResolvedValue(undefined),
    onToggleDiscreet: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('SettingsView', () => {
  it('renders full-page header with Back button and handles Google OAuth errors when signed out', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onGoogleSignIn = vi.fn().mockRejectedValueOnce(new Error('OAuth popup blocked'));

    render(<SettingsView {...buildProps({ onBack, onGoogleSignIn })} />);

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(onGoogleSignIn).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent('OAuth popup blocked');
  });

  it('validates Magic Link email and shows loading, confirmation, and error states', async () => {
    const user = userEvent.setup();
    let resolveMagic!: () => void;
    const onSendMagicLink = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMagic = resolve;
        }),
    );

    render(<SettingsView {...buildProps({ onSendMagicLink })} />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitBtn = screen.getByRole('button', { name: 'Send Magic Link' });

    await user.click(submitBtn);
    expect(onSendMagicLink).not.toHaveBeenCalled();
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');

    await user.type(emailInput, 'bad-email');
    await user.click(submitBtn);
    expect(onSendMagicLink).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Error: Enter an email address in the format you@example\.com/i),
    ).toBeInTheDocument();

    await user.clear(emailInput);
    await user.type(emailInput, '  alex@example.com  ');
    await user.click(submitBtn);

    expect(onSendMagicLink).toHaveBeenCalledWith('alex@example.com');
    expect(screen.getByRole('button', { name: 'Sending Magic Link...' })).toBeDisabled();

    resolveMagic();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Check your email for the magic link.',
    );
    expect(screen.getByRole('status')).toHaveTextContent('alex@example.com');
  });

  it('displays Google Connected badge, Pro plan billing portal trigger, and Sign Out when paired', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    const onOpenBillingPortal = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsView
        {...buildProps({
          signedInEmail: 'founder@date-dex.com',
          isPro: true,
          isGooglePaired: true,
          localPinCount: 4,
          onSignOut,
          onOpenBillingPortal,
        })}
      />,
    );

    expect(screen.getByTestId('account-signed-in-email')).toHaveTextContent('founder@date-dex.com');
    expect(screen.getByTestId('google-connected-badge')).toHaveTextContent('Google Connected');
    expect(screen.queryByRole('button', { name: 'Pair Google Account' })).not.toBeInTheDocument();
    expect(screen.getByTestId('account-tier-badge')).toHaveTextContent('Datédex Pro €2.99/mo');
    expect(screen.getByTestId('local-cache-status')).toHaveTextContent('4 entries cached locally');

    await user.click(screen.getByRole('button', { name: 'Manage Billing' }));
    expect(onOpenBillingPortal).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Sign Out' }));
    await waitFor(() => {
      expect(onSignOut).toHaveBeenCalledTimes(1);
    });
  });

  it('displays Pair Google Account action when unpaired, Free Tier upgrade trigger, and Discreet toggle', async () => {
    const user = userEvent.setup();
    const onLinkGoogle = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('This Google account is already linked to another Datédex account.'),
      );
    const onUpgradeToPro = vi.fn().mockResolvedValue(undefined);
    const onToggleDiscreet = vi.fn();

    render(
      <SettingsView
        {...buildProps({
          signedInEmail: 'magic@example.com',
          isPro: false,
          isGooglePaired: false,
          discreetMode: false,
          onLinkGoogle,
          onUpgradeToPro,
          onToggleDiscreet,
        })}
      />,
    );

    expect(screen.getByTestId('account-tier-badge')).toHaveTextContent('Free Tier');
    await user.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));
    expect(onUpgradeToPro).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('switch'));
    expect(onToggleDiscreet).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Pair Google Account' }));
    expect(onLinkGoogle).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Google account is already linked to another Datédex account.',
    );
  });

  it('renders the embedded Vault, Encryption & Sync section when vaultSection is provided', () => {
    render(
      <SettingsView
        {...buildProps({
          vaultSection: <div data-testid="embedded-vault-body">Vault controls ready</div>,
        })}
      />,
    );

    expect(screen.getByTestId('settings-vault-section')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vault, Encryption & Sync' })).toBeInTheDocument();
    expect(screen.getByTestId('embedded-vault-body')).toBeInTheDocument();
  });

  it('pins Plan & Billing first without a collapse toggle and toggles each remaining section independently', async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider initialLocale="en">
        <SettingsView
          {...buildProps({
            vaultSection: <div data-testid="embedded-vault-body">Vault controls ready</div>,
          })}
        />
      </LanguageProvider>,
    );

    const main = screen.getByRole('main');
    const sections = Array.from(main.querySelectorAll(':scope > section'));
    expect(sections.map((el) => el.getAttribute('data-testid'))).toEqual([
      'plan-billing-section',
      'language-section',
      'account-auth-section',
      'connected-accounts-section',
      'privacy-preferences-section',
      'settings-vault-section',
    ]);

    // Plan & Billing is always visible and has NO collapse toggle
    const billingSection = screen.getByTestId('plan-billing-section');
    expect(within(billingSection).queryByRole('button', { name: /Toggle/i })).not.toBeInTheDocument();

    // Every remaining section has an aria-expanded toggle controlling its body independently
    const collapsibleCases = [
      {
        toggleName: 'Toggle Language section',
        bodyTestId: 'language-section-body',
      },
      {
        toggleName: 'Toggle Account & Authentication section',
        bodyTestId: 'account-auth-section-body',
      },
      {
        toggleName: 'Toggle Connected Accounts section',
        bodyTestId: 'connected-accounts-section-body',
      },
      {
        toggleName: 'Toggle Privacy & Preferences section',
        bodyTestId: 'privacy-preferences-section-body',
      },
      {
        toggleName: 'Toggle Vault, Encryption & Sync section',
        bodyTestId: 'settings-vault-section-body',
      },
    ];

    for (const item of collapsibleCases) {
      const toggleBtn = screen.getByRole('button', { name: item.toggleName });
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId(item.bodyTestId)).toBeInTheDocument();

      await user.click(toggleBtn);
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByTestId(item.bodyTestId)).not.toBeInTheDocument();

      await user.click(toggleBtn);
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId(item.bodyTestId)).toBeInTheDocument();
    }
  });

  it('switches UI language from the Language section while preserving brand terms', async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider initialLocale="en">
        <SettingsView
          {...buildProps({
            vaultSection: <div data-testid="embedded-vault-body">Vault controls ready</div>,
          })}
        />
      </LanguageProvider>,
    );

    // Switch to Italian
    await user.click(screen.getByTestId('language-option-it'));
    expect(screen.getByRole('heading', { name: 'Impostazioni' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Piano e Fatturazione' })).toBeInTheDocument();
    expect(screen.getByText(/Datédex Pro/)).toBeInTheDocument();
    expect(screen.getByText(/Rizz AI/)).toBeInTheDocument();
    expect(screen.getByText('Modalità Discreet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vault, Crittografia e Sincronizzazione' })).toBeInTheDocument();

    // Switch to Spanish
    await user.click(screen.getByTestId('language-option-es'));
    expect(screen.getByRole('heading', { name: 'Ajustes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plan y Facturación' })).toBeInTheDocument();
    expect(screen.getByText('Modo Discreet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vault, Cifrado y Sincronización' })).toBeInTheDocument();
  });
});
