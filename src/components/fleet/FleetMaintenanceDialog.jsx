import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Plus, Trash2, Loader2, WandSparkles } from "lucide-react";

const EMPTY = {
  title: "",
  description: "",
  equipment_id: "",
  type: "recurring",
  priority: "medium",
  frequency: "monthly",
  custom_frequency_value: "",
  custom_frequency_unit: "months",
  estimated_duration: "",
  start_date: "",
  assigned_to: "",
  status: "pending",
  parts_needed: [],
  fluids_needed: [],
};

export default function FleetMaintenanceDialog({ open, task, initialEquipmentId = "", equipment, parts = [], fluids = [], onClose, onSave, saving }) {
  const [form, setForm] = useState(EMPTY);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiApplied, setAiApplied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAiPrompt("");
    setAiError("");
    setAiApplied(false);
    setForm(task ? {
      ...EMPTY,
      ...task,
      status: task.status === "overdue" ? "pending" : (task.status || "pending"),
      custom_frequency_value: task.custom_frequency_value ?? "",
      estimated_duration: task.estimated_duration ?? "",
      parts_needed: Array.isArray(task.parts_needed) ? task.parts_needed : [],
      fluids_needed: Array.isArray(task.fluids_needed) ? task.fluids_needed : [],
    } : { ...EMPTY, equipment_id: initialEquipmentId || "", parts_needed: [], fluids_needed: [] });
  }, [open, task, initialEquipmentId]);

  if (!open) return null;

  const availableParts = parts.filter(item => !form.equipment_id || !item.compatible_equipment_ids?.length || item.compatible_equipment_ids.includes(form.equipment_id));
  const availableFluids = fluids.filter(item => !form.equipment_id || !item.compatible_equipment_ids?.length || item.compatible_equipment_ids.includes(form.equipment_id));
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const setPart = (index, key, value) => setForm(prev => ({
    ...prev,
    parts_needed: prev.parts_needed.map((row, i) => i === index ? { ...row, [key]: value } : row),
  }));
  const setFluid = (index, key, value) => setForm(prev => ({
    ...prev,
    fluids_needed: prev.fluids_needed.map((row, i) => i === index ? { ...row, [key]: value } : row),
  }));

  const generateAiDraft = async () => {
    const selected = equipment.find(item => item.id === form.equipment_id);
    if (!selected) {
      setAiError("Select the Fleet equipment first so AI cannot guess which asset this schedule belongs to.");
      return;
    }
    if (!aiPrompt.trim()) {
      setAiError("Describe the maintenance task you want help drafting.");
      return;
    }
    setAiLoading(true);
    setAiError("");
    try {
      const compatiblePartNames = availableParts.slice(0, 100).map(item => ({ name: item.part_name, part_number: item.part_number || "", manufacturer: item.manufacturer || "" }));
      const compatibleFluidNames = availableFluids.slice(0, 100).map(item => ({ name: item.fluid_name, brand: item.brand || "", viscosity: item.viscosity || "", unit: item.unit || "" }));
      const schema = {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low","medium","high","critical"] },
          frequency: { type: "string", enum: ["daily","weekly","bi_weekly","monthly","bi_monthly","quarterly","every_6_months","annually","custom"] },
          custom_frequency_value: { type: "number" },
          custom_frequency_unit: { type: "string", enum: ["days","weeks","months","years"] },
          estimated_duration: { type: "number" },
          parts_needed: { type: "array", items: { type: "object", properties: { part_name: { type: "string" }, quantity: { type: "number" }, notes: { type: "string" } } } },
          fluids_needed: { type: "array", items: { type: "object", properties: { fluid_type: { type: "string" }, quantity: { type: "number" }, unit: { type: "string", enum: ["quarts","gallons","pints","ounces"] }, notes: { type: "string" } } } },
          verification_notes: { type: "string" },
        },
        required: ["title","description","priority","frequency","parts_needed","fluids_needed","verification_notes"],
      };
      const prompt = `Create a REVIEW-ONLY maintenance schedule draft for this exact CCS Fleet asset. Do not change or guess the asset identity.\n\nAsset: ${JSON.stringify({ name:selected.name, type:selected.type, year:selected.year, make:selected.make, model:selected.model, engine_details:selected.engine_details })}\nUser request: ${aiPrompt.trim()}\n\nCompatible Fleet parts currently in CCS: ${JSON.stringify(compatiblePartNames)}\nCompatible Fleet fluids currently in CCS: ${JSON.stringify(compatibleFluidNames)}\n\nResearch can assist, but do not present uncertain OEM intervals, capacities, part numbers, or specifications as verified facts. Prefer matching existing Fleet inventory names when appropriate. Put every uncertainty or item requiring OEM/manual confirmation in verification_notes. Never save or activate anything; return only a draft for an admin to review.`;
      const result = await base44.integrations.Core.InvokeLLM({ prompt, add_context_from_internet: true, response_json_schema: schema });
      if (!result || typeof result !== "object") throw new Error("AI returned no usable draft.");
      setForm(prev => ({
        ...prev,
        title: String(result.title || prev.title || ""),
        description: String(result.description || prev.description || ""),
        priority: ["low","medium","high","critical"].includes(result.priority) ? result.priority : prev.priority,
        frequency: ["daily","weekly","bi_weekly","monthly","bi_monthly","quarterly","every_6_months","annually","custom"].includes(result.frequency) ? result.frequency : prev.frequency,
        custom_frequency_value: result.frequency === "custom" && Number(result.custom_frequency_value) > 0 ? Number(result.custom_frequency_value) : prev.custom_frequency_value,
        custom_frequency_unit: ["days","weeks","months","years"].includes(result.custom_frequency_unit) ? result.custom_frequency_unit : prev.custom_frequency_unit,
        estimated_duration: Number(result.estimated_duration) >= 0 ? Number(result.estimated_duration) : prev.estimated_duration,
        parts_needed: Array.isArray(result.parts_needed) ? result.parts_needed.map(row => ({ part_name:String(row?.part_name || ""), quantity:Math.max(0, Number(row?.quantity || 0)), notes:String(row?.notes || "") })).filter(row => row.part_name && row.quantity > 0) : prev.parts_needed,
        fluids_needed: Array.isArray(result.fluids_needed) ? result.fluids_needed.map(row => ({ fluid_type:String(row?.fluid_type || ""), quantity:Math.max(0, Number(row?.quantity || 0)), unit:["quarts","gallons","pints","ounces"].includes(row?.unit) ? row.unit : "quarts", notes:String(row?.notes || "") })).filter(row => row.fluid_type && row.quantity > 0) : prev.fluids_needed,
      }));
      setAiPrompt(String(result.verification_notes || "Review all AI-suggested maintenance details against the equipment/OEM documentation before saving."));
      setAiApplied(true);
    } catch (e) {
      setAiError(e?.message || "AI maintenance drafting failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      equipment_id: form.equipment_id,
      type: form.type,
      priority: form.priority,
      frequency: form.type === "recurring" ? form.frequency : undefined,
      custom_frequency_value: form.type === "recurring" && form.frequency === "custom" && form.custom_frequency_value !== "" ? Number(form.custom_frequency_value) : undefined,
      custom_frequency_unit: form.type === "recurring" && form.frequency === "custom" ? form.custom_frequency_unit : undefined,
      estimated_duration: form.estimated_duration === "" ? undefined : Number(form.estimated_duration),
      start_date: form.start_date || undefined,
      assigned_to: form.assigned_to.trim(),
      status: form.status,
      parts_needed: form.parts_needed
        .map(row => ({ part_name: String(row.part_name || "").trim(), quantity: Number(row.quantity || 0), notes: String(row.notes || "").trim() }))
        .filter(row => row.part_name && row.quantity > 0),
      fluids_needed: form.fluids_needed
        .map(row => ({ fluid_type: String(row.fluid_type || "").trim(), quantity: Number(row.quantity || 0), unit: row.unit || "quarts", notes: String(row.notes || "").trim() }))
        .filter(row => row.fluid_type && row.quantity > 0),
    };
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-gray-200 dark:border-slate-700">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">{task ? "Edit Maintenance Schedule" : "New Maintenance Schedule"}</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">Scheduling only. Saving this does not generate a work order.</p>
          </div>
          <button onClick={onClose} disabled={saving} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-6">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div><div className="flex items-center gap-2 font-semibold text-indigo-900 dark:text-indigo-100"><WandSparkles className="w-4 h-4"/>AI Draft Assistant</div><p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">Optional review-only assistance. Select equipment first. AI can suggest wording, interval, parts and fluids, but nothing is saved until you review the normal form and click Save.</p></div>
              <button type="button" onClick={generateAiDraft} disabled={aiLoading || saving} className="shrink-0 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{aiLoading?<Loader2 className="w-4 h-4 animate-spin"/>:<WandSparkles className="w-4 h-4"/>}{aiLoading?"Researching…":"Draft with AI"}</button>
            </div>
            <textarea rows="3" value={aiPrompt} onChange={e=>{setAiPrompt(e.target.value);setAiApplied(false);}} placeholder="Example: Draft the next oil and filter service for this asset. Include likely supplies and a conservative schedule for me to verify." className="field mt-3" />
            {aiError && <div className="mt-2 text-xs text-red-700 dark:text-red-300">{aiError}</div>}
            {aiApplied && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><b>AI draft applied to the form below.</b> Verification notes: {aiPrompt || "Verify interval, capacity, part numbers, and fluid specifications against OEM documentation before saving."}</div>}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Title *"><input required value={form.title} onChange={e => set("title", e.target.value)} className="field" /></Field>
            <Field label="Equipment *"><select required value={form.equipment_id} onChange={e => set("equipment_id", e.target.value)} className="field"><option value="">Select equipment</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Type"><select value={form.type} onChange={e => set("type", e.target.value)} className="field"><option value="recurring">Recurring</option><option value="one_off">One-time</option></select></Field>
            <Field label="Priority"><select value={form.priority} onChange={e => set("priority", e.target.value)} className="field"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
            {form.type === "recurring" && <Field label="Frequency"><select value={form.frequency} onChange={e => set("frequency", e.target.value)} className="field"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="bi_weekly">Every 2 weeks</option><option value="monthly">Monthly</option><option value="bi_monthly">Every 2 months</option><option value="quarterly">Quarterly</option><option value="every_6_months">Every 6 months</option><option value="annually">Annually</option><option value="custom">Custom</option></select></Field>}
            {form.type === "recurring" && form.frequency === "custom" && <div className="grid grid-cols-2 gap-2"><Field label="Every"><input min="1" type="number" value={form.custom_frequency_value} onChange={e => set("custom_frequency_value", e.target.value)} className="field" /></Field><Field label="Unit"><select value={form.custom_frequency_unit} onChange={e => set("custom_frequency_unit", e.target.value)} className="field"><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option></select></Field></div>}
            <Field label="Start / due date"><input type="date" value={form.start_date || ""} onChange={e => set("start_date", e.target.value)} className="field" /></Field>
            <Field label="Estimated duration (hours)"><input min="0" step="0.25" type="number" value={form.estimated_duration} onChange={e => set("estimated_duration", e.target.value)} className="field" /></Field>
            <Field label="Assigned to"><input value={form.assigned_to} onChange={e => set("assigned_to", e.target.value)} className="field" /></Field>
            <Field label="Workflow status"><select value={form.status} onChange={e => set("status", e.target.value)} className="field"><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select><div className="mt-1 text-[11px] text-gray-400">Overdue is calculated automatically from the due date while a schedule is pending.</div></Field>
          </div>

          <Field label="Description"><textarea rows="3" value={form.description} onChange={e => set("description", e.target.value)} className="field" /></Field>

          <div className="grid lg:grid-cols-2 gap-5">
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
              <div className="flex items-center justify-between"><div><h3 className="font-semibold text-gray-900 dark:text-slate-100">Parts Needed</h3><p className="text-xs text-gray-400 mt-0.5">Suggestions come from compatible Fleet Parts; historical/custom names remain allowed.</p></div><button type="button" onClick={() => set("parts_needed", [...form.parts_needed, { part_name: "", quantity: 1, notes: "" }])} className="text-sm inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300"><Plus className="w-4 h-4" />Add part</button></div>
              <datalist id="fleet-maint-part-options">{availableParts.map(item => <option key={item.id} value={item.part_name}>{item.part_number ? `${item.part_number} · ` : ""}stock ${item.quantity_on_hand ?? "—"}</option>)}</datalist>
              {form.parts_needed.map((row, i) => <div key={i} className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 space-y-2"><div className="grid grid-cols-[1fr_90px_36px] gap-2 items-end"><Field label="Part"><input list="fleet-maint-part-options" value={row.part_name || ""} onChange={e => setPart(i, "part_name", e.target.value)} className="field" placeholder="Select or type a part" /></Field><Field label="Qty"><input type="number" min="0" step="1" value={row.quantity ?? 1} onChange={e => setPart(i, "quantity", e.target.value)} className="field" /></Field><button type="button" onClick={() => set("parts_needed", form.parts_needed.filter((_, x) => x !== i))} className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button></div><Field label="Line Notes"><input value={row.notes || ""} onChange={e => setPart(i, "notes", e.target.value)} className="field" placeholder="Optional instructions, brand preference, etc." /></Field></div>)}
              {form.parts_needed.length === 0 && <p className="text-xs text-gray-400">No parts pre-planned.</p>}
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
              <div className="flex items-center justify-between"><div><h3 className="font-semibold text-gray-900 dark:text-slate-100">Fluids Needed</h3><p className="text-xs text-gray-400 mt-0.5">Suggestions come from compatible Fleet Fluids; custom historical text remains supported.</p></div><button type="button" onClick={() => set("fluids_needed", [...form.fluids_needed, { fluid_type: "", quantity: 1, unit: "quarts", notes: "" }])} className="text-sm inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300"><Plus className="w-4 h-4" />Add fluid</button></div>
              <datalist id="fleet-maint-fluid-options">{availableFluids.map(item => <option key={item.id} value={item.fluid_name}>{[item.brand, item.viscosity, item.quantity != null ? `stock ${item.quantity} ${item.unit || ""}` : ""].filter(Boolean).join(" · ")}</option>)}</datalist>
              {form.fluids_needed.map((row, i) => <div key={i} className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 space-y-2"><div className="grid grid-cols-[1fr_80px_105px_36px] gap-2 items-end"><Field label="Fluid"><input list="fleet-maint-fluid-options" value={row.fluid_type || ""} onChange={e => { const value = e.target.value; setFluid(i, "fluid_type", value); const matched = availableFluids.find(item => item.fluid_name === value); if (matched?.unit) setFluid(i, "unit", matched.unit); }} className="field" placeholder="Select or type a fluid" /></Field><Field label="Qty"><input type="number" min="0" step="0.01" value={row.quantity ?? 1} onChange={e => setFluid(i, "quantity", e.target.value)} className="field" /></Field><Field label="Unit"><select value={row.unit || "quarts"} onChange={e => setFluid(i, "unit", e.target.value)} className="field"><option value="quarts">Quarts</option><option value="gallons">Gallons</option><option value="pints">Pints</option><option value="ounces">Ounces</option></select></Field><button type="button" onClick={() => set("fluids_needed", form.fluids_needed.filter((_, x) => x !== i))} className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button></div><Field label="Line Notes"><input value={row.notes || ""} onChange={e => setFluid(i, "notes", e.target.value)} className="field" placeholder="Optional type/specification notes" /></Field></div>)}
              {form.fluids_needed.length === 0 && <p className="text-xs text-gray-400">No fluids pre-planned.</p>}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 disabled:opacity-50">Cancel</button><button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center gap-2 disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{task ? "Save Schedule" : "Create Schedule"}</button></div>
        </form>
      </div>
      <style>{`.field{width:100%;border:1px solid rgb(209 213 219);border-radius:.5rem;padding:.5rem .65rem;background:white;color:inherit}.dark .field{background:rgb(15 23 42);border-color:rgb(51 65 85)}`}</style>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block text-sm"><span className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{label}</span>{children}</label>;
}
