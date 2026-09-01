import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, Edit3, Link2, Plus, Save, ShieldCheck } from "lucide-react";
import { MaintenanceInventory } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MasterPartPickerModal from "@/components/estimator/parts/MasterPartPickerModal";
import { money } from "@/components/estimator/aioPricing";
import { SIGN_TYPES, ACTIONS } from "./constants";
import {
  isMaintenanceMaterialCatalogItem,
  legacyPricingModeForUsageBasis,
  loadMaintenanceMaterialRules,
  suggestedUsageBasis,
  suggestedUsageMultiplier,
} from "./maintenanceMaterialRules";

const SIZE_OPTIONS = [
  ["extra_small", "XS Letters"], ["small", "Small Letters"], ["medium", "Medium Letters"],
  ["large", "Large Letters"], ["extra_large", "XL Letters"], ["extra_extra_large", "XXL Letters"],
  ["cab_small", "Small Cabinet"], ["cab_medium", "Medium Cabinet"], ["cab_large", "Large Cabinet"], ["cab_extra_large", "XL Cabinet"],
];
const BASIS_OPTIONS = [
  ["per_letter", "Per letter"], ["per_cabinet", "Per cabinet"], ["per_linear_foot", "Per linear foot"],
  ["per_sqft", "Per square foot"], ["per_service_item", "Per service item"],
];

