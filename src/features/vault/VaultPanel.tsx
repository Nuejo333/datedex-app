/**
 * @module features/vault/VaultPanel
 * Privacy, Vault / Discreet controls,
 * offline browser-data-loss notice, Encrypted JSON Backup export/restore,
 * and optional passwordless Supabase Auth (Google OAuth + Magic Link ONLY).
 */
import { useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  Cloud,
  Download,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  Shield,
  Upload,
} from 'lucide-react';
import { EncryptedBackupBundleSchema, type VaultSettings } from '../../domain/models/profile';
import { useTranslation } from '../../platform/i18n/LanguageContext';

/**
 * Props for `VaultPanel`.
 */
export interface VaultPanelProps {
  vaultSettings: VaultSettings;
  supabaseConfigured: boolean;
  signedInEmail: string | null;
  syncPhotos: boolean;
  embeddedInSettings?: boolean;
  onToggleDiscreet: () => void;
  onToggleSyncPhotos: (next: boolean) => Promise<void>;
  onSetPassphrase: (passphrase: string) => Promise<void>;
  onExportBackup: (passphrase: string) => Promise<string>;
  onRestoreBackup: (jsonText: string, passphrase: string) => Promise<number>;
  onGoogleSignIn: () => Promise<void>;
  onSendMagicLink: (email: string) => Promise<void>;
  onSyncNow: () => Promise<string>;
  onSignOut: () => Promise<void>;
}

/**
 * Renders Vault privacy controls, encrypted JSON backup tools, and optional cloud sync.
 * @param {VaultPanelProps} props - Vault settings and privacy/cloud callbacks.
 * @returns {React.JSX.Element} Vault settings panel.
 */
