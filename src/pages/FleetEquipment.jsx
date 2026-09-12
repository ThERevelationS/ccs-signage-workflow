import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetEquipmentDialog from "@/components/fleet/FleetEquipmentDialog";
import FleetConfirmDialog from "@/components/fleet/FleetConfirmDialog";
import { listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CalendarClock,
  CircleOff,
  ClipboardList,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
  Truck,
  Wrench,
} from "lucide-react";

const normalizeVin = value => String(value || "").trim().toUpperCase();
const normalizeImei = value => String(value || "").trim();
const todayText = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function runtimeTrackingConflict(equipment, bouncieVehicles) {
  const vin = normalizeVin(equipment?.vin);
  const imei = normalizeImei(equipment?.bouncie_imei);
  if (!vin || !imei || !["matched", "manual"].includes(equipment?.bouncie_link_status) || !bouncieVehicles.length) return null;
  if (bouncieVehicles.some(vehicle => normalizeVin(vehicle?.vin) === vin && normalizeImei(vehicle?.imei) === imei)) return null;
  const currentByImei = bouncieVehicles.find(vehicle => normalizeImei(vehicle?.imei) === imei);
  if (!currentByImei) return null;
  const currentVin = normalizeVin(currentByImei?.vin);
  return currentVin && currentVin !== vin ? { currentVin, imei } : null;
}

function trustedCurrentVehicle(equipment, bouncieVehicles) {
  if (!["matched", "manual"].includes(equipment?.bouncie_link_status)) return null;
  const vin = normalizeVin(equipment?.vin);
  const imei = normalizeImei(equipment?.bouncie_imei);
  if (!vin || !imei) return null;
  return bouncieVehicles.find(vehicle => normalizeVin(vehicle?.vin) === vin && normalizeImei(vehicle?.imei) === imei) || null;
}

function taskIsOverdue(task, today = todayText()) {
  return task?.status === "overdue" || (task?.status === "pending" && !!task?.start_date && task.start_date < today);
}

function lastSeenText(vehicle) {
  const stats = vehicle?.stats || {};
  const raw = stats.lastUpdated || stats.lastUpdate || stats.timestamp || stats.location?.timestamp || vehicle?.updatedAt || vehicle?.updated_at;
  if (!raw) return "Current Bouncie state";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "Current Bouncie state" : date.toLocaleString();
}

