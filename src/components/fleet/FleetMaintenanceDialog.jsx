import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { FLEET_MAINTENANCE_TEMPLATES, prettyMaintenanceFrequency } from "@/components/fleet/fleetMaintenanceTemplates";
import { ArrowLeft, ArrowRight, CalendarClock, Check, Loader2, Plus, Sparkles, Trash2, WandSparkles, X } from "lucide-react";

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

/** @type {Array<[number, string]>} */
const STEPS = [
  [1, "Equipment & Maintenance"],
  [2, "When"],
  [3, "Work Planning"],
  [4, "Parts & Fluids"],
];

export default function FleetMaintenanceDialog({ open, task, initialEquipmentId = "", equipment, parts = [], fluids = [], onClose, onSave, saving }) {
  const [form, setForm] = useState(/** @type {any} */ ({ ...EMPTY }));
  const [step, setStep] = useState(1);
  const [validationError, setValidationError] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiApplied, setAiApplied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setValidationError("");
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

  const availableParts = useMemo(() => parts.filter(item => !form.equipment_id || !item.compatible_equipment_ids?.length || item.compatible_equipment_ids.includes(form.equipment_id)), [parts, form.equipment_id]);
  const availableFluids = useMemo(() => fluids.filter(item => !form.equipment_id || !item.compatible_equipment_ids?.length || item.compatible_equipment_ids.includes(form.equipment_id)), [fluids, form.equipment_id]);
  const recurrencePreview = useMemo(() => buildRecurrencePreview(form), [form]);

  if (!open) return null;

  const set = (key, value) => {
    setValidationError("");
    setForm(prev => ({ ...prev, [key]: value }));
  };
  const setPart = (index, key, value) => setForm(prev => ({ ...prev, parts_needed: prev.parts_needed.map((row, i) => i === index ? { ...row, [key]: value } : row) }));
  const setFluid = (index, key, value) => setForm(prev => ({ ...prev, fluids_needed: prev.fluids_needed.map((row, i) => i === index ? { ...row, [key]: value } : row) }));

  const applyTemplate = (template) => {
    const existingPartNames = new Set(form.parts_needed.map(row => String(row.part_name || "").toLowerCase()));
    const existingFluidNames = new Set(form.fluids_needed.map(row => String(row.fluid_type || "").toLowerCase()));
    const suggestedParts = template.partTerms.map(term => findInventoryMatch(availableParts, "part_name", term)).filter(Boolean).filter(item => !existingPartNames.has(String(item.part_name || "").toLowerCase())).map(item => ({ part_name: item.part_name, quantity: 1, notes: "Template suggestion — verify fitment and quantity before saving." }));
    const suggestedFluids = template.fluidTerms.map(term => findInventoryMatch(availableFluids, "fluid_name", term)).filter(Boolean).filter(item => !existingFluidNames.has(String(item.fluid_name || "").toLowerCase())).map(item => ({ fluid_type: item.fluid_name, quantity: 1, unit: normalizeFluidUnit(item.unit), notes: "Template suggestion — verify specification and required capacity before saving." }));
    setForm(prev => ({
      ...prev,
      title: template.name,
      description: template.description,
      type: "recurring",
      frequency: template.frequency,
      custom_frequency_value: "",
      estimated_duration: template.duration,
      priority: prev.priority || "medium",
      parts_needed: [...prev.parts_needed, ...suggestedParts],
      fluids_needed: [...prev.fluids_needed, ...suggestedFluids],
    }));
    setValidationError("");
  };

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
      const result = /** @type {any} */ (await base44.integrations.Core.InvokeLLM({ prompt, add_context_from_internet: true, response_json_schema: schema }));
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

  const validateForStep = (currentStep) => {
    if (currentStep === 1 && (!form.title.trim() || !form.equipment_id)) return "Choose equipment and enter a maintenance title before continuing.";
    if (currentStep === 2 && form.type === "recurring" && form.frequency === "custom" && !(Number(form.custom_frequency_value) > 0)) return "Enter a custom recurrence interval greater than zero.";
    return "";
  };

  const nextStep = () => {
    const message = validateForStep(step);
    if (message) {
      setValidationError(message);
      return;
    }
    setValidationError("");
    setStep(current => Math.min(4, current + 1));
  };

  const submit = (e) => {
    e.preventDefault();
    const requiredMessage = validateForStep(1) || validateForStep(2);
    if (requiredMessage) {
      setValidationError(requiredMessage);
      setStep(!form.title.trim() || !form.equipment_id ? 1 : 2);
      return;
    }
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
      parts_needed: form.parts_needed.map(row => ({ part_name: String(row.part_name || "").trim(), quantity: Number(row.quantity || 0), notes: String(row.notes || "").trim() })).filter(row => row.part_name && row.quantity > 0),
      fluids_needed: form.fluids_needed.map(row => ({ fluid_type: String(row.fluid_type || "").trim(), quantity: Number(row.quantity || 0), unit: row.unit || "quarts", notes: String(row.notes || "").trim() })).filter(row => row.fluid_type && row.quantity > 0),
    };
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-2 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="fleet-maintenance-dialog-title" className="w-full max-w-5xl max-h-[96dvh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-gray-200 dark:border-slate-700">
        <div className="sticky top-0 z-20 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between px-4 sm:px-5 py-4">
            <div><h2 id="fleet-maintenance-dialog-title" className="text-lg font-bold text-gray-900 dark:text-slate-100">{task ? "Edit Maintenance Schedule" : "New Maintenance Schedule"}</h2><p className="text-xs text-gray-500 dark:text-slate-400">Scheduling only. Nothing becomes a work order until the guarded Fleet generator or a separate work-order action runs.</p></div>
            <button type="button" onClick={onClose} disabled={saving} aria-label="Close maintenance schedule dialog" className="min-h-11 min-w-11 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><X className="w-5 h-5 mx-auto" /></button>
          </div>
          <div className="px-3 sm:px-5 pb-3 overflow-x-auto"><div className="flex min-w-max gap-2">{STEPS.map(([number, label]) => <div key={number} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${step === number ? "bg-indigo-600 text-white" : step > number ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400"}`}>{step > number ? <Check className="w-3.5 h-3.5" /> : <span className="w-4 h-4 rounded-full border border-current inline-flex items-center justify-center text-[10px]">{number}</span>}{label}</div>)}</div></div>
        </div>

        <form onSubmit={submit} className="p-4 sm:p-5 space-y-5">
          {validationError && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-3 py-2 text-sm">{validationError}</div>}

          {step === 1 && <div className="space-y-5">
            {!task && <div><div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-500" /><h3 className="font-semibold text-gray-900 dark:text-slate-100">Start with a template</h3></div><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Templates fill in a safe editable starting point. Any matching Fleet inventory suggestions are review-only and existing planned items are preserved.</p><div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">{FLEET_MAINTENANCE_TEMPLATES.map(template => <button key={template.name} type="button" onClick={() => applyTemplate(template)} className="text-left rounded-xl border border-gray-200 dark:border-slate-700 p-3 hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/20"><div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{template.name}</div><div className="text-[11px] text-gray-400 mt-1 capitalize">{prettyMaintenanceFrequency(template.frequency)}</div></button>)}</div></div>}

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Equipment *"><select value={form.equipment_id} onChange={e => set("equipment_id", e.target.value)} className="field"><option value="">Select equipment</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Maintenance title *"><input value={form.title} onChange={e => set("title", e.target.value)} className="field" placeholder="Oil Change" /></Field>
              <Field label="Schedule type"><select value={form.type} onChange={e => set("type", e.target.value)} className="field"><option value="recurring">Recurring</option><option value="one_off">One-time</option></select></Field>
            </div>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold text-indigo-900 dark:text-indigo-100"><WandSparkles className="w-4 h-4" />AI Draft Assistant</div><p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">Optional review-only help. AI can draft wording, interval, parts and fluids, but cannot save this schedule.</p></div><button type="button" onClick={generateAiDraft} disabled={aiLoading || saving} className="shrink-0 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <WandSparkles className="w-4 h-4" />}{aiLoading ? "Researching…" : "Draft with AI"}</button></div>
              <textarea rows={3} value={aiPrompt} onChange={e => { setAiPrompt(e.target.value); setAiApplied(false); }} placeholder="Example: Draft the next oil and filter service for this asset. Include likely supplies and a conservative schedule for me to verify." className="field mt-3" />
              {aiError && <div className="mt-2 text-xs text-red-700 dark:text-red-300">{aiError}</div>}
              {aiApplied && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><b>AI draft applied.</b> Verification notes: {aiPrompt || "Verify interval, capacity, part numbers, and fluid specifications against OEM documentation before saving."}</div>}
            </div>
          </div>}

          {step === 2 && <div className="space-y-5">
            <div><h3 className="font-semibold text-gray-900 dark:text-slate-100">When should this maintenance happen?</h3><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Choose the due/start date and a simple recurrence. CCS keeps the underlying generation safeguards unchanged.</p></div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Start / due date"><input type="date" value={form.start_date || ""} onChange={e => set("start_date", e.target.value)} className="field" /></Field>
              {form.type === "recurring" && <Field label="Repeat"><select value={form.frequency} onChange={e => set("frequency", e.target.value)} className="field"><option value="daily">Every day</option><option value="weekly">Every week</option><option value="bi_weekly">Every 2 weeks</option><option value="monthly">Every month</option><option value="bi_monthly">Every 2 months</option><option value="quarterly">Every 3 months</option><option value="every_6_months">Every 6 months</option><option value="annually">Every year</option><option value="custom">Custom interval</option></select></Field>}
              {form.type === "recurring" && form.frequency === "custom" && <div className="grid grid-cols-2 gap-2"><Field label="Every"><input min="1" type="number" value={form.custom_frequency_value} onChange={e => set("custom_frequency_value", e.target.value)} className="field" /></Field><Field label="Unit"><select value={form.custom_frequency_unit} onChange={e => set("custom_frequency_unit", e.target.value)} className="field"><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option></select></Field></div>}
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/20 p-4"><div className="flex items-start gap-3"><CalendarClock className="w-5 h-5 text-indigo-600 dark:text-indigo-300 mt-0.5" /><div><div className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Schedule preview</div><div className="font-semibold text-indigo-950 dark:text-indigo-100 mt-1">{recurrencePreview}</div></div></div></div>
          </div>}

          {step === 3 && <div className="space-y-5">
            <div><h3 className="font-semibold text-gray-900 dark:text-slate-100">Plan the work</h3><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Set priority, expected time, assignment and work instructions.</p></div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Priority"><select value={form.priority} onChange={e => set("priority", e.target.value)} className="field"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
              <Field label="Estimated duration (hours)"><input min="0" step="0.25" type="number" value={form.estimated_duration} onChange={e => set("estimated_duration", e.target.value)} className="field" /></Field>
              <Field label="Assigned to"><input value={form.assigned_to} onChange={e => set("assigned_to", e.target.value)} className="field" placeholder="Optional" /></Field>
              <Field label="Workflow status"><select value={form.status} onChange={e => set("status", e.target.value)} className="field"><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select><div className="mt-1 text-[11px] text-gray-400">Overdue is calculated automatically from the due date while a schedule is pending.</div></Field>
            </div>
            <Field label="Work description / instructions"><textarea rows={5} value={form.description} onChange={e => set("description", e.target.value)} className="field" placeholder="What should be inspected, serviced, replaced, or verified?" /></Field>
          </div>}

          {step === 4 && <div className="space-y-5">
            <div><h3 className="font-semibold text-gray-900 dark:text-slate-100">Plan parts and fluids</h3><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">These are planning suggestions only. Inventory is not consumed by saving a schedule.</p></div>
            <div className="grid lg:grid-cols-2 gap-5">
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3"><div><h4 className="font-semibold text-gray-900 dark:text-slate-100">Parts Needed</h4><p className="text-xs text-gray-400 mt-0.5">Compatible Fleet Parts are suggested; historical/custom names remain allowed.</p></div><button type="button" onClick={() => set("parts_needed", [...form.parts_needed, { part_name: "", quantity: 1, notes: "" }])} className="text-sm inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300"><Plus className="w-4 h-4" />Add part</button></div>
                <datalist id="fleet-maint-part-options">{availableParts.map(item => <option key={item.id} value={item.part_name}>{item.part_number ? `${item.part_number} · ` : ""}stock ${item.quantity_on_hand ?? "—"}</option>)}</datalist>
                {form.parts_needed.map((row, i) => <div key={i} className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 space-y-2"><div className="grid grid-cols-[minmax(0,1fr)_78px_36px] gap-2 items-end"><Field label="Part"><input list="fleet-maint-part-options" value={row.part_name || ""} onChange={e => setPart(i, "part_name", e.target.value)} className="field" placeholder="Select or type a part" /></Field><Field label="Qty"><input type="number" min="0" step="1" value={row.quantity ?? 1} onChange={e => setPart(i, "quantity", e.target.value)} className="field" /></Field><button type="button" aria-label="Remove part" onClick={() => set("parts_needed", form.parts_needed.filter((_, x) => x !== i))} className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button></div><Field label="Line Notes"><input value={row.notes || ""} onChange={e => setPart(i, "notes", e.target.value)} className="field" placeholder="Optional instructions or fitment notes" /></Field></div>)}
                {form.parts_needed.length === 0 && <p className="text-xs text-gray-400">No parts pre-planned.</p>}
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3"><div><h4 className="font-semibold text-gray-900 dark:text-slate-100">Fluids Needed</h4><p className="text-xs text-gray-400 mt-0.5">Compatible Fleet Fluids are suggested; verify specification and capacity.</p></div><button type="button" onClick={() => set("fluids_needed", [...form.fluids_needed, { fluid_type: "", quantity: 1, unit: "quarts", notes: "" }])} className="text-sm inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300"><Plus className="w-4 h-4" />Add fluid</button></div>
                <datalist id="fleet-maint-fluid-options">{availableFluids.map(item => <option key={item.id} value={item.fluid_name}>{[item.brand, item.viscosity, item.quantity != null ? `stock ${item.quantity} ${item.unit || ""}` : ""].filter(Boolean).join(" · ")}</option>)}</datalist>
                {form.fluids_needed.map((row, i) => <div key={i} className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 space-y-2"><div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_72px_100px_36px] gap-2 items-end"><Field label="Fluid"><input list="fleet-maint-fluid-options" value={row.fluid_type || ""} onChange={e => { const value = e.target.value; setFluid(i, "fluid_type", value); const matched = availableFluids.find(item => item.fluid_name === value); if (matched?.unit) setFluid(i, "unit", normalizeFluidUnit(matched.unit)); }} className="field" placeholder="Select or type a fluid" /></Field><Field label="Qty"><input type="number" min="0" step="0.01" value={row.quantity ?? 1} onChange={e => setFluid(i, "quantity", e.target.value)} className="field" /></Field><Field label="Unit"><select value={row.unit || "quarts"} onChange={e => setFluid(i, "unit", e.target.value)} className="field"><option value="quarts">Quarts</option><option value="gallons">Gallons</option><option value="pints">Pints</option><option value="ounces">Ounces</option></select></Field><button type="button" aria-label="Remove fluid" onClick={() => set("fluids_needed", form.fluids_needed.filter((_, x) => x !== i))} className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button></div><Field label="Line Notes"><input value={row.notes || ""} onChange={e => setFluid(i, "notes", e.target.value)} className="field" placeholder="Optional type/specification notes" /></Field></div>)}
                {form.fluids_needed.length === 0 && <p className="text-xs text-gray-400">No fluids pre-planned.</p>}
              </div>
            </div>
          </div>}

          <div className="sticky bottom-0 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 px-4 sm:px-5 py-3 border-t border-gray-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur flex items-center justify-between gap-3">
            <button type="button" onClick={() => step === 1 ? onClose() : setStep(current => Math.max(1, current - 1))} disabled={saving} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 disabled:opacity-50 inline-flex items-center gap-2">{step > 1 && <ArrowLeft className="w-4 h-4" />}{step === 1 ? "Cancel" : "Back"}</button>
            <div className="text-xs text-gray-400 hidden sm:block">Step {step} of 4</div>
            {step < 4 ? <button type="button" onClick={nextStep} disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center gap-2 disabled:opacity-50">Continue <ArrowRight className="w-4 h-4" /></button> : <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center gap-2 disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{task ? "Save Schedule" : "Create Schedule"}</button>}
          </div>
        </form>
      </div>
      <style>{`.field{width:100%;border:1px solid rgb(209 213 219);border-radius:.5rem;padding:.5rem .65rem;background:white;color:inherit}.dark .field{background:rgb(15 23 42);border-color:rgb(51 65 85)}`}</style>
    </div>
  );
}

function findInventoryMatch(items, key, term) {
  const needle = String(term || "").toLowerCase();
  return items.find(item => String(item?.[key] || "").toLowerCase() === needle) || items.find(item => String(item?.[key] || "").toLowerCase().includes(needle));
}
function normalizeFluidUnit(unit) { return ["quarts", "gallons", "pints", "ounces"].includes(String(unit || "").toLowerCase()) ? String(unit).toLowerCase() : "quarts"; }
function buildRecurrencePreview(form) {
  const dateText = form.start_date ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${form.start_date}T12:00:00`)) : "";
  if (form.type === "one_off") return dateText ? `One-time maintenance due ${dateText}.` : "One-time maintenance; choose a due date when ready.";
  const cadence = form.frequency === "custom" ? (Number(form.custom_frequency_value) > 0 ? `Every ${Number(form.custom_frequency_value)} ${form.custom_frequency_unit || "months"}` : "Custom recurring maintenance") : prettyMaintenanceFrequency(form.frequency);
  return dateText ? `${cadence} starting ${dateText}.` : `${cadence}; choose a start date when ready.`;
}
function Field({ label, children }) { return <label className="block text-sm"><span className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{label}</span>{children}</label>; }
