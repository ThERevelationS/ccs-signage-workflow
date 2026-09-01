import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

// A clean, centered, branded confirm/alert modal that replaces native
// browser confirm()/alert() popups.
//
// Props:
//   open, onClose       — controlled visibility
//   title               — heading text
//   description         — body text (optional)
//   confirmLabel        — primary button label (default "OK")
//   cancelLabel         — secondary button label (default null, hides it)
//   tone                — "warning" | "danger" | "info" (default "warning")
//   onConfirm           — handler for the primary button
export default function ConfirmModal({
  open,
  onClose,
  title,
  description,
  confirmLabel = "OK",
  cancelLabel,
  tone = "warning",
  onConfirm,
}) {
  const toneStyles = {
    warning: { iconBg: "bg-amber-100", iconColor: "text-amber-600", btn: "bg-amber-600 hover:bg-amber-700" },
    danger:  { iconBg: "bg-red-100",   iconColor: "text-red-600",   btn: "bg-red-600 hover:bg-red-700" },
    info:    { iconBg: "bg-blue-100",  iconColor: "text-blue-600",  btn: "bg-blue-600 hover:bg-blue-700" },
  }[tone] || {};

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full ${toneStyles.iconBg} flex items-center justify-center flex-shrink-0`}>
              <AlertTriangle className={`w-5 h-5 ${toneStyles.iconColor}`} />
            </div>
            <div className="flex-1 pt-1">
              <DialogTitle className="text-base font-semibold text-slate-900 text-left">{title}</DialogTitle>
              {description && (
                <DialogDescription className="text-sm text-slate-600 text-left mt-1.5 leading-relaxed">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2 pt-2">
          {cancelLabel && (
            <Button variant="outline" onClick={onClose} className="rounded-xl">
              {cancelLabel}
            </Button>
          )}
          <Button onClick={handleConfirm} className={`text-white rounded-xl ${toneStyles.btn}`}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}