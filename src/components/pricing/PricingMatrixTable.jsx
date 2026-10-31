import { useMemo, useState } from "react";
import { Plus, Save, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pickEditableFields, savePricingChanges } from "@/components/pricing/pricingPersistence";

// Editable PricingTierMatrix grid — one row per tier×category rule. Edits stay
// local until Save; save batches creates / CAS updates / deletes through
// pricingPersistence.savePricingChanges so a concurrent session's write can
// never be silently overwritten.

const EDIT_KEYS = [
  "name", "status", "customer_tier", "category", "markup_pct",
  "minimum_charge", "per_unit_breaks", "effective_from", "effective_to", "sort_order",
  "pricing_mode", "market_retail", "market_discount_pct",
];

let draftSeq = 0;
const newDraftKey = () => `__new_${(draftSeq += 1)}_${Date.now()}`;

// per_unit_breaks edit as text: "10=5.50, 25=4.75" → [{qty:10,unit_price:5.5},...]
export const formatBreaks = (breaks) =>
  (Array.isArray(breaks) ? breaks : [])
    .map((b) => `${Number(b?.qty) || 0}=${Number(b?.unit_price) || 0}`)
    .join(", ");

export const parseBreaks = (text) => {
  const s = String(text ?? "").trim();
  if (!s) return [];
  return s.split(",").map((pair) => {
    const [q, p] = pair.split("=").map((x) => Number(String(x).trim()));
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p < 0) {
      throw new Error(`Bad price break "${pair.trim()}" — use qty=price pairs like 10=5.50.`);
    }
    return { qty: q, unit_price: p };
  });
};

// formula_modifiers edit as text: "add_pct:10, min:50" → [{type,value},...]
const MODIFIER_TYPES = new Set(["add_pct", "mul", "add_flat", "min", "max"]);
export const formatModifiers = (mods) =>
  (Array.isArray(mods) ? mods : [])
    .map((m) => (m && MODIFIER_TYPES.has(m.type) ? `${m.type}:${Number(m.value) || 0}` : ""))
    .filter(Boolean)
    .join(", ");

export const parseModifiers = (text) => {
  const s = String(text ?? "").trim();
  if (!s) return [];
  return s.split(",").map((pair) => {
    const [t, v] = pair.split(":").map((x) => String(x).trim());
    const n = Number(v);
    if (!MODIFIER_TYPES.has(t) || !Number.isFinite(n)) {
      throw new Error(`Bad modifier "${pair.trim()}" — use type:value pairs like add_pct:10, mul:1.1, add_flat:5, min:50, max:200.`);
    }
    return { type: t, value: n };
  });
};

const toDraft = (row) => ({
  _key: row.id,
  _original: row,
  _breaksText: formatBreaks(row.per_unit_breaks),
  _modsText: formatModifiers(row.formula_modifiers),
  ...pickEditableFields("PricingTierMatrix", row),
});
const blankDraft = () => ({
  _key: newDraftKey(),
  _original: null,
  _breaksText: "",
  _modsText: "",
  pricing_mode: "markup",
  market_retail: "",
  market_discount_pct: "",
  name: "",
  status: "active",
  customer_tier: "",
  category: "",
  markup_pct: "",
  minimum_charge: "",
  effective_from: "",
  effective_to: "",
  sort_order: 0,
});

const draftChanged = (d) => {
  if (!d._original) return true;
  const base = toDraft(d._original);
  return EDIT_KEYS.some((k) => String(d[k] ?? "") !== String(base[k] ?? "")) ||
    d._breaksText !== base._breaksText || d._modsText !== base._modsText;
};