const emptyDraft = () => ({
  item_name: "",
  inventory_entity: "",
  inventory_item_id: "",
  inventory_item_name: "",
  usage_basis: "per_service_item",
  usage_multiplier: 1,
  usage_rounding: "none",
  applies_to_item_types: [],
  applies_to_sizes: [],
  applies_to_actions: [],
  pricing_mode: "per_project_flat",
  is_default: true,
  is_active: true,
  sort_order: 0,
  notes: "",
});

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function RuleEditor({ open, rule, catalog, onClose, onSaved }) {
  const [draft, setDraft] = useState(emptyDraft());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft({ ...emptyDraft(), ...(rule || {}) });
    setSaving(false);
    setError("");
  }, [open, rule?.id]);

  const linked = catalog.find((item) => item.entity === draft.inventory_entity && item.inventoryId === draft.inventory_item_id) || null;
  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));

  const save = async () => {
    if (!draft.inventory_entity || !draft.inventory_item_id || !draft.item_name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        item_name: draft.item_name.trim(),
        inventory_entity: draft.inventory_entity,
        inventory_item_id: draft.inventory_item_id,
        inventory_item_name: draft.inventory_item_name || linked?.name || draft.item_name.trim(),
        usage_basis: draft.usage_basis,
        usage_multiplier: Math.max(0, Number(draft.usage_multiplier || 0)),
        usage_rounding: draft.usage_rounding === "ceil_whole" ? "ceil_whole" : "none",
        applies_to_item_types: draft.applies_to_item_types || [],
        applies_to_sizes: draft.applies_to_sizes || [],
        applies_to_actions: draft.applies_to_actions || [],
        pricing_mode: legacyPricingModeForUsageBasis(draft.usage_basis),
        is_default: draft.is_default !== false,
        is_active: draft.is_active !== false,
        sort_order: Number(draft.sort_order || 0),
        notes: draft.notes || "",
      };
      if (rule?.id) await MaintenanceInventory.update(rule.id, payload);
      else await MaintenanceInventory.create(payload);
      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || "Maintenance material rule could not be saved.");
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose?.()}>
        <DialogContent className="sm:max-w-[920px] p-0 overflow-hidden border-gray-300 shadow-2xl">
          <DialogHeader className="px-5 py-4 bg-[#3f3f3f] text-white border-b-4 border-lime-300">
            <DialogTitle className="text-white text-[17px] flex items-center gap-2"><Link2 className="w-5 h-5 text-lime-300" /> {rule?.id ? "Edit" : "Add"} Maintenance Material Rule</DialogTitle>
            <p className="text-[10px] text-gray-300 mt-1">Master Inventory owns the resource and cost. This rule only controls when and how much Maintenance uses.</p>
          </DialogHeader>
          <div className="p-5 bg-white space-y-4 max-h-[78vh] overflow-y-auto">
            <section className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[9px] font-bold tracking-widest text-gray-400">MASTER INVENTORY RESOURCE</div>
                  <div className="text-[12px] font-bold text-gray-900 mt-1">{linked?.name || draft.inventory_item_name || "No resource selected"}</div>
                  {linked && <div className="text-[9px] text-gray-500 mt-0.5">{linked.categoryLabel} · {String(linked.subtype || "").replaceAll("_", " ")} · {money(linked.unitCost)} / {linked.unit}</div>}
                </div>
                <Button type="button" variant="outline" className="h-[30px] text-[10px]" onClick={() => setPickerOpen(true)}><Boxes className="w-3.5 h-3.5 mr-1.5" /> {linked ? "Change Resource" : "Select Resource"}</Button>
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="md:col-span-2 text-[10px] font-bold tracking-wide text-gray-500">RULE NAME<Input value={draft.item_name} onChange={(e) => patch({ item_name: e.target.value })} className="mt-1 h-[33px] text-[11px]" placeholder="e.g. LED modules — medium channel letters" /></label>
              <label className="text-[10px] font-bold tracking-wide text-gray-500">USAGE BASIS<select value={draft.usage_basis} onChange={(e) => patch({ usage_basis: e.target.value })} className="mt-1 w-full h-[33px] border border-gray-300 rounded px-2 bg-white text-[11px]">{BASIS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-[10px] font-bold tracking-wide text-gray-500">MASTER UNITS / BASIS UNIT<Input type="number" min="0" step="any" value={draft.usage_multiplier} onChange={(e) => patch({ usage_multiplier: e.target.value })} className="mt-1 h-[33px] text-[11px]" /></label>
              <label className="text-[10px] font-bold tracking-wide text-gray-500">QUANTITY ROUNDING<select value={draft.usage_rounding} onChange={(e) => patch({ usage_rounding: e.target.value })} className="mt-1 w-full h-[33px] border border-gray-300 rounded px-2 bg-white text-[11px]"><option value="none">No rounding</option><option value="ceil_whole">Round up to whole Master unit</option></select></label>
              <div className="rounded border border-lime-200 bg-lime-50 px-3 py-2 self-end"><div className="text-[9px] text-gray-500">CURRENT RESOURCE RATE</div><div className="text-[12px] font-bold text-gray-900">{linked ? `${money(linked.unitCost)} / ${linked.unit}` : "Select a resource"}</div></div>
            </div>

            <section className="rounded border border-gray-200 p-3 space-y-3">
              <div><div className="text-[10px] font-bold text-gray-700">Applies to Sign Types</div><div className="text-[9px] text-gray-400">Leave all unchecked to apply to every sign type.</div></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">{SIGN_TYPES.map((item) => <label key={item.id} className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1.5 text-[10px] bg-gray-50"><input type="checkbox" checked={(draft.applies_to_item_types || []).includes(item.id)} onChange={() => patch({ applies_to_item_types: toggle(draft.applies_to_item_types || [], item.id) })} className="accent-lime-600" /> {item.label}</label>)}</div>
            </section>

            <section className="rounded border border-gray-200 p-3 space-y-3">
              <div><div className="text-[10px] font-bold text-gray-700">Applies to Maintenance Actions</div><div className="text-[9px] text-gray-400">Leave all unchecked to apply to every action.</div></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 max-h-[190px] overflow-y-auto">{ACTIONS.map((item) => <label key={item.id} className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1.5 text-[10px] bg-gray-50"><input type="checkbox" checked={(draft.applies_to_actions || []).includes(item.id)} onChange={() => patch({ applies_to_actions: toggle(draft.applies_to_actions || [], item.id) })} className="accent-lime-600" /> {item.label}</label>)}</div>
            </section>

            <section className="rounded border border-gray-200 p-3 space-y-3">
              <div><div className="text-[10px] font-bold text-gray-700">Applies to Sizes</div><div className="text-[9px] text-gray-400">Leave all unchecked for every size. Separate rules may reference the same Master item when usage changes by size.</div></div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5">{SIZE_OPTIONS.map(([value, label]) => <label key={value} className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1.5 text-[10px] bg-gray-50"><input type="checkbox" checked={(draft.applies_to_sizes || []).includes(value)} onChange={() => patch({ applies_to_sizes: toggle(draft.applies_to_sizes || [], value) })} className="accent-lime-600" /> {label}</label>)}</div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex items-center justify-between gap-3 rounded border border-gray-200 px-3 py-2"><span><span className="block text-[10px] font-bold text-gray-700">Automatic Default</span><span className="block text-[9px] text-gray-400">Auto-add when applicability matches.</span></span><input type="checkbox" checked={draft.is_default !== false} onChange={(e) => patch({ is_default: e.target.checked })} className="w-4 h-4 accent-lime-600" /></label>
              <label className="flex items-center justify-between gap-3 rounded border border-gray-200 px-3 py-2"><span><span className="block text-[10px] font-bold text-gray-700">Active Rule</span><span className="block text-[9px] text-gray-400">Inactive rules stay preserved.</span></span><input type="checkbox" checked={draft.is_active !== false} onChange={(e) => patch({ is_active: e.target.checked })} className="w-4 h-4 accent-lime-600" /></label>
              <label className="text-[10px] font-bold tracking-wide text-gray-500">SORT ORDER<Input type="number" value={draft.sort_order || 0} onChange={(e) => patch({ sort_order: e.target.value })} className="mt-1 h-[33px] text-[11px]" /></label>
            </div>
            <label className="text-[10px] font-bold tracking-wide text-gray-500 block">INTERNAL NOTES<textarea rows={2} value={draft.notes || ""} onChange={(e) => patch({ notes: e.target.value })} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-[11px]" /></label>
            {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" className="h-[31px] text-[10px]" disabled={saving} onClick={onClose}>Cancel</Button><Button type="button" className="h-[31px] text-[10px] bg-lime-300 text-gray-900 hover:bg-lime-400" disabled={saving || !draft.inventory_item_id || !draft.item_name.trim()} onClick={save}><Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? "Saving…" : "Save Rule"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
      <MasterPartPickerModal
        open={pickerOpen}
        mode="select"
        catalogFilter={isMaintenanceMaterialCatalogItem}
        onClose={() => setPickerOpen(false)}
        onAdd={(item) => {
          const basis = suggestedUsageBasis(item);
          patch({
            inventory_entity: item.entity,
            inventory_item_id: item.inventoryId,
            inventory_item_name: item.name,
            item_name: draft.item_name || item.name,
            usage_basis: basis,
            usage_multiplier: suggestedUsageMultiplier(item, basis),
            pricing_mode: legacyPricingModeForUsageBasis(basis),
          });
        }}
      />
    </>
  );
}

