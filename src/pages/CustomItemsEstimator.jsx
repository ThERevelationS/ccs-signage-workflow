import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Upload, ArrowLeft, ListChecks } from "lucide-react";
import { recordBuilderSave } from "@/components/estimator/builder/builderService";
import { preflightBuilderSourceMutation } from "@/components/estimator/builder/partSync";

const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const newItem = () => ({ description: "", quantity: 1, item_total_cost: 0, item_type: "fabrication", unit: "item" });
const ITEM_TYPES = ["fabrication", "material", "labor", "equipment", "shipping", "other"];
const sumTotal = (items) => (items || []).reduce((s, i) => s + num(i.item_total_cost), 0);

export default function CustomItemsEstimator({ embeddedProjectId, embeddedEstimateId, onSaved } = {}) {
  const [searchParams] = useSearchParams();
  const editId = embeddedProjectId || searchParams.get("edit") || searchParams.get("id");
  const estimateId = embeddedEstimateId || searchParams.get("estimateId");
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const csvRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const proj = editId ? await staffEntities.CustomItemsProject.get(editId) : null;
        if (cancelled) return;
        setProject(proj || { project_name: "Custom items", client_name: "", items: [newItem()], total_cost: 0 });
        setLoading(false);
      } catch (e) { if (!cancelled) { setError(e?.message || "Could not load project."); setLoading(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, [editId]);

  const updateItem = (i, field, value) => setProject((p) => {
    const items = p.items.map((it, j) => j === i ? { ...it, [field]: value } : it);
    return { ...p, items, total_cost: sumTotal(items) };
  });
  const addItem = () => setProject((p) => ({ ...p, items: [...(p.items || []), newItem()] }));
  const removeItem = (i) => setProject((p) => { const items = p.items.filter((_, j) => j !== i); return { ...p, items, total_cost: sumTotal(items) }; });

  const importCsv = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean).slice(0, 200);
      const rows = [];
      for (const line of lines) {
        const [desc, qty, cost, type] = line.split(",").map((s) => s.trim());
        if (!desc || desc.toLowerCase() === "description") continue;
        rows.push({ description: desc, quantity: num(qty, 1), item_total_cost: num(cost), item_type: type || "fabrication", unit: "item" });
      }
      if (!rows.length) throw new Error("No item rows — expected `description, quantity, item_total_cost` per line.");
      setProject((p) => { const items = [...(p.items || []), ...rows]; return { ...p, items, total_cost: sumTotal(items) }; });
      window.alert(`Imported ${rows.length} line item(s).`);
    } catch (e) { window.alert(e?.message || "CSV import failed."); }
    finally { if (csvRef.current) csvRef.current.value = ""; }
  };

  const saveProject = async () => {
    setSaving(true);
    try {
      const payload = { ...project, total_cost: sumTotal(project.items) };
      let saved;
      if (project.id) {
        const fresh = await staffEntities.CustomItemsProject.get(project.id);
        if (fresh?.updated_date && fresh.updated_date !== project.updated_date) throw new Error("This section changed — reload before saving.");
        saved = await staffEntities.CustomItemsProject.update(project.id, payload);
      } else {
        await preflightBuilderSourceMutation?.({ estimateId }).catch(() => {});
        saved = await staffEntities.CustomItemsProject.create(payload);
      }
      setProject(saved || payload);
      if (estimateId) await recordBuilderSave?.({ estimateId, projectId: saved?.id || project.id }).catch(() => {});
      onSaved?.(saved);
      window.alert("Section saved.");
    } catch (e) { window.alert(e?.message || "Save failed."); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-10 text-center text-[12px] text-gray-400">Loading custom items…</div>;
  if (error) return <div className="p-10 text-center text-[12px] text-red-600">{error}</div>;
  if (!project) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-5">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/Estimator"><Button variant="outline" className="h-[30px] text-[11px]"><ArrowLeft className="w-3.5 h-3.5 mr-1" /> Estimator</Button></Link>
        <div className="w-9 h-9 rounded bg-violet-50 text-violet-700 flex items-center justify-center"><ListChecks className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-bold text-gray-900">Custom line items</h1>
          <p className="text-[10px] text-gray-500">A flat list of priced items — hand-entered or CSV-imported. Feeds the section total via `extractManualItems`.</p>
        </div>
        <button type="button" onClick={() => csvRef.current?.click()} className="h-[30px] px-2.5 rounded border border-emerald-300 bg-emerald-50 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 inline-flex items-center gap-1"><Upload className="w-3 h-3" /> Import CSV</button>
        <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => importCsv(e.target.files?.[0])} />
        <Button onClick={saveProject} disabled={saving} className="h-[30px] text-[11px]">{saving ? "Saving…" : "Save section"}</Button>
      </div>
      <div className="bg-white border border-gray-200 rounded-md">
        <div className="px-4 py-2 border-b border-gray-200 grid grid-cols-2 gap-3">
          <div><Label className="text-[9px]">Section name</Label><Input value={project.project_name || ""} onChange={(e) => setProject((p) => ({ ...p, project_name: e.target.value }))} className="h-[30px] text-[11px] mt-0.5" /></div>
          <div><Label className="text-[9px]">Client</Label><Input value={project.client_name || ""} onChange={(e) => setProject((p) => ({ ...p, client_name: e.target.value }))} className="h-[30px] text-[11px] mt-0.5" /></div>
        </div>
        <div className="divide-y divide-gray-100">
          {(project.items || []).map((item, i) => (
            <div key={i} className="px-4 py-2.5 grid grid-cols-12 items-end gap-2">
              <div className="col-span-5"><Label className="text-[9px]">Description</Label><Input value={item.description || ""} onChange={(e) => updateItem(i, "description", e.target.value)} className="h-[28px] text-[11px] mt-0.5" /></div>
              <div className="col-span-2"><Label className="text-[9px]">Qty</Label><Input type="number" min="0" value={item.quantity ?? 1} onChange={(e) => updateItem(i, "quantity", num(e.target.value, 1))} className="h-[28px] text-[11px] mt-0.5" /></div>
              <div className="col-span-2"><Label className="text-[9px]">Cost (extended)</Label><Input type="number" min="0" step="0.01" value={item.item_total_cost ?? 0} onChange={(e) => updateItem(i, "item_total_cost", num(e.target.value))} className="h-[28px] text-[11px] mt-0.5" /></div>
              <div className="col-span-2"><Label className="text-[9px]">Type</Label>
                <Select value={item.item_type || "fabrication"} onValueChange={(v) => updateItem(i, "item_type", v)}>
                  <SelectTrigger className="h-[28px] text-[11px] mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{ITEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <button type="button" onClick={() => removeItem(i)} className="col-span-1 justify-self-end text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-gray-200 flex items-center justify-between">
          <button type="button" onClick={addItem} className="h-[28px] px-2.5 rounded border border-gray-300 bg-white text-[10px] font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add item</button>
          <div className="text-[12px] font-bold text-gray-900">Section total: ${sumTotal(project.items).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
      </div>
    </div>
  );
}
