import { toast } from "sonner";

// Sonner-based undo helper. One call site for the "X deleted -- Undo" pattern:
//
//   showUndo({
//     message: "Invoice voided",
//     onUndo: () => restoreInvoice(inv.id),
//     duration: 8000,
//   });
//
// Renders the app's standard Toaster action button (ui/sonner.jsx styles
// actionButton via toastOptions already). Returns the toast id so callers
// can dismiss programmatically; omitting onUndo renders a plain toast.
export function showUndo({ message, description, onUndo, duration = 6000, undoLabel = "Undo" }) {
  return toast(message, {
    description,
    duration,
    action:
      typeof onUndo === "function"
        ? {
            label: undoLabel,
            onClick: (event) => {
              event?.preventDefault?.();
              onUndo();
            },
          }
        : undefined,
  });
}
