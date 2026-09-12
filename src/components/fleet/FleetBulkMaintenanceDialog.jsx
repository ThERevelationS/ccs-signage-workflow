import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { FLEET_MAINTENANCE_TEMPLATES, prettyMaintenanceFrequency } from "@/components/fleet/fleetMaintenanceTemplates";
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Search, Sparkles, Truck, X } from "lucide-react";

const EMPTY = {
  title: "",
  description: "",
  type: "recurring",
  priority: "medium",
  frequency: "monthly",
  custom_frequency_value: "",
  custom_frequency_unit: "months",
  estimated_duration: "",
  start_date: "",
  assigned_to: "",
};

export default function FleetBulkMaintenanceDialog({ open, equipment = [], onClose, onCompleted }) {
  const [operationKey, setOperationKey] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [selectedIds, setSelectedIds] = useState([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setOperationKey(crypto.randomUUID());
    setForm(EMPTY);
    setSelectedIds([]);
    setAssetSearch("");
    setTypeFilter("all");
    setPreview(null);
    setBusy("");
    setError("");
    setResult(null);
  }, [open]);

  const eligibleEquipment = useMemo(() => equipment.filter(item => item.status !== "retired"), [equipment]);
  const retiredCount = equipment.length - eligibleEquipment.length;
  const types = useMemo(() => [...new Set(eligibleEquipment.map(item => item.type).filter(Boolean))].sort(), [eligibleEquipment]);
  const visibleEquipment = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    return eligibleEquipment.filter(item => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (!query) return true;
      return [item.name, item.type, item.make, item.model, item.year, item.vin, item.serial_number, item.license_plate].some(value => String(value || "").toLowerCase().includes(query));
    });
  }, [eligibleEquipment, assetSearch, typeFilter]);

  if (!open) return null;

  const invalidatePreview = () => {
    setPreview(null);
    setResult(null);
    setError("");
  };
  const set = (key, value) => {
    invalidatePreview();
    setForm(current => ({ ...current, [key]: value }));
  };
  const toggleEquipment = (id) => {
    invalidatePreview();
    setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };
  const allVisibleSelected = visibleEquipment.length > 0 && visibleEquipment.every(item => selectedIds.includes(item.id));
  const toggleVisible = () => {
    invalidatePreview();
    if (allVisibleSelected) {
      const visible = new Set(visibleEquipment.map(item => item.id));
      setSelectedIds(current => current.filter(id => !visible.has(id)));
    } else {
      setSelectedIds(current => [...new Set([...current, ...visibleEquipment.map(item => item.id)])].slice(0, 50));
    }
  };
  const applyTemplate = (template) => {
    invalidatePreview();
    setForm(current => ({
      ...current,
      title: template.name,
      description: template.description,
      type: "recurring",
      frequency: template.frequency,
      custom_frequency_value: "",
      estimated_duration: template.duration,
    }));
  };

  const schedulePayload = () => ({
    title: form.title.trim(),
    description: form.description.trim(),
    type: form.type,
    priority: form.priority,
    frequency: form.type === "recurring" ? form.frequency : undefined,
    custom_frequency_value: form.type === "recurring" && form.frequency === "custom" && form.custom_frequency_value !== "" ? Number(form.custom_frequency_value) : undefined,
    custom_frequency_unit: form.type === "recurring" && form.frequency === "custom" ? form.custom_frequency_unit : undefined,
    estimated_duration: form.estimated_duration === "" ? undefined : Number(form.estimated_duration),
    start_date: form.start_date || undefined,
    assigned_to: form.assigned_to.trim(),
    parts_needed: [],
    fluids_needed: [],
  });

  const validate = () => {
    if (!form.title.trim()) return "Enter a maintenance title or choose a template.";
    if (!selectedIds.length) return "Select at least one Fleet asset.";
    if (selectedIds.length > 50) return "Bulk maintenance is limited to 50 assets at a time.";
    if (form.type === "recurring" && form.frequency === "custom" && !(Number(form.custom_frequency_value) > 0)) return "Enter a custom recurrence interval greater than zero.";
    return "";
  };

  const runPreview = async () => {
    const validation = validate();
    if (validation) { setError(validation); return; }
    setBusy("preview");
    setError("");
    setResult(null);
    try {
      const response = await base44.functions.invoke("fleetBulkMaintenancePlan", {
        action: "preview",
        operation_key: operationKey,
        equipment_ids: selectedIds,
        schedule: schedulePayload(),
      });
      const data = response?.data || {};
      if (data.error) throw new Error(data.error);
      setPreview(data);
    } catch (previewError) {
      setPreview(null);
      setError(previewError?.message || "Unable to preview the bulk maintenance plan.");
    } finally {
      setBusy("");
    }
  };

  const commit = async () => {
    if (!preview?.preview_fingerprint || preview?.summary?.blocked > 0) return;
    setBusy("commit");
    setError("");
    try {
      const response = await base44.functions.invoke("fleetBulkMaintenancePlan", {
        action: "commit",
        operation_key: operationKey,
        preview_fingerprint: preview.preview_fingerprint,
        equipment_ids: selectedIds,
        schedule: schedulePayload(),
      });
      const data = response?.data || {};
      setResult(data);
      if (data.error) setError(data.message ? `${data.error} ${data.message}` : data.error);
      if (data.success) await onCompleted?.();
    } catch (commitError) {
      setError(commitError?.message || "Bulk maintenance creation failed before CCS returned a result. Refresh the preview before deciding whether to retry.");
    } finally {
      setBusy("");
    }
  };

  const cadence = form.type === "one_off"
    ? (form.start_date ? `One-time maintenance due ${form.start_date}` : "One-time maintenance")
    : form.frequency === "custom"
      ? `Every ${form.custom_frequency_value || "?"} ${form.custom_frequency_unit}`
      : prettyMaintenanceFrequency(form.frequency);

  return <div className="fixed inset-0 z-[120] bg-black/55 flex items-center justify-center p-2 sm:p-4" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
    <div role="dialog" aria-modal="true" aria-labelledby="fleet-bulk-maintenance-dialog-title" className="w-full max-w-6xl max-h-[96dvh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <div className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-4 sm:px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div><h2 id="fleet-bulk-maintenance-dialog-title" className="text-lg font-bold text-gray-900 dark:text-slate-100">Bulk Maintenance Planner</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Preview every asset before commit. Retries use the same deterministic create identities and do not intentionally duplicate schedules.</p></div>
        <button type="button" onClick={onClose} disabled={!!busy} aria-label="Close bulk maintenance planner" className="min-h-11 min-w-11 p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><X className="w-5 h-5 mx-auto" /></button>
      </div>

      <div className="p-4 sm:p-5 space-y-5">
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200"><b>Safe bulk behavior:</b> preview → full server preflight → sequential retry-safe creates. Base44 does not provide a transaction spanning multiple schedule records, so a rare later failure can leave partial progress; retrying this exact plan reuses already-created schedules instead of creating them again.</div>

        <section className="space-y-3">
          <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-500" /><h3 className="font-semibold text-gray-900 dark:text-slate-100">Choose a maintenance template</h3></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{FLEET_MAINTENANCE_TEMPLATES.map(template => <button key={template.name} type="button" onClick={() => applyTemplate(template)} className={`text-left rounded-xl border p-3 transition ${form.title === template.name ? "border-indigo-400 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30" : "border-gray-200 hover:border-indigo-300 dark:border-slate-700 dark:hover:border-indigo-800"}`}><div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{template.name}</div><div className="text-[11px] text-gray-400 mt-1">{prettyMaintenanceFrequency(template.frequency)}</div></button>)}</div>
        </section>

        <section className="rounded-xl border border-gray-200 p-4 dark:border-slate-700 space-y-4">
          <div><h3 className="font-semibold text-gray-900 dark:text-slate-100">Schedule details</h3><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Common schedule details are applied to every selected asset. Asset-specific parts and fluids are intentionally left for individual review.</p></div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Title *"><input value={form.title} onChange={event => set("title", event.target.value)} className="bulk-field" /></Field>
            <Field label="Schedule type"><select value={form.type} onChange={event => set("type", event.target.value)} className="bulk-field"><option value="recurring">Recurring</option><option value="one_off">One-time</option></select></Field>
            <Field label="Start / due date"><input type="date" value={form.start_date} onChange={event => set("start_date", event.target.value)} className="bulk-field" /></Field>
            {form.type === "recurring" && <Field label="Repeat"><select value={form.frequency} onChange={event => set("frequency", event.target.value)} className="bulk-field"><option value="daily">Every day</option><option value="weekly">Every week</option><option value="bi_weekly">Every 2 weeks</option><option value="monthly">Every month</option><option value="bi_monthly">Every 2 months</option><option value="quarterly">Every 3 months</option><option value="every_6_months">Every 6 months</option><option value="annually">Every year</option><option value="custom">Custom interval</option></select></Field>}
            {form.type === "recurring" && form.frequency === "custom" && <><Field label="Every"><input min="1" type="number" value={form.custom_frequency_value} onChange={event => set("custom_frequency_value", event.target.value)} className="bulk-field" /></Field><Field label="Custom unit"><select value={form.custom_frequency_unit} onChange={event => set("custom_frequency_unit", event.target.value)} className="bulk-field"><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option></select></Field></>}
            <Field label="Priority"><select value={form.priority} onChange={event => set("priority", event.target.value)} className="bulk-field"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
            <Field label="Estimated hours"><input min="0" step="0.25" type="number" value={form.estimated_duration} onChange={event => set("estimated_duration", event.target.value)} className="bulk-field" /></Field>
            <Field label="Assigned to"><input value={form.assigned_to} onChange={event => set("assigned_to", event.target.value)} className="bulk-field" placeholder="Optional" /></Field>
          </div>
          <Field label="Work description / instructions"><textarea rows={3} value={form.description} onChange={event => set("description", event.target.value)} className="bulk-field resize-y" /></Field>
          <div className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200"><CalendarClock className="w-4 h-4 inline mr-2" />{cadence}{form.start_date && form.type === "recurring" ? ` starting ${form.start_date}` : ""}</div>
        </section>

        <section className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-slate-700 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3"><div><h3 className="font-semibold text-gray-900 dark:text-slate-100">Select equipment</h3><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{selectedIds.length} selected · maximum 50. {retiredCount ? `${retiredCount} retired asset${retiredCount === 1 ? " is" : "s are"} excluded.` : "Retired assets are excluded."}</p></div><button type="button" onClick={toggleVisible} disabled={!visibleEquipment.length} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">{allVisibleSelected ? "Clear Visible" : "Select Visible"}</button></div>
            <div className="grid sm:grid-cols-[minmax(0,1fr)_180px] gap-2"><div className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={assetSearch} onChange={event => setAssetSearch(event.target.value)} placeholder="Filter equipment..." className="bulk-field pl-9" /></div><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="bulk-field"><option value="all">All equipment types</option>{types.map(type => <option key={type} value={type}>{String(type).replaceAll("_", " ")}</option>)}</select></div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">{visibleEquipment.map(item => <label key={item.id} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/40"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleEquipment(item.id)} className="mt-1 h-4 w-4" /><div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0">{item.photo_url ? <img src={item.photo_url} alt="" className="w-full h-full object-cover rounded-lg" /> : <Truck className="w-4 h-4 text-gray-400" />}</div><div className="min-w-0"><div className="font-medium text-gray-900 dark:text-slate-100">{item.name}</div><div className="text-xs text-gray-500 dark:text-slate-400">{[item.year, item.make, item.model].filter(Boolean).join(" ") || String(item.type || "").replaceAll("_", " ")}{item.vin ? ` · VIN ${item.vin}` : ""}</div></div></label>)}{visibleEquipment.length === 0 && <div className="px-4 py-10 text-center text-sm text-gray-500">No eligible equipment matches this filter.</div>}</div>
        </section>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

        {preview && <section className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><h3 className="font-semibold text-gray-900 dark:text-slate-100">Preview</h3><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">No schedules have been created by preview.</p></div><div className="text-xs text-gray-500 dark:text-slate-400">Create {preview.summary?.would_create || 0} · existing {preview.summary?.equivalent_existing || 0} · retry reuse {preview.summary?.already_applied || 0} · blocked {preview.summary?.blocked || 0}</div></div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">{(preview.plan || []).map(row => <div key={row.equipment_id} className="px-4 py-3 flex items-start justify-between gap-3"><div><div className="font-medium text-gray-900 dark:text-slate-100">{row.equipment_name || row.equipment_id}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{previewReason(row)}</div></div><PreviewBadge action={row.action} /></div>)}</div>
        </section>}

        {result?.success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200"><CheckCircle2 className="w-4 h-4 inline mr-2" /><b>Bulk maintenance completed.</b> Created {result.created?.length || 0}, reused {result.reused?.length || 0}, skipped equivalent {result.skipped?.length || 0}.</div>}
        {result?.partial && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200"><AlertTriangle className="w-4 h-4 inline mr-2" /><b>Partial progress was recorded.</b> Do not start a new bulk operation. Fix the reported issue, refresh this preview, and retry with this same planner session so already-applied schedules are reused.</div>}

        <div className="sticky bottom-0 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 border-t border-gray-200 bg-white/95 px-4 sm:px-5 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <button type="button" onClick={onClose} disabled={!!busy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">{result?.success ? "Close" : "Cancel"}</button>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={runPreview} disabled={!!busy} className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300">{busy === "preview" && <Loader2 className="w-4 h-4 animate-spin inline mr-2" />}{preview ? "Refresh Preview" : "Preview Changes"}</button>
            <button type="button" onClick={commit} disabled={!!busy || !preview?.preview_fingerprint || (preview?.summary?.blocked || 0) > 0 || result?.success} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "commit" && <Loader2 className="w-4 h-4 animate-spin inline mr-2" />}{result?.partial ? "Retry Exact Plan" : "Create Previewed Schedules"}</button>
          </div>
        </div>
      </div>
      <style>{`.bulk-field{width:100%;border:1px solid rgb(209 213 219);border-radius:.5rem;padding:.55rem .7rem;background:white;color:inherit}.dark .bulk-field{background:rgb(15 23 42);border-color:rgb(51 65 85)}`}</style>
    </div>
  </div>;
}

function previewReason(row) {
  if (row.action === "create") return "Would create a new pending maintenance schedule.";
  if (row.action === "already_applied") return "This exact bulk operation already created the matching schedule; retry will reuse it.";
  if (row.action === "skip_existing_equivalent") return "An equivalent active schedule already exists; CCS will not create a duplicate.";
  if (row.reason === "retired_equipment") return "Retired equipment cannot receive new bulk maintenance schedules.";
  if (row.reason === "creation_identity_conflict") return "This retry identity is already attached to different schedule details.";
  if (row.reason === "duplicate_creation_identity") return "Multiple schedules share the same retry identity and must be reviewed first.";
  return String(row.reason || "Blocked by bulk maintenance preflight.").replaceAll("_", " ");
}

function PreviewBadge({ action }) {
  const styles = action === "create" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" : action === "blocked" ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  const label = action === "create" ? "Create" : action === "blocked" ? "Blocked" : action === "already_applied" ? "Reuse" : "Skip Duplicate";
  return <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${styles}`}>{label}</span>;
}

function Field({ label, children }) {
  return <label className="block text-sm"><span className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{label}</span>{children}</label>;
}
