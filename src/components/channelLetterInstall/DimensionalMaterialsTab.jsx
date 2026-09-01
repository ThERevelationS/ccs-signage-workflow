import React, { useState, useEffect } from "react";
import { DimensionalLetterMaterial } from "@/entities/all";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Copy, Save, Layers, Search } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { materialCostPerSqin } from "./dimensionalFabCalculator";

const MATERIAL_TYPE_LABELS = {
  acrylic: "Acrylic",
  pvc: "PVC / Sintra",
  aluminum_composite: "ACM (Aluminum Composite)",
  aluminum_solid: "Solid Aluminum",
  wood: "Wood",
  mdf: "MDF",
  hdu: "HDU Foam",
  foam: "EPS Foam",
  other: "Other",
};

const TYPE_COLORS = {
  acrylic: "bg-cyan-100 text-cyan-800",
  pvc: "bg-blue-100 text-blue-800",
  aluminum_composite: "bg-slate-100 text-slate-800",
  aluminum_solid: "bg-zinc-100 text-zinc-800",
  wood: "bg-amber-100 text-amber-800",
  mdf: "bg-orange-100 text-orange-800",
  hdu: "bg-pink-100 text-pink-800",
  foam: "bg-purple-100 text-purple-800",
  other: "bg-slate-100 text-slate-800",
};

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

// Filters substrates by which pages they're enabled for in Master Inventory.
// scope = "install"     → show items with show_in_dimensional_letters OR show_in_lobby_sign_backer
// scope = "maintenance" → show items with show_in_vinyl_replacement OR show_in_replace_returns OR show_in_replace_face
// scope = undefined     → show all (used by Master Inventory itself)
const matchesVisibility = (m, scope) => {
  if (!scope) return true;
  if (scope === "install") {
    return m.show_in_dimensional_letters === true || m.show_in_lobby_sign_backer === true;
  }
  if (scope === "maintenance") {
    return m.show_in_vinyl_replacement === true ||
           m.show_in_replace_returns === true ||
           m.show_in_replace_face === true;
  }
  return true;
};

export default function DimensionalMaterialsTab({ visibilityScope } = {}) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await DimensionalLetterMaterial.list("sort_order");
      setMaterials(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const addMaterial = () => {
    setMaterials(prev => [
      ...prev,
      {
        _isNew: true,
        material_name: "New Material",
        material_type: "pvc",
        thickness_inches: 0.5,
        sheet_length_inches: 96,
        sheet_width_inches: 48,
        cost_per_sheet: 0,
        yield_factor: 0.7,
        color: "",
        supplier: "",
        needs_painting: true,
        allow_laser: true,
        notes: "",
        is_active: true,
        sort_order: prev.length,
      },
    ]);
    setDirty(true);
  };

  const updateMaterial = (idx, patch) => {
    setMaterials(prev => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], ...patch };
      return arr;
    });
    setDirty(true);
  };

  const duplicate = (idx) => {
    setMaterials(prev => {
      const arr = [...prev];
      const copy = { ...arr[idx] };
      delete copy.id;
      copy._isNew = true;
      copy.material_name = `${copy.material_name} (Copy)`;
      arr.splice(idx + 1, 0, copy);
      return arr;
    });
    setDirty(true);
  };

  const removeMaterial = async (idx) => {
    const m = materials[idx];
    if (!confirm(`Delete "${m.material_name}"?`)) return;
    if (m.id) {
      try { await DimensionalLetterMaterial.delete(m.id); }
      catch (e) { toast({ variant: "destructive", description: "Delete failed: " + e.message }); return; }
    }
    setMaterials(prev => prev.filter((_, i) => i !== idx));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const ops = materials.map(m => {
        const data = { ...m };
        delete data._isNew;
        delete data.id;
        if (m.id) return DimensionalLetterMaterial.update(m.id, data);
        return DimensionalLetterMaterial.create(data);
      });
      await Promise.all(ops);
      toast({ description: "Materials saved" });
      setDirty(false);
      load();
    } catch (e) {
      toast({ variant: "destructive", description: "Save failed: " + e.message });
    }
    setSaving(false);
  };

  const filtered = materials.filter(m => {
    if (!matchesVisibility(m, visibilityScope)) return false;
    if (filter !== "all" && m.material_type !== filter) return false;
    if (search && !`${m.material_name} ${m.color || ""} ${m.supplier || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm text-slate-600">Sheet material library used for dimensional letter fabrication (CNC + Paint cost build-up).</p>
        </div>
        <Button onClick={addMaterial} variant="outline">
          <Plus className="w-4 h-4 mr-1" /> Add Material
        </Button>
        <Button onClick={saveAll} disabled={saving || !dirty} className="bg-slate-900 hover:bg-slate-800 text-white">
          {saving ? "Saving…" : <><Save className="w-4 h-4 mr-1" /> Save All</>}
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name, color, supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Material Types</SelectItem>
              {Object.entries(MATERIAL_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-500">{filtered.length} of {materials.length}</span>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="p-12 text-center text-slate-500">
            <Layers className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="mb-3 font-medium">No materials yet</p>
            <Button onClick={addMaterial} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="w-4 h-4 mr-1" /> Add First Material
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => {
            const idx = materials.indexOf(m);
            const sqin = materialCostPerSqin(m);
            return (
              <Card key={m.id || idx} className={`${m._isNew ? "border-emerald-300 bg-emerald-50/30" : ""}`}>
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={TYPE_COLORS[m.material_type] || TYPE_COLORS.other}>
                      {MATERIAL_TYPE_LABELS[m.material_type]}
                    </Badge>
                    {m._isNew && <Badge variant="outline" className="text-emerald-700 border-emerald-300">New</Badge>}
                    <Badge variant="outline" className="bg-slate-50 text-xs">
                      ≈ {fmt(sqin * 144)}/sqft
                    </Badge>
                    <div className="ml-auto flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicate(idx)}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeMaterial(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    <div className="md:col-span-2">
                      <Label className="text-xs">Material Name</Label>
                      <Input
                        value={m.material_name}
                        onChange={(e) => updateMaterial(idx, { material_name: e.target.value })}
                        className="h-8 mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select value={m.material_type} onValueChange={(v) => updateMaterial(idx, { material_type: v })}>
                        <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(MATERIAL_TYPE_LABELS).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Thickness (in)</Label>
                      <Input
                        type="number" step="0.0625" min="0"
                        value={m.thickness_inches}
                        onChange={(e) => updateMaterial(idx, { thickness_inches: parseFloat(e.target.value) || 0 })}
                        className="h-8 mt-1 tabular-nums"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Color</Label>
                      <Input
                        value={m.color || ""}
                        onChange={(e) => updateMaterial(idx, { color: e.target.value })}
                        className="h-8 mt-1"
                        placeholder="White"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Supplier</Label>
                      <Input
                        value={m.supplier || ""}
                        onChange={(e) => updateMaterial(idx, { supplier: e.target.value })}
                        className="h-8 mt-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <div>
                      <Label className="text-xs">Sheet L (in)</Label>
                      <Input
                        type="number" step="1" min="0"
                        value={m.sheet_length_inches}
                        onChange={(e) => updateMaterial(idx, { sheet_length_inches: parseFloat(e.target.value) || 0 })}
                        className="h-8 mt-1 tabular-nums"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Sheet W (in)</Label>
                      <Input
                        type="number" step="1" min="0"
                        value={m.sheet_width_inches}
                        onChange={(e) => updateMaterial(idx, { sheet_width_inches: parseFloat(e.target.value) || 0 })}
                        className="h-8 mt-1 tabular-nums"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Cost / Sheet</Label>
                      <div className="relative mt-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                        <Input
                          type="number" step="0.01" min="0"
                          value={m.cost_per_sheet}
                          onChange={(e) => updateMaterial(idx, { cost_per_sheet: parseFloat(e.target.value) || 0 })}
                          className="h-8 pl-5 tabular-nums"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs" title="Usable yield after nesting waste">
                        Yield (0–1)
                      </Label>
                      <Input
                        type="number" step="0.05" min="0.05" max="1"
                        value={m.yield_factor}
                        onChange={(e) => updateMaterial(idx, { yield_factor: parseFloat(e.target.value) || 0.7 })}
                        className="h-8 mt-1 tabular-nums"
                      />
                    </div>
                    <div className="flex items-end gap-3 pb-1 flex-wrap">
                      <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                        <Checkbox
                          checked={!!m.needs_painting}
                          onCheckedChange={(c) => updateMaterial(idx, { needs_painting: !!c })}
                        />
                        Needs Paint
                      </label>
                      <label
                        className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer"
                        title="If unchecked, this material cannot be cut on the laser (e.g., PVC, ACM) — only CNC will be available."
                      >
                        <Checkbox
                          checked={m.allow_laser !== false}
                          onCheckedChange={(c) => updateMaterial(idx, { allow_laser: !!c })}
                        />
                        Allow Laser
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                        <Checkbox
                          checked={m.is_active !== false}
                          onCheckedChange={(c) => updateMaterial(idx, { is_active: !!c })}
                        />
                        Active
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}