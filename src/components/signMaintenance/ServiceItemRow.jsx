import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Copy, PackagePlus, RotateCcw, Trash2 } from "lucide-react";
import SignTypePicker from "./SignTypePicker";
import ActionPicker from "./ActionPicker";
import RepaintMonumentPanel from "./RepaintMonumentPanel";
import { defaultMonumentRepaintConfig } from "./repaintCalculator";
import { SIGN_TYPES_BY_ID, LETTER_SIZES, CABINET_SIZES, sizeAxisFor, ACTIONS } from "./constants";
import { materialFromInventory } from "./maintenanceCalculator";

export default function ServiceItemRow({ item, index, onUpdate, onRemove, onDuplicate, settings = {}, rates = [], materialRules = [] }) {
  const update = (patch) => onUpdate(index, { ...item, ...patch });

  const applicableMaterialRules = React.useMemo(() => (materialRules || []).filter((rule) => {
    if (rule.is_active === false || rule._master_missing) return false;
    const types = rule.applies_to_item_types || [];
    const sizes = rule.applies_to_sizes || [];
    const actions = rule.applies_to_actions || [];
    if (types.length && !types.includes(item.sign_type)) return false;
    if (sizes.length && !sizes.includes(item.size)) return false;
    if (actions.length && !actions.some((action) => (item.actions || []).includes(action))) return false;
    return true;
  }), [materialRules, item.sign_type, item.size, item.actions]);

  const selectedRuleIds = new Set((item.materials || []).map((material) => material.maintenance_rule_id || "").filter(Boolean));
  const addableMaterialRules = applicableMaterialRules.filter((rule) => !selectedRuleIds.has(rule.id));
  const needsSqft = (item.materials || []).some((material) => material.usage_basis === "per_sqft");
  const needsLinearFeet = (item.materials || []).some((material) => material.usage_basis === "per_linear_foot");

  const updateMaterial = (materialIndex, patch) => update({
    materials: (item.materials || []).map((material, idx) => idx === materialIndex ? { ...material, ...patch } : material),
  });

  const addMaterial = (ruleId) => {
    const rule = (materialRules || []).find((candidate) => candidate.id === ruleId);
    if (!rule) return;
    update({ materials: [...(item.materials || []), materialFromInventory(rule, item)] });
  };

  // Actions enabled for the current sign type, driven by the user's Settings
  // toggles (MaintenanceActionRate.is_enabled). If no rate row exists yet for
  // a (sign_type, action) pair, we treat it as enabled (default).
  const enabledActionsForSign = React.useMemo(() => {
    if (!item.sign_type) return [];
    return ACTIONS
      .map(a => a.id)
      .filter(actionId => {
        const r = rates.find(x => x.sign_type === item.sign_type && x.action === actionId);
        return !r || r.is_enabled !== false;
      });
  }, [item.sign_type, rates]);

  const handleSignTypeChange = (id) => {
    // Reset size and prune actions that are not enabled for this sign type.
    const allowed = ACTIONS
      .map(a => a.id)
      .filter(actionId => {
        const r = rates.find(x => x.sign_type === id && x.action === actionId);
        return !r || r.is_enabled !== false;
      });
    const filteredActions = (item.actions || []).filter(a => allowed.includes(a));
    const axis = sizeAxisFor(id);
    const defaultSize = axis === "cabinet" ? "cab_medium" : "medium";
    update({ sign_type: id, actions: filteredActions, size: defaultSize });
  };

  const toggleAction = (actionId) => {
    const cur = item.actions || [];
    const next = cur.includes(actionId) ? cur.filter(a => a !== actionId) : [...cur, actionId];
    const patch = { actions: next };
    // Seed default monument repaint config the first time both are selected.
    if (actionId === "repaint" && next.includes("repaint") && item.sign_type === "monument_sign" && !item.repaint_config) {
      patch.repaint_config = defaultMonumentRepaintConfig();
    }
    update(patch);
  };

  const isMonumentRepaint = item.sign_type === "monument_sign" && (item.actions || []).includes("repaint");

  const axis = sizeAxisFor(item.sign_type);
  const sizes = axis === "cabinet" ? CABINET_SIZES : LETTER_SIZES;
  const sizeLabel = axis === "cabinet" ? "Cabinet Size" : "Letter Size";
  const qtyLabel = axis === "cabinet" ? "# of Cabinets" : "# of Letters";

  const meta = SIGN_TYPES_BY_ID[item.sign_type];

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">Description (optional)</Label>
            <Input
              value={item.description || ""}
              onChange={(e) => update({ description: e.target.value })}
              placeholder={meta ? `e.g. Front ${meta.label} — north elevation` : "e.g. Front Channel Letters — north elevation"}
              className="h-9 text-sm mt-1"
            />
          </div>
          <div className="flex gap-1 pt-5">
            <Button size="icon" variant="ghost" onClick={() => onDuplicate(index)} title="Duplicate"><Copy className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => onRemove(index)} title="Remove"><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>

        <div>
          <Label className="text-[11px] uppercase tracking-wide text-slate-500 block mb-1.5">Sign Type</Label>
          <SignTypePicker value={item.sign_type} onChange={handleSignTypeChange} />
        </div>

        {item.sign_type && (
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">{sizeLabel}</Label>
              <select
                className="h-9 w-full rounded-md border border-slate-200 text-sm bg-white px-2 mt-1"
                value={item.size || sizes[1].id}
                onChange={(e) => update({ size: e.target.value })}
              >
                {sizes.map(s => <option key={s.id} value={s.id}>{s.label} {s.range ? `— ${s.range}` : ""}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">{qtyLabel}</Label>
              <Input
                type="number" min="0" step="1"
                value={item.qty ?? (axis === "cabinet" ? 1 : 10)}
                onChange={(e) => update({ qty: parseFloat(e.target.value) || 0 })}
                className="h-9 text-sm tabular-nums mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">Install Height (ft)</Label>
              <Input
                type="number" min="0" step="1"
                value={item.installation_height_feet ?? 12}
                onChange={(e) => update({ installation_height_feet: parseFloat(e.target.value) || 0 })}
                className="h-9 text-sm tabular-nums mt-1"
              />
            </div>
          </div>
        )}

        {item.sign_type && (
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-slate-500 block mb-1.5">Work to be Performed</Label>
            <ActionPicker
              signType={item.sign_type}
              selected={item.actions || []}
              onToggle={toggleAction}
              enabledActions={enabledActionsForSign}
            />
          </div>
        )}

        {item.sign_type && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">Materials</Label>
                <div className="text-[10px] text-slate-400 mt-0.5">Master Inventory cost × usage rule. Quantities can be overridden for this service item.</div>
              </div>
              <div className="text-right"><div className="text-[9px] text-slate-400">MATERIAL TOTAL</div><div className="text-sm font-bold tabular-nums">${(parseFloat(item.materials_cost) || 0).toFixed(2)}</div></div>
            </div>

            {(needsSqft || needsLinearFeet) && (
              <div className="grid sm:grid-cols-2 gap-2 rounded border border-slate-200 bg-white p-2.5">
                {needsSqft && <label className="text-[10px] font-semibold text-slate-500">FACE / WORK AREA (SQ FT)<Input type="number" min="0" step="0.01" value={item.face_sqft || 0} onChange={(e) => update({ face_sqft: parseFloat(e.target.value) || 0 })} className="h-8 mt-1 text-xs" /></label>}
                {needsLinearFeet && <label className="text-[10px] font-semibold text-slate-500">LINEAR FEET<Input type="number" min="0" step="0.01" value={item.linear_feet || 0} onChange={(e) => update({ linear_feet: parseFloat(e.target.value) || 0 })} className="h-8 mt-1 text-xs" /></label>}
              </div>
            )}

            {(item.materials || []).length === 0 ? (
              <div className="rounded border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-[10px] text-slate-400">No materials are currently attached to this service item.</div>
            ) : (
              <div className="space-y-1.5">
                {(item.materials || []).map((material, materialIndex) => (
                  <div key={`${material.maintenance_rule_id || material.inventory_item_id || materialIndex}-${materialIndex}`} className="grid grid-cols-[minmax(0,1fr)_90px_85px_85px_28px] gap-2 items-center rounded border border-slate-200 bg-white px-2.5 py-2">
                    <div className="min-w-0"><div className="text-[10px] font-bold text-slate-800 truncate flex items-center gap-1">{material.item_name || "Material"}{material.link_missing && <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0" />}</div><div className="text-[8px] text-slate-400 truncate">{material.inventory_entity ? `${material.inventory_entity} · ` : ""}${material.usage_basis ? String(material.usage_basis).replaceAll("_", " ") : material.pricing_mode || "manual"}</div></div>
                    <div className="text-right"><div className="text-[8px] text-slate-400">UNIT COST</div><div className="text-[10px] font-semibold">${(parseFloat(material.unit_cost) || 0).toFixed(2)} / {material.unit || "unit"}</div></div>
                    <div><div className="text-[8px] text-slate-400">QUANTITY</div><Input type="number" min="0" step="any" value={material.quantity ?? 0} onChange={(e) => updateMaterial(materialIndex, { quantity: parseFloat(e.target.value) || 0, quantity_override: true })} className="h-7 mt-0.5 px-1.5 text-[10px]" /></div>
                    <div className="text-right"><div className="text-[8px] text-slate-400">TOTAL</div><div className="text-[11px] font-bold">${(parseFloat(material.total_cost) || 0).toFixed(2)}</div>{material.quantity_override && <button type="button" onClick={() => updateMaterial(materialIndex, { quantity_override: false, quantity: material.auto_quantity ?? material.quantity })} className="text-[8px] text-cyan-700 inline-flex items-center gap-0.5"><RotateCcw className="w-2.5 h-2.5" /> Auto</button>}</div>
                    <button type="button" onClick={() => update({ materials: (item.materials || []).filter((_, idx) => idx !== materialIndex) })} className="w-7 h-7 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Remove material"><Trash2 className="w-3.5 h-3.5 mx-auto" /></button>
                  </div>
                ))}
              </div>
            )}

            {addableMaterialRules.length > 0 ? (
              <div className="flex justify-end"><label className="relative"><PackagePlus className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-cyan-700 pointer-events-none" /><select value="" onChange={(e) => { if (e.target.value) addMaterial(e.target.value); }} className="h-8 pl-8 pr-8 rounded border border-cyan-300 bg-cyan-50 text-[10px] font-semibold text-cyan-800"><option value="">Add configured material…</option>{addableMaterialRules.map((rule) => <option key={rule.id} value={rule.id}>{rule._display_name || rule.item_name}</option>)}</select></label></div>
            ) : materialRules.length === 0 ? (
              <div className="text-[9px] text-slate-400">No Maintenance material rules are configured yet. Add them under Maintenance Settings → Material Rules.</div>
            ) : null}
          </div>
        )}

        {/* Specialized estimator panels per (sign_type × action) */}
        {isMonumentRepaint && (
          <RepaintMonumentPanel item={item} settings={settings} onChange={update} />
        )}
      </CardContent>
    </Card>
  );
}