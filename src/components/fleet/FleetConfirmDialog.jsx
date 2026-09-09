import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const confirmClass = tone === "warning"
    ? "bg-amber-600 hover:bg-amber-700 text-white"
    : tone === "success"
      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
      : "bg-red-600 hover:bg-red-700 text-white";

  return (
    <AlertDialog open={!!open} onOpenChange={(next) => { if (!next && !busy) onCancel?.(); }}>
      <AlertDialogContent className="border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tone === "success" ? "bg-emerald-100 dark:bg-emerald-950/50" : "bg-amber-100 dark:bg-amber-950/50"}`}>
              <AlertTriangle className={`w-5 h-5 ${tone === "success" ? "text-emerald-600" : "text-amber-600"}`} />
            </div>
            <div className="text-left">
              <AlertDialogTitle className="text-gray-900 dark:text-slate-100">{title}</AlertDialogTitle>
              <AlertDialogDescription className="mt-2 text-gray-600 dark:text-slate-300 whitespace-pre-line">{description}</AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={() => onCancel?.()}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); onConfirm?.(); }} className={confirmClass}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