export function VaultPanel({
  vaultSettings,
  supabaseConfigured,
  signedInEmail,
  syncPhotos,
  embeddedInSettings = false,
  onToggleDiscreet,
  onToggleSyncPhotos,
  onSetPassphrase,
  onExportBackup,
  onRestoreBackup,
  onGoogleSignIn,
  onSendMagicLink,
  onSyncNow,
  onSignOut,
}: VaultPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [newPassphrase, setNewPassphrase] = useState('');
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [pendingRestoreJson, setPendingRestoreJson] = useState<string | null>(null);
  const [magicEmail, setMagicEmail] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleExport = async (): Promise<void> => {
    setErrorMsg(null);
    setFeedback(null);
    setBusy(true);
    try {
      const jsonText = await onExportBackup(backupPassphrase);
      const blob = new Blob([jsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `datedex-encrypted-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setBackupPassphrase('');
      setFeedback(t('vault.exportSuccess'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('vault.exportError'));
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const text = await file.text();
      const parsed = EncryptedBackupBundleSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        throw new Error(t('vault.invalidBackupFile'));
      }
      setPendingRestoreJson(text);
      setFeedback(t('vault.loadedBackup', { name: file.name }));
    } catch (err) {
      setPendingRestoreJson(null);
      setErrorMsg(err instanceof Error ? err.message : t('vault.invalidBackupFile'));
    }
  };

  const handleRestoreSubmit = async (): Promise<void> => {
    if (!pendingRestoreJson) return;
    setErrorMsg(null);
    setFeedback(null);
    setBusy(true);
    try {
      const count = await onRestoreBackup(pendingRestoreJson, restorePassphrase);
      setPendingRestoreJson(null);
      setRestorePassphrase('');
      setFeedback(t('vault.restoredCount', { count }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('vault.restoreError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Discreet & Vault Lock Controls */}
      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#121622] p-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          <h2 className="text-sm font-bold text-white">{t('vault.controlsTitle')}</h2>
        </div>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={onToggleDiscreet}
            aria-pressed={vaultSettings.discreetMode}
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
              vaultSettings.discreetMode
                ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                : 'border-white/10 bg-slate-900/60 text-slate-200'
            }`}
          >
            <span>{t('vault.toggleLabel')}</span>
            <span>{vaultSettings.discreetMode ? t('common.onUpper') : t('common.offUpper')}</span>
          </button>
        </div>

        <div className="space-y-1.5 border-t border-white/10 pt-3">
          <label htmlFor="vault-pass-update" className="block text-xs font-medium text-slate-300">
            {vaultSettings.hasPassphraseLock
              ? t('vault.updatePassphraseLabel')
              : t('vault.setPassphraseLabel')}
          </label>
          <div className="flex gap-2">
            <input
              id="vault-pass-update"
              type="password"
              minLength={4}
              value={newPassphrase}
              onChange={(e) => setNewPassphrase(e.target.value)}
              placeholder={t('vault.passphrasePlaceholder')}
              className="dd-input flex-1 text-xs"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setErrorMsg(null);
                setFeedback(null);
                void onSetPassphrase(newPassphrase)
                  .then(() => {
                    setFeedback(
                      newPassphrase.trim() ? t('vault.passphraseSaved') : t('vault.lockRemoved'),
                    );
                    setNewPassphrase('');
                  })
                  .catch((e: unknown) =>
                    setErrorMsg(e instanceof Error ? e.message : t('vault.passphraseError')),
                  );
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {t('common.save')}
            </button>
          </div>
        </div>
      </section>

      {/* Offline Data Risk Notice + Encrypted JSON Backup */}
      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#121622] p-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          <p>
            <strong>{t('vault.offlineNoticeTitle')}</strong> {t('vault.offlineNoticeBefore')}{' '}
            <strong>{t('vault.offlineNoticeBold')}</strong> {t('vault.offlineNoticeAfter')}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
            <h3 className="text-xs font-semibold text-white">{t('vault.exportTitle')}</h3>
            <input
              type="password"
              value={backupPassphrase}
              onChange={(e) => setBackupPassphrase(e.target.value)}
              placeholder={t('vault.exportPlaceholder')}
              aria-label={t('vault.exportAria')}
              className="dd-input text-xs"
            />
            <button
              type="button"
              disabled={busy || backupPassphrase.trim().length < 6}
              onClick={() => void handleExport()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-400 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {t('vault.exportBtn')}
            </button>
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
            <h3 className="text-xs font-semibold text-white">{t('vault.restoreTitle')}</h3>
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              {t('vault.selectBackup')}
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => void handleRestoreFile(e)}
                className="sr-only"
              />
            </label>
            {pendingRestoreJson && (
              <div className="space-y-2">
                <input
                  type="password"
                  value={restorePassphrase}
                  onChange={(e) => setRestorePassphrase(e.target.value)}
                  placeholder={t('vault.restorePlaceholder')}
                  aria-label={t('vault.restoreAria')}
                  className="dd-input text-xs"
                />
                <button
                  type="button"
                  disabled={busy || !restorePassphrase}
                  onClick={() => void handleRestoreSubmit()}
                  className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {t('vault.decryptRestoreBtn')}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Optional Supabase Passwordless Cloud Sync */}
      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#121622] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <h2 className="text-sm font-bold text-white">{t('vault.cloudSyncTitle')}</h2>
          </div>
          {signedInEmail && (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
              {signedInEmail}
            </span>
          )}
        </div>

        {!supabaseConfigured ? (
          <p className="text-xs text-slate-400">{t('vault.localOnlyNotice')}</p>
        ) : signedInEmail ? (
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2.5 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={syncPhotos}
                onChange={(e) => void onToggleSyncPhotos(e.target.checked)}
                className="dd-checkbox h-4 w-4"
              />
              <span>{t('vault.syncPhotosOptIn')}</span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setErrorMsg(null);
                  void onSyncNow()
                    .then((msg) => setFeedback(msg))
                    .catch((e: unknown) =>
                      setErrorMsg(e instanceof Error ? e.message : t('vault.syncError')),
                    )
                    .finally(() => setBusy(false));
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {t('vault.syncPinsBtn')}
              </button>

              {!embeddedInSettings && (
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('settings.account.signOut')}
                </button>
              )}
            </div>
          </div>
        ) : embeddedInSettings ? (
          <p className="text-xs text-slate-400">{t('vault.signInAboveSync')}</p>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-400">{t('vault.passwordlessNote')}</p>
            <button
              type="button"
              onClick={() =>
                void onGoogleSignIn().catch((e: unknown) =>
                  setErrorMsg(e instanceof Error ? e.message : t('settings.account.googleError')),
                )
              }
              className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              {t('vault.signInGoogleOAuth')}
            </button>
            <div className="flex gap-2">
              <input
                type="email"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label={t('vault.magicEmailAria')}
                className="dd-input flex-1 text-xs"
              />
              <button
                type="button"
                disabled={!magicEmail.includes('@')}
                onClick={() =>
                  void onSendMagicLink(magicEmail)
                    .then(() => setFeedback(t('vault.magicLinkSent')))
                    .catch((e: unknown) =>
                      setErrorMsg(e instanceof Error ? e.message : t('vault.magicLinkFailed')),
                    )
                }
                className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                {t('vault.magicLinkBtn')}
              </button>
            </div>
          </div>
        )}
      </section>

      {feedback && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-2.5 text-xs text-emerald-200">
          {feedback}
        </p>
      )}
      {errorMsg && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
