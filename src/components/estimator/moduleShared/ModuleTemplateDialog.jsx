import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { deleteModuleTemplate, listModuleTemplates, saveModuleTemplate } from "./moduleTemplateService";

// Generic save/load/delete template dialog keyed by module (#79). The caller
// supplies how the live project state becomes a template payload
// (buildTemplateData) and how a row is described in the list (describeTemplate);
// the dialog owns the idempotent-save retry key exactly like the Foundation
// implementation it is generalized from.
export default function ModuleTemplateDialog({
  open,
  mode,
  onClose,
  project,
  onApply,
  moduleKey,
  title = "Module",
  buildTemplateData,
  describeTemplate,
}) {
  const [templates, setTemplates] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const saveAttemptRef = useRef({ signature: "", key: "" });

  useEffect(() => {
    if (!open) return;
    saveAttemptRef.current = { signature: "", key: "" };
    if (mode !== "load") return;
    listModuleTemplates({ moduleKey }).then((rows) => setTemplates(rows || []));
  }, [open, mode, moduleKey]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const data = {
        template_name: name.trim(),
        module_key: moduleKey,
        project_data: buildTemplateData ? buildTemplateData(project) : project,
      };
      const signature = JSON.stringify(data);
      if (saveAttemptRef.current.signature !== signature) {
        saveAttemptRef.current = {
          signature,
          key: `${moduleKey}_template_save:${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`,
        };
      }
      await saveModuleTemplate({
        moduleKey,
        idempotencyKey: saveAttemptRef.current.key,
        data,
        label: `${title} template`,
      });
      setName("");
      saveAttemptRef.current = { signature: "", key: "" };
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete template "${t.template_name || "Untitled"}"?`)) return;
    try {
      await deleteModuleTemplate(t.id, `${title} template`);
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    } catch {
      // leave the template in the list when the delete fails
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {mode === "save" ? "Save as Template" : `${title} Templates`}
          </DialogTitle>
        </DialogHeader>

        {mode === "save" ? (
          <div className="space-y-3">
            <label className="text-[11px] text-gray-500 block">
              Template name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`e.g. Standard ${title} setup`}
                className="w-full h-[30px] px-2 border border-gray-300 rounded-sm text-[12px] focus:outline-none focus:border-red-400"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="h-[30px] px-3 border border-gray-300 rounded-sm text-[12px]">
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="h-[30px] px-4 rounded-sm bg-lime-300 border border-lime-400 text-[12px] font-bold text-gray-800 disabled:opacity-60"
              >
                Save Template
              </button>
            </div>
          </div>
        ) : templates.length === 0 ? (
          <p className="text-[12px] text-gray-500 py-4">No {title.toLowerCase()} templates saved yet.</p>
        ) : (
          <div className="divide-y divide-gray-200 max-h-[320px] overflow-y-auto">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-2">
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-gray-800">{t.template_name}</div>
                  <div className="text-[11px] text-gray-500">
                    {describeTemplate ? describeTemplate(t) : `${Object.keys(t.project_data || {}).length} fields`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onApply(t.project_data || {});
                    onClose();
                  }}
                  className="h-[26px] px-3 rounded-sm bg-white border border-gray-300 text-[11px] font-semibold text-gray-700"
                >
                  Apply
                </button>
                <button type="button" onClick={() => remove(t)} className="text-gray-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}