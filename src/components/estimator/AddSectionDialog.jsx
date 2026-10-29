import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ESTIMATOR_MODULES } from "./moduleRegistry";

const MODULE_DESCRIPTIONS = {
  foundation: "Concrete pads, masonry bases and pole installs",
  channel_letters: "Channel letter and dimensional sign installs",
  vinyl: "Printed vinyl, graphics and wraps",
  cnc: "CNC-routed shapes, panels and signs",
  laser: "Laser cutting and engraving",
  metal: "Custom metal fabrication and welding",
  brick_stone: "Brick and stone monument work",
  maintenance: "Service, repair and maintenance work",
  painting: "Sign painting and finishing",
};

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
            <button type="button"
              key={mod.key}
              disabled={!!busyKey}
              onClick={() => handlePick(mod)}
              className="text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-red-400 hover:bg-red-50 transition-colors text-sm font-medium text-gray-800 disabled:opacity-50"
            >
              <span className="block">{busyKey === mod.key ? "Adding…" : mod.label}</span>
              <span className="block text-xs font-normal text-gray-400 mt-0.5">{MODULE_DESCRIPTIONS[mod.key]}</span>
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