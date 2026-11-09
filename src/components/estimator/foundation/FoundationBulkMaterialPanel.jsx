// O-094 (CMP-H03) -- bulk material change picker. Applies an authored
// material id across the selected target (concrete/forming/walls/caps/poles)
// via applyFoundationBulkMaterial -- replace/all/fill_blank modes, scope to
// the current selection's component ids when provided, unknown targets and
// price fields are refused by the model itself.

import { useState } from "react";
import { applyFoundationBulkMaterial, FOUNDATION_BULK_MATERIAL_TARGETS } from "./foundationBulkMaterialChange";

export default function FoundationBulkMaterialPanel({ project, selectedComponentIds, onApply }) {
  const [target, setTarget] = useState("concrete");
  const [value, setValue] = useState("");
  const [mode, setMode] = useState("all");
  const [note, setNote] = useState(null);

  const apply = () => {
    if (!project) return;
    const component_ids = selectedComponentIds && selectedComponentIds.size ? selectedComponentIds : null;
    try {
      const result = applyFoundationBulkMaterial(project, {
        target,
        value,
        mode,
        include_project_default: mode !== "fill_blank",
        component_ids: component_ids ? [...component_ids] : null,
      });
      onApply?.(result.patch, result.summary);
      setNote({ ok: true, text: `Applied ${result.summary.rows_total} row${result.summary.rows_total === 1 ? "" : "s"}${result.summary.project_default_changed ? " + project default" : ""}` });
    } catch (e) {
      setNote({ ok: false, text: e?.message || "Bulk material change failed" });
    }
  };

  return (
    <details className="rounded-sm border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[11px]" data-bulk-material="true">
      <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wide text-gray-500">Bulk material change</summary>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-[10px] text-gray-500">
          Target
          <select
            value={target}
            onChange={(e) => { setTarget(e.target.value); setNote(null); }}
            className="block w-36 h-7 rounded-sm border border-gray-300 px-1 text-[11px] bg-white"
          >
            {Object.entries(FOUNDATION_BULK_MATERIAL_TARGETS).map(([k, spec]) => (
              <option key={k} value={k}>{spec.label}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] text-gray-500">
          Material id
          <input
            type="text"
            value={value}
            placeholder="catalog id (blank clears)"
            onChange={(e) => setValue(e.target.value)}
            className="block w-32 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px] font-mono"
          />
        </label>
        <label className="text-[10px] text-gray-500">
          Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="block w-28 h-7 rounded-sm border border-gray-300 px-1 text-[11px] bg-white"
          >
            <option value="all">All rows</option>
            <option value="replace">Replace matching</option>
            <option value="fill_blank">Fill blanks only</option>
          </select>
        </label>
        <button type="button"
          onClick={apply}
          disabled={!project}
          className="h-7 px-3 rounded-sm bg-slate-700 text-white text-[11px] font-semibold hover:bg-slate-600 disabled:bg-gray-300"
        >
          Apply
        </button>
        {selectedComponentIds && selectedComponentIds.size > 0 && (
          <span className="text-[10px] text-gray-400 self-center">Scoped to {selectedComponentIds.size} selected</span>
        )}
      </div>
      {note && <p className={`mt-1.5 text-[10px] ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</p>}
    </details>
  );
}
