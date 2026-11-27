/**
 * @module features/vault/SettingsView
 * Full-viewport dark-mode Settings view organized into five responsive cards:
 * Account & Authentication, Connected Accounts (Google identity pairing),
 * Plan & Billing, Privacy & Preferences, and Vault, Encryption & Sync.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  CloudOff,
  CreditCard,
  Crown,
  Database,
  Link2,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Shield,
  ShieldOff,
  Sparkles,
  UserCheck,
} from 'lucide-react';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Props for `SettingsView`.
 */
export interface SettingsViewProps {
  supabaseConfigured: boolean;
  signedInEmail: string | null;
  isPro: boolean;
  isGooglePaired: boolean;
  identitiesLoading?: boolean;
  discreetMode: boolean;
  hasPassphraseLock: boolean;
  localPinCount: number;
  authRedirectError?: string | null;
  vaultSection?: ReactNode;
  onBack: () => void;
  onGoogleSignIn: () => Promise<void>;
  onSendMagicLink: (email: string) => Promise<void>;
  onLinkGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onUpgradeToPro: () => Promise<void>;
  onOpenBillingPortal: () => Promise<void>;
  onToggleDiscreet: () => void;
}

/**
 * Renders the full-viewport Datédex Settings screen with a sticky Back header
 * and four structured dark-mode settings cards.
 * @param {SettingsViewProps} props - Auth, pairing, billing, privacy state, and callbacks.
 * @returns {React.JSX.Element} Full-page Settings view.
 */
