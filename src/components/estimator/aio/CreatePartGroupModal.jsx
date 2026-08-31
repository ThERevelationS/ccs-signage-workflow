import React, { useEffect, useState } from "react";
import { Layers3 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function CreatePartGroupModal({ open, selectedCount, onClose, onCreate }) {
  const [name, setName] = useState("Part Group");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("Part Group");
    setSaving(false);
    setError("");
  }, [open]);

  const submit = async (event) => {
    event?.preventDefault?.();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await onCreate?.(name.trim());
    } catch (err) {
      setError(err?.message || "The Part Group could not be created.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose?.()}>
      <DialogContent className="max-w-md p-0 overflow-hidden border border-gray-300 shadow-xl">
        <div className="bg-[#444] border-b-4 border-lime-300 px-5 py-4 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-[16px]">
              <Layers3 className="w-5 h-5 text-lime-300" /> Create Part Group
            </DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-gray-200 mt-1">
            Group {selectedCount} selected Part{selectedCount === 1 ? "" : "s"} so they can be collapsed and later copied/moved as one unit.
          </p>
        </div>
        <form onSubmit={submit} className="p-5 bg-white">
          <label className="text-[10px] font-bold tracking-wider text-gray-500 block">
            PART GROUP NAME
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-[34px] w-full rounded border border-gray-300 px-3 text-[12px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-lime-300"
              placeholder="e.g. Installation, Face Components, Electrical"
            />
          </label>
          {error && <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[12px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[12px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50"
            >
              {saving ? "Grouping…" : "Create Part Group"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
