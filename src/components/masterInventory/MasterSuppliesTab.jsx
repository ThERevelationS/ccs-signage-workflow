// Master Inventory — Installation & Maintenance Supplies tab.
//
// Merges supply items from two underlying entities:
//   - ChannelLetterInstallInventory (channel-letter install / maintenance supplies)
//   - FoundationInventory rows that are NOT equipment/attachment/sub_attachment
//     (i.e. concrete_service, bagged_concrete, rebar, forming_material, pole,
//      brick_stone, fill_material, wall_material, wall_cap)
//
// Each row gets cross-estimator visibility toggles.
// The Add form lets the user choose which storage entity + which type the new
// item is, so all existing fields/settings are still available.

import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Edit, Plus, Wrench } from "lucide-react";

const ChannelLetterInstallInventoryEntity = base44.entities.ChannelLetterInstallInventory;
const FoundationInventoryEntity = base44.entities.FoundationInventory;

const FOUNDATION_SUPPLY_TYPES = [
  "concrete_service", "bagged_concrete", "rebar", "forming_material",
  "pole", "brick_stone", "fill_material", "wall_material", "wall_cap",
];

const FOUNDATION_TYPE_OPTIONS = FOUNDATION_SUPPLY_TYPES.map((t) => ({
  value: t, label: t.replace(/_/g, " "),
}));

const CHANNEL_PRICING_MODES = ["per_letter_flat", "per_letter_by_size", "per_raceway_foot", "per_project_flat"];

function normalize(row, source) {
  if (source === "channel_letter") {
    return {
      _source: source,
      id: row.id,
      name: row.item_name,
      subtype: row.pricing_mode || "—",
      cost_display: row.cost_per_letter || row.cost_per_foot || row.cost_flat || 0,
      supplier: row.supplier || "",
      show_in_channel_letters:  row.show_in_install_materials ?? true,
      show_in_foundation:       row.show_in_foundation_materials ?? false,
      show_in_sign_maintenance: row.show_in_maintenance_materials ?? false,
      raw: row,
    };
  }
  return {
    _source: "foundation",
    id: row.id,
    name: row.material_name,
    subtype: row.material_type,
    cost_display: row.cost_per_unit || 0,
    supplier: row.supplier || "",
    show_in_channel_letters:  row.show_in_channel_letters ?? false,
    show_in_foundation:       row.show_in_foundation ?? true,
    show_in_sign_maintenance: row.show_in_sign_maintenance ?? false,
    raw: row,
  };
}

