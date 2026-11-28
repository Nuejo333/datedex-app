/**
 * @module features/vault/SettingsView
 * Full-viewport dark-mode Settings view with Plan & Billing pinned permanently
 * at the top (non-collapsible), followed by independently collapsible cards for
 * Language, Account & Authentication, Connected Accounts, Privacy & Preferences,
 * and Vault, Encryption & Sync.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Cloud,
  CloudOff,
  CreditCard,
  Crown,
  Database,
  Globe,
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
import { useTranslation } from '../../platform/i18n/LanguageContext';
import { SUPPORTED_LOCALES } from '../../platform/i18n/translations';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CollapsibleSectionKey = 'language' | 'account' | 'connected' | 'privacy' | 'vault';

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

interface CollapsibleCardHeaderProps {
  headingId: string;
  panelId: string;
  icon: ReactNode;
  iconBgClass: string;
  title: string;
  subtitle: string;
  expanded: boolean;
  toggleAriaLabel: string;
  onToggle: () => void;
}

function CollapsibleCardHeader({
  headingId,
  panelId,
  icon,
  iconBgClass,
  title,
  subtitle,
  expanded,
  toggleAriaLabel,
  onToggle,
}: CollapsibleCardHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBgClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-bold text-white">
            {title}
          </h2>
          <p className="text-xs text-neutral-400">{subtitle}</p>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={toggleAriaLabel}
        onClick={onToggle}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-[#111111] text-neutral-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

/**
 * Renders the full-viewport Datédex Settings screen with Plan & Billing pinned
 * permanently at the top and collapsible cards for all remaining sections.
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
  const { locale, setLocale, t } = useTranslation();
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [expandedSections, setExpandedSections] = useState<Record<CollapsibleSectionKey, boolean>>({
    language: true,
    account: true,
    connected: true,
    privacy: true,
    vault: true,
  });

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

  const toggleSection = (key: CollapsibleSectionKey): void => {
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const validateEmail = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return t('settings.account.emailRequired');
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      return t('settings.account.emailInvalid');
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
      setAuthError(err instanceof Error ? err.message : t('settings.account.googleError'));
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
      setAuthError(err instanceof Error ? err.message : t('settings.account.magicError'));
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
      setLinkingError(err instanceof Error ? err.message : t('settings.connected.linkError'));
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
      setAuthError(err instanceof Error ? err.message : t('settings.account.signOutError'));
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
      setBillingError(err instanceof Error ? err.message : t('settings.billing.error'));
    } finally {
      setBusyAction(null);
    }
  };

  const showEmailError = Boolean(emailTouched && emailError);
  const isBusy = busyAction !== null;

  const localCacheText =
    localPinCount === 0
      ? t('settings.privacy.cacheEmpty')
      : localPinCount === 1
        ? t('settings.privacy.cacheSingle')
        : t('settings.privacy.cachePlural', { count: localPinCount });

  return (
    <div data-testid="settings-page" className="min-h-dvh bg-black text-white">
      {/* Sticky Full-Page Header */}
      <header className="sticky top-0 z-30 border-b border-white/15 bg-black/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.backAria')}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#111111] px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t('common.back')}
          </button>

          <h1 className="text-base font-bold tracking-tight text-white">{t('settings.title')}</h1>

          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              signedInEmail
                ? 'bg-white text-black'
                : 'border border-white/15 bg-[#111111] text-neutral-300'
            }`}
          >
            {signedInEmail ? t('settings.signedIn') : t('settings.signedOut')}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-14">
        {/* 1. Plan & Billing Card (Pinned permanently at the top — non-collapsible) */}
        <section
          aria-labelledby="settings-billing-heading"
          data-testid="plan-billing-section"
          className="space-y-3 rounded-2xl border border-red-500/35 bg-[#080808] p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-600/15 text-red-400">
                <Crown className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2 id="settings-billing-heading" className="text-sm font-bold text-white">
                  {t('settings.billing.title')}
                </h2>
                <p className="text-xs text-neutral-400">{t('settings.billing.subtitle')}</p>
              </div>
            </div>

            <span
              data-testid="account-tier-badge"
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${
                isPro
                  ? 'border border-red-500/40 bg-red-600/20 text-red-300'
                  : 'border border-white/15 bg-[#111111] text-neutral-200'
              }`}
            >
              {isPro && <Crown className="h-3 w-3" aria-hidden="true" />}
              {isPro ? t('settings.billing.tierPro') : t('settings.billing.tierFree')}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-[#111111] p-4">
            <p className="max-w-md text-xs text-neutral-300">
              {isPro ? t('settings.billing.proCopy') : t('settings.billing.freeCopy')}
            </p>

            {signedInEmail ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleBillingAction()}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                  isPro
                    ? 'border border-white/20 bg-white/10 text-white hover:bg-white/15'
                    : 'bg-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-500'
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
                  ? t('settings.billing.openingStripe')
                  : isPro
                    ? t('settings.billing.manage')
                    : t('settings.billing.upgrade')}
              </button>
            ) : (
              <span className="text-[11px] font-medium text-red-400">
                {t('settings.billing.signInPrompt')}
              </span>
            )}
          </div>

          {billingError && (
            <p
              role="alert"
              className="rounded-xl border border-red-500/50 bg-red-950/50 px-3.5 py-2.5 text-xs text-red-200"
            >
              {billingError}
            </p>
          )}
        </section>

        {/* 2. Language Card (Collapsible) */}
        <section
          aria-labelledby="settings-language-heading"
          data-testid="language-section"
          className="space-y-4 rounded-2xl border border-white/15 bg-[#080808] p-5"
        >
          <CollapsibleCardHeader
            headingId="settings-language-heading"
            panelId="settings-language-panel"
            icon={<Globe className="h-4 w-4" aria-hidden="true" />}
            iconBgClass="border border-white/15 bg-[#111111] text-white"
            title={t('settings.language.title')}
            subtitle={t('settings.language.subtitle')}
            expanded={expandedSections.language}
            toggleAriaLabel={t('settings.toggleSectionAria', {
              section: t('settings.language.title'),
            })}
            onToggle={() => toggleSection('language')}
          />

          {expandedSections.language && (
            <div
              id="settings-language-panel"
              data-testid="language-section-body"
              role="radiogroup"
              aria-label={t('settings.language.groupAria')}
              className="grid grid-cols-3 gap-2"
            >
              {SUPPORTED_LOCALES.map((option) => {
                const selected = locale === option.code;
                return (
                  <button
                    key={option.code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`language-option-${option.code}`}
                    onClick={() => setLocale(option.code)}
                    className={`flex flex-col items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                      selected
                        ? 'border-red-500/60 bg-red-600/20 text-white ring-1 ring-red-500/40'
                        : 'border-white/15 bg-[#111111] text-neutral-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>{option.nativeLabel}</span>
                    <span className="mt-0.5 text-[10px] font-medium text-neutral-400 uppercase">
                      {option.code}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* 3. Account & Authentication Card (Collapsible) */}
        <section
          aria-labelledby="settings-account-heading"
          data-testid="account-auth-section"
          className="space-y-4 rounded-2xl border border-white/15 bg-[#080808] p-5"
        >
          <CollapsibleCardHeader
            headingId="settings-account-heading"
            panelId="settings-account-panel"
            icon={<UserCheck className="h-4 w-4" aria-hidden="true" />}
            iconBgClass="border border-red-500/30 bg-red-600/15 text-red-400"
            title={t('settings.account.title')}
            subtitle={t('settings.account.subtitle')}
            expanded={expandedSections.account}
            toggleAriaLabel={t('settings.toggleSectionAria', {
              section: t('settings.account.title'),
            })}
            onToggle={() => toggleSection('account')}
          />

          {expandedSections.account && (
            <div id="settings-account-panel" data-testid="account-auth-section-body">
              {signedInEmail ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/25 bg-[#111111] p-4">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[11px] font-semibold tracking-wide text-red-400 uppercase">
                        {t('settings.account.activeAccount')}
                      </p>
                      <p
                        data-testid="account-signed-in-email"
                        className="truncate text-sm font-semibold text-white"
                      >
                        {signedInEmail}
                      </p>
                      <p className="inline-flex items-center gap-1.5 text-xs text-neutral-300">
                        <Cloud className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                        {t('settings.account.cloudSyncEnabled')}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleSignOutClick()}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/50 bg-red-600/15 px-4 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-600/25 disabled:opacity-50"
                    >
                      {busyAction === 'signout' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {busyAction === 'signout'
                        ? t('settings.account.signingOut')
                        : t('settings.account.signOut')}
                    </button>
                  </div>

                  {authError && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-500/50 bg-red-950/50 px-3.5 py-2.5 text-xs text-red-200"
                    >
                      {authError}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {!supabaseConfigured && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-white/20 bg-[#111111] p-3 text-xs text-neutral-200">
                      <CloudOff
                        className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
                        aria-hidden="true"
                      />
                      <p>{t('settings.account.offlineNotice')}</p>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!supabaseConfigured || isBusy}
                    onClick={() => void handleGoogleClick()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white px-4 py-2.5 text-xs font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyAction === 'google' && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    )}
                    {busyAction === 'google'
                      ? t('settings.account.redirectingGoogle')
                      : t('settings.account.continueGoogle')}
                  </button>

                  <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                    <span className="h-px flex-1 bg-white/15" aria-hidden="true" />
                    <span>{t('settings.account.orEmail')}</span>
                    <span className="h-px flex-1 bg-white/15" aria-hidden="true" />
                  </div>

                  <form
                    noValidate
                    onSubmit={(event) => void handleMagicLinkSubmit(event)}
                    className="space-y-3"
                  >
                    <div className="space-y-1">
                      <label
                        htmlFor="settings-magic-email"
                        className="block text-xs font-medium text-neutral-200"
                      >
                        {t('settings.account.emailLabel')}
                      </label>
                      {/* Format hint placed above the input so autofill popovers do not obscure it */}
                      <span id="settings-email-hint" className="block text-[11px] text-neutral-400">
                        {t('settings.account.emailHint')}
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
                        <p id="settings-email-error" className="mt-1 text-xs text-red-400">
                          {emailError}
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={!supabaseConfigured || isBusy}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyAction === 'magic' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {busyAction === 'magic'
                        ? t('settings.account.sendingMagic')
                        : t('settings.account.sendMagic')}
                    </button>
                  </form>

                  {magicLinkSentTo && (
                    <div
                      role="status"
                      className="flex items-start gap-2 rounded-xl border border-white/25 bg-[#111111] px-3.5 py-2.5 text-xs text-white"
                    >
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
                        aria-hidden="true"
                      />
                      <p>
                        <strong>{t('settings.account.magicSentTitle')}</strong>{' '}
                        {t('settings.account.magicSentBody')}{' '}
                        <span className="font-semibold">{magicLinkSentTo}</span>.
                      </p>
                    </div>
                  )}

                  {authError && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-500/50 bg-red-950/50 px-3.5 py-2.5 text-xs text-red-200"
                    >
                      {authError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 4. Connected Accounts Card (Collapsible) */}
        <section
          aria-labelledby="settings-connected-heading"
          data-testid="connected-accounts-section"
          className="space-y-3 rounded-2xl border border-white/15 bg-[#080808] p-5"
        >
          <CollapsibleCardHeader
            headingId="settings-connected-heading"
            panelId="settings-connected-panel"
            icon={<Link2 className="h-4 w-4" aria-hidden="true" />}
            iconBgClass="border border-white/15 bg-[#111111] text-white"
            title={t('settings.connected.title')}
            subtitle={t('settings.connected.subtitle')}
            expanded={expandedSections.connected}
            toggleAriaLabel={t('settings.toggleSectionAria', {
              section: t('settings.connected.title'),
            })}
            onToggle={() => toggleSection('connected')}
          />

          {expandedSections.connected && (
            <div id="settings-connected-panel" data-testid="connected-accounts-section-body">
              {signedInEmail ? (
                <div className="space-y-3 rounded-xl border border-white/15 bg-[#111111] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {t('settings.connected.googleTitle')}
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        {isGooglePaired
                          ? t('settings.connected.googlePairedDesc')
                          : t('settings.connected.googleUnpairedDesc')}
                      </p>
                    </div>

                    {identitiesLoading ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        {t('common.checking')}
                      </span>
                    ) : isGooglePaired ? (
                      <span
                        data-testid="google-connected-badge"
                        className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-black"
                      >
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        {t('settings.connected.googleConnectedBadge')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!supabaseConfigured || isBusy || identitiesLoading}
                        onClick={() => void handleLinkGoogleClick()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyAction === 'link' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {busyAction === 'link'
                          ? t('settings.connected.connectingGoogle')
                          : t('settings.connected.pairGoogleBtn')}
                      </button>
                    )}
                  </div>

                  {linkingError && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-500/50 bg-red-950/50 px-3.5 py-2.5 text-xs text-red-200"
                    >
                      {linkingError}
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-white/15 bg-[#111111] p-3.5 text-xs text-neutral-400">
                  {t('settings.connected.signedOutNote')}
                </p>
              )}
            </div>
          )}
        </section>

        {/* 5. Privacy & Preferences Card (Collapsible) */}
        <section
          aria-labelledby="settings-privacy-heading"
          data-testid="privacy-preferences-section"
          className="space-y-3 rounded-2xl border border-white/15 bg-[#080808] p-5"
        >
          <CollapsibleCardHeader
            headingId="settings-privacy-heading"
            panelId="settings-privacy-panel"
            icon={<Shield className="h-4 w-4" aria-hidden="true" />}
            iconBgClass="border border-white/15 bg-[#111111] text-white"
            title={t('settings.privacy.title')}
            subtitle={t('settings.privacy.subtitle')}
            expanded={expandedSections.privacy}
            toggleAriaLabel={t('settings.toggleSectionAria', {
              section: t('settings.privacy.title'),
            })}
            onToggle={() => toggleSection('privacy')}
          />

          {expandedSections.privacy && (
            <div
              id="settings-privacy-panel"
              data-testid="privacy-preferences-section-body"
              className="divide-y divide-white/15 rounded-xl border border-white/15 bg-[#111111]"
            >
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-white">
                    {t('settings.privacy.discreetTitle')}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {t('settings.privacy.discreetDesc')}
                    {hasPassphraseLock ? t('settings.privacy.passphraseProtectedSuffix') : '.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={discreetMode}
                  onClick={onToggleDiscreet}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    discreetMode
                      ? 'bg-white text-black ring-1 ring-white'
                      : 'border border-white/15 bg-black text-neutral-200 hover:bg-white/10'
                  }`}
                >
                  {discreetMode ? (
                    <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {discreetMode ? t('common.on') : t('common.off')}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-start gap-2.5">
                  <Database
                    className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400"
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-white">
                      {t('settings.privacy.localCacheTitle')}
                    </p>
                    <p data-testid="local-cache-status" className="text-[11px] text-neutral-400">
                      {localCacheText}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-white/15 bg-black px-2.5 py-0.5 text-[11px] font-medium text-neutral-300">
                  {signedInEmail
                    ? t('settings.privacy.syncedBadge')
                    : t('settings.privacy.localOnlyBadge')}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* 6. Vault, Encryption & Cloud Sync Card (Collapsible) */}
        {vaultSection && (
          <section
            aria-labelledby="settings-vault-heading"
            data-testid="settings-vault-section"
            className="space-y-4 rounded-2xl border border-white/15 bg-[#080808] p-5"
          >
            <CollapsibleCardHeader
              headingId="settings-vault-heading"
              panelId="settings-vault-panel"
              icon={<Lock className="h-4 w-4" aria-hidden="true" />}
              iconBgClass="border border-white/15 bg-[#111111] text-white"
              title={t('settings.vault.title')}
              subtitle={t('settings.vault.subtitle')}
              expanded={expandedSections.vault}
              toggleAriaLabel={t('settings.toggleSectionAria', {
                section: t('settings.vault.title'),
              })}
              onToggle={() => toggleSection('vault')}
            />

            {expandedSections.vault && (
              <div id="settings-vault-panel" data-testid="settings-vault-section-body">
                {vaultSection}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
