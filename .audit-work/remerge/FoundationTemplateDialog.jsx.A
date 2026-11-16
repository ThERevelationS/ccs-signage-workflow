import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { deleteFoundationTemplate, saveFoundationTemplate } from "./foundationTemplateService";
import { createFoundationTemplateSnapshot } from "./foundationTemplateModel";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";

export default function FoundationTemplateDialog({ open, mode, onClose, project, onApply, saveDisabled = false, saveDisabledReason = "" }) {
  const [templates, setTemplates] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const saveAttemptRef = useRef({ signature: "", key: "" });
  const saveFlightRef = useRef(null);
  const contextRef = useRef({ open: false, mode: null, projectId: null, identity: "", generation: 0, project: null });
  const generationRef = useRef(0);
  const loadSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const draftRef = useRef(null);
  draftRef.current = { project, name };

  const identity = `${open ? 1 : 0}|${mode}|${project?.id ?? ""}`;
  if (contextRef.current.identity !== identity) {
    generationRef.current += 1;
    contextRef.current = {
      open,
      mode,
      projectId: project?.id ?? null,
      project,
      identity,
      generation: generationRef.current,
    };
  } else {
    contextRef.current.open = open;
    contextRef.current.project = project;
  }
  const saveContext = { ...contextRef.current };
  const sameContext = (c) =>
    mountedRef.current &&
    c.open &&
    contextRef.current.open &&
    contextRef.current.identity === c.identity &&
    contextRef.current.generation === c.generation;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadRows = (gen) => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadFailed(false);
    setError(null);
    loadAllEntityRows({
      entity: base44.entities.ProjectTemplate,
      query: { module_key: "foundation" },
      sort: "created_date",
      label: "Foundation templates",
    })
      .then((rows) => {
        const c = contextRef.current;
        if (!mountedRef.current || !c.open || c.mode !== "load" || generationRef.current !== gen || loadSeqRef.current !== seq) return;
        setTemplates(rows || []);
        setError(null);
      })
      .catch((e) => {
        const c = contextRef.current;
        if (!mountedRef.current || !c.open || c.mode !== "load" || generationRef.current !== gen || loadSeqRef.current !== seq) return;
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
    loadRows(generationRef.current);
  }, [open, mode, project?.id]);

  const save = () => {
    const sc = saveContext;
    if (saveFlightRef.current) return saveFlightRef.current;
    if (saveDisabled) return null;
    const trimmed = name.trim();
    if (!trimmed || !sameContext(sc) || sc.mode !== "save" || draftRef.current.project !== project || draftRef.current.name !== name) return null;
    let snapshot;
    try {
      snapshot = createFoundationTemplateSnapshot(project, {
        createId: (kind) => newCreationRequestKey(`template_${kind}`),
      });
    } catch (e) {
      setError(e?.message || "Template snapshot could not be prepared.");
      return null;
    }
    const data = { template_name: trimmed, module_key: "foundation", project_data: snapshot };
    const signature = JSON.stringify(data);
    if (saveAttemptRef.current.signature !== signature) {
      saveAttemptRef.current = {
        signature,
        key: `foundation_template_save:${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`,
        data,
      };
    }
    const attempt = saveAttemptRef.current;
    const run = Promise.resolve()
      .then(async () => {
        if (!sameContext(sc)) return;
        setBusy(true);
        try {
          await saveFoundationTemplate({ idempotencyKey: attempt.key, data: attempt.data });
          if (!sameContext(sc)) return;
          if (draftRef.current.project !== project || draftRef.current.name !== name) {
            setError("The earlier template snapshot was saved. Current changes have not been saved as a template.");
            return;
          }
          setName("");
          saveAttemptRef.current = { signature: "", key: "" };
          setError(null);
          onClose();
        } catch (e) {
          if (sameContext(sc)) setError(e?.message || "Template could not be saved.");
        }
      })
      .finally(() => {
        if (saveFlightRef.current !== run) return;
        saveFlightRef.current = null;
        if (mountedRef.current) setBusy(false);
      });
    saveFlightRef.current = run;
    return run;
  };

  const apply = (t) => {
    const sc = saveContext;
    if (!sameContext(sc)) return;
    let ok = false;
    try {
      ok = onApply(t.project_data || {}) === true;
    } catch (e) {
      if (sameContext(sc)) setError(e?.message || "Template could not be applied.");
      return;
    }
    if (!sameContext(sc)) return;
    if (ok) {
      setError(null);
      onClose();
    } else {
      setError("Template was not applied; the current project was left unchanged.");
    }
  };

  const remove = async (t) => {
    const sc = saveContext;
    if (!sameContext(sc)) return;
    if (!window.confirm(`Delete template "${t.template_name || "Untitled"}"?`)) return;
    try {
      await deleteFoundationTemplate(t.id);
      if (!sameContext(sc)) return;
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      setError(null);
    } catch (e) {
      if (sameContext(sc)) setError(e?.message || "Template could not be deleted.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {mode === "save" ? "Save as Template" : "Foundation Templates"}
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
                placeholder="e.g. Standard 8ft Pylon Foundation"
                className="w-full h-[30px] px-2 border border-gray-300 rounded-sm text-[12px] focus:outline-none focus:border-red-400"
              />
            </label>
            {saveDisabled ? (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                {saveDisabledReason || "Saving a template is not available right now."}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="h-[30px] px-3 border border-gray-300 rounded-sm text-[12px]">
                Cancel
              </button>
              <button type="button"
                onClick={save}
                disabled={busy || saveDisabled}
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
            <button type="button"
              onClick={() => { const c = saveContext; if (sameContext(c)) loadRows(generationRef.current); }}
              className="h-[26px] px-3 rounded-sm bg-white border border-gray-300 text-[11px] font-semibold text-gray-700"
            >
              Retry
            </button>
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
                <button type="button"
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