export function SettingsView({
  supabaseConfigured,
  signedInEmail,
  isPro,
  isGooglePaired,
  identitiesLoading = false,
  discreetMode,
  hasPassphraseLock,
  localPinCount,
  authRedirectError = null,
  vaultSection,
  onBack,
  onGoogleSignIn,
  onSendMagicLink,
  onLinkGoogle,
  onSignOut,
  onUpgradeToPro,
  onOpenBillingPortal,
  onToggleDiscreet,
}: SettingsViewProps): React.JSX.Element {
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [magicLinkSentTo, setMagicLinkSentTo] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(authRedirectError);
  const [linkingError, setLinkingError] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    'google' | 'magic' | 'link' | 'signout' | 'billing' | null
  >(null);

  useEffect(() => {
    setAuthError(authRedirectError ?? null);
    setLinkingError(null);
    setBillingError(null);
    setMagicLinkSentTo(null);
    setEmailError(null);
    setEmailTouched(false);
    setBusyAction(null);
  }, [signedInEmail, authRedirectError]);

  const validateEmail = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'Error: Please enter your email address.';
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      return 'Error: Enter an email address in the format you@example.com.';
    }
    return null;
  };

  const handleGoogleClick = async (): Promise<void> => {
    setAuthError(null);
    setMagicLinkSentTo(null);
    setBusyAction('google');
    try {
      await onGoogleSignIn();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleMagicLinkSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setAuthError(null);
    setMagicLinkSentTo(null);
    setEmailTouched(true);

    const validationMessage = validateEmail(email);
    if (validationMessage) {
      setEmailError(validationMessage);
      emailInputRef.current?.focus();
      return;
    }

    const cleanEmail = email.trim();
    setEmailError(null);
    setBusyAction('magic');
    try {
      await onSendMagicLink(cleanEmail);
      setMagicLinkSentTo(cleanEmail);
      setEmail('');
      setEmailTouched(false);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to send magic link.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleLinkGoogleClick = async (): Promise<void> => {
    setLinkingError(null);
    setBusyAction('link');
    try {
      await onLinkGoogle();
    } catch (err) {
      setLinkingError(err instanceof Error ? err.message : 'Unable to pair Google account.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSignOutClick = async (): Promise<void> => {
    setAuthError(null);
    setBusyAction('signout');
    try {
      await onSignOut();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign out failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleBillingAction = async (): Promise<void> => {
    setBillingError(null);
    setBusyAction('billing');
    try {
      if (isPro) {
        await onOpenBillingPortal();
      } else {
        await onUpgradeToPro();
      }
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : 'Unable to open billing session.');
    } finally {
      setBusyAction(null);
    }
  };

  const showEmailError = Boolean(emailTouched && emailError);
  const isBusy = busyAction !== null;

  return (
    <div
      data-testid="settings-page"
      className="min-h-dvh bg-[#0b0d14] text-slate-100"
    >
      {/* Sticky Full-Page Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0d14]/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to previous view"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/15 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </button>

          <h1 className="text-base font-bold tracking-tight text-white">Settings</h1>

          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              signedInEmail
                ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30'
                : 'bg-white/10 text-slate-300'
            }`}
          >
            {signedInEmail ? 'Signed In' : 'Signed Out'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-14">
        {/* 1. Account & Authentication Card */}
        <section
          aria-labelledby="settings-account-heading"
          data-testid="account-auth-section"
          className="space-y-4 rounded-2xl border border-white/10 bg-[#121622] p-5"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <UserCheck className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="settings-account-heading" className="text-sm font-bold text-white">
                Account &amp; Authentication
              </h2>
              <p className="text-xs text-slate-400">
                Passwordless sign-in via Google OAuth or Email Magic Link — zero passwords stored.
              </p>
            </div>
          </div>

          {signedInEmail ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[11px] font-semibold tracking-wide text-emerald-300 uppercase">
                    Active Account
                  </p>
                  <p
                    data-testid="account-signed-in-email"
                    className="truncate text-sm font-semibold text-white"
                  >
                    {signedInEmail}
                  </p>
                  <p className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                    <Cloud className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                    Encrypted Cloud Sync enabled
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleSignOutClick()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50"
                >
                  {busyAction === 'signout' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {busyAction === 'signout' ? 'Signing out...' : 'Sign Out'}
                </button>
              </div>

              {authError && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200"
                >
                  {authError}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {!supabaseConfigured && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                  <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                  <p>
                    Cloud authentication is not configured in this build. You can continue using
                    Datédex 100% offline with local AES-GCM encryption.
                  </p>
                </div>
              )}

              <button
                type="button"
                disabled={!supabaseConfigured || isBusy}
                onClick={() => void handleGoogleClick()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyAction === 'google' && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                )}
                {busyAction === 'google' ? 'Redirecting to Google...' : 'Continue with Google'}
              </button>

              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
                <span>or sign in with email</span>
                <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
              </div>

              <form
                noValidate
                onSubmit={(event) => void handleMagicLinkSubmit(event)}
                className="space-y-3"
              >
                <div className="space-y-1">
                  <label
                    htmlFor="settings-magic-email"
                    className="block text-xs font-medium text-slate-200"
                  >
                    Email Address
                  </label>
                  {/* Format hint placed above the input so autofill popovers do not obscure it */}
                  <span id="settings-email-hint" className="block text-[11px] text-slate-400">
                    We will send a one-time magic link (format: you@example.com).
                  </span>
                  <input
                    ref={emailInputRef}
                    id="settings-magic-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    spellCheck={false}
                    enterKeyHint="done"
                    disabled={!supabaseConfigured || isBusy}
                    value={email}
                    aria-invalid={showEmailError ? 'true' : 'false'}
                    aria-describedby={
                      showEmailError
                        ? 'settings-email-hint settings-email-error'
                        : 'settings-email-hint'
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setEmail(nextValue);
                      if (emailTouched) {
                        setEmailError(validateEmail(nextValue));
                      }
                    }}
                    onBlur={() => {
                      if (email.trim().length > 0) {
                        setEmailTouched(true);
                        setEmailError(validateEmail(email));
                      }
                    }}
                    placeholder="you@example.com"
                    className={`dd-input text-xs ${showEmailError ? 'user-invalid-fallback' : ''}`}
                  />
                  {showEmailError && (
                    <p id="settings-email-error" className="mt-1 text-xs text-rose-300">
                      {emailError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!supabaseConfigured || isBusy}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyAction === 'magic' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {busyAction === 'magic' ? 'Sending Magic Link...' : 'Send Magic Link'}
                </button>
              </form>

              {magicLinkSentTo && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-2.5 text-xs text-emerald-200"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                    aria-hidden="true"
                  />
                  <p>
                    <strong>Check your email for the magic link.</strong> We sent a one-time sign-in
                    link to <span className="font-semibold">{magicLinkSentTo}</span>.
                  </p>
                </div>
              )}

              {authError && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200"
                >
                  {authError}
                </p>
              )}
            </div>
          )}
        </section>

        {/* 2. Connected Accounts Card */}
        <section
          aria-labelledby="settings-connected-heading"
          data-testid="connected-accounts-section"
          className="space-y-3 rounded-2xl border border-white/10 bg-[#121622] p-5"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="settings-connected-heading" className="text-sm font-bold text-white">
                Connected Accounts
              </h2>
              <p className="text-xs text-slate-400">
                Link sign-in providers to access your Datédex with one tap.
              </p>
            </div>
          </div>

          {signedInEmail ? (
            <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-white">Google</p>
                  <p className="text-[11px] text-slate-400">
                    {isGooglePaired
                      ? 'Paired with your Datédex account for one-tap Google sign-in.'
                      : 'Pair Google so you can sign in with either Magic Link or Google.'}
                  </p>
                </div>

                {identitiesLoading ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Checking...
                  </span>
                ) : isGooglePaired ? (
                  <span
                    data-testid="google-connected-badge"
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30"
                  >
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    Google Connected
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!supabaseConfigured || isBusy || identitiesLoading}
                    onClick={() => void handleLinkGoogleClick()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyAction === 'link' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {busyAction === 'link' ? 'Connecting Google...' : 'Pair Google Account'}
                  </button>
                )}
              </div>

              {linkingError && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200"
                >
                  {linkingError}
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-white/10 bg-slate-900/50 p-3.5 text-xs text-slate-400">
              Sign in above to view your connected sign-in methods or pair a Google account.
            </p>
          )}
        </section>

        {/* 3. Plan & Billing Card */}
        <section
          aria-labelledby="settings-billing-heading"
          data-testid="plan-billing-section"
          className="space-y-3 rounded-2xl border border-white/10 bg-[#121622] p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                <Crown className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2 id="settings-billing-heading" className="text-sm font-bold text-white">
                  Plan &amp; Billing
                </h2>
                <p className="text-xs text-slate-400">
                  Manage your subscription tier and Stripe billing portal.
                </p>
              </div>
            </div>

            <span
              data-testid="account-tier-badge"
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${
                isPro
                  ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/30'
                  : 'bg-white/10 text-slate-200'
              }`}
            >
              {isPro && <Crown className="h-3 w-3" aria-hidden="true" />}
              {isPro ? 'Datédex Pro €2.99/mo' : 'Free Tier'}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
            <p className="max-w-md text-xs text-slate-300">
              {isPro
                ? 'Active Datédex Pro subscription (€2.99/mo) — AI Rizz Coach and ad-free browsing unlocked.'
                : 'Upgrade to Datédex Pro (€2.99/mo) to unlock the AI Rizz Coach and an ad-free experience.'}
            </p>

            {signedInEmail ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleBillingAction()}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                  isPro
                    ? 'border border-white/15 bg-white/10 text-white hover:bg-white/15'
                    : 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-lg shadow-rose-500/20 hover:brightness-110'
                }`}
              >
                {busyAction === 'billing' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : isPro ? (
                  <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {busyAction === 'billing'
                  ? 'Opening Stripe...'
                  : isPro
                    ? 'Manage Billing'
                    : 'Upgrade to Pro'}
              </button>
            ) : (
              <span className="text-[11px] font-medium text-amber-300">
                Sign in above to upgrade
              </span>
            )}
          </div>

          {billingError && (
            <p
              role="alert"
              className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200"
            >
              {billingError}
            </p>
          )}
        </section>

        {/* 4. Privacy & Preferences Card */}
        <section
          aria-labelledby="settings-privacy-heading"
          data-testid="privacy-preferences-section"
          className="space-y-3 rounded-2xl border border-white/10 bg-[#121622] p-5"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Shield className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="settings-privacy-heading" className="text-sm font-bold text-white">
                Privacy &amp; Preferences
              </h2>
              <p className="text-xs text-slate-400">
                Public-safe masking and local encrypted storage overview.
              </p>
            </div>
          </div>

          <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-slate-900/60">
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-white">Discreet Mode</p>
                <p className="text-[11px] text-slate-400">
                  Hides map stats and pin names, and masks sensitive details in public
                  {hasPassphraseLock ? ' (Vault passphrase protected).' : '.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={discreetMode}
                onClick={onToggleDiscreet}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  discreetMode
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40'
                    : 'bg-white/10 text-slate-200 hover:bg-white/15'
                }`}
              >
                {discreetMode ? (
                  <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {discreetMode ? 'On' : 'Off'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-2.5">
                <Database
                  className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-white">Local Cache Status</p>
                  <p data-testid="local-cache-status" className="text-[11px] text-slate-400">
                    {localPinCount === 0
                      ? '0 entries cached locally in encrypted IndexedDB'
                      : `${localPinCount} ${localPinCount === 1 ? 'entry' : 'entries'} cached locally in AES-256-GCM IndexedDB`}
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
                {signedInEmail ? 'Synced' : 'Local Only'}
              </span>
            </div>
          </div>
        </section>

        {/* 5. Vault, Encryption & Cloud Sync Card */}
        {vaultSection && (
          <section
            aria-labelledby="settings-vault-heading"
            data-testid="settings-vault-section"
            className="space-y-4 rounded-2xl border border-white/10 bg-[#121622] p-5"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <Lock className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2 id="settings-vault-heading" className="text-sm font-bold text-white">
                  Vault, Encryption &amp; Sync
                </h2>
                <p className="text-xs text-slate-400">
                  Local passphrase lock, encrypted JSON backup/restore, and cloud pin sync.
                </p>
              </div>
            </div>
            {vaultSection}
          </section>
        )}
      </main>
    </div>
  );
}