export default function MaintenanceMaterialRulesTab() {
  const [rules, setRules] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await loadMaintenanceMaterialRules({ includeInactive: true });
      setRules(data.rules || []);
      setCatalog(data.catalog || []);
    } catch (err) {
      setError(err?.message || "Maintenance material rules could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sorted = useMemo(() => [...rules].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a._display_name || a.item_name || "").localeCompare(String(b._display_name || b.item_name || ""))), [rules]);
  const setActive = async (rule, next) => {
    try {
      await MaintenanceInventory.update(rule.id, { is_active: next });
      await load();
    } catch (err) { setError(err?.message || "Rule status could not be changed."); }
  };

  const scopeSummary = (rule) => {
    const signs = rule.applies_to_item_types?.length ? `${rule.applies_to_item_types.length} sign type${rule.applies_to_item_types.length === 1 ? "" : "s"}` : "all sign types";
    const actions = rule.applies_to_actions?.length ? `${rule.applies_to_actions.length} action${rule.applies_to_actions.length === 1 ? "" : "s"}` : "all actions";
    const sizes = rule.applies_to_sizes?.length ? `${rule.applies_to_sizes.length} size${rule.applies_to_sizes.length === 1 ? "" : "s"}` : "all sizes";
    return `${signs} · ${actions} · ${sizes}`;
  };

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
        <div><div className="text-[11px] font-bold uppercase tracking-wide text-gray-700">Maintenance Material Rules</div><div className="text-[10px] text-gray-500 mt-0.5">References Master Inventory for cost. Rules only define applicability and usage quantity.</div></div>
        <Button className="h-[30px] bg-lime-300 hover:bg-lime-400 text-gray-900 text-[10px] font-bold" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Rule</Button>
      </div>
      {error && <div className="m-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div>}
      {loading ? <div className="py-14 text-center text-[11px] text-gray-400">Loading Maintenance material rules…</div> : sorted.length === 0 ? (
        <div className="py-14 text-center"><Boxes className="w-9 h-9 text-gray-300 mx-auto" /><div className="mt-2 text-[12px] font-bold text-gray-700">No Maintenance material rules yet</div><div className="mt-1 text-[10px] text-gray-400">Create rules that reference existing Master Inventory resources. No resource prices are copied here.</div></div>
      ) : (
        <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-gray-50 border-b border-gray-200"><tr className="text-[9px] text-gray-500"><th className="px-4 py-2">RESOURCE / RULE</th><th className="px-3 py-2">APPLIES TO</th><th className="px-3 py-2">USAGE</th><th className="px-3 py-2 text-right">CURRENT COST</th><th className="px-3 py-2">DEFAULT</th><th className="px-3 py-2">STATUS</th><th className="px-4 py-2 text-right">ACTIONS</th></tr></thead><tbody className="divide-y divide-gray-100">{sorted.map((rule) => <tr key={rule.id} className="hover:bg-gray-50"><td className="px-4 py-2.5 min-w-[250px]"><div className="text-[11px] font-bold text-gray-900">{rule.item_name}</div><div className="text-[9px] text-gray-500 flex items-center gap-1 mt-0.5">{rule._master_missing ? <><AlertTriangle className="w-3 h-3 text-amber-600" /><span className="text-amber-700">Master Inventory link missing</span></> : rule._master_item ? <><ShieldCheck className="w-3 h-3 text-emerald-600" /> {rule._master_item.name}</> : <>Legacy manual pricing</>}</div></td><td className="px-3 py-2.5 text-[9px] text-gray-500 min-w-[210px]">{scopeSummary(rule)}</td><td className="px-3 py-2.5 text-[10px] text-gray-700 whitespace-nowrap">{String(rule.usage_basis || "legacy").replaceAll("_", " ")} × {Number(rule.usage_multiplier ?? 1).toLocaleString()}{rule.usage_rounding === "ceil_whole" ? " · round up" : ""}</td><td className="px-3 py-2.5 text-right whitespace-nowrap"><div className="text-[11px] font-bold text-gray-900">{rule._master_item ? money(rule._master_unit_cost) : "Legacy"}</div>{rule._master_item && <div className="text-[8px] text-gray-400">per {rule._master_unit}</div>}</td><td className="px-3 py-2.5 text-[9px] font-semibold">{rule.is_default === false ? "Optional" : "Auto"}</td><td className="px-3 py-2.5 text-[9px] font-semibold"><span className={rule.is_active === false ? "text-gray-400" : "text-emerald-700"}>{rule.is_active === false ? "Inactive" : "Active"}</span></td><td className="px-4 py-2.5"><div className="flex justify-end gap-1"><button type="button" onClick={() => { setEditing(rule); setOpen(true); }} className="h-[27px] px-2 rounded border border-gray-300 bg-white text-[9px] font-bold text-gray-700"><Edit3 className="w-3 h-3 inline mr-1" />Edit</button><button type="button" onClick={() => setActive(rule, rule.is_active === false)} className="h-[27px] px-2 rounded border border-gray-300 bg-white text-[9px] font-bold text-gray-600">{rule.is_active === false ? "Activate" : "Deactivate"}</button></div></td></tr>)}</tbody></table></div>
      )}
      <div className="px-4 py-2.5 border-t border-gray-200 bg-gray-50 text-[9px] text-gray-400"><Link2 className="w-3 h-3 inline mr-1" /> Master Inventory remains authoritative. Deactivating a rule does not delete the resource or historical estimate snapshots.</div>
      <RuleEditor open={open} rule={editing} catalog={catalog} onClose={() => { setOpen(false); setEditing(null); }} onSaved={load} />
    </section>
  );
}
