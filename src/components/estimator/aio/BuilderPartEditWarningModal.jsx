import React from "react";
import { AlertTriangle, Pencil, Unlink, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function BuilderPartEditWarningModal({ open, part, onCancel, onEditBuilder, onDetach }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel?.()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden border border-gray-300 shadow-xl">
        <div className="bg-[#444] border-b-4 border-lime-300 px-5 py-4 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-[16px]">
              <AlertTriangle className="w-5 h-5 text-amber-300" /> Builder-Linked Part
            </DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-gray-200 mt-1">
            {part?.part_name || "This Part"} is controlled by the Builder. Choose how you want to make the change.
          </p>
        </div>
        <div className="p-4 bg-white space-y-2">
          <button type="button" onClick={onEditBuilder} className="w-full rounded border border-lime-300 bg-lime-50 hover:bg-lime-100 p-3 text-left flex gap-3">
            <Pencil className="w-4 h-4 mt-0.5 text-lime-700" />
            <div><div className="text-[12px] font-bold text-gray-900">Update Builder</div><div className="text-[10px] text-gray-600 mt-0.5">Open the Builder and change the source settings so all linked Parts recalculate together.</div></div>
          </button>
          <button type="button" onClick={onDetach} className="w-full rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 p-3 text-left flex gap-3">
            <Unlink className="w-4 h-4 mt-0.5 text-amber-700" />
            <div><div className="text-[12px] font-bold text-gray-900">Detach / Override Part</div><div className="text-[10px] text-gray-600 mt-0.5">Freeze this Part independently, stop Builder synchronization, and edit its quantity/cost without changing the Builder.</div></div>
          </button>
          <button type="button" onClick={onCancel} className="w-full rounded border border-gray-200 bg-white hover:bg-gray-50 p-3 text-left flex gap-3">
            <X className="w-4 h-4 mt-0.5 text-gray-500" />
            <div><div className="text-[12px] font-bold text-gray-900">Cancel</div><div className="text-[10px] text-gray-600 mt-0.5">Leave the Part and Builder unchanged.</div></div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