export default function FleetEquipment() {
  const [equipment, setEquipment] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [bouncieVehicles, setBouncieVehicles] = useState([]);
  const [query, setQuery] = useState("");
  const [viewFilter, setViewFilter] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("view") || "active";
    return ["active", "all", "operational", "maintenance", "down", "retired", "tracking_issues"].includes(requested) ? requested : "active";
  });
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reactivateTarget, setReactivateTarget] = useState(null);
  const [reactivating, setReactivating] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [equipmentRows, workOrderRows, taskRows, user, bouncieResult] = await Promise.all([
        listAllFleetRows(base44.entities.FleetEquipment, "name", { label: "Fleet equipment" }),
        listAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, "-created_date", { label: "Fleet work-order history" }),
        listAllFleetRows(base44.entities.FleetMaintenanceTask, "start_date", { label: "Fleet maintenance schedules" }),
        base44.auth.me().catch(() => null),
        base44.functions.invoke("bouncieApi", { method: "GET", path: "/v1/vehicles", query: {} }).catch(() => null),
      ]);
      setEquipment(equipmentRows || []);
      setWorkOrders(workOrderRows || []);
      setTasks(taskRows || []);
      setCurrentUser(user || null);
      setBouncieVehicles(bouncieResult?.data?.data || []);
    } catch (e) {
      setError(e?.message || "Failed to load Fleet equipment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreateDialog = useCallback(() => setDialog({ equipment: null, createKey: crypto.randomUUID() }), []);
  const isAdmin = currentUser?.role === "admin";
  const runtimeConflicts = useMemo(() => new Map(equipment.map(eq => [eq.id, runtimeTrackingConflict(eq, bouncieVehicles)])), [equipment, bouncieVehicles]);
  const metrics = useMemo(() => ({
    operational: equipment.filter(item => item.status === "operational").length,
    maintenance: equipment.filter(item => item.status === "maintenance").length,
    down: equipment.filter(item => item.status === "down").length,
    trackingIssues: equipment.filter(item => item.status !== "retired" && (item.bouncie_link_status === "ambiguous" || runtimeConflicts.get(item.id))).length,
    retired: equipment.filter(item => item.status === "retired").length,
  }), [equipment, runtimeConflicts]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return equipment.filter(item => {
      if (viewFilter === "active" && item.status === "retired") return false;
      if (viewFilter === "tracking_issues" && (item.status === "retired" || (item.bouncie_link_status !== "ambiguous" && !runtimeConflicts.get(item.id)))) return false;
      if (!["active", "all", "tracking_issues"].includes(viewFilter) && item.status !== viewFilter) return false;
      if (!q) return true;
      return [item.name, item.make, item.model, item.serial_number, item.vin, item.license_plate, item.type, item.location].some(value => String(value || "").toLowerCase().includes(q));
    });
  }, [equipment, query, viewFilter, runtimeConflicts]);

  const reactivateEquipment = async () => {
    if (!reactivateTarget) return;
    setReactivating(true);
    setError("");
    try {
      const { data } = await base44.functions.invoke("fleetEquipmentAction", {
        action: "update",
        id: reactivateTarget.id,
        expected_updated_date: reactivateTarget.updated_date || "",
        equipment: { status: "operational" },
      });
      if (data?.error) throw new Error(data.error);
      setReactivateTarget(null);
      await loadData();
    } catch (e) {
      setError(e?.message || "Unable to reactivate Fleet equipment.");
    } finally {
      setReactivating(false);
    }
  };

  const saveEquipment = async ({ equipment: payload, tracking_applicable }) => {
    setSaving(true);
    setError("");
    try {
      const body = dialog?.equipment
        ? { action: "update", id: dialog.equipment.id, expected_updated_date: dialog.equipment.updated_date || "", equipment: payload, tracking_applicable }
        : { action: "create", creation_key: dialog?.createKey || "", equipment: payload, tracking_applicable };
      const { data } = await base44.functions.invoke("fleetEquipmentAction", body);
      if (data?.error) throw new Error(data.error);
      setDialog(null);
      await loadData();
    } catch (e) {
      setError(e?.message || "Failed to save Fleet equipment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Equipment</h1><p className="text-sm text-gray-500 dark:text-slate-400">Fleet maintenance identity, current tracking status, maintenance readiness, and quick actions in one place.</p></div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto"><div className="relative w-full sm:w-72"><Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search equipment..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div><select value={viewFilter} onChange={event => setViewFilter(event.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="active">Active equipment</option><option value="all">All incl. retired</option><option value="operational">Operational</option><option value="maintenance">Maintenance</option><option value="down">Down</option><option value="retired">Retired archive</option><option value="tracking_issues">Bouncie link conflicts</option></select>{isAdmin && <button onClick={openCreateDialog} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center justify-center gap-2"><Plus className="w-4 h-4" />New Equipment</button>}</div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><EquipmentMetric icon={Truck} label="Operational" value={metrics.operational}/><EquipmentMetric icon={Wrench} label="Maintenance" value={metrics.maintenance} attention={metrics.maintenance > 0}/><EquipmentMetric icon={CircleOff} label="Down" value={metrics.down} danger={metrics.down > 0}/><EquipmentMetric icon={Link2} label="Bouncie link conflicts" value={metrics.trackingIssues} attention={metrics.trackingIssues > 0}/><button type="button" onClick={() => setViewFilter("retired")} className="text-left"><EquipmentMetric icon={Archive} label="Retired archive" value={metrics.retired}/></button></div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}

        {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(eq => {
              const activeOrders = workOrders.filter(order => order.equipment_id === eq.id && !["completed", "cancelled"].includes(order.status));
              const eqTasks = tasks.filter(task => task.equipment_id === eq.id);
              const activeTasks = eqTasks.filter(task => task.status !== "completed");
              const today = todayText();
              const horizon = new Date(`${today}T12:00:00`); horizon.setDate(horizon.getDate() + 14);
              const overdue = activeTasks.filter(task => taskIsOverdue(task, today));
              const dueSoon = activeTasks.filter(task => {
                if (!task.start_date || taskIsOverdue(task, today)) return false;
                const due = new Date(`${task.start_date}T12:00:00`);
                return due <= horizon;
              });
              const nextMaintenance = activeTasks.filter(task => task.start_date).slice().sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0] || null;
              const identityConflict = runtimeConflicts.get(eq.id);
              const trackedVehicle = !identityConflict ? trustedCurrentVehicle(eq, bouncieVehicles) : null;
              const stats = trackedVehicle?.stats || {};
              const rawSpeed = typeof stats.speed === "number" ? stats.speed : stats.location?.speed;
              const speed = Number.isFinite(Number(rawSpeed)) ? Math.max(0, Math.round(Number(rawSpeed))) : null;
              const driving = !!stats.isRunning || (speed != null && speed > 0);
              const compliance = overdue.length ? { label: `${overdue.length} overdue`, tone: "danger" } : dueSoon.length ? { label: `${dueSoon.length} due soon`, tone: "attention" } : activeTasks.length ? { label: "On track", tone: "good" } : { label: "No schedule", tone: "neutral" };
              return <EquipmentCard key={eq.id} eq={eq} activeOrders={activeOrders} activeTasks={activeTasks} nextMaintenance={nextMaintenance} overdue={overdue} identityConflict={identityConflict} trackedVehicle={trackedVehicle} driving={driving} speed={speed} compliance={compliance} isAdmin={isAdmin} onEdit={() => setDialog({ equipment: eq })} onReactivate={() => setReactivateTarget(eq)} />;
            })}
            {filtered.length === 0 && <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 py-12 text-center text-gray-500">No Fleet equipment found.</div>}
          </div>
        )}
      </div>

      <FleetEquipmentDialog open={!!dialog} equipment={dialog?.equipment || null} onClose={() => !saving && setDialog(null)} onSave={saveEquipment} saving={saving} />
      <FleetConfirmDialog open={!!reactivateTarget} title={`Reactivate ${reactivateTarget?.name || "Fleet equipment"}?`} description="This keeps all existing Fleet history, documents, schedules, logs, and Bouncie linkage metadata intact and returns the asset to operational status. No records are deleted or recreated." confirmLabel="Reactivate Equipment" tone="success" busy={reactivating} onCancel={() => !reactivating && setReactivateTarget(null)} onConfirm={reactivateEquipment} />
    </div>
  );
}

function EquipmentCard({ eq, activeOrders, activeTasks, nextMaintenance, overdue, identityConflict, trackedVehicle, driving, speed, compliance, isAdmin, onEdit }) {
  const detailUrl = `${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(eq.id)}`;
  const maintenanceUrl = `${createPageUrl("FleetMaintenance")}?equipment=${encodeURIComponent(eq.id)}`;
  const newWorkOrderUrl = `${createPageUrl("FleetWorkOrders")}?new=1&equipment=${encodeURIComponent(eq.id)}`;
  const requestUrl = `${createPageUrl("FleetRequests")}?new=1&equipment=${encodeURIComponent(eq.id)}`;
  const reportUrl = `/FleetReport?equipment=${encodeURIComponent(eq.id)}`;
  const location = trackedVehicle?.stats?.location?.address || eq.location || "—";
  const trackingLabel = identityConflict || eq.bouncie_link_status === "ambiguous" ? "Identity conflict" : trackedVehicle ? (driving ? (speed != null ? `Driving · ${speed} mph` : "Driving") : "Parked") : eq.bouncie_link_status === "not_applicable" ? "Not applicable" : ["matched", "manual"].includes(eq.bouncie_link_status) ? "No current state" : "Unlinked";

  return <article className={`rounded-xl border bg-white dark:bg-slate-900 shadow-sm overflow-hidden ${identityConflict || eq.bouncie_link_status === "ambiguous" ? "border-amber-300 dark:border-amber-900" : overdue.length ? "border-red-200 dark:border-red-900" : "border-gray-200 dark:border-slate-800"}`}>
    <Link to={detailUrl} className="block h-36 bg-gray-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">{eq.photo_url ? <img src={eq.photo_url} alt={eq.name} className="w-full h-full object-cover" /> : <Truck className="w-12 h-12 text-gray-300" />}</Link>
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link to={detailUrl} className="font-semibold text-gray-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-300 line-clamp-1">{eq.name}</Link><p className="text-xs text-gray-500 dark:text-slate-400 mt-1 truncate">{[eq.year, eq.make, eq.model].filter(Boolean).join(" ") || eq.type}</p></div><StatusBadge status={eq.status} /></div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Open WOs" value={activeOrders.length} danger={activeOrders.some(order => ["critical", "high"].includes(order.priority))} />
        <MiniStat label="Schedules" value={activeTasks.length} />
        <MiniStat label="Compliance" value={compliance.label} tone={compliance.tone} small />
      </div>

      <div className="rounded-lg bg-gray-50 dark:bg-slate-800/60 p-3">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">Next maintenance</div>
        {nextMaintenance ? <><div className={`text-sm font-semibold mt-1 ${taskIsOverdue(nextMaintenance) ? "text-red-700 dark:text-red-300" : "text-gray-900 dark:text-slate-100"}`}>{nextMaintenance.title}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Due {nextMaintenance.start_date || "—"} · {pretty(nextMaintenance.status)}</div></> : <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">No active maintenance schedule.</div>}
      </div>

      <div className="space-y-1.5 text-xs">
        <div className={`flex items-center gap-2 ${identityConflict || eq.bouncie_link_status === "ambiguous" ? "text-amber-700 dark:text-amber-300 font-semibold" : trackedVehicle ? "text-emerald-700 dark:text-emerald-300" : "text-gray-500 dark:text-slate-400"}`}><Link2 className="w-3.5 h-3.5 shrink-0" /><span>Bouncie: {trackingLabel}</span></div>
        <div className="flex items-start gap-2 text-gray-500 dark:text-slate-400"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="line-clamp-1">{location}</span></div>
        {trackedVehicle && <div className="text-[11px] text-gray-400 pl-5">Last seen: {lastSeenText(trackedVehicle)}</div>}
      </div>

      {identityConflict && <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Stored Fleet VIN {normalizeVin(eq.vin)} uses IMEI {identityConflict.imei}, but Bouncie currently reports VIN {identityConflict.currentVin}. Tracking remains fail-closed until reviewed.</div>}

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
        <Link to={detailUrl} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 text-white px-2 py-2 text-xs font-semibold"><ArrowRight className="w-3.5 h-3.5" />Open</Link>
        <Link to={newWorkOrderUrl} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-2 py-2 text-xs font-semibold text-gray-700 dark:text-slate-200"><ClipboardList className="w-3.5 h-3.5" />New WO</Link>
        <Link to={maintenanceUrl} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-2 py-2 text-xs font-semibold text-gray-700 dark:text-slate-200"><CalendarClock className="w-3.5 h-3.5" />Schedule</Link>
        <Link to={requestUrl} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-2 py-2 text-xs font-semibold text-gray-700 dark:text-slate-200"><ShoppingCart className="w-3.5 h-3.5" />Request Item</Link>
        <a href={reportUrl} className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 px-2 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300"><AlertTriangle className="w-3.5 h-3.5" />Report Problem</a>
      </div>
      {isAdmin && <button onClick={onEdit} className="w-full text-xs text-gray-500 dark:text-slate-400 inline-flex items-center justify-center gap-1 py-1"><Pencil className="w-3.5 h-3.5" />Edit equipment</button>}
    </div>
  </article>;
}

function StatusBadge({ status }) {
  const style = status === "operational" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : status === "down" ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300" : status === "retired" ? "bg-gray-200 text-gray-700 dark:bg-slate-800 dark:text-slate-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  return <span className={`text-[11px] px-2 py-1 rounded-full capitalize shrink-0 ${style}`}>{status}</span>;
}

function MiniStat({ label, value, danger = false, tone = "neutral", small = false }) {
  const valueStyle = danger || tone === "danger" ? "text-red-700 dark:text-red-300" : tone === "attention" ? "text-amber-700 dark:text-amber-300" : tone === "good" ? "text-emerald-700 dark:text-emerald-300" : "text-gray-900 dark:text-slate-100";
  return <div className="rounded-lg bg-gray-50 dark:bg-slate-800/60 px-2 py-2 text-center"><div className={`${small ? "text-xs leading-tight min-h-[2rem] flex items-center justify-center" : "text-lg"} font-bold ${valueStyle}`}>{value}</div><div className="text-[10px] text-gray-400 mt-0.5">{label}</div></div>;
}

function EquipmentMetric({ icon: Icon, label, value, attention = false, danger = false }) {
  const style = danger ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" : attention ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900";
  const valueStyle = danger ? "text-red-700 dark:text-red-300" : attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100";
  return <div className={`rounded-xl border p-3 ${style}`}><div className="flex items-center justify-between gap-2"><div className="text-xs text-gray-400">{label}</div><Icon className="w-4 h-4 text-gray-400" /></div><div className={`text-2xl font-bold mt-1 ${valueStyle}`}>{value}</div></div>;
}

function pretty(value) { return String(value || "—").replaceAll("_", " "); }
