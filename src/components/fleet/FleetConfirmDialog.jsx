import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function FleetConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const cancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  cancelRef.current = onCancel;
  busyRef.current = busy;

  // Handle keys inside the topmost confirmation before they reach document
  // listeners owned by the underlying Fleet dialog or page.
  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!busyRef.current) cancelRef.current?.();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    event.stopPropagation();
    const controls = [...dialogRef.current.querySelectorAll("button:not(:disabled)")]
      .filter((element) => element.getClientRects().length > 0);
    if (!controls.length) { event.preventDefault(); dialogRef.current.focus(); return; }
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (!dialogRef.current.contains(active) || active === dialogRef.current) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const keyboardHandlerRef = useRef(handleKeyDown);
  keyboardHandlerRef.current = handleKeyDown;

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    cancelButtonRef.current?.focus();
    // Fallback if focus moves outside the confirmation while it is open.
    const onDocumentKey = (event) => {
      if (dialogRef.current?.contains(event.target)) return;
      keyboardHandlerRef.current(event);
    };
    document.addEventListener("keydown", onDocumentKey);
    return () => {
      document.removeEventListener("keydown", onDocumentKey);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const confirmClass = tone === "warning"
    ? "bg-amber-600 hover:bg-amber-700"
    : tone === "success"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : "bg-red-600 hover:bg-red-700";
  const iconClass = tone === "success"
    ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600"
    : "bg-amber-100 dark:bg-amber-950/50 text-amber-600";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onKeyDown={handleKeyDown} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel?.(); }}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="fleet-confirm-title" aria-describedby="fleet-confirm-description" tabIndex={-1} className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconClass}`}><AlertTriangle className="w-5 h-5" /></div>
          <div className="min-w-0">
            <h2 id="fleet-confirm-title" className="text-lg font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
            <p id="fleet-confirm-description" className="mt-2 text-sm text-gray-600 dark:text-slate-300 whitespace-pre-line">{description}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" ref={cancelButtonRef} type="button" disabled={busy} onClick={() => onCancel?.()} className="min-h-11 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">{cancelLabel}</button>
          <button type="button" disabled={busy} onClick={() => onConfirm?.()} className={`min-h-11 px-4 py-2 rounded-lg text-white font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${confirmClass}`}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