export default function MasterSuppliesTab({ isAdmin }) {
  const [channelRows, setChannelRows] = useState([]);
  const [foundationRows, setFoundationRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [chn, fnd] = await Promise.all([
        ChannelLetterInstallInventoryEntity.list(),
        FoundationInventoryEntity.list(),
      ]);
      setChannelRows(chn);
      setFoundationRows(fnd.filter((r) => FOUNDATION_SUPPLY_TYPES.includes(r.material_type)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const a = channelRows.map((r) => normalize(r, "channel_letter"));
    const b = foundationRows.map((r) => normalize(r, "foundation"));
    const all = [...a, ...b];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((r) =>
      [r.name, r.subtype, r.supplier].some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [channelRows, foundationRows, search]);

  const toggleVisibility = async (row, masterField, next) => {
    // Map master toggle name → entity field name per source.
    let field = masterField;
    if (row._source === "channel_letter") {
      if (masterField === "show_in_channel_letters")  field = "show_in_install_materials";
      if (masterField === "show_in_sign_maintenance") field = "show_in_maintenance_materials";
      if (masterField === "show_in_foundation")       field = "show_in_foundation_materials";
      await ChannelLetterInstallInventoryEntity.update(row.id, { [field]: next });
      setChannelRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: next } : r)));
    } else {
      await FoundationInventoryEntity.update(row.id, { [field]: next });
      setFoundationRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: next } : r)));
    }
  };

  const deleteItem = async (row) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    const entity = row._source === "channel_letter" ? ChannelLetterInstallInventoryEntity : FoundationInventoryEntity;
    await entity.delete(row.id);
    load();
  };

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader className="border-b flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-purple-600" />
          Installation & Maintenance Supplies
          <Badge variant="outline" className="ml-2 font-normal">{rows.length} items</Badge>
        </CardTitle>
        <div className="flex gap-2 items-center">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-56" />
          {isAdmin && (
            <Button size="sm" onClick={() => { setEditItem({ _new: true, _source: "channel_letter", raw: {} }); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1" /> Add Supply
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No supplies yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium text-slate-600">Item</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Type / Mode</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Cost</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Supplier</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Storage</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Channel &amp; Dim.</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Concrete | Masonry</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Sign Maintenance</th>
                  {isAdmin && <th className="px-4 py-3 font-medium text-slate-600 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={`${row._source}-${row.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className="font-normal capitalize">{row.subtype.replace(/_/g, " ")}</Badge></td>
                    <td className="px-4 py-3 text-slate-700">${parseFloat(row.cost_display || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-700">{row.supplier || "—"}</td>
                    <td className="px-4 py-3"><Badge variant="secondary" className="font-normal">{row._source === "channel_letter" ? "CL Inventory" : "Foundation"}</Badge></td>
                    <td className="px-4 py-3"><Switch checked={!!row.show_in_channel_letters}  onCheckedChange={(v) => toggleVisibility(row, "show_in_channel_letters",  v)} disabled={!isAdmin} /></td>
                    <td className="px-4 py-3"><Switch checked={!!row.show_in_foundation}       onCheckedChange={(v) => toggleVisibility(row, "show_in_foundation",       v)} disabled={!isAdmin} /></td>
                    <td className="px-4 py-3"><Switch checked={!!row.show_in_sign_maintenance} onCheckedChange={(v) => toggleVisibility(row, "show_in_sign_maintenance", v)} disabled={!isAdmin} /></td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" onClick={() => { setEditItem(row); setShowForm(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50" onClick={() => deleteItem(row)}><Trash2 className="w-4 h-4" /></Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem?._new ? "Add" : "Edit"} Supply</DialogTitle></DialogHeader>
          {editItem && (
            <SupplyForm
              row={editItem}
              onCancel={() => { setShowForm(false); setEditItem(null); }}
              onSaved={() => { setShowForm(false); setEditItem(null); load(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Supply form: source-aware (channel_letter vs foundation) ───────────────
function SupplyForm({ row, onCancel, onSaved }) {
  const isNew = !!row._new;
  const [source, setSource] = useState(row._source);

  // Init form from raw row, with safe defaults per source.
  const buildInitial = (src, raw) => {
    if (src === "channel_letter") {
      return {
        item_name: raw.item_name || "",
        pricing_mode: raw.pricing_mode || "per_letter_flat",
        cost_per_letter: raw.cost_per_letter || 0,
        cost_per_foot: raw.cost_per_foot || 0,
        cost_flat: raw.cost_flat || 0,
        cost_extra_small: raw.cost_extra_small || 0,
        cost_small: raw.cost_small || 0,
        cost_medium: raw.cost_medium || 0,
        cost_large: raw.cost_large || 0,
        cost_extra_large: raw.cost_extra_large || 0,
        cost_extra_extra_large: raw.cost_extra_extra_large || 0,
        unit: raw.unit || "",
        supplier: raw.supplier || "",
        notes: raw.notes || "",
        show_in_install_materials:      raw.show_in_install_materials ?? true,
        show_in_foundation_materials:   raw.show_in_foundation_materials ?? false,
        show_in_maintenance_materials:  raw.show_in_maintenance_materials ?? false,
      };
    }
    return {
      material_name: raw.material_name || "",
      material_type: raw.material_type || "concrete_service",
      material_description: raw.material_description || "",
      cost_per_unit: raw.cost_per_unit || 0,
      unit: raw.unit || "",
      supplier: raw.supplier || "",
      notes: raw.notes || "",
      // Carry through foundation-specific fields when editing so we don't drop them.
      ...passThroughFoundation(raw),
      show_in_channel_letters:  raw.show_in_channel_letters ?? false,
      show_in_foundation:       raw.show_in_foundation ?? true,
      show_in_sign_maintenance: raw.show_in_sign_maintenance ?? false,
    };
  };

  const [form, setForm] = useState(buildInitial(source, row.raw || {}));
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSourceChange = (next) => {
    setSource(next);
    setForm(buildInitial(next, {}));
  };

  const nameField = source === "channel_letter" ? "item_name" : "material_name";
  const isValid = !!form[nameField];

  const handleSave = async () => {
    if (source === "channel_letter") {
      if (isNew) await ChannelLetterInstallInventoryEntity.create(form);
      else       await ChannelLetterInstallInventoryEntity.update(row.id, form);
    } else {
      if (isNew) await FoundationInventoryEntity.create(form);
      else       await FoundationInventoryEntity.update(row.id, form);
    }
    onSaved?.();
  };

  return (
    <div className="space-y-4">
      {isNew && (
        <div>
          <Label className="text-xs">Storage / Item Family</Label>
          <Select value={source} onValueChange={handleSourceChange}>
            <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="channel_letter">Channel Letter / Install Supply (per-letter, per-foot pricing)</SelectItem>
              <SelectItem value="foundation">Concrete / Masonry / Pole Supply (per-unit pricing, full fields)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label className="text-xs">Name *</Label>
        <Input className="h-8" value={form[nameField] || ""} onChange={(e) => set(nameField, e.target.value)} />
      </div>

      {source === "channel_letter" ? (
        <ChannelLetterFields form={form} set={set} />
      ) : (
        <FoundationFields form={form} set={set} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Supplier</Label><Input className="h-8" value={form.supplier || ""} onChange={(e) => set("supplier", e.target.value)} /></div>
        <div><Label className="text-xs">Unit</Label><Input className="h-8" value={form.unit || ""} onChange={(e) => set("unit", e.target.value)} /></div>
      </div>

      <div>
        <Label className="text-xs">Notes</Label>
        <Input className="h-8" value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
      </div>

      <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-700">Show in which estimator(s)?</p>
        {source === "channel_letter" ? (
          <>
            <Toggle label="Channel & Dimensional Letters" checked={form.show_in_install_materials}     onChange={(v) => set("show_in_install_materials", v)} />
            <Toggle label="Concrete | Masonry | Poles"    checked={form.show_in_foundation_materials}  onChange={(v) => set("show_in_foundation_materials", v)} />
            <Toggle label="Sign Maintenance"               checked={form.show_in_maintenance_materials} onChange={(v) => set("show_in_maintenance_materials", v)} />
          </>
        ) : (
          <>
            <Toggle label="Channel & Dimensional Letters" checked={form.show_in_channel_letters}   onChange={(v) => set("show_in_channel_letters", v)} />
            <Toggle label="Concrete | Masonry | Poles"    checked={form.show_in_foundation}        onChange={(v) => set("show_in_foundation", v)} />
            <Toggle label="Sign Maintenance"               checked={form.show_in_sign_maintenance} onChange={(v) => set("show_in_sign_maintenance", v)} />
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!isValid}>Save</Button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={!!checked} onCheckedChange={onChange} />
      <Label className="text-xs">{label}</Label>
    </div>
  );
}

function ChannelLetterFields({ form, set }) {
  return (
    <>
      <div>
        <Label className="text-xs">Pricing Mode</Label>
        <Select value={form.pricing_mode} onValueChange={(v) => set("pricing_mode", v)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CHANNEL_PRICING_MODES.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label className="text-xs">$ / Letter</Label><Input type="number" className="h-8" value={form.cost_per_letter} onChange={(e) => set("cost_per_letter", parseFloat(e.target.value) || 0)} /></div>
        <div><Label className="text-xs">$ / Foot</Label><Input type="number" className="h-8" value={form.cost_per_foot} onChange={(e) => set("cost_per_foot", parseFloat(e.target.value) || 0)} /></div>
        <div><Label className="text-xs">Flat $</Label><Input type="number" className="h-8" value={form.cost_flat} onChange={(e) => set("cost_flat", parseFloat(e.target.value) || 0)} /></div>
      </div>
      {form.pricing_mode === "per_letter_by_size" && (
        <div className="grid grid-cols-3 gap-2">
          {["extra_small", "small", "medium", "large", "extra_large", "extra_extra_large"].map((sz) => (
            <div key={sz}>
              <Label className="text-xs capitalize">{sz.replace(/_/g, " ")}</Label>
              <Input type="number" className="h-8" value={form[`cost_${sz}`] || 0} onChange={(e) => set(`cost_${sz}`, parseFloat(e.target.value) || 0)} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FoundationFields({ form, set }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={form.material_type} onValueChange={(v) => set("material_type", v)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FOUNDATION_TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Cost / Unit ($)</Label><Input type="number" className="h-8" value={form.cost_per_unit} onChange={(e) => set("cost_per_unit", parseFloat(e.target.value) || 0)} /></div>
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Input className="h-8" value={form.material_description || ""} onChange={(e) => set("material_description", e.target.value)} />
      </div>
    </>
  );
}

// Preserve foundation-specific extras through edits (mix prices, brick dims, pole specs, wall caps, etc.).
function passThroughFoundation(raw) {
  const passKeys = [
    "foundation_usage", "lumber_size", "thickness_inches",
    "pole_shape", "pole_width_inches", "pole_depth_inches", "pole_wall_thickness_inches",
    "pole_stock_length_ft", "pole_stock_price", "pole_pricing_mode", "paint_rate_per_linear_ft",
    "brick_length_inches", "brick_width_inches", "brick_height_inches", "brick_color", "brick_texture",
    "fill_material_subtype", "wall_material_subtype",
    "wall_unit_length_inches", "wall_unit_width_inches", "wall_unit_height_inches", "wall_color", "wall_texture",
    "cap_stock_length_inches", "cap_width_inches", "cap_height_inches", "cap_profile", "cap_color", "cap_stock_price", "is_cuttable",
    "rebar_size", "minimum_order_yards", "below_minimum_cost_per_cy", "minimum_cost",
    "mix_3500_price", "mix_4000_price", "mix_4500_price", "mix_5000_price", "mix_fast_set_price",
    "admix_calcium_chloride_price", "admix_set_retarding_price", "admix_water_reducing_price", "admix_fibers_price", "admix_winter_service_price",
    "small_load_fee_1_1_75", "small_load_fee_2_2_75", "small_load_fee_3_3_75", "small_load_fee_4_4_25", "small_load_fee_4_5_4_75",
    "fuel_surcharge", "sort_order",
  ];
  const out = {};
  for (const k of passKeys) {
    if (raw[k] !== undefined && raw[k] !== null) out[k] = raw[k];
  }
  return out;
}