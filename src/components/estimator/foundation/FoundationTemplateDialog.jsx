import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

export default function FoundationTemplateDialog({ open, mode, onClose, project, onApply }) {
  const [templates, setTemplates] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || mode !== "load") return;
    base44.entities.ProjectTemplate.filter({ module_key: "foundation" }).then((rows) =>
      setTemplates(rows || [])
    );
  }, [open, mode]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await base44.entities.ProjectTemplate.create({
        template_name: name.trim(),
        module_key: "foundation",
        project_data: {
          items: project.items || [],
          walls: project.walls || [],
          poles: project.poles || [],
          wall_caps: project.wall_caps || [],
          selected_equipment: project.selected_equipment || [],
          project_concrete_type: project.project_concrete_type,
          project_concrete_admixtures: project.project_concrete_admixtures || [],
          excavation_method: project.excavation_method,
        },
      });
      setName("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t) => {
    await base44.entities.ProjectTemplate.delete(t.id);
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {mode === "save" ? "Save as Template" : "Foundation Templates"}
          </DialogTitle>
        </DialogHeader>

        {mode === "save" ? (
          <div className="space-y-3">
            <label className="text-[11px] text-gray-500 block">
              Template name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard 8ft Pylon Foundation"
                className="w-full h-[30px] px-2 border border-gray-300 rounded-sm text-[12px] focus:outline-none focus:border-red-400"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="h-[30px] px-3 border border-gray-300 rounded-sm text-[12px]">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="h-[30px] px-4 rounded-sm bg-lime-300 border border-lime-400 text-[12px] font-bold text-gray-800 disabled:opacity-60"
              >
                Save Template
              </button>
            </div>
          </div>
        ) : templates.length === 0 ? (
          <p className="text-[12px] text-gray-500 py-4">No foundation templates saved yet.</p>
        ) : (
          <div className="divide-y divide-gray-200 max-h-[320px] overflow-y-auto">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-2">
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-gray-800">{t.template_name}</div>
                  <div className="text-[11px] text-gray-500">
                    {(t.project_data?.items || []).length} foundations
                  </div>
                </div>
                <button
                  onClick={() => {
                    onApply(t.project_data || {});
                    onClose();
                  }}
                  className="h-[26px] px-3 rounded-sm bg-white border border-gray-300 text-[11px] font-semibold text-gray-700"
                >
                  Apply
                </button>
                <button onClick={() => remove(t)} className="text-gray-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}