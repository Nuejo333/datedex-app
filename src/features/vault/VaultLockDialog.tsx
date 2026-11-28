/**
 * @module features/vault/VaultLockDialog
 * Accessible native `<dialog>` prompting for the user's Vault passphrase before
 * disabling Discreet / Vault mode when a passphrase lock is configured.
 */
import { useRef, useState, type FormEvent } from 'react';
import { Lock, X } from 'lucide-react';
import { useTranslation } from '../../platform/i18n/LanguageContext';
import { useNativeModalDialog } from '../../platform/ui/dialogUtils';

/**
 * Props for `VaultLockDialog`.
 */
export interface VaultLockDialogProps {
  open: boolean;
  onClose: () => void;
  onVerifyPassphrase: (passphrase: string) => Promise<boolean>;
}

/**
 * Native modal dialog verifying the local Vault unlock passphrase.
 * @param {VaultLockDialogProps} props - Dialog open flag and verifier callback.
 * @returns {React.JSX.Element} Vault unlock modal.
 */
export function VaultLockDialog({
  open,
  onClose,
  onVerifyPassphrase,
}: VaultLockDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useNativeModalDialog(dialogRef, open, onClose, true);

  const [passphrase, setPassphrase] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setErrorMsg(null);
    const ok = await onVerifyPassphrase(passphrase);
    if (!ok) {
      setErrorMsg(t('vault.lockDialogIncorrect'));
      return;
    }
    setPassphrase('');
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="vault-unlock-title"
      className="dd-dialog"
    >
      <div className="flex items-center justify-between border-b border-white/15 bg-black px-5 py-4">
        <h1 id="vault-unlock-title" className="inline-flex items-center gap-2 text-sm font-bold text-white">
          <Lock className="h-4 w-4 text-red-500" aria-hidden="true" />
          {t('vault.lockDialogTitle')}
        </h1>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={t('vault.lockDialogCloseAria')}
          className="rounded-lg p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 bg-black p-5">
        <div>
          <label htmlFor="vault-unlock-input" className="mb-1 block text-xs font-medium text-neutral-300">
            {t('vault.lockDialogPrompt')}
          </label>
          <input
            id="vault-unlock-input"
            type="password"
            required
            autoFocus
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="dd-input"
          />
        </div>

        {errorMsg && (
          <p role="alert" className="text-xs text-red-400">
            {errorMsg}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-xl border border-white/15 bg-[#111111] px-4 py-2 text-xs text-neutral-200 hover:bg-white/10 hover:text-white"
          >
            {t('vault.lockDialogKeepLocked')}
          </button>
          <button
            type="submit"
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500"
          >
            {t('vault.lockDialogUnlock')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
