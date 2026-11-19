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
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState(null);
  const saveAttemptRef = useRef({ signature: "", key: "" });
  const loadSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadRows = () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadFailed(false);
    setError(null);
    // loadAllEntityRows rethrows failures — an un-caught rejection would both
    // leak an unhandled promise and render a fake "no templates" list. The
    // catch marks the load failed and offers a retry (same honest-empty shape
    // the landed O-014 Foundation dialog uses).
    listModuleTemplates({ moduleKey })
      .then((rows) => {
        if (!mountedRef.current || loadSeqRef.current !== seq) return;
        setTemplates(rows || []);
        setError(null);
      })
      .catch((e) => {
        if (!mountedRef.current || loadSeqRef.current !== seq) return;
        setTemplates([]);
        setLoadFailed(true);
        setError(e?.message || "Templates could not be loaded.");
      })
      .finally(() => {
        if (mountedRef.current && loadSeqRef.current === seq) setLoading(false);
      });
  };

  useEffect(() => {
    if (!open) return;
    saveAttemptRef.current = { signature: "", key: "" };
    setTemplates([]);
    setError(null);
    setLoadFailed(false);
    if (mode !== "load") return;
    loadRows();
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
      setError(null);
      onClose();
    } catch (e) {
      // The dialog stays open and honest — a swallowed rejection here meant a
      // silent save failure with no visible state anywhere.
      setError(e?.message || "Template could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete template "${t.template_name || "Untitled"}"?`)) return;
    try {
      await deleteModuleTemplate(t.id, `${title} template`);
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      setError(null);
    } catch (e) {
      // The row honestly stays in the list — and the failure is now visible
      // instead of an empty-catch no-op.
      setError(e?.message || "Template could not be deleted.");
    }
  };

  const apply = (t) => {
    try {
      onApply(t.project_data || {});
      setError(null);
      onClose();
    } catch (e) {
      setError(e?.message || "Template could not be applied.");
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

        {error ? (
          <div role="alert" className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            {error}
          </div>
        ) : null}

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
        ) : loading ? (
          <p className="text-[12px] text-gray-500 py-4">Loading…</p>
        ) : loadFailed ? (
          <div className="py-4 space-y-2">
            <p className="text-[12px] text-gray-500">Templates could not be loaded.</p>
            <button
              type="button"
              onClick={loadRows}
              className="h-[26px] px-3 rounded-sm bg-white border border-gray-300 text-[11px] font-semibold text-gray-700"
            >
              Retry
            </button>
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
                  onClick={() => apply(t)}
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
