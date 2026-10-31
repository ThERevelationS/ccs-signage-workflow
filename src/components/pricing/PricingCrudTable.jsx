import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pickEditableFields, savePricingChanges, PRICING_EDITABLE_FIELDS } from "@/components/pricing/pricingPersistence";

// Generic dirty-tracking CRUD grid for the flat pricing entities (LaborLevel,
// MachineRate). Same save semantics as PricingMatrixTable: edits stay local,
// Save batches creates / CAS updates / deletes via savePricingChanges.
//
// columns: [{ key, label, type: 'text'|'number'|'select'|'list', options?,
//             placeholder?, numeric?, width? }]
//   'list' edits a string[] as comma-separated text (e.g. applies_to_categories).

let draftSeq = 0;
const newDraftKey = () => `__new_${(draftSeq += 1)}_${Date.now()}`;

const toDraft = (row) => ({ _key: row.id, _original: row, ...row });
const listToText = (v) => (Array.isArray(v) ? v.join(", ") : (v ?? ""));
const textToList = (v) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export default function PricingCrudTable({ entityName, title, hint, columns, rows = [], newRow, onSaved, updatedBy = "" }) {
  const [drafts, setDrafts] = useState(() => rows.map(toDraft));
  const [deleted, setDeleted] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadedRows, setLoadedRows] = useState(rows);

  if (rows !== loadedRows) {
    setLoadedRows(rows);
    setDrafts(rows.map(toDraft));
    setDeleted(new Set());
  }

  const live = drafts.filter((d) => !deleted.has(d._key));
  const fieldKeys = (PRICING_EDITABLE_FIELDS[entityName] || []).filter((f) => f !== "updated_by");
  const listKeys = new Set(columns.filter((c) => c.type === "list").map((c) => c.key));

  const draftChanged = (d) => {
    if (!d._original) return true;
    for (const f of fieldKeys) {
      const a = listKeys.has(f) ? textToList(d[f]) : (d[f] ?? null);
      const b = d._original[f] ?? null;
      if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) return true;
    }
    return false;
  };
  const dirtyCount = drafts.filter((d) => !deleted.has(d._key) && draftChanged(d)).length + deleted.size;

  const patch = (key, field, value) =>
    setDrafts((prev) => prev.map((d) => (d._key === key ? { ...d, [field]: value } : d)));

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const creates = [];
      const updates = [];
      for (const d of drafts) {
        if (deleted.has(d._key)) continue;
        const data = { ...pickEditableFields(entityName, d), updated_by: updatedBy || undefined };
        for (const col of columns) {
          if (col.type === "list") data[col.key] = textToList(d[col.key]);
          else if (col.numeric) data[col.key] = Number(d[col.key]) || 0;
        }
        if (!d._original) creates.push(data);
        else if (draftChanged(d)) updates.push({ id: d._original.id, updated_date: d._original.updated_date, patch: data });
      }
      const deletes = [...deleted].filter((k) => !String(k).startsWith("__new_"));
      const result = await savePricingChanges(entityName, { creates, updates, deletes });
      const n = result.created.length + result.updated.length + result.deleted.length;
      setMessage(n ? `Saved ${n} change${n === 1 ? "" : "s"}.` : "Nothing changed.");
      await onSaved?.(result);
    } catch (e) {
      setError(e.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const cell = "h-[28px] text-[11px] px-1.5";
  const th = "px-1.5 py-1.5 text-left text-[9px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap";

  const editor = (d, col) => {
    const v = col.type === "list" ? listToText(d[col.key]) : (d[col.key] ?? "");
    if (col.type === "select") {
      return (
        <select className={`${cell} w-full border border-gray-200 rounded bg-white`} value={v} onChange={(e) => patch(d._key, col.key, e.target.value)}>
          {(col.options || []).map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
        </select>
      );
    }
    return (
      <Input
        type={col.numeric ? "number" : "text"}
        step="0.01"
        className={`${cell} ${col.numeric ? "text-right" : ""}`}
        style={col.width ? { width: col.width } : undefined}
        value={v}
        placeholder={col.placeholder}
        onChange={(e) => patch(d._key, col.key, e.target.value)}
      />
    );
  };

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">{title}</div>
          {hint && <div className="text-[9px] text-gray-500 mt-0.5">{hint}</div>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-[30px] text-[11px]" onClick={() => setDrafts((p) => [...p, { _key: newDraftKey(), _original: null, ...newRow() }])}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Row
          </Button>
          <Button onClick={save} disabled={saving || dirtyCount === 0} className="h-[30px] bg-[#454545] hover:bg-[#353535] text-white text-[11px] font-semibold disabled:opacity-50">
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : `Save${dirtyCount ? ` (${dirtyCount})` : ""}`}
          </Button>
        </div>
      </div>

      {message && <div className="px-3 py-2 border-b border-green-200 bg-green-50 text-[11px] text-green-700">{message}</div>}
      {error && <div className="px-3 py-2 border-b border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((c) => <th key={c.key} className={th}>{c.label}</th>)}
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {live.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-6 text-center text-[11px] text-gray-400">
                No rows yet — or the entity is not yet allowlisted in the staff gateways.
              </td></tr>
            )}
            {live.map((d) => (
              <tr key={d._key} className={`border-b border-gray-100 ${draftChanged(d) ? "bg-amber-50/50" : ""}`}>
                {columns.map((c) => <td key={c.key} className="px-1.5 py-1">{editor(d, c)}</td>)}
                <td className="px-1.5 py-1 text-right">
                  <button className="p-1 text-gray-400 hover:text-red-600" title="Remove row"
                    onClick={() => setDeleted((prev) => new Set(prev).add(d._key))}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
