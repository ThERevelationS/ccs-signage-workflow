import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Gauge, Loader2, X } from "lucide-react";

const EMPTY = {
  maintenance_task_id: "",
  meter_type: "odometer_miles",
  source: "manual",
  interval_value: "",
  next_due_value: "",
  last_service_value: "",
  lead_value: "",
  trigger_mode: "date_or_meter",
  enabled: true,
  notes: "",
};

export default function FleetMeterRuleDialog({ open, equipment, tasks = [], rule = null, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setSaving(false);
    setForm(rule ? {
      ...EMPTY,
      ...rule,
      interval_value: rule.interval_value ?? "",
      next_due_value: rule.next_due_value ?? "",
      last_service_value: rule.last_service_value ?? "",
      lead_value: rule.lead_value ?? "",
    } : {
      ...EMPTY,
      source: ["matched", "manual"].includes(equipment?.bouncie_link_status) ? "bouncie" : "manual",
      meter_type: ["matched", "manual"].includes(equipment?.bouncie_link_status) ? "odometer_miles" : "engine_hours",
    });
  }, [open, rule, equipment]);

  const availableTasks = useMemo(() => tasks.filter(task => task.equipment_id === equipment?.id && task.type === "recurring"), [tasks, equipment?.id]);
  if (!open) return null;
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const save = async event => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const payload = {
        equipment_id: equipment.id,
        maintenance_task_id: form.maintenance_task_id,
        meter_type: form.meter_type,
        source: form.source,
        interval_value: form.interval_value === "" ? undefined : Number(form.interval_value),
        next_due_value: form.next_due_value === "" ? undefined : Number(form.next_due_value),
        last_service_value: form.last_service_value === "" ? undefined : Number(form.last_service_value),
        lead_value: form.lead_value === "" ? 0 : Number(form.lead_value),
        trigger_mode: form.trigger_mode,
        enabled: form.enabled !== false,
        notes: String(form.notes || "").trim(),
      };
      const body = rule
        ? { action: "update", id: rule.id, expected_updated_date: rule.updated_date || "", rule: payload }
        : { action: "create", creation_key: `meter-rule-${crypto.randomUUID()}`, rule: payload };
      const { data } = await base44.functions.invoke("fleetMeterMaintenanceAction", body);
      if (data?.error) throw new Error(data.error);
      await onSaved?.(data.rule);
      onClose();
    } catch (err) {
      setError(err?.message || "Unable to save Fleet meter maintenance rule.");
    } finally { setSaving(false); }
  };

  const bouncieEligible = ["matched", "manual"].includes(equipment?.bouncie_link_status);
  return <div className="fixed inset-0 z-[110] bg-black/55 p-4 flex items-center justify-center">
    <div role="dialog" aria-modal="true" aria-labelledby="fleet-meter-rule-title" className="w-full max-w-2xl max-h-[92dvh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800"><div><div className="flex items-center gap-2"><Gauge className="w-5 h-5 text-indigo-600"/><h2 id="fleet-meter-rule-title" className="text-lg font-bold">{rule ? "Edit Meter Maintenance" : "Add Meter Maintenance"}</h2></div><p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Link a recurring schedule to mileage or hours. Date and meter can work together—whichever comes first creates the maintenance work.</p></div><button type="button" onClick={onClose} disabled={saving} className="min-h-11 min-w-11 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-5 h-5 mx-auto"/></button></div>
      <form onSubmit={save} className="p-5 space-y-4">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 px-3 py-2 text-sm">{error}</div>}
        <Field label="Maintenance schedule *"><select required value={form.maintenance_task_id || ""} onChange={e=>set("maintenance_task_id",e.target.value)} className="field" disabled={!!rule}><option value="">Select recurring schedule…</option>{availableTasks.map(task=><option key={task.id} value={task.id}>{task.title} · due {task.start_date || "no date"}</option>)}</select></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Meter type"><select value={form.meter_type} onChange={e=>set("meter_type",e.target.value)} className="field"><option value="odometer_miles">Odometer miles</option><option value="engine_hours">Engine / equipment hours</option><option value="manual">Manual units</option></select></Field>
          <Field label="Reading source"><select value={form.source} onChange={e=>{const value=e.target.value;set("source",value);if(value==="bouncie")set("meter_type","odometer_miles");}} className="field"><option value="manual">FleetEquipment manual reading</option><option value="bouncie" disabled={!bouncieEligible}>Bouncie odometer{!bouncieEligible?" — vehicle not definitively linked":""}</option></select></Field>
          <Field label={`Service interval *`}><input required type="number" min="0.01" step="0.01" value={form.interval_value} onChange={e=>set("interval_value",e.target.value)} className="field" placeholder={form.meter_type==="engine_hours"?"250":"5000"}/></Field>
          <Field label="Lead / due-soon window"><input type="number" min="0" step="0.01" value={form.lead_value} onChange={e=>set("lead_value",e.target.value)} className="field" placeholder={form.meter_type==="engine_hours"?"25":"500"}/></Field>
          <Field label="Last service reading"><input type="number" min="0" step="0.01" value={form.last_service_value} onChange={e=>set("last_service_value",e.target.value)} className="field" placeholder="Leave blank to use current reading"/></Field>
          <Field label="Next due reading"><input type="number" min="0" step="0.01" value={form.next_due_value} onChange={e=>set("next_due_value",e.target.value)} className="field" placeholder="Calculated when blank if possible"/></Field>
        </div>
        <Field label="Trigger behavior"><select value={form.trigger_mode} onChange={e=>set("trigger_mode",e.target.value)} className="field"><option value="date_or_meter">Date OR meter — whichever comes first</option><option value="meter_only">Meter only</option></select></Field>
        <Field label="Notes"><textarea rows={3} value={form.notes || ""} onChange={e=>set("notes",e.target.value)} className="field" placeholder="Example: OEM interval, severe-duty adjustment, manual hour-meter location…"/></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled !== false} onChange={e=>set("enabled",e.target.checked)}/>Enabled</label>
        {form.source === "bouncie" && <div className="rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/20 px-3 py-2 text-xs text-indigo-800 dark:text-indigo-300">Bouncie remains authoritative for the tracked vehicle odometer. Fleet only reads that value to decide when maintenance is due; it does not copy or edit Bouncie telemetry.</div>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="min-h-11 px-4 rounded-lg border border-gray-300 dark:border-slate-700">Cancel</button><button type="submit" disabled={saving} className="min-h-11 px-4 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center gap-2 disabled:opacity-50">{saving&&<Loader2 className="w-4 h-4 animate-spin"/>}{rule?"Save Rule":"Add Meter Rule"}</button></div>
      </form>
      <style>{`.field{width:100%;border:1px solid rgb(209 213 219);border-radius:.6rem;padding:.6rem .72rem;background:white;color:inherit}.dark .field{background:rgb(15 23 42);border-color:rgb(51 65 85)}.field:focus{outline:2px solid rgb(99 102 241 / .35);outline-offset:1px}`}</style>
    </div>
  </div>;
}
function Field({label,children}){return <label className="block"><span className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">{label}</span>{children}</label>}
