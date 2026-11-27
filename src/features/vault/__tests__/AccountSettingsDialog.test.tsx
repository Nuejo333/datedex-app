/**
 * @module features/vault/__tests__/AccountSettingsDialog.test
 * Unit tests for AccountSettingsDialog covering Google OAuth, Email Magic Link
 * validation/loading/confirmation/error states, unconfigured offline fallback,
 * signed-in account metadata, and Sign Out behavior.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountSettingsDialog } from '../AccountSettingsDialog';

afterEach(() => {
  cleanup();
});

describe('AccountSettingsDialog', () => {
  it('invokes Google OAuth handler and displays errors when OAuth fails', async () => {
    const user = userEvent.setup();
    const onGoogleSignIn = vi.fn().mockRejectedValueOnce(new Error('OAuth popup blocked'));

    render(
      <AccountSettingsDialog
        open={true}
        onClose={vi.fn()}
        supabaseConfigured={true}
        signedInEmail={null}
        isPro={false}
        onGoogleSignIn={onGoogleSignIn}
        onSendMagicLink={vi.fn().mockResolvedValue(undefined)}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(onGoogleSignIn).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent('OAuth popup blocked');
  });

  it('validates email input and sends a Magic Link with loading and confirmation states', async () => {
    const user = userEvent.setup();
    let resolveMagic!: () => void;
    const onSendMagicLink = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMagic = resolve;
        }),
    );

    render(
      <AccountSettingsDialog
        open={true}
        onClose={vi.fn()}
        supabaseConfigured={true}
        signedInEmail={null}
        isPro={false}
        onGoogleSignIn={vi.fn().mockResolvedValue(undefined)}
        onSendMagicLink={onSendMagicLink}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const emailInput = screen.getByLabelText('Email Address');
    const submitBtn = screen.getByRole('button', { name: 'Send Magic Link' });

    // Submit empty -> validation error, handler not called
    await user.click(submitBtn);
    expect(onSendMagicLink).not.toHaveBeenCalled();
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Please enter your email address/i)).toBeInTheDocument();

    // Enter malformed email -> format error
    await user.type(emailInput, 'not-an-email');
    await user.click(submitBtn);
    expect(onSendMagicLink).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Error: Enter an email address in the format you@example\.com/i),
    ).toBeInTheDocument();

    // Enter valid email -> triggers loading then confirmation message
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

  it('displays an error alert when sending a Magic Link fails', async () => {
    const user = userEvent.setup();
    const onSendMagicLink = vi.fn().mockRejectedValueOnce(new Error('Email rate limit exceeded'));

    render(
      <AccountSettingsDialog
        open={true}
        onClose={vi.fn()}
        supabaseConfigured={true}
        signedInEmail={null}
        isPro={false}
        onGoogleSignIn={vi.fn().mockResolvedValue(undefined)}
        onSendMagicLink={onSendMagicLink}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.type(screen.getByLabelText('Email Address'), 'alex@example.com');
    await user.click(screen.getByRole('button', { name: 'Send Magic Link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email rate limit exceeded');
  });

  it('disables cloud sign-in actions cleanly when Supabase is not configured', () => {
    render(
      <AccountSettingsDialog
        open={true}
        onClose={vi.fn()}
        supabaseConfigured={false}
        signedInEmail={null}
        isPro={false}
        onGoogleSignIn={vi.fn().mockResolvedValue(undefined)}
        onSendMagicLink={vi.fn().mockResolvedValue(undefined)}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText(/Cloud authentication is not configured/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send Magic Link' })).toBeDisabled();
  });

  it('displays signed-in user email, tier badge, sync status, and closes modal on Sign Out', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <AccountSettingsDialog
        open={true}
        onClose={onClose}
        supabaseConfigured={true}
        signedInEmail="founder@date-dex.com"
        isPro={true}
        onGoogleSignIn={vi.fn().mockResolvedValue(undefined)}
        onSendMagicLink={vi.fn().mockResolvedValue(undefined)}
        onSignOut={onSignOut}
      />,
    );

    expect(screen.getByTestId('account-signed-in-email')).toHaveTextContent('founder@date-dex.com');
    expect(screen.getByTestId('account-tier-badge')).toHaveTextContent('Pro');
    expect(screen.getByText(/Encrypted Cloud Sync active/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign Out' }));

    await waitFor(() => {
      expect(onSignOut).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
