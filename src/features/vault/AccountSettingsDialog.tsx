/**
 * @module features/vault/AccountSettingsDialog
 * Accessible native `<dialog>` modal for Account & Settings allowing passwordless
 * Supabase sign-in (Google OAuth or Email Magic Link OTP) and sign-out while
 * displaying the authenticated user's email, subscription tier, and cloud sync status.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Crown,
  Loader2,
  LogOut,
  Mail,
  Settings,
  X,
} from 'lucide-react';
import { useNativeModalDialog } from '../../platform/ui/dialogUtils';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Props for `AccountSettingsDialog`.
 */
export interface AccountSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  supabaseConfigured: boolean;
  signedInEmail: string | null;
  isPro: boolean;
  onGoogleSignIn: () => Promise<void>;
  onSendMagicLink: (email: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

/**
 * Native modal dialog for Account & Settings (Google OAuth, Email Magic Link, Sign Out).
 * @param {AccountSettingsDialogProps} props - Dialog visibility, auth state, and auth handlers.
 * @returns {React.JSX.Element} Account & Settings modal dialog.
 */
export function AccountSettingsDialog({
  open,
  onClose,
  supabaseConfigured,
  signedInEmail,
  isPro,
  onGoogleSignIn,
  onSendMagicLink,
  onSignOut,
}: AccountSettingsDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  useNativeModalDialog(dialogRef, open, onClose, true);

  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [magicLinkSentTo, setMagicLinkSentTo] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'google' | 'magic' | 'signout' | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setEmailError(null);
    setEmailTouched(false);
    setMagicLinkSentTo(null);
    setBusyAction(null);
  }, [open, signedInEmail]);

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
    setErrorMsg(null);
    setMagicLinkSentTo(null);
    setBusyAction('google');
    try {
      await onGoogleSignIn();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleMagicLinkSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMsg(null);
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
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send magic link.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSignOutClick = async (): Promise<void> => {
    setErrorMsg(null);
    setBusyAction('signout');
    try {
      await onSignOut();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign out failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const showEmailError = Boolean(emailTouched && emailError);
  const isBusy = busyAction !== null;

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="account-settings-title"
      className="dd-dialog"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h1
          id="account-settings-title"
          className="inline-flex items-center gap-2 text-base font-bold text-white"
        >
          <Settings className="h-4 w-4 text-rose-400" aria-hidden="true" />
          Account &amp; Settings
        </h1>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close account settings"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-4 overflow-y-auto px-5 py-4">
        {signedInEmail ? (
          <div className="space-y-4">
            <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[11px] font-medium tracking-wide text-emerald-300 uppercase">
                    Signed In
                  </p>
                  <p
                    data-testid="account-signed-in-email"
                    className="truncate text-sm font-semibold text-white"
                  >
                    {signedInEmail}
                  </p>
                </div>

                <span
                  data-testid="account-tier-badge"
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${
                    isPro
                      ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/30'
                      : 'bg-white/10 text-slate-200'
                  }`}
                >
                  {isPro && <Crown className="h-3 w-3" aria-hidden="true" />}
                  {isPro ? 'Pro' : 'Free Tier'}
                </span>
              </div>

              <div className="flex items-center gap-2 border-t border-white/10 pt-2.5 text-xs text-slate-200">
                <Cloud className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden="true" />
                <span>Encrypted Cloud Sync active across devices</span>
              </div>
            </div>

            {errorMsg && (
              <p
                role="alert"
                className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200"
              >
                {errorMsg}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                disabled={isBusy}
                className="rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
              >
                Close
              </button>
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
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Sign in to sync your encrypted Datédex across devices or unlock Pro features.
              Passwordless authentication only — zero passwords stored.
            </p>

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
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <p>
                  <strong>Check your email for the magic link.</strong> We sent a one-time sign-in
                  link to <span className="font-semibold">{magicLinkSentTo}</span>.
                </p>
              </div>
            )}

            {errorMsg && (
              <p
                role="alert"
                className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200"
              >
                {errorMsg}
              </p>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
