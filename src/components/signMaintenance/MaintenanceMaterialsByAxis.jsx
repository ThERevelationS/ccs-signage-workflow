// Maintenance Materials editor — generic by "axis".
//   axis="sign_type" → filters by applies_to_item_types (the 8 main service item types)
//   axis="action"    → filters by applies_to_actions (the 20 maintenance actions)
//
// Items are stored in the MaintenanceInventory entity; the same row can carry
// both axes' tags simultaneously (so a single inventory item can apply to
// specific sign types AND specific actions).

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { MaintenanceInventory } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Save, Trash2, Search, ChevronDown, Package2 } from "lucide-react";
import { SIGN_TYPES, ACTIONS, ACTION_GROUPS } from "./constants";

const PRICING_MODES = [
  { value: "per_letter_flat",    label: "Per Letter (Flat)" },
  { value: "per_letter_by_size", label: "Per Letter (By Size)" },
  { value: "per_cabinet_flat",   label: "Per Cabinet (Flat)" },
  { value: "per_cabinet_by_size",label: "Per Cabinet (By Size)" },
  { value: "per_linear_foot",    label: "Per Linear Foot" },
  { value: "per_sqft",           label: "Per Sq. Ft." },
  { value: "per_project_flat",   label: "Per Sign (Flat)" },
];

const summarizeCost = (it) => {
  const n = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;
  switch (it.pricing_mode) {
    case "per_letter_flat":    return `${n(it.cost_per_letter)} / letter`;
    case "per_letter_by_size": return "By letter size";
    case "per_cabinet_flat":   return `${n(it.cost_per_cabinet)} / cabinet`;
    case "per_cabinet_by_size":return "By cabinet size";
    case "per_linear_foot":    return `${n(it.cost_per_foot)} / ft`;
    case "per_sqft":            return `${n(it.cost_per_sqft)} / sqft`;
    case "per_project_flat":   return `${n(it.cost_flat)} / sign`;
    default: return "";
  }
};

