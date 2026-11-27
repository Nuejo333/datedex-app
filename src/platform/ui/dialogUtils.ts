/**
 * @module platform/ui/dialogUtils
 * Progressive-enhancement light-dismiss helper for native `<dialog closedby="any">`
 * modals in browsers that do not yet implement `HTMLDialogElement.prototype.closedBy`.
 */
import { useEffect, type RefObject } from 'react';

function isPointerOutsideDialog(event: PointerEvent, dialog: HTMLDialogElement): boolean {
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

/**
 * Synchronizes a React `open` boolean with a native `<dialog>` element via `showModal()`,
 * cleans `returnValue` on close, and attaches a `closedby="any"` pointer fallback.
 * @param {RefObject<HTMLDialogElement | null>} dialogRef - Ref to the native `<dialog>`.
 * @param {boolean} open - Controlled visibility flag.
 * @param {() => void} onClose - Callback invoked when the modal closes.
 * @param {boolean} [allowLightDismiss] - Whether outside-tap light dismiss is active.
 * @returns {void}
 */
export function useNativeModalDialog(
  dialogRef: RefObject<HTMLDialogElement | null>,
  open: boolean,
  onClose: () => void,
  allowLightDismiss: boolean = true,
): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [dialogRef, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = (): void => {
      dialog.returnValue = '';
      onClose();
    };

    dialog.addEventListener('close', handleClose);

    // Fallback for browsers without native <dialog closedby="any">
    let pressedOutside = false;
    const handlePointerDown = (event: PointerEvent): void => {
      if (!allowLightDismiss) return;
      pressedOutside = isPointerOutsideDialog(event, dialog);
    };
    const handlePointerUp = (event: PointerEvent): void => {
      if (!allowLightDismiss) return;
      if (pressedOutside && isPointerOutsideDialog(event, dialog) && dialog.open) {
        dialog.close();
      }
      pressedOutside = false;
    };

    const needsClosedByFallback = !('closedBy' in HTMLDialogElement.prototype);
    if (needsClosedByFallback && allowLightDismiss) {
      dialog.addEventListener('pointerdown', handlePointerDown);
      dialog.addEventListener('pointerup', handlePointerUp);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (needsClosedByFallback && allowLightDismiss) {
        dialog.removeEventListener('pointerdown', handlePointerDown);
        dialog.removeEventListener('pointerup', handlePointerUp);
      }
    };
  }, [dialogRef, onClose, allowLightDismiss]);
}
