import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ESTIMATOR_MODULES } from "./moduleRegistry";

export default function AddSectionDialog({ open, onClose, onAdd }) {
  const [busyKey, setBusyKey] = useState("");

  const handlePick = async (mod) => {
    setBusyKey(mod.key);
    try {
      await onAdd(mod);
    } finally {
      setBusyKey("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Estimate Section</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-2">
          {ESTIMATOR_MODULES.map((mod) => (
            <button
              key={mod.key}
              disabled={!!busyKey}
              onClick={() => handlePick(mod)}
              className="text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-red-400 hover:bg-red-50 transition-colors text-sm font-medium text-gray-800 disabled:opacity-50"
            >
              {busyKey === mod.key ? "Adding…" : mod.label}
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}