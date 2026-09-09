import { useEffect } from "react";
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
  useEffect(() => {
    if (!open || busy) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel?.(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="fleet-confirm-title" aria-describedby="fleet-confirm-description" className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconClass}`}><AlertTriangle className="w-5 h-5" /></div>
          <div className="min-w-0">
            <h2 id="fleet-confirm-title" className="text-lg font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
            <p id="fleet-confirm-description" className="mt-2 text-sm text-gray-600 dark:text-slate-300 whitespace-pre-line">{description}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={() => onCancel?.()} className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">{cancelLabel}</button>
          <button type="button" disabled={busy} onClick={() => onConfirm?.()} className={`px-4 py-2 rounded-lg text-white font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50 ${confirmClass}`}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
