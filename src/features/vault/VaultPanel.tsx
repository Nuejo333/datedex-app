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

/**
 * Props for `VaultPanel`.
 */
export interface VaultPanelProps {
  vaultSettings: VaultSettings;
  supabaseConfigured: boolean;
  signedInEmail: string | null;
  syncPhotos: boolean;
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
      setFeedback('Encrypted JSON backup exported safely.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Backup export failed');
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
        throw new Error('Selected file is not a valid Datédex encrypted backup');
      }
      setPendingRestoreJson(text);
      setFeedback(`Loaded ${file.name}. Enter its backup passphrase to decrypt and restore.`);
    } catch (err) {
      setPendingRestoreJson(null);
      setErrorMsg(err instanceof Error ? err.message : 'Invalid backup file');
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
      setFeedback(`Restored ${count} entries from encrypted backup.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Wrong passphrase or corrupted backup');
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
          <h2 className="text-sm font-bold text-white">Vault & Discreet Controls</h2>
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
            <span>Vault / Discreet</span>
            <span>{vaultSettings.discreetMode ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <div className="space-y-1.5 border-t border-white/10 pt-3">
          <label htmlFor="vault-pass-update" className="block text-xs font-medium text-slate-300">
            {vaultSettings.hasPassphraseLock ? 'Update Vault Lock Passphrase' : 'Set Local Vault Lock Passphrase'}
          </label>
          <div className="flex gap-2">
            <input
              id="vault-pass-update"
              type="password"
              minLength={4}
              value={newPassphrase}
              onChange={(e) => setNewPassphrase(e.target.value)}
              placeholder="Min 4 characters (leave blank to clear)"
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
                    setFeedback(newPassphrase.trim() ? 'Vault passphrase saved.' : 'Vault lock removed.');
                    setNewPassphrase('');
                  })
                  .catch((e: unknown) =>
                    setErrorMsg(e instanceof Error ? e.message : 'Failed to update passphrase'),
                  );
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Save
            </button>
          </div>
        </div>
      </section>

      {/* Offline Data Risk Notice + Encrypted JSON Backup */}
      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#121622] p-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          <p>
            <strong>Offline Privacy Notice:</strong> When you are not signed in, 100% of your data
            stays on this device in IndexedDB. Clearing browser site data or uninstalling will erase
            local entries unless you export an <strong>Encrypted JSON Backup</strong> below.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
            <h3 className="text-xs font-semibold text-white">Export Encrypted Backup</h3>
            <input
              type="password"
              value={backupPassphrase}
              onChange={(e) => setBackupPassphrase(e.target.value)}
              placeholder="Backup passphrase (min 6 chars)"
              aria-label="Backup export passphrase"
              className="dd-input text-xs"
            />
            <button
              type="button"
              disabled={busy || backupPassphrase.trim().length < 6}
              onClick={() => void handleExport()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-400 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download .json Backup
            </button>
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
            <h3 className="text-xs font-semibold text-white">Restore Encrypted Backup</h3>
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Select Backup .json
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
                  placeholder="Enter backup passphrase"
                  aria-label="Backup restore passphrase"
                  className="dd-input text-xs"
                />
                <button
                  type="button"
                  disabled={busy || !restorePassphrase}
                  onClick={() => void handleRestoreSubmit()}
                  className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  Decrypt & Restore
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
            <h2 className="text-sm font-bold text-white">Optional Encrypted Cloud Sync</h2>
          </div>
          {signedInEmail && (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
              {signedInEmail}
            </span>
          )}
        </div>

        {!supabaseConfigured ? (
          <p className="text-xs text-slate-400">
            Running in local-only mode. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
            to enable Google OAuth / Email Magic Link cloud sync.
          </p>
        ) : signedInEmail ? (
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2.5 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={syncPhotos}
                onChange={(e) => void onToggleSyncPhotos(e.target.checked)}
                className="dd-checkbox h-4 w-4"
              />
              <span>
                Opt-in: Sync EXIF-stripped photos to private Supabase Storage bucket (signed URLs only)
              </span>
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
                      setErrorMsg(e instanceof Error ? e.message : 'Sync failed'),
                    )
                    .finally(() => setBusy(false));
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Sync Encrypted Pins
              </button>

              <button
                type="button"
                onClick={() => void onSignOut()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-400">
              Passwordless authentication only (Google OAuth or Email Magic Link OTP).
            </p>
            <button
              type="button"
              onClick={() =>
                void onGoogleSignIn().catch((e: unknown) =>
                  setErrorMsg(e instanceof Error ? e.message : 'Google OAuth failed'),
                )
              }
              className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              Sign in with Google OAuth
            </button>
            <div className="flex gap-2">
              <input
                type="email"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Magic link email"
                className="dd-input flex-1 text-xs"
              />
              <button
                type="button"
                disabled={!magicEmail.includes('@')}
                onClick={() =>
                  void onSendMagicLink(magicEmail)
                    .then(() => setFeedback('Magic Link sent to your email inbox.'))
                    .catch((e: unknown) =>
                      setErrorMsg(e instanceof Error ? e.message : 'Magic link failed'),
                    )
                }
                className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                Magic Link
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
