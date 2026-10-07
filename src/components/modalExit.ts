// Dialogs close by unmounting, whatever triggered it (X, Escape, a guard that asked first, a
// finished action). To still give them an exit, a frozen copy of the dialog fades out over the
// page for a moment. It is inert and hidden from assistive technology; the real dialog is gone.
export const MODAL_EXIT_MS = 220;

export function fadeOutCopy(dialog: HTMLDialogElement) {
  if (!dialog.open || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const copy = dialog.cloneNode(true) as HTMLDialogElement;
  copy.classList.add('modal-ghost');
  copy.setAttribute('inert', '');
  copy.setAttribute('aria-hidden', 'true');
  copy.removeAttribute('id');
  const shade = document.createElement('div');
  shade.className = 'modal-ghost-backdrop';
  document.body.append(shade, copy);
  window.setTimeout(() => { copy.remove(); shade.remove(); }, MODAL_EXIT_MS);
}
