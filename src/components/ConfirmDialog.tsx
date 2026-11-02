import { useEffect, useId, useRef } from 'react';

interface ConfirmDialogProps {
  question: string;
  confirmLabel: string;
  /** The safe choice: it gets the focus first, and Escape counts as this. */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Disables the confirm button while the action runs. */
  busy?: boolean;
}

/** Modal confirmation. Mount it only while the question is open. */
export function ConfirmDialog({ question, confirmLabel, cancelLabel, onConfirm, onCancel, busy }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog?.close();
      // The opener may be gone (e.g. after a delete); focusing a detached element does nothing.
      opener?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={titleId}
      className="dialog"
      // Escape fires "cancel"; closing is the parent's job, so the dialog and its state cannot drift apart.
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <p id={titleId} className="dialog-question">
        {question}
      </p>
      <div className="dialog-actions">
        <button type="button" ref={cancelRef} className="button-quiet" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
