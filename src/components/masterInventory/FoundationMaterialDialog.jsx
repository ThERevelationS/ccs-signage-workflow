import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { MATERIAL_TYPES, fieldsFor } from "./foundationFieldSchema";

export default function FoundationMaterialDialog({ open, record, defaultType, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const saveRef = useRef(false);

  useEffect(() => {
    if (open) {
      setForm(record || { material_type: defaultType, show_in_foundation: true });
    }
  }, [open, record, defaultType]);

  const type = form.material_type || defaultType;
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!form.material_name || saveRef.current) return;
    saveRef.current = true;
    setSaving(true);
    try {
      const { id, created_date, updated_date, created_by_id, created_by, ...data } = form;
      data.material_type = type;
      data.show_in_foundation = true;
      if (id) {
        const live = await base44.entities.FoundationInventory.get(id);
        if (!live) {
          alert("This Foundation Catalog item no longer exists. The catalog will reload.");
          onSaved();
          return;
        }
        if (updated_date && live.updated_date && updated_date !== live.updated_date) {
          alert("This Foundation Catalog item changed in another session. Your changes were not saved; the latest catalog will reload.");
          onSaved();
          return;
        }
        await base44.entities.FoundationInventory.update(id, data);
      } else {
        await base44.entities.FoundationInventory.create(data);
      }
      onSaved();
    } catch (error) {
      console.error("Foundation Catalog save failed:", error);
      alert(error?.message || "Foundation Catalog item could not be saved.");
    } finally {
      saveRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record?.id ? "Edit Material" : "New Material"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <label className="text-xs text-gray-500 block">
            Material type
            <select
              value={type}
              onChange={(e) => set({ material_type: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
            >
              {MATERIAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fieldsFor(type).map((f) => (
              <label key={f.key} className="text-xs text-gray-500">
                {f.label}
                <Input
                  type={f.type}
                  value={form[f.key] ?? ""}
                  onChange={(e) =>
                    set({ [f.key]: f.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value })
                  }
                />
              </label>
            ))}
          </div>

          <label className="text-xs text-gray-500 block">
            Notes
            <Input value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !form.material_name}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}