/**
 * @module features/onboarding/OnboardingFlow
 * 4-step identity onboarding experience ("Welcome to Datédex — Your private, encrypted
 * romantic passport") with local-first privacy pledge, optional Vault passphrase,
 * and passwordless Google OAuth / Email Magic Link sign-in.
 */
import { useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Compass,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { COUNTRIES } from '../../domain/countries/countries';
import { OnboardingInputSchema, type OnboardingInput } from '../../domain/models/profile';

/**
 * Props for `OnboardingFlow`.
 */
export interface OnboardingFlowProps {
  supabaseConfigured: boolean;
  onComplete: (input: OnboardingInput) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  onSendMagicLink: (email: string) => Promise<void>;
  onOpenSignIn?: () => void;
}

/**
 * Renders the 4-step Datédex onboarding wizard.
 * @param {OnboardingFlowProps} props - Component callbacks and cloud availability state.
 * @returns {React.JSX.Element} 4-step onboarding UI.
 */
export function OnboardingFlow({
  supabaseConfigured,
  onComplete,
  onGoogleSignIn,
  onSendMagicLink,
  onOpenSignIn,
}: OnboardingFlowProps): React.JSX.Element {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [displayName, setDisplayName] = useState('');
  const [homeCountry, setHomeCountry] = useState('US');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [vaultPassphrase, setVaultPassphrase] = useState('');
  const [magicEmail, setMagicEmail] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFinish = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    setErrorMsg(null);
    const parsed = OnboardingInputSchema.safeParse({
      displayName: displayName.trim() || 'Explorer',
      homeCountry,
      privacyPledgeAccepted: privacyAccepted,
      vaultPassphrase: vaultPassphrase.trim() || undefined,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? 'Complete all required onboarding fields');
      return;
    }

    setBusy(true);
    try {
      await onComplete(parsed.data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save onboarding profile');
    } finally {
      setBusy(false);
    }
  };

  const handleMagicLink = async (): Promise<void> => {
    setErrorMsg(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      await onSendMagicLink(magicEmail);
      setStatusMsg('Magic Link sent! Check your inbox, or continue offline now.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send Magic Link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-5 py-8">
      <div className="space-y-6">
        <header className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Step {step} of 4
            </span>
            <div className="flex gap-1.5" aria-label="Onboarding progress">
              {[1, 2, 3, 4].map((idx) => (
                <span
                  key={idx}
                  className={`h-1.5 w-7 rounded-full transition-colors ${
                    idx <= step ? 'bg-rose-500' : 'bg-slate-800'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Welcome to Datédex
              </h1>
              <p className="text-sm text-slate-300">
                Your private, encrypted romantic passport — Track Your Dating Journey.
              </p>
            </div>
            {supabaseConfigured && onOpenSignIn && (
              <button
                type="button"
                onClick={onOpenSignIn}
                className="shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
              >
                Sign In
              </button>
            )}
          </div>
        </header>

        {step === 1 && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-[#121622] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
                <Compass className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Identity Setup</h2>
                <p className="text-xs text-slate-400">Stored on your device first.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="onboard-name" className="block text-xs font-medium text-slate-200">
                Passport Nickname
              </label>
              <span id="onboard-name-hint" className="block text-xs text-slate-400">
                Shown in your local Pokédex header (e.g. Alex).
              </span>
              <input
                id="onboard-name"
                type="text"
                required
                minLength={1}
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex"
                aria-describedby="onboard-name-hint"
                className="dd-input"
              />
              <span className="dd-error-msg">Enter a nickname to personalize your passport.</span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="onboard-country" className="block text-xs font-medium text-slate-200">
                Home Base Country
              </label>
              <select
                id="onboard-country"
                value={homeCountry}
                onChange={(e) => setHomeCountry(e.target.value)}
                className="dd-input"
              >
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {country.name}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-[#121622] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Zero-Knowledge Privacy Pledge</h2>
                <p className="text-xs text-slate-400">Local-first IndexedDB + Web Crypto AES-GCM.</p>
              </div>
            </div>

            <ul className="space-y-2.5 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>
                  Sensitive notes, intimacy logs, and Vault entries are encrypted in your browser via
                  AES-256-GCM before storage.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>
                  Uploaded photos are resized and stripped of EXIF GPS coordinates locally before saving.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>
                  Works 100% offline with zero account required. Export an encrypted JSON backup anytime.
                </span>
              </li>
            </ul>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-3 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                className="dd-checkbox mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                I understand that without cloud sync, browser storage clear/uninstall deletes local
                data unless I export an Encrypted JSON Backup.
              </span>
            </label>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-[#121622] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                <Lock className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Vault & Discreet Protection</h2>
                <p className="text-xs text-slate-400">Optional local passphrase lock.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Toggle <strong>Vault / Discreet Mode</strong> anytime from the top bar to instantly mask
              names, photos, intimacy metrics, and ad slots in public.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="onboard-passphrase" className="block text-xs font-medium text-slate-200">
                Optional Vault Passphrase (min 4 chars)
              </label>
              <span id="onboard-pass-hint" className="block text-xs text-slate-400">
                Leave blank if you prefer one-tap discreet masking without a lock prompt.
              </span>
              <input
                id="onboard-passphrase"
                type="password"
                minLength={4}
                maxLength={128}
                value={vaultPassphrase}
                onChange={(e) => setVaultPassphrase(e.target.value)}
                placeholder="Optional local Vault PIN/passphrase"
                aria-describedby="onboard-pass-hint"
                className="dd-input"
              />
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-[#121622] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
                <UserCheck className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Local-First or Encrypted Cloud Sync</h2>
                <p className="text-xs text-slate-400">Passwordless auth only — zero passwords stored.</p>
              </div>
            </div>

            {supabaseConfigured ? (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setErrorMsg(null);
                    void onGoogleSignIn().catch((e: unknown) =>
                      setErrorMsg(e instanceof Error ? e.message : 'Google OAuth failed'),
                    );
                  }}
                  className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/15"
                >
                  Continue with Google OAuth
                </button>

                <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
                  <label htmlFor="onboard-magic-email" className="block text-xs font-medium text-slate-200">
                    Or Email Magic Link (OTP)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="onboard-magic-email"
                      type="email"
                      value={magicEmail}
                      onChange={(e) => setMagicEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="dd-input flex-1"
                    />
                    <button
                      type="button"
                      disabled={busy || !magicEmail.includes('@')}
                      onClick={() => void handleMagicLink()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                      Send Link
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                Cloud sync environment keys are optional. You can launch 100% offline right now and
                export Encrypted JSON Backups anytime.
              </p>
            )}

            {statusMsg && (
              <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                {statusMsg}
              </p>
            )}
          </section>
        )}

        {errorMsg && (
          <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}
      </div>

      <footer className="mt-6 flex items-center justify-between gap-3">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
            }}
            className="rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/5"
          >
            Back
          </button>
        ) : (
          <div />
        )}

        {step < 4 ? (
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              if (step === 1 && !displayName.trim()) {
                setDisplayName('Explorer');
              }
              if (step === 2 && !privacyAccepted) {
                setErrorMsg('Please accept the privacy pledge to continue.');
                return;
              }
              setStep((prev) => (prev + 1) as 1 | 2 | 3 | 4);
            }}
            className="flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:brightness-110"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleFinish()}
            className="flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? 'Encrypting Vault...' : 'Start Offline Passport'}
          </button>
        )}
      </footer>
    </main>
  );
}
