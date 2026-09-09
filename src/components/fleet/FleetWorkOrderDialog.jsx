import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Plus, Trash2, Loader2, ImagePlus, Upload } from "lucide-react";

const TYPE_OPTIONS = ["scheduled", "emergency", "inspection", "repair"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];
const STATUS_OPTIONS = ["open", "assigned", "in_progress", "cancelled"];
const EQUIPMENT_STATUS_OPTIONS = ["operational", "maintenance", "down", "retired"];

const blankOrder = () => ({
  equipment_id: "",
  maintenance_task_id: "",
  title: "",
  description: "",
  type: "scheduled",
  priority: "medium",
  status: "open",
  assigned_to: "",
  started_date: "",
  projected_completion_date: "",
  actual_hours: "",
  corrective_action: "",
  notes: "",
  parts_used: [],
  fluids_used: [],
  before_photos: [],
  problem_photos: [],
  after_photos: [],
});

export default function FleetWorkOrderDialog({
  open,
  mode,
  workOrder,
  equipment,
  tasks,
  parts,
  fluids,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(blankOrder());
  const [equipmentStatus, setEquipmentStatus] = useState("operational");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState({ before_photos: [], problem_photos: [], after_photos: [] });

  useEffect(() => {
    if (!open) return;
    const source = workOrder ? {
      ...blankOrder(),
      ...workOrder,
      maintenance_task_id: workOrder.maintenance_task_id || "",
      equipment_id: workOrder.equipment_id || "",
      assigned_to: workOrder.assigned_to || "",
      started_date: workOrder.started_date || "",
      projected_completion_date: workOrder.projected_completion_date || "",
      actual_hours: workOrder.actual_hours ?? "",
      corrective_action: workOrder.corrective_action || "",
      notes: workOrder.notes || "",
      parts_used: (workOrder.parts_used || []).map((p) => ({ ...p })),
      fluids_used: (workOrder.fluids_used || []).map((f) => ({ ...f })),
    } : blankOrder();
    setForm(source);
    const eq = equipment.find((e) => e.id === source.equipment_id);
    setEquipmentStatus(eq?.status || "operational");
    setPendingPhotos({ before_photos: [], problem_photos: [], after_photos: [] });
    setError("");
  }, [open, workOrder, equipment]);

  const filteredTasks = useMemo(() => tasks.filter((t) => !form.equipment_id || t.equipment_id === form.equipment_id), [tasks, form.equipment_id]);
  const compatibleParts = useMemo(() => parts.filter((p) => !form.equipment_id || !p.compatible_equipment_ids?.length || p.compatible_equipment_ids.includes(form.equipment_id)), [parts, form.equipment_id]);
  const compatibleFluids = useMemo(() => fluids.filter((f) => !form.equipment_id || !f.compatible_equipment_ids?.length || f.compatible_equipment_ids.includes(form.equipment_id)), [fluids, form.equipment_id]);

  if (!open) return null;
  const completing = mode === "complete";
  const editing = mode === "edit" || completing;

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const addPart = () => setForm((prev) => ({ ...prev, parts_used: [...(prev.parts_used || []), { part_id: "", part_name: "", quantity: 1, cost: 0 }] }));
  const addFluid = () => setForm((prev) => ({ ...prev, fluids_used: [...(prev.fluids_used || []), { fluid_id: "", fluid_name: "", quantity: 1, unit: "", cost: 0 }] }));
  const addPhotos = (field, fileList) => {
    const files = Array.from(fileList || []).filter(file => file?.type?.startsWith("image/"));
    if (!files.length) return;
    setPendingPhotos(prev => ({ ...prev, [field]: [...(prev[field] || []), ...files] }));
  };
  const removePendingPhoto = (field, index) => setPendingPhotos(prev => ({ ...prev, [field]: (prev[field] || []).filter((_, i) => i !== index) }));
  const removeSavedPhoto = (field, index) => setForm(prev => ({ ...prev, [field]: (prev[field] || []).filter((_, i) => i !== index) }));

  const updatePart = (index, field, value) => {
    setForm((prev) => ({ ...prev, parts_used: (prev.parts_used || []).map((line, i) => {
      if (i !== index) return line;
      if (field === "part_id") {
        const item = parts.find((p) => p.id === value);
        return item ? { part_id: item.id, part_name: item.part_name, quantity: Number(line.quantity || 1), cost: Number(item.unit_cost || 0) * Number(line.quantity || 1) } : { ...line, part_id: value };
      }
      if (field === "quantity") {
        const item = parts.find((p) => p.id === line.part_id);
        const qty = Math.max(0, Number(value || 0));
        return { ...line, quantity: qty, cost: Number(item?.unit_cost || 0) * qty };
      }
      return { ...line, [field]: value };
    }) }));
  };

  const updateFluid = (index, field, value) => {
    setForm((prev) => ({ ...prev, fluids_used: (prev.fluids_used || []).map((line, i) => {
      if (i !== index) return line;
      if (field === "fluid_id") {
        const item = fluids.find((f) => f.id === value);
        return item ? { fluid_id: item.id, fluid_name: item.fluid_name, quantity: Number(line.quantity || line.quantity_quarts || 1), unit: item.unit || "quarts", cost: Number(item.cost_per_unit || 0) * Number(line.quantity || line.quantity_quarts || 1) } : { ...line, fluid_id: value };
      }
      if (field === "quantity") {
        const item = fluids.find((f) => f.id === line.fluid_id);
        const qty = Math.max(0, Number(value || 0));
        return { ...line, quantity: qty, quantity_quarts: undefined, unit: item?.unit || line.unit || "quarts", cost: Number(item?.cost_per_unit || 0) * qty };
      }
      return { ...line, [field]: value };
    }) }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.title?.trim()) return setError("Title is required.");
    if (!editing && !form.equipment_id) return setError("Equipment is required for a new Fleet work order.");
    if (completing && !form.corrective_action?.trim()) return setError("Corrective action is required to complete the work order.");
    if (completing) {
      const usageCount = (form.parts_used || []).filter((p) => p.part_id && Number(p.quantity) > 0).length + (form.fluids_used || []).filter((f) => f.fluid_id && Number(f.quantity ?? f.quantity_quarts) > 0).length;
      const message = usageCount
        ? `Complete this Fleet work order and apply ${usageCount} inventory usage line${usageCount === 1 ? "" : "s"}? This operation is protected by idempotency receipts.`
        : "Complete this Fleet work order with no inventory usage recorded?";
      if (!window.confirm(message)) return;
    }
    setSaving(true);
    try {
      const photoFields = ["problem_photos", "before_photos", "after_photos"];
      const photoPatch = {};
      for (const field of photoFields) {
        const uploads = await Promise.all((pendingPhotos[field] || []).map(async (file) => {
          const result = await base44.integrations.Core.UploadFile({ file });
          if (!result?.file_url) throw new Error(`Photo upload failed for ${file.name}.`);
          return result.file_url;
        }));
        photoPatch[field] = [...(form[field] || []), ...uploads];
      }
      const payload = {
        ...form,
        ...photoPatch,
        actual_hours: form.actual_hours === "" ? undefined : Number(form.actual_hours),
        maintenance_task_id: form.maintenance_task_id || undefined,
      };
      await onSubmit(payload, completing ? equipmentStatus : undefined);
    } catch (err) {
      setError(err?.message || "Fleet work-order operation failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 p-3 sm:p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-t-2xl">
          <div><div className="font-semibold text-gray-900 dark:text-slate-100">{mode === "create" ? "New Fleet Work Order" : mode === "complete" ? `Complete ${workOrder?.work_order_number || "Work Order"}` : `Edit ${workOrder?.work_order_number || "Work Order"}`}</div><div className="text-xs text-gray-500">Fleet maintenance only — never enters signage production.</div></div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 sm:p-6 space-y-6">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300 px-3 py-2 text-sm">{error}</div>}

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Equipment"><select value={form.equipment_id || ""} onChange={(e) => { set("equipment_id", e.target.value); set("maintenance_task_id", ""); }} className="fleet-input" disabled={completing && !form.equipment_id}><option value="">No equipment / unresolved</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
            <Field label="Maintenance Schedule"><select value={form.maintenance_task_id || ""} onChange={(e) => set("maintenance_task_id", e.target.value)} className="fleet-input"><option value="">None</option>{filteredTasks.map((t) => <option key={t.id} value={t.id}>{t.title} · {t.start_date || "no date"}</option>)}</select></Field>
            <Field label="Title"><input value={form.title || ""} onChange={(e) => set("title", e.target.value)} className="fleet-input" /></Field>
            <Field label="Assigned To"><input value={form.assigned_to || ""} onChange={(e) => set("assigned_to", e.target.value)} className="fleet-input" placeholder="Technician / vendor" /></Field>
            <Field label="Type"><select value={form.type || "scheduled"} onChange={(e) => set("type", e.target.value)} className="fleet-input">{TYPE_OPTIONS.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></Field>
            <Field label="Priority"><select value={form.priority || "medium"} onChange={(e) => set("priority", e.target.value)} className="fleet-input">{PRIORITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
            {!completing && <Field label="Status"><select value={form.status || "open"} onChange={(e) => set("status", e.target.value)} className="fleet-input">{STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></Field>}
            <Field label="Actual Hours"><input type="number" min="0" step="0.25" value={form.actual_hours ?? ""} onChange={(e) => set("actual_hours", e.target.value)} className="fleet-input" /></Field>
            <Field label="Started"><input type="date" value={form.started_date || ""} onChange={(e) => set("started_date", e.target.value)} className="fleet-input" /></Field>
            <Field label="Projected Completion"><input type="date" value={form.projected_completion_date || ""} onChange={(e) => set("projected_completion_date", e.target.value)} className="fleet-input" /></Field>
          </div>

          <Field label="Description"><textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} rows={4} className="fleet-input" /></Field>
          <Field label={completing ? "Corrective Action *" : "Corrective Action"}><textarea value={form.corrective_action || ""} onChange={(e) => set("corrective_action", e.target.value)} rows={4} className="fleet-input" /></Field>
          <Field label="Notes"><textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={3} className="fleet-input" /></Field>

          <div>
            <div className="flex items-center gap-2 mb-2"><ImagePlus className="w-4 h-4 text-indigo-500" /><div className="font-medium text-gray-900 dark:text-slate-100">Work Order Photos</div></div>
            <div className="grid md:grid-cols-3 gap-3">
              <PhotoEditor title="Problem Photos" field="problem_photos" urls={form.problem_photos || []} files={pendingPhotos.problem_photos || []} onAdd={addPhotos} onRemoveUrl={removeSavedPhoto} onRemoveFile={removePendingPhoto} />
              <PhotoEditor title="Before Photos" field="before_photos" urls={form.before_photos || []} files={pendingPhotos.before_photos || []} onAdd={addPhotos} onRemoveUrl={removeSavedPhoto} onRemoveFile={removePendingPhoto} />
              <PhotoEditor title="After Photos" field="after_photos" urls={form.after_photos || []} files={pendingPhotos.after_photos || []} onAdd={addPhotos} onRemoveUrl={removeSavedPhoto} onRemoveFile={removePendingPhoto} />
            </div>
            <div className="text-xs text-gray-400 mt-2">Selected photos upload when you save or complete the Fleet work order.</div>
          </div>

          <UsageEditor title="Parts Used" onAdd={addPart}>
            {(form.parts_used || []).map((line, index) => <div key={`part-${index}`} className="grid sm:grid-cols-[1fr_120px_44px] gap-2 items-center">
              <select value={line.part_id || ""} onChange={(e) => updatePart(index, "part_id", e.target.value)} className="fleet-input"><option value="">Select part…</option>{compatibleParts.map((p) => <option key={p.id} value={p.id}>{p.part_name} · stock {p.quantity_on_hand ?? 0}</option>)}</select>
              <input type="number" min="0" step="1" value={line.quantity ?? 0} onChange={(e) => updatePart(index, "quantity", e.target.value)} className="fleet-input" />
              <button type="button" onClick={() => setForm((prev) => ({ ...prev, parts_used: prev.parts_used.filter((_, i) => i !== index) }))} className="p-2 rounded-lg border border-gray-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700"><Trash2 className="w-4 h-4" /></button>
            </div>)}
          </UsageEditor>

          <UsageEditor title="Fluids Used" onAdd={addFluid}>
            {(form.fluids_used || []).map((line, index) => <div key={`fluid-${index}`} className="grid sm:grid-cols-[1fr_120px_100px_44px] gap-2 items-center">
              <select value={line.fluid_id || ""} onChange={(e) => updateFluid(index, "fluid_id", e.target.value)} className="fleet-input"><option value="">Select fluid…</option>{compatibleFluids.map((f) => <option key={f.id} value={f.id}>{f.fluid_name} · stock {f.quantity ?? "—"} {f.unit || ""}</option>)}</select>
              <input type="number" min="0" step="0.01" value={line.quantity ?? line.quantity_quarts ?? 0} onChange={(e) => updateFluid(index, "quantity", e.target.value)} className="fleet-input" />
              <div className="text-xs text-gray-500 px-2">{line.unit || fluids.find((f) => f.id === line.fluid_id)?.unit || ""}</div>
              <button type="button" onClick={() => setForm((prev) => ({ ...prev, fluids_used: prev.fluids_used.filter((_, i) => i !== index) }))} className="p-2 rounded-lg border border-gray-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700"><Trash2 className="w-4 h-4" /></button>
            </div>)}
          </UsageEditor>

          {completing && <Field label="Equipment Status After Completion"><select value={equipmentStatus} onChange={(e) => setEquipmentStatus(e.target.value)} className="fleet-input">{EQUIPMENT_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>}

          <div className="rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200 px-3 py-2 text-xs">Fleet notifications are live. Completion updates Fleet inventory/history, advances linked recurring maintenance, and queues completion/low-stock notifications only after the server-side idempotency checks pass.</div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-50 flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{completing ? "Complete Work Order" : mode === "create" ? "Create Work Order" : "Save Changes"}</button>
          </div>
        </form>
      </div>
      <style>{`.fleet-input{width:100%;border:1px solid rgb(209 213 219);border-radius:.5rem;padding:.55rem .7rem;background:white}.dark .fleet-input{background:rgb(15 23 42);border-color:rgb(51 65 85);color:rgb(226 232 240)}`}</style>
    </div>
  );
}

function Field({ label, children }) { return <label className="block space-y-1.5"><span className="text-xs font-medium text-gray-600 dark:text-slate-300">{label}</span>{children}</label>; }
function UsageEditor({ title, onAdd, children }) { return <div className="space-y-2"><div className="flex items-center justify-between"><div className="font-medium text-gray-900 dark:text-slate-100">{title}</div><button type="button" onClick={onAdd} className="text-sm text-indigo-600 dark:text-indigo-300 flex items-center gap-1"><Plus className="w-4 h-4" />Add</button></div>{children.length ? <div className="space-y-2">{children}</div> : <div className="text-xs text-gray-400 border border-dashed border-gray-200 dark:border-slate-800 rounded-lg p-3">None recorded.</div>}</div>; }