// Multi-select dropdown rendered as a popover with checkboxes.
function MultiSelectDropdown({ options, value, onChange, placeholder = "All" }) {
  const list = Array.isArray(value) ? value : [];
  const toggle = (v) => {
    if (list.includes(v)) onChange(list.filter(x => x !== v));
    else onChange([...list, v]);
  };
  const summary = list.length === 0
    ? placeholder
    : list.length <= 2
      ? list.map(v => options.find(o => o.value === v)?.label || v).join(", ")
      : `${list.length} selected`;

  // Allow grouped options (with .group field)
  const grouped = useMemo(() => {
    const hasGroups = options.some(o => o.group);
    if (!hasGroups) return [{ group: null, items: options }];
    const map = new Map();
    for (const o of options) {
      const g = o.group || "";
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(o);
    }
    return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
  }, [options]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-8 w-full justify-between font-normal text-xs px-2">
          <span className="truncate">{summary}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 max-h-[60vh] overflow-y-auto" align="start">
        <div className="space-y-3">
          {grouped.map(({ group, items }) => (
            <div key={group || "_"}>
              {group && (
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-2 pb-1">
                  {group}
                </div>
              )}
              <div className="space-y-0.5">
                {items.map(opt => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={list.includes(opt.value)}
                      onCheckedChange={() => toggle(opt.value)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="border-t pt-1 mt-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
            >
              Clear (apply to all)
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const emptyItem = () => ({
  item_name: "",
  applies_to_item_types: [],
  applies_to_sizes: [],
  applies_to_actions: [],
  pricing_mode: "per_letter_flat",
  cost_per_letter: 0,
  cost_per_cabinet: 0,
  cost_per_foot: 0,
  cost_per_sqft: 0,
  cost_flat: 0,
  unit: "ea",
  supplier: "",
  notes: "",
  is_default: true,
  sort_order: 0,
});

// `axis` controls what the "Applies To" multi-select shows (sign types vs actions)
// and how items are grouped on screen. Both fields are persisted regardless,
// so an item can be tagged on both axes.
export default function MaintenanceMaterialsByAxis({ axis }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dirtyIds, setDirtyIds] = useState(new Set());
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await MaintenanceInventory.list("sort_order");
      setItems(data);
      setDirtyIds(new Set());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markDirty = (idx) => {
    setDirtyIds(prev => { const n = new Set(prev); n.add(idx); return n; });
  };

  const update = (idx, patch) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    markDirty(idx);
  };

  const addItem = () => {
    setItems(prev => {
      const next = [...prev, { ...emptyItem(), _localKey: `new-${Date.now()}`, _new: true }];
      markDirty(next.length - 1);
      return next;
    });
  };

  const removeItem = async (idx) => {
    const it = items[idx];
    if (!confirm(`Delete "${it.item_name || "this item"}"?`)) return;
    if (it.id) {
      try { await MaintenanceInventory.delete(it.id); }
      catch (e) { toast({ variant: "destructive", description: "Delete failed: " + e.message }); return; }
    }
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const toSave = [...dirtyIds].map(i => items[i]).filter(Boolean);
      const ops = toSave.map(it => {
        const { _new, _localKey, id, ...payload } = it;
        if (id) return () => MaintenanceInventory.update(id, payload);
        return () => MaintenanceInventory.create(payload);
      });
      // Batch to respect rate limits
      const BATCH = 5;
      for (let i = 0; i < ops.length; i += BATCH) {
        await Promise.all(ops.slice(i, i + BATCH).map(fn => fn()));
        if (i + BATCH < ops.length) await new Promise(r => setTimeout(r, 250));
      }
      toast({ description: `Saved ${ops.length} item${ops.length !== 1 ? "s" : ""}` });
      load();
    } catch (e) {
      toast({ variant: "destructive", description: "Save failed: " + e.message });
    }
    setSaving(false);
  };

  // Build "Applies To" options based on the current axis
  const axisField = axis === "sign_type" ? "applies_to_item_types" : "applies_to_actions";
  const axisOptions = useMemo(() => {
    if (axis === "sign_type") {
      return SIGN_TYPES.map(s => ({ value: s.id, label: s.label }));
    }
    return ACTIONS.map(a => ({ value: a.id, label: a.label, group: a.group }));
  }, [axis]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => {
        if (!q) return true;
        return `${it.item_name || ""} ${it.supplier || ""}`.toLowerCase().includes(q);
      });
  }, [items, search]);

  // Group rows by the current axis (each unique value gets its own section).
  // Items can appear under multiple groups when tagged with multiple values.
  // Items with empty list appear under "Applies to all".
  const grouped = useMemo(() => {
    const buckets = new Map();
    const ALL_KEY = "__all__";
    for (const { it, idx } of filtered) {
      const list = Array.isArray(it[axisField]) ? it[axisField] : [];
      const keys = list.length === 0 ? [ALL_KEY] : list;
      for (const k of keys) {
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push({ it, idx });
      }
    }
    const ordered = [];
    if (buckets.has(ALL_KEY)) {
      ordered.push({ key: ALL_KEY, label: "Applies to all", rows: buckets.get(ALL_KEY), accent: "bg-slate-100 text-slate-700 border-slate-200" });
    }
    if (axis === "sign_type") {
      for (const st of SIGN_TYPES) {
        if (buckets.has(st.id)) {
          ordered.push({ key: st.id, label: st.label, rows: buckets.get(st.id), accent: "bg-cyan-50 text-cyan-700 border-cyan-200" });
        }
      }
    } else {
      // Group actions by their action-group for visual organization
      for (const g of ACTION_GROUPS) {
        for (const a of ACTIONS.filter(x => x.group === g)) {
          if (buckets.has(a.id)) {
            ordered.push({ key: a.id, label: a.label, rows: buckets.get(a.id), accent: "bg-violet-50 text-violet-700 border-violet-200", group: g });
          }
        }
      }
    }
    return ordered;
  }, [filtered, axis, axisField]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-cyan-600 rounded-full animate-spin mr-3" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 bg-slate-50 -mx-2 px-2 pt-2 pb-1">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or supplier…"
              className="pl-9 h-10"
            />
          </div>
          <Button onClick={addItem} variant="outline" className="h-10">
            <Plus className="w-4 h-4 mr-1" /> Add Material
          </Button>
          <Button
            onClick={saveAll}
            disabled={saving || dirtyIds.size === 0}
            className="bg-cyan-600 hover:bg-cyan-700 text-white h-10"
          >
            <Save className="w-4 h-4 mr-1" />
            {saving ? "Saving…" : dirtyIds.size > 0 ? `Save ${dirtyIds.size}` : "Saved"}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl py-16 text-center">
          <Package2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-700 mb-1">No maintenance materials yet</h3>
          <p className="text-sm text-slate-500 mb-4">Add your first material to start tagging it to sign types and actions.</p>
          <Button onClick={addItem} className="bg-cyan-600 hover:bg-cyan-700 text-white">
            <Plus className="w-4 h-4 mr-1" /> Add First Material
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ key, label, rows, accent }) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Badge variant="outline" className={`${accent} text-xs`}>{label}</Badge>
                <span className="text-xs text-slate-400">{rows.length} item{rows.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-2">
                {rows.map(({ it, idx }) => (
                  <Card key={it.id || it._localKey || idx} className={it._new ? "border-emerald-300 bg-emerald-50/30" : ""}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="bg-slate-50 text-xs">{summarizeCost(it)}</Badge>
                        {dirtyIds.has(idx) && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Unsaved</Badge>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto text-red-500" onClick={() => removeItem(idx)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                        <div className="md:col-span-2">
                          <Label className="text-xs">Item Name</Label>
                          <Input value={it.item_name || ""} onChange={(e) => update(idx, { item_name: e.target.value })} className="h-8 mt-1" />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Applies To {axis === "sign_type" ? "Sign Types" : "Actions"}</Label>
                          <MultiSelectDropdown
                            options={axisOptions}
                            value={it[axisField] || []}
                            onChange={(v) => update(idx, { [axisField]: v })}
                            placeholder="All"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Pricing Mode</Label>
                          <Select value={it.pricing_mode} onValueChange={(v) => update(idx, { pricing_mode: v })}>
                            <SelectTrigger className="h-8 mt-1 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PRICING_MODES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Supplier</Label>
                          <Input value={it.supplier || ""} onChange={(e) => update(idx, { supplier: e.target.value })} className="h-8 mt-1" />
                        </div>
                      </div>

                      {/* Cost field — only the relevant one for the selected pricing mode */}
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                        {it.pricing_mode === "per_letter_flat" && (
                          <div>
                            <Label className="text-xs">$ / Letter</Label>
                            <Input type="number" step="0.01" value={it.cost_per_letter || 0} onChange={(e) => update(idx, { cost_per_letter: parseFloat(e.target.value) || 0 })} className="h-8 mt-1 tabular-nums" />
                          </div>
                        )}
                        {it.pricing_mode === "per_cabinet_flat" && (
                          <div>
                            <Label className="text-xs">$ / Cabinet</Label>
                            <Input type="number" step="0.01" value={it.cost_per_cabinet || 0} onChange={(e) => update(idx, { cost_per_cabinet: parseFloat(e.target.value) || 0 })} className="h-8 mt-1 tabular-nums" />
                          </div>
                        )}
                        {it.pricing_mode === "per_linear_foot" && (
                          <div>
                            <Label className="text-xs">$ / Foot</Label>
                            <Input type="number" step="0.01" value={it.cost_per_foot || 0} onChange={(e) => update(idx, { cost_per_foot: parseFloat(e.target.value) || 0 })} className="h-8 mt-1 tabular-nums" />
                          </div>
                        )}
                        {it.pricing_mode === "per_sqft" && (
                          <div>
                            <Label className="text-xs">$ / Sq. Ft.</Label>
                            <Input type="number" step="0.01" value={it.cost_per_sqft || 0} onChange={(e) => update(idx, { cost_per_sqft: parseFloat(e.target.value) || 0 })} className="h-8 mt-1 tabular-nums" />
                          </div>
                        )}
                        {it.pricing_mode === "per_project_flat" && (
                          <div>
                            <Label className="text-xs">$ / Sign (Flat)</Label>
                            <Input type="number" step="0.01" value={it.cost_flat || 0} onChange={(e) => update(idx, { cost_flat: parseFloat(e.target.value) || 0 })} className="h-8 mt-1 tabular-nums" />
                          </div>
                        )}
                        {(it.pricing_mode === "per_letter_by_size" || it.pricing_mode === "per_cabinet_by_size") && (
                          <div className="md:col-span-6 text-xs text-slate-500 italic">
                            By-size pricing: edit per-size rates from the line item on an estimate.
                          </div>
                        )}
                        <div className="md:col-span-2">
                          <Label className="text-xs">Notes</Label>
                          <Input value={it.notes || ""} onChange={(e) => update(idx, { notes: e.target.value })} className="h-8 mt-1" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}