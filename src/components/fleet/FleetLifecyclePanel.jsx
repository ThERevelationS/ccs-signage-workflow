import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CircleDollarSign, Gauge, Loader2, Pencil, Save, TrendingDown, X } from "lucide-react";
import { invokeFleet } from "@/components/fleet/fleetInvoke";
import { CcsDateField } from "@/components/ui/ccs-date-field";

const money = value => Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
const pretty = value => String(value || "—").replaceAll("_", " ");
const seed = profile => ({
  acquisition_cost: String(profile?.acquisition_cost ?? ""),
  acquisition_date: profile?.acquisition_date || "",
  current_value: String(profile?.current_value ?? ""),
  target_replacement_date: profile?.target_replacement_date || "",
  target_mileage_hours: String(profile?.target_mileage_hours ?? ""),
  expected_residual_value: String(profile?.expected_residual_value ?? ""),
  replacement_status: profile?.replacement_status || "monitor",
  annual_budget: String(profile?.annual_budget ?? ""),
  notes: profile?.notes || "",
});

export default function FleetLifecyclePanel({ equipment, isAdmin }) {
  const [profile, setProfile] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [flags, setFlags] = useState([]);
  const [priority, setPriority] = useState(null);
  const [form, setForm] = useState(seed(null));
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const loadSequenceRef = useRef(0);

  const load = async () => {
    const requestSequence = ++loadSequenceRef.current;
    if (!isAdmin || !equipment?.id) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const { data } = await invokeFleet("fleetLifecycleAction", { action: "get", equipment_id: equipment.id });
      if (requestSequence !== loadSequenceRef.current) return;
      if (data?.error) throw new Error(data.error);
      setProfile(data?.profile || null);
      setMetrics(data?.metrics || null);
      setFlags(data?.flags || []);
      setPriority(data?.priority || null);
      setForm(seed(data?.profile || null));
    } catch (err) {
      if (requestSequence === loadSequenceRef.current) setError(err?.message || "Unable to load lifecycle planning.");
    } finally { if (requestSequence === loadSequenceRef.current) setLoading(false); }
  };
  useEffect(() => { load(); }, [equipment?.id, isAdmin]);

  const save = async () => {
    setSaving(true); setError("");
    try {
      const { data } = await invokeFleet("fleetLifecycleAction", {
        action: "save",
        equipment_id: equipment.id,
        expected_updated_date: profile?.updated_date || "",
        profile: {
          ...form,
          acquisition_cost: Number(form.acquisition_cost || 0),
          current_value: Number(form.current_value || 0),
          target_mileage_hours: Number(form.target_mileage_hours || 0),
          expected_residual_value: Number(form.expected_residual_value || 0),
          annual_budget: Number(form.annual_budget || 0),
        },
      });
      if (data?.error) throw new Error(data.error);
      setProfile(data?.profile || null);
      setMetrics(data?.metrics || null);
      setFlags(data?.flags || []);
      setPriority(data?.priority || null);
      setForm(seed(data?.profile || null));
      setEditing(false);
    } catch (err) {
      setError(err?.message || "Unable to save lifecycle planning.");
    } finally { setSaving(false); }
  };

  if (!isAdmin) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">Lifecycle and replacement financial planning is restricted to CCS administrators.</div>;
  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400"/></div>;

  const meter = metrics?.current_meter || {};
  const statusTone = profile?.replacement_status === "replace_soon" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" : profile?.replacement_status === "plan" || profile?.replacement_status === "approved" ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900";

  return <div className="space-y-5">
    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      <Metric icon={CircleDollarSign} label="Recorded maintenance" value={money(metrics?.maintenance_cost)} sub={`${metrics?.completed_work_orders || 0} completed WOs`} />
      <Metric icon={CircleDollarSign} label="Past 12 months" value={money(metrics?.recent_maintenance_cost)} sub={`${metrics?.recent_completed_work_orders || 0} completed WOs`} />
      <Metric icon={Gauge} label="Current meter" value={meter.available ? `${number(meter.value)} ${meter.unit || ""}` : "Unavailable"} sub={meter.source === "bouncie" ? "Bouncie verified" : "Fleet manual meter"} />
      <Metric icon={CalendarClock} label="Asset age" value={metrics?.age_years != null ? `${metrics.age_years} yr` : metrics?.model_age_years != null ? `~${metrics.model_age_years} yr` : "N/A"} sub={metrics?.age_years != null ? "From acquisition date" : "Model-year approximation"} />
      <Metric icon={TrendingDown} label="Maintenance / acquisition" value={metrics?.maintenance_to_acquisition_ratio != null ? `${(metrics.maintenance_to_acquisition_ratio * 100).toFixed(1)}%` : "N/A"} sub={profile?.acquisition_cost ? `${money(profile.acquisition_cost)} acquisition cost` : "Add acquisition cost"} />
      <Metric icon={CalendarClock} label="Service-cycle proxy" value={metrics?.average_service_cycle_days != null ? `${metrics.average_service_cycle_days} days` : "N/A"} sub={metrics?.longest_service_cycle_days != null ? `Longest ${metrics.longest_service_cycle_days} days · not true downtime` : "Requires WO start/completion dates"} />
    </div>

    <section className={`rounded-xl border p-4 ${statusTone}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Replacement planning status</div><div className="flex flex-wrap items-center gap-2 mt-1"><div className="text-xl font-bold text-gray-900 dark:text-slate-100 capitalize">{pretty(profile?.replacement_status || "monitor")}</div>{priority && <span className={`text-xs rounded-full px-2 py-1 font-bold ${priority.label === "High" ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" : priority.label === "Medium" || priority.label === "Watch" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>Planning priority {priority.score} · {priority.label}</span>}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Strategic status is admin-managed. Planning priority is a Fleet heuristic built from configured targets, maintenance burden, and current asset state; it is not an automatic replacement decision.</div></div>{!editing && <button type="button" onClick={() => setEditing(true)} className="min-h-11 px-3 rounded-lg border border-indigo-300 text-indigo-700 dark:text-indigo-300 text-sm font-semibold inline-flex items-center justify-center gap-2"><Pencil className="w-4 h-4"/>Edit Lifecycle Plan</button>}</div>
      {flags.length > 0 && <div className="mt-4 space-y-2">{flags.map(flag => <div key={flag.code} className={`rounded-lg border px-3 py-2 text-xs flex gap-2 ${flag.severity === "high" ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300" : flag.severity === "medium" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300" : "border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}><AlertTriangle className="w-4 h-4 shrink-0"/><span>{flag.label}</span></div>)}</div>}
    </section>

    {!editing ? <div className="grid xl:grid-cols-2 gap-5">
      <Panel title="Financial Snapshot"><div className="grid grid-cols-2 gap-4"><Info label="Acquisition cost" value={profile?.acquisition_cost ? money(profile.acquisition_cost) : "—"}/><Info label="Current estimated value" value={profile?.current_value ? money(profile.current_value) : "—"}/><Info label="Expected residual" value={profile?.expected_residual_value ? money(profile.expected_residual_value) : "—"}/><Info label="Annual replacement budget" value={profile?.annual_budget ? money(profile.annual_budget) : "—"}/><Info label="Value retained" value={metrics?.value_retained_ratio != null ? `${(metrics.value_retained_ratio * 100).toFixed(1)}%` : "—"}/><Info label="Maintenance per meter unit" value={metrics?.cost_per_meter != null ? money(metrics.cost_per_meter) : "—"}/></div></Panel>
      <Panel title="Replacement Targets"><div className="grid grid-cols-2 gap-4"><Info label="Target date" value={profile?.target_replacement_date || "—"}/><Info label="Days to target" value={metrics?.target_replacement_days == null ? "—" : metrics.target_replacement_days < 0 ? `${Math.abs(metrics.target_replacement_days)} overdue` : number(metrics.target_replacement_days)}/><Info label="Target mileage / hours" value={profile?.target_mileage_hours ? number(profile.target_mileage_hours) : "—"}/><Info label="Meter progress" value={metrics?.target_meter_progress_percent != null ? `${metrics.target_meter_progress_percent.toFixed(1)}%` : "—"}/><Info label="Acquisition date" value={profile?.acquisition_date || equipment.purchase_date || "—"}/><Info label="Last updated by" value={profile?.updated_by_email || "—"}/></div>{profile?.notes && <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400">Planning notes</div><div className="text-sm text-gray-700 dark:text-slate-300 mt-1 whitespace-pre-wrap">{profile.notes}</div></div>}</Panel>
    </div> : <section className="rounded-xl border border-indigo-200 bg-white dark:bg-slate-900 dark:border-indigo-900 p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-gray-900 dark:text-slate-100">Edit Lifecycle Plan</h3><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Planning values do not modify equipment identity, maintenance history, or Bouncie data.</p></div><button type="button" onClick={() => { setForm(seed(profile)); setEditing(false); }} disabled={saving} className="min-h-11 min-w-11 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Cancel lifecycle editing"><X className="w-5 h-5 mx-auto"/></button></div><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4"><Field label="Acquisition cost"><input type="number" min="0" step="0.01" value={form.acquisition_cost} onChange={e => setForm(v => ({...v, acquisition_cost:e.target.value}))} className="field"/></Field><Field label="Acquisition date"><CcsDateField value={form.acquisition_date} onChange={e => setForm(v => ({...v, acquisition_date:e.target.value}))} className="field"/></Field><Field label="Current estimated value"><input type="number" min="0" step="0.01" value={form.current_value} onChange={e => setForm(v => ({...v, current_value:e.target.value}))} className="field"/></Field><Field label="Target replacement date"><CcsDateField value={form.target_replacement_date} onChange={e => setForm(v => ({...v, target_replacement_date:e.target.value}))} className="field"/></Field><Field label="Target mileage / hours"><input type="number" min="0" step="1" value={form.target_mileage_hours} onChange={e => setForm(v => ({...v, target_mileage_hours:e.target.value}))} className="field"/></Field><Field label="Expected residual value"><input type="number" min="0" step="0.01" value={form.expected_residual_value} onChange={e => setForm(v => ({...v, expected_residual_value:e.target.value}))} className="field"/></Field><Field label="Annual replacement budget"><input type="number" min="0" step="0.01" value={form.annual_budget} onChange={e => setForm(v => ({...v, annual_budget:e.target.value}))} className="field"/></Field><Field label="Replacement status"><select value={form.replacement_status} onChange={e => setForm(v => ({...v, replacement_status:e.target.value}))} className="field"><option value="monitor">Monitor</option><option value="plan">Plan</option><option value="replace_soon">Replace Soon</option><option value="approved">Approved</option><option value="replaced">Replaced</option></select></Field></div><Field label="Planning notes"><textarea rows={4} value={form.notes} onChange={e => setForm(v => ({...v, notes:e.target.value}))} className="field mt-4"/></Field><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => { setForm(seed(profile)); setEditing(false); }} disabled={saving} className="min-h-11 px-4 rounded-lg border border-gray-300 dark:border-slate-700 font-semibold">Cancel</button><button type="button" onClick={save} disabled={saving} className="min-h-11 px-4 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}Save Lifecycle Plan</button></div><style>{`.field{width:100%;min-height:44px;border:1px solid rgb(209 213 219);border-radius:.5rem;background:transparent;padding:.625rem .75rem;font-size:.875rem}.dark .field{border-color:rgb(51 65 85)}`}</style></section>}
  </div>;
}

function Panel({title,children}){return <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm"><div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800"><h3 className="font-semibold text-gray-900 dark:text-slate-100">{title}</h3></div><div className="p-4">{children}</div></section>}
function Metric({icon:Icon,label,value,sub}){return <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-4"><div className="flex items-start justify-between gap-2"><div className="text-xs text-gray-500 dark:text-slate-400">{label}</div><Icon className="w-4 h-4 text-gray-400"/></div><div className="text-xl font-bold text-gray-900 dark:text-slate-100 mt-1">{value}</div><div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">{sub}</div></div>}
function Info({label,value}){return <div><div className="text-xs text-gray-400">{label}</div><div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1 break-words">{value}</div></div>}
function Field({label,children}){return <label className="block"><span className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">{label}</span>{children}</label>}
