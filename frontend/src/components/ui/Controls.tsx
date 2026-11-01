"use client";
import { useEffect, useRef } from "react";
export function ErrorMessage({ error }: { error?: unknown }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-lg bg-negative/10 text-negative p-3 text-sm"
    >
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      className="bg-surface-primary text-text-primary rounded-2xl border border-border-soft w-[min(95vw,36rem)] max-h-[90vh] p-0 backdrop:bg-black/60"
    >
      <div className="flex justify-between items-center border-b border-border-soft p-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          className="btn-secondary"
          onClick={onClose}
          aria-label="Close dialog"
        >
          ✕
        </button>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </dialog>
  );
}
export function Confirm({
  message,
  onClose,
  onConfirm,
  busy,
  error,
}: {
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
  error?: unknown;
}) {
  return (
    <Modal title="Confirm deletion" onClose={onClose}>
      <p>{message}</p>
      <ErrorMessage error={error} />
      <button className="btn bg-negative" disabled={busy} onClick={onConfirm}>
        {busy ? "Deleting…" : "Delete"}
      </button>
    </Modal>
  );
}
