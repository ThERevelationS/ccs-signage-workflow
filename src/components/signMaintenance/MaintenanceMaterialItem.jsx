// Single editable card for one MaintenanceInventory record.
// Used by both sub-tabs (Main Service Type / Action Items) of the Maintenance
// Materials tab. All applicability tagging is done here in one place.

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Trash2, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { SIGN_TYPES, ACTIONS, ACTION_GROUPS } from "./constants";

const PRICING_MODES = [
  { value: "per_letter_flat",      label: "Per Letter (Flat)" },
  { value: "per_letter_by_size",   label: "Per Letter (By Size)" },
  { value: "per_cabinet_flat",     label: "Per Cabinet (Flat)" },
  { value: "per_cabinet_by_size",  label: "Per Cabinet (By Size)" },
  { value: "per_linear_foot",      label: "Per Linear Foot" },
  { value: "per_sqft",             label: "Per Sq Ft" },
  { value: "per_project_flat",     label: "Per Service Item (Flat)" },
];

export default function MaintenanceMaterialItem({
  item, isDirty, defaultExpanded, onChange, onRemove, onDuplicate,
}) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);

  const update = (patch) => onChange(patch);
  const types = Array.isArray(item.applies_to_item_types) ? item.applies_to_item_types : [];
  const actions = Array.isArray(item.applies_to_actions) ? item.applies_to_actions : [];

  const toggleInArray = (key, value) => {
    const arr = Array.isArray(item[key]) ? item[key] : [];
    const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
    update({ [key]: next });
  };

  const headlineCost = () => {
    switch (item.pricing_mode) {
      case "per_letter_flat":    return `$${(item.cost_per_letter || 0).toFixed(2)} / letter`;
      case "per_cabinet_flat":   return `$${(item.cost_per_cabinet || 0).toFixed(2)} / cabinet`;
      case "per_linear_foot":    return `$${(item.cost_per_foot || 0).toFixed(2)} / ft`;
      case "per_sqft":           return `$${(item.cost_per_sqft || 0).toFixed(2)} / sqft`;
      case "per_project_flat":   return `$${(item.cost_flat || 0).toFixed(2)} / item`;
      default:                   return "Variable pricing";
    }
  };

  return (
    <div className={`bg-white border rounded-xl ${isDirty ? "border-amber-300 ring-1 ring-amber-100" : "border-slate-200"}`}>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
        <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setExpanded(x => !x)}>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(x => !x)}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 truncate">
              {item.item_name || <span className="text-slate-400 italic">Unnamed item</span>}
            </span>
            <Badge variant="outline" className="text-[10px] bg-slate-50">{headlineCost()}</Badge>
            {types.length > 0 && (
              <Badge variant="outline" className="text-[10px] bg-cyan-50 text-cyan-700 border-cyan-200">
                {types.length} sign type{types.length !== 1 ? "s" : ""}
              </Badge>
            )}
            {actions.length > 0 && (
              <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">
                {actions.length} action{actions.length !== 1 ? "s" : ""}
              </Badge>
            )}
            {isDirty && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Unsaved</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="h-8 w-8 p-0 text-slate-500"><Copy className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="h-8 w-8 p-0 text-red-500"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 px-4 py-4 bg-slate-50/40 space-y-4">
          <div className="grid md:grid-cols-12 gap-3">
            <div className="md:col-span-6">
              <Label className="text-xs">Material Name</Label>
              <Input value={item.item_name || ""} onChange={(e) => update({ item_name: e.target.value })} placeholder="e.g. White Acrylic Face" className="h-9 mt-1" />
            </div>
            <div className="md:col-span-3">
              <Label className="text-xs">Supplier</Label>
              <Input value={item.supplier || ""} onChange={(e) => update({ supplier: e.target.value })} className="h-9 mt-1" />
            </div>
            <div className="md:col-span-3">
              <Label className="text-xs">Unit</Label>
              <Input value={item.unit || ""} onChange={(e) => update({ unit: e.target.value })} placeholder="ea, ft, sqft" className="h-9 mt-1" />
            </div>
          </div>

          {/* Applies to: Service types */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Applies to Service Types <span className="text-slate-400 font-normal">(leave empty for all)</span></Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              {SIGN_TYPES.map(st => (
                <label key={st.id} className="flex items-center gap-2 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={types.includes(st.id)} onCheckedChange={() => toggleInArray("applies_to_item_types", st.id)} />
                  <span className="truncate">{st.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Applies to: Actions, grouped */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Applies to Maintenance Actions <span className="text-slate-400 font-normal">(leave empty for all)</span></Label>
            <div className="space-y-3 mt-2">
              {ACTION_GROUPS.map(group => (
                <div key={group}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">{group}</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {ACTIONS.filter(a => a.group === group).map(a => (
                      <label key={a.id} className="flex items-center gap-2 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-slate-50">
                        <Checkbox checked={actions.includes(a.id)} onCheckedChange={() => toggleInArray("applies_to_actions", a.id)} />
                        <span className="truncate">{a.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing */}
          <div className="grid md:grid-cols-12 gap-3">
            <div className="md:col-span-4">
              <Label className="text-xs">Pricing Mode</Label>
              <Select value={item.pricing_mode || "per_letter_flat"} onValueChange={(v) => update({ pricing_mode: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRICING_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-8">
              {item.pricing_mode === "per_letter_flat" && (
                <div><Label className="text-xs">Cost / Letter ($)</Label><Input type="number" step="0.01" value={item.cost_per_letter || 0} onChange={(e) => update({ cost_per_letter: parseFloat(e.target.value) || 0 })} className="h-9 mt-1 max-w-[200px]" /></div>
              )}
              {item.pricing_mode === "per_cabinet_flat" && (
                <div><Label className="text-xs">Cost / Cabinet ($)</Label><Input type="number" step="0.01" value={item.cost_per_cabinet || 0} onChange={(e) => update({ cost_per_cabinet: parseFloat(e.target.value) || 0 })} className="h-9 mt-1 max-w-[200px]" /></div>
              )}
              {item.pricing_mode === "per_linear_foot" && (
                <div><Label className="text-xs">Cost / Linear Foot ($)</Label><Input type="number" step="0.01" value={item.cost_per_foot || 0} onChange={(e) => update({ cost_per_foot: parseFloat(e.target.value) || 0 })} className="h-9 mt-1 max-w-[200px]" /></div>
              )}
              {item.pricing_mode === "per_sqft" && (
                <div><Label className="text-xs">Cost / Sq Ft ($)</Label><Input type="number" step="0.01" value={item.cost_per_sqft || 0} onChange={(e) => update({ cost_per_sqft: parseFloat(e.target.value) || 0 })} className="h-9 mt-1 max-w-[200px]" /></div>
              )}
              {item.pricing_mode === "per_project_flat" && (
                <div><Label className="text-xs">Flat Cost / Service Item ($)</Label><Input type="number" step="0.01" value={item.cost_flat || 0} onChange={(e) => update({ cost_flat: parseFloat(e.target.value) || 0 })} className="h-9 mt-1 max-w-[200px]" /></div>
              )}
              {(item.pricing_mode === "per_letter_by_size" || item.pricing_mode === "per_cabinet_by_size") && (
                <div className="text-xs text-slate-500 mt-1 italic">Size-based pricing matrix (advanced) — edit via Master Inventory.</div>
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={item.notes || ""} onChange={(e) => update({ notes: e.target.value })} className="h-9 mt-1" />
          </div>
        </div>
      )}
    </div>
  );
}