import { useMemo, useRef, useState } from "react";
import { Download, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { staffEntities } from "@/components/staff/staffEntities";
import {
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

// #127/#145 — minimal MarkupTier administration. MarkupTier is backend-only
// RLS, so all access flows through the staff gateways (staffEntities). The
// grid edits tier_number / tier_name / description / sort_order and the
// per-category markups map; JSON import/export carries whole tier templates;
// "Re-apply" marks open draft estimates for repricing under a tier.

const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
const tierFields = (row) => ({
  tier_number: num(row?.tier_number),
  tier_name: String(row?.tier_name || ""),
  description: String(row?.description || ""),
  sort_order: num(row?.sort_order),
  markups: { ...(row?.markups || {}) },
});
const TIER_LIMIT = 8;
const REAPPLY_BATCH = 25;

const EMPTY = [];
export default function MarkupTierPanel({ tiers = EMPTY, categories = EMPTY, onSaved }) {
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reapplyReport, setReapplyReport] = useState(null);
  const fileRef = useRef(null);

  const sorted = useMemo(
    () => [...tiers].sort((a, b) => num(a.tier_number) - num(b.tier_number)),
    [tiers]
  );
  const cats = useMemo(
    () => [...categories].sort((a, b) => String(a.category_key || "").localeCompare(String(b.category_key || ""))),
    [categories]
  );

  const draft = (tier) => ({ ...tierFields(tier), ...(edits[tier.id] || {}) });
  const patch = (tier, field, value) =>
    setEdits((prev) => ({ ...prev, [tier.id]: { ...(prev[tier.id] || {}), [field]: value } }));
  const dirtyIds = Object.keys(edits);

  const persistTier = async (tier, next, label) =>
    replaceEntityFieldsIfUnchanged({
      entity: staffEntities.MarkupTier,
      id: tier.id,
      expectedUpdatedAt: tier.updated_date || "",
      expectedFields: expectedEntityFields(tier, next),
      nextFields: next,
      label: label || `Markup Tier ${tier.tier_name || tier.id}`,
    });

  const saveDirty = async () => {
    if (!dirtyIds.length) return;
    setBusy(true);
    try {
      for (const tier of sorted) {
        const next = edits[tier.id];
        if (!next) continue;
        await persistTier(tier, tierFields(next), `Tier ${next.tier_name}`);
      }
      setEdits({});
      setMessage("Tiers saved.");
      await onSaved?.();
    } catch (error) {
      setMessage(error?.message || "Tier save failed — reload before retrying.");
    } finally {
      setBusy(false);
    }
  };

  const addTier = async () => {
    const used = new Set(sorted.map((t) => num(t.tier_number)));
    let nextNumber = 1;
    while (used.has(nextNumber) && nextNumber <= TIER_LIMIT) nextNumber += 1;
    if (nextNumber > TIER_LIMIT) { setMessage(`All ${TIER_LIMIT} tier slots are in use.`); return; }
    setBusy(true);
    try {
      await staffEntities.MarkupTier.create({ tier_number: nextNumber, tier_name: `Tier ${nextNumber}`, description: "", sort_order: nextNumber, markups: {} });
      setMessage(`Tier ${nextNumber} created.`);
      await onSaved?.();
    } catch (error) {
      setMessage(error?.message || "Tier could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const removeTier = async (tier) => {
    if (!window.confirm(`Delete tier "${tier.tier_name}"? Customers on this tier fall back to default markup.`)) return;
    setBusy(true);
    try {
      await staffEntities.MarkupTier.delete(tier.id);
      setEdits((prev) => { const next = { ...prev }; delete next[tier.id]; return next; });
      setMessage(`Tier "${tier.tier_name}" deleted.`);
      await onSaved?.();
    } catch (error) {
      setMessage(error?.message || "Tier could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  // --- #127 JSON import/export -------------------------------------------
  const exportJson = () => {
    const payload = { kind: "markup_tier_template", version: 1, exported_at: new Date().toISOString(), tiers: sorted.map(tierFields) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "markup-tiers.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file) => {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setMessage("Import failed — the file is not valid JSON.");
      return;
    }
    const rows = Array.isArray(parsed?.tiers) ? parsed.tiers : null;
    if (!rows?.length) { setMessage("Import failed — expected { tiers: [...] }."); return; }
    setBusy(true);
    const applied = [];
    const skipped = [];
    try {
      for (const raw of rows.slice(0, TIER_LIMIT)) {
        const next = tierFields(raw);
        if (!next.tier_name || !(next.tier_number > 0)) { skipped.push({ tier: raw?.tier_name || "?", reason: "invalid" }); continue; }
        const existing = sorted.find((t) => num(t.tier_number) === next.tier_number);
        if (existing) {
          await persistTier(existing, next, `Imported Tier ${next.tier_name}`);
          applied.push({ tier: next.tier_name, action: "updated" });
        } else {
          await staffEntities.MarkupTier.create(next);
          applied.push({ tier: next.tier_name, action: "created" });
        }
      }
      setMessage(`Import complete — ${applied.length} applied, ${skipped.length} skipped.`);
      await onSaved?.();
    } catch (error) {
      setMessage(`Import stopped after ${applied.length} tier(s): ${error?.message || "write failed"}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // --- #145 re-apply tier to open draft estimates ---------------------------
  const reapplyTier = async (tier) => {
    if (!window.confirm(`Re-apply "${tier.tier_name}" pricing to open draft estimates? Up to ${REAPPLY_BATCH} drafts will be flagged for repricing under tier ${num(tier.tier_number)}.`)) return;
    setBusy(true);
    setReapplyReport(null);
    const applied = [];
    const skipped = [];
    try {
      const rows = await staffEntities.AllInOneEstimate.filter({ status: "draft" }, "-updated_date", REAPPLY_BATCH);
      for (const row of (Array.isArray(rows) ? rows : [])) {
        try {
          await replaceEntityFieldsIfUnchanged({
            entity: staffEntities.AllInOneEstimate,
            id: row.id,
            expectedUpdatedAt: row.updated_date || "",
            expectedFields: { status: "draft" },
            nextFields: {
              pricing_tier: num(tier.tier_number),
              price_recalc_required: true,
              price_recalc_reason: `Re-applied tier ${num(tier.tier_number)} (${tier.tier_name}) markup from Pricing Admin`,
            },
            label: `Estimate ${row.estimate_number || row.id} tier re-apply`,
            maxAttempts: 1,
          });
          applied.push(row.estimate_number || row.id);
        } catch (error) {
          skipped.push({ estimate: row.estimate_number || row.id, reason: error?.message || "conflict" });
        }
      }
      setReapplyReport({ applied, skipped, tier: tier.tier_name });
    } catch (error) {
      setMessage(error?.message || "Draft estimates could not be loaded.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Markup Tiers</div>
          <div className="text-[9px] text-gray-500 mt-0.5">Tier rows consumed by loadCustomerPricingConfig. Markups are multipliers per category key (1.50 = 50% markup).</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-[28px] text-[10px]" disabled={busy} onClick={exportJson}><Download className="w-3 h-3 mr-1" /> Export JSON</Button>
          <Button variant="outline" className="h-[28px] text-[10px]" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="w-3 h-3 mr-1" /> Import JSON</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <Button variant="outline" className="h-[28px] text-[10px]" disabled={busy} onClick={addTier}><Plus className="w-3 h-3 mr-1" /> Tier</Button>
          <Button className="h-[28px] text-[10px] bg-[#454545] hover:bg-[#353535]" disabled={busy || !dirtyIds.length} onClick={saveDirty}><RefreshCw className={`w-3 h-3 mr-1 ${busy ? "animate-spin" : ""}`} /> Save{dirtyIds.length ? ` (${dirtyIds.length})` : ""}</Button>
        </div>
      </div>
      {message && <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/60 text-[10px] text-gray-700">{message}</div>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-2 py-1.5 text-[9px] font-bold text-gray-500 uppercase w-16">Tier #</th>
              <th className="px-2 py-1.5 text-[9px] font-bold text-gray-500 uppercase">Name</th>
              <th className="px-2 py-1.5 text-[9px] font-bold text-gray-500 uppercase">Description</th>
              <th className="px-2 py-1.5 text-[9px] font-bold text-gray-500 uppercase w-14">Sort</th>
              {cats.map((c) => <th key={c.category_key} className="px-2 py-1.5 text-[9px] font-bold text-gray-500 uppercase w-20">{c.category_key}</th>)}
              <th className="px-2 py-1.5 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tier) => {
              const d = draft(tier);
              const dirty = !!edits[tier.id];
              return (
                <tr key={tier.id} className={`border-t border-gray-100 ${dirty ? "bg-amber-50/50" : ""}`}>
                  <td className="px-1 py-1"><Input type="number" min="1" max={TIER_LIMIT} className="h-[26px] w-14 text-[11px]" value={d.tier_number} onChange={(e) => patch(tier, "tier_number", num(e.target.value))} /></td>
                  <td className="px-1 py-1"><Input className="h-[26px] text-[11px]" value={d.tier_name} onChange={(e) => patch(tier, "tier_name", e.target.value)} /></td>
                  <td className="px-1 py-1"><Input className="h-[26px] text-[11px]" value={d.description} onChange={(e) => patch(tier, "description", e.target.value)} /></td>
                  <td className="px-1 py-1"><Input type="number" className="h-[26px] w-14 text-[11px]" value={d.sort_order} onChange={(e) => patch(tier, "sort_order", num(e.target.value))} /></td>
                  {cats.map((c) => (
                    <td key={c.category_key} className="px-1 py-1">
                      <Input
                        type="number" step="0.01" className="h-[26px] w-20 text-[11px]"
                        value={d.markups[c.category_key] ?? ""}
                        placeholder="—"
                        onChange={(e) => {
                          const markups = { ...d.markups };
                          if (e.target.value === "") delete markups[c.category_key];
                          else markups[c.category_key] = num(e.target.value, 1);
                          patch(tier, "markups", markups);
                        }}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-right whitespace-nowrap">
                    <button title="Re-apply to open draft estimates" disabled={busy} className="p-1 text-gray-400 hover:text-emerald-700 disabled:opacity-40" onClick={() => reapplyTier(tier)}><RefreshCw className="w-3.5 h-3.5" /></button>
                    <button title="Delete tier" disabled={busy} className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-40" onClick={() => removeTier(tier)}><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={4 + cats.length + 1} className="px-3 py-6 text-center text-[11px] text-gray-400">No tiers yet — create one or import a template.</td></tr>}
          </tbody>
        </table>
      </div>
      {reapplyReport && (
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60 text-[10px] text-gray-700">
          Re-applied "{reapplyReport.tier}" to {reapplyReport.applied.length} draft estimate(s){reapplyReport.applied.length ? `: ${reapplyReport.applied.slice(0, 12).join(", ")}${reapplyReport.applied.length > 12 ? "…" : ""}` : ""}.
          {reapplyReport.skipped.length > 0 && ` Skipped ${reapplyReport.skipped.length}: ${reapplyReport.skipped.map((s) => `${s.estimate} (${s.reason})`).join(", ")}.`}
        </div>
      )}
    </section>
  );
}