import { useState, useEffect, useMemo, useRef } from "react";
import { DimensionalLetterMaterial } from "@/entities/all";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
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
import { deleteEntityIfUnchanged, expectedEntityFields, replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

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

const stripMaterialMeta = (row = {}) => {
  const data = { ...row };
  ["id", "_isNew", "created_date", "updated_date", "created_by_id", "created_by", "is_sample"].forEach((key) => delete data[key]);
  return data;
};

const materialSnapshot = (row) => JSON.stringify(stripMaterialMeta(row));
const sameStoredValue = (a, b) => {
  const emptyA = a === undefined || a === null || a === "";
  const emptyB = b === undefined || b === null || b === "";
  if (emptyA && emptyB) return true;
  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 0.000001;
  }
  return JSON.stringify(a) === JSON.stringify(b);
};
const materialMatchesPayload = (row, payload) => !!row && Object.entries(payload || {}).every(([field, value]) => sameStoredValue(row[field], value));

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
  const [loadError, setLoadError] = useState("");
  const [originalById, setOriginalById] = useState({});
  const saveRef = useRef(false);
  const deleteRef = useRef(new Set());
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await loadAllEntityRows({ entity: DimensionalLetterMaterial, sort: "sort_order", label: "Dimensional Letter materials" });
      setMaterials(data || []);
      setOriginalById(Object.fromEntries((data || []).filter((row) => row.id).map((row) => [row.id, materialSnapshot(row)])));
      setDirty(false);
    } catch (e) {
      console.error(e);
      setLoadError(e?.message || "Dimensional material inventory could not be verified.");
    } finally {
      setLoading(false);
    }
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
    const lockKey = m.id || `new:${idx}`;
    if (loadError || deleteRef.current.has(lockKey)) return;
    deleteRef.current.add(lockKey);
    if (!confirm(`Delete "${m.material_name}"?`)) {
      deleteRef.current.delete(lockKey);
      return;
    }
    try {
      if (m.id) {
        const live = await DimensionalLetterMaterial.get(m.id);
        if (m.updated_date && live?.updated_date && m.updated_date !== live.updated_date) {
          toast({ variant: "destructive", description: "This material changed in another session and was not deleted. Reloading the latest inventory." });
          await load();
          return;
        }
        await deleteEntityIfUnchanged({
          entity: DimensionalLetterMaterial,
          record: live,
          label: `Dimensional material “${m.material_name || "Item"}”`,
        });
      }
      setMaterials(prev => prev.filter((_, i) => i !== idx));
      if (m.id) setOriginalById((prev) => { const next = { ...prev }; delete next[m.id]; return next; });
    } catch (e) {
      toast({ variant: "destructive", description: "Delete failed: " + e.message });
    } finally {
      deleteRef.current.delete(lockKey);
    }
  };

  const changedMaterials = useMemo(() => materials.filter((m) =>
    m._isNew || !m.id || materialSnapshot(m) !== originalById[m.id]
  ), [materials, originalById]);

  const saveAll = async () => {
    if (saveRef.current || loadError || changedMaterials.length === 0) return;
    saveRef.current = true;
    setSaving(true);
    let confirmed = 0;
    try {
      const existingChanged = changedMaterials.filter((m) => m.id && !m._isNew);
      const liveRows = await Promise.all(existingChanged.map((m) => DimensionalLetterMaterial.get(m.id)));
      const conflicts = existingChanged.filter((m, index) => {
        const live = liveRows[index];
        if (!live) return true;
        const versionChanged = !!(m.updated_date && live.updated_date && m.updated_date !== live.updated_date);
        const loadedSnapshot = originalById[m.id];
        return versionChanged || (loadedSnapshot !== undefined && materialSnapshot(live) !== loadedSnapshot);
      });
      if (conflicts.length) {
        throw new Error(`These materials changed in another session: ${conflicts.map((m) => m.material_name).join(", ")}. Reload before saving.`);
      }

      const liveById = new Map(existingChanged.map((m, index) => [m.id, liveRows[index]]));
      const completed = [];
      for (const m of changedMaterials) {
        const data = stripMaterialMeta(m);
        try {
          let saved;
          if (m.id && !m._isNew) {
            const live = liveById.get(m.id);
            saved = await replaceEntityFieldsIfUnchanged({
              entity: DimensionalLetterMaterial,
              id: m.id,
              expectedUpdatedAt: live?.updated_date || "",
              expectedFields: expectedEntityFields(live || {}, data),
              nextFields: data,
              label: `Dimensional material “${m.material_name || "Item"}”`,
            });
          } else {
            saved = await DimensionalLetterMaterial.create(data);
            if (!saved?.id) throw new Error(`Created material “${m.material_name || "Item"}” could not be verified.`);
          }
          confirmed += 1;
          completed.push({ id: saved.id, data, name: m.material_name || "Material" });
        } catch (error) {
          throw new Error(`Save stopped after ${confirmed} of ${changedMaterials.length} changed materials were confirmed. Reloading the catalog; remaining materials were not skipped automatically. ${error?.message || ""}`.trim());
        }
      }

      const finalRows = await loadAllEntityRows({ entity: DimensionalLetterMaterial, sort: "sort_order", label: "Dimensional Letter materials final verification" });
      const finalById = new Map(finalRows.map((row) => [row.id, row]));
      const failedVerification = completed.filter((entry) => !materialMatchesPayload(finalById.get(entry.id), entry.data));
      if (failedVerification.length) {
        throw new Error(`Final verification found ${failedVerification.length} saved material${failedVerification.length === 1 ? "" : "s"} whose live values no longer match this save: ${failedVerification.map((entry) => entry.name).join(", ")}. Reload and review before retrying.`);
      }

      toast({ description: `Saved ${changedMaterials.length} material${changedMaterials.length === 1 ? "" : "s"}` });
      await load();
    } catch (e) {
      toast({ variant: "destructive", description: "Save failed: " + e.message });
      if (confirmed > 0) await load();
    } finally {
      saveRef.current = false;
      setSaving(false);
    }
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
        <Button onClick={addMaterial} variant="outline" disabled={!!loadError}>
          <Plus className="w-4 h-4 mr-1" /> Add Material
        </Button>
        <Button onClick={saveAll} disabled={saving || !dirty || !!loadError || changedMaterials.length === 0} className="bg-slate-900 hover:bg-slate-800 text-white">
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
      ) : loadError ? (
        <Card className="border-red-200 bg-red-50"><CardContent className="p-8 text-center text-red-700"><div className="font-semibold">Dimensional material inventory could not be verified.</div><div className="text-xs mt-1">{loadError}</div><Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="p-12 text-center text-slate-500">
            <Layers className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="mb-3 font-medium">No materials yet</p>
            <Button onClick={addMaterial} disabled={!!loadError} className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
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