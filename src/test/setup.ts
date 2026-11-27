/**
 * @module test/setup
 * Vitest global setup configuring fake-indexeddb, Testing Library matchers,
 * and native HTMLDialogElement showModal/close polyfills for jsdom.
 */
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(
      this: HTMLDialogElement,
      returnValue?: string,
    ): void {
      if (returnValue !== undefined) {
        this.returnValue = returnValue;
      }
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}
