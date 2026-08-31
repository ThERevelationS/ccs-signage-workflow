import React, { useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ProductNotesModal({ open, line, onClose, onSave }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setNotes(line?.product_notes || "");
    setSaving(false);
    setError("");
  }, [open, line?.line_id, line?.builder_product_id]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave?.(notes);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Product notes could not be saved.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose?.()}>
      <DialogContent className="sm:max-w-[620px] p-0 overflow-hidden border-gray-300 shadow-xl">
        <DialogHeader className="px-5 py-4 bg-[#424242] text-white border-b-4 border-lime-300">
          <DialogTitle className="text-white text-[16px] flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-lime-300" /> Manage Product Notes
          </DialogTitle>
          <p className="text-[11px] text-gray-300 mt-1">
            Internal Product notes are preserved with clones, Quick Products and clipboard copies. They are separate from the customer-facing description.
          </p>
        </DialogHeader>

        <form onSubmit={submit} className="p-5 bg-white space-y-4">
          <div>
            <div className="text-[10px] font-bold tracking-wide text-gray-500 mb-1">PRODUCT</div>
            <div className="text-[13px] font-semibold text-gray-900">{line?.client_product_name || line?.project_name || "Product"}</div>
          </div>
          <label className="text-[10px] font-bold tracking-wide text-gray-500 block">
            INTERNAL PRODUCT NOTES
            <textarea
              autoFocus
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={8}
              placeholder="Production notes, estimating assumptions, vendor notes, internal reminders..."
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-[12px] leading-5 resize-y min-h-[150px]"
            />
          </label>
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={onClose} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600">Cancel</button>
            <button type="submit" disabled={saving} className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50">
              {saving ? "Saving…" : "Save Product Notes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