export default function PricingMatrixTable({ rows = [], tierOptions = [], categoryOptions = [], onSaved, updatedBy = "" }) {
  const [drafts, setDrafts] = useState(() => rows.map(toDraft));
  const [deleted, setDeleted] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadedRows, setLoadedRows] = useState(rows);

  // Parent reloaded → re-seed drafts (only when the row set identity changed).
  if (rows !== loadedRows) {
    setLoadedRows(rows);
    setDrafts(rows.map(toDraft));
    setDeleted(new Set());
  }

  const live = drafts.filter((d) => !deleted.has(d._key));
  const dirtyCount = drafts.filter((d) => !deleted.has(d._key) && draftChanged(d)).length + deleted.size;

  const patch = (key, field, value) =>
    setDrafts((prev) => prev.map((d) => (d._key === key ? { ...d, [field]: value } : d)));

  const tierValues = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const t of tierOptions || []) {
      const v = t?.tier_name || t?.name || String(t?.tier_number ?? "");
      if (v && !seen.has(v)) { seen.add(v); out.push(v); }
    }
    for (const d of drafts) {
      const v = String(d.customer_tier || "");
      if (v && !seen.has(v)) { seen.add(v); out.push(v); }
    }
    return out;
  }, [tierOptions, drafts]);

  const categoryValues = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const c of categoryOptions || []) {
      const v = c?.category_key || c?.category_name || "";
      if (v && !seen.has(v)) { seen.add(v); out.push(v); }
    }
    for (const d of drafts) {
      const v = String(d.category || "");
      if (v && !seen.has(v)) { seen.add(v); out.push(v); }
    }
    return out;
  }, [categoryOptions, drafts]);

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const creates = [];
      const updates = [];
      for (const d of drafts) {
        if (deleted.has(d._key)) continue;
        const breaks = parseBreaks(d._breaksText);
        const data = {
          ...pickEditableFields("PricingTierMatrix", d),
          per_unit_breaks: breaks,
          formula_modifiers: parseModifiers(d._modsText),
          markup_pct: Number(d.markup_pct) || 0,
          minimum_charge: Number(d.minimum_charge) || 0,
          sort_order: Number(d.sort_order) || 0,
          pricing_mode: d.pricing_mode === "market" ? "market" : "markup",
          market_retail: Number(d.market_retail) || 0,
          market_discount_pct: Number(d.market_discount_pct) || 0,
          updated_by: updatedBy || undefined,
        };
        if (!d._original) {
          if (!String(data.name || "").trim()) data.name = `${data.customer_tier || "All tiers"} / ${data.category || "All categories"}`;
          creates.push(data);
        } else if (draftChanged(d)) {
          updates.push({ id: d._original.id, updated_date: d._original.updated_date, patch: data });
        }
      }
      const deletes = [...deleted].filter((k) => !String(k).startsWith("__new_"));
      const result = await savePricingChanges("PricingTierMatrix", { creates, updates, deletes });
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

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Tier × Category Matrix</div>
          <div className="text-[9px] text-gray-500 mt-0.5">
            Most specific row wins: category+tier &gt; category-only &gt; tier-only &gt; blank default &gt; global default markup.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-[30px] text-[11px]" onClick={() => setDrafts((p) => [...p, blankDraft()])}>
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
              <th className={th}>Name</th>
              <th className={th}>Status</th>
              <th className={th}>Customer Tier</th>
              <th className={th}>Category</th>
              <th className={th}>Markup %</th>
              <th className={th}>Min Charge</th>
              <th className={th}>Mode</th>
              <th className={th}>Mkt Retail</th>
              <th className={th}>Mkt Disc %</th>
              <th className={th}>Modifiers (type:value,…)</th>
              <th className={th}>Qty Breaks (qty=price,…)</th>
              <th className={th}>From</th>
              <th className={th}>To</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {live.length === 0 && (
              <tr><td colSpan={14} className="px-4 py-6 text-center text-[11px] text-gray-400">
                No matrix rows yet — add one, or rows may be gated until the pricing entities are allowlisted in the staff gateways.
              </td></tr>
            )}
            {live.map((d) => {
              const dirty = draftChanged(d);
              return (
                <tr key={d._key} className={`border-b border-gray-100 ${dirty ? "bg-amber-50/50" : ""}`}>
                  <td className="px-1.5 py-1"><Input className={cell} value={d.name ?? ""} onChange={(e) => patch(d._key, "name", e.target.value)} placeholder="Label" /></td>
                  <td className="px-1.5 py-1">
                    <select className={`${cell} w-full border border-gray-200 rounded bg-white`} value={d.status || "active"} onChange={(e) => patch(d._key, "status", e.target.value)}>
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </td>
                  <td className="px-1.5 py-1">
                    <select className={`${cell} w-full border border-gray-200 rounded bg-white`} value={d.customer_tier || ""} onChange={(e) => patch(d._key, "customer_tier", e.target.value)}>
                      <option value="">(all tiers)</option>
                      {tierValues.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-1.5 py-1">
                    <select className={`${cell} w-full border border-gray-200 rounded bg-white`} value={d.category || ""} onChange={(e) => patch(d._key, "category", e.target.value)}>
                      <option value="">(all categories)</option>
                      {categoryValues.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-1.5 py-1"><Input type="number" step="0.01" className={`${cell} w-20 text-right`} value={d.markup_pct ?? ""} onChange={(e) => patch(d._key, "markup_pct", e.target.value)} /></td>
                  <td className="px-1.5 py-1"><Input type="number" step="0.01" min="0" className={`${cell} w-20 text-right`} value={d.minimum_charge ?? ""} onChange={(e) => patch(d._key, "minimum_charge", e.target.value)} /></td>
                  <td className="px-1.5 py-1">
                    <select className={`${cell} w-full border border-gray-200 rounded bg-white`} value={d.pricing_mode || "markup"} onChange={(e) => patch(d._key, "pricing_mode", e.target.value)}>
                      <option value="markup">markup</option>
                      <option value="market">market</option>
                    </select>
                  </td>
                  <td className="px-1.5 py-1"><Input type="number" step="0.01" min="0" className={`${cell} w-20 text-right`} value={d.market_retail ?? ""} onChange={(e) => patch(d._key, "market_retail", e.target.value)} /></td>
                  <td className="px-1.5 py-1"><Input type="number" step="0.01" min="0" className={`${cell} w-16 text-right`} value={d.market_discount_pct ?? ""} onChange={(e) => patch(d._key, "market_discount_pct", e.target.value)} /></td>
                  <td className="px-1.5 py-1"><Input className={`${cell} w-36`} value={d._modsText ?? ""} onChange={(e) => patch(d._key, "_modsText", e.target.value)} placeholder="add_pct:10, min:50" /></td>
                  <td className="px-1.5 py-1"><Input className={`${cell} w-40`} value={d._breaksText} onChange={(e) => patch(d._key, "_breaksText", e.target.value)} placeholder="10=5.50, 25=4.75" /></td>
                  <td className="px-1.5 py-1"><Input type="date" className={`${cell} w-32`} value={d.effective_from ?? ""} onChange={(e) => patch(d._key, "effective_from", e.target.value)} /></td>
                  <td className="px-1.5 py-1"><Input type="date" className={`${cell} w-32`} value={d.effective_to ?? ""} onChange={(e) => patch(d._key, "effective_to", e.target.value)} /></td>
                  <td className="px-1.5 py-1 text-right">
                    <button
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Remove row"
                      onClick={() => setDeleted((prev) => new Set(prev).add(d._key))}
                    >
                      {deleted.has(d._key) ? <Undo2 className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
