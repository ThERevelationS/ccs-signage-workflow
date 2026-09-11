import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { filterAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { buildWeeklyRanges, formatDateTimeShort, formatMiles } from "@/components/fleet/fleetHelpers";
import { ArrowLeft, Truck, Navigation, ClipboardList, CalendarClock, History, Bell, Loader2, Pencil, Save, X, MapPin, Gauge, Activity, Plus } from "lucide-react";

const ACTIVE = new Set(["open", "assigned", "in_progress"]);
const TRACKED_LINK = new Set(["matched", "manual"]);
const pretty = value => String(value || "—").replaceAll("_", " ");
const hasDefinitiveTripEnd = row => {
  if (!row?.ended_at || String(row?.transaction_id || "").trim()) return false;
  const endedAt = Date.parse(row.ended_at) || 0;
  const startedAt = Date.parse(row.started_at || "") || 0;
  const lastEventAt = Date.parse(row.last_event_at || "") || 0;
  return endedAt > 0 && (!startedAt || endedAt >= startedAt) && (!lastEventAt || endedAt >= lastEventAt);
};

export default function FleetEquipmentDetail() {
  const id = new URLSearchParams(window.location.search).get("id") || "";
  const [equipment, setEquipment] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [liveStates, setLiveStates] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({});
  const [savingMeta, setSavingMeta] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [equipmentRows, user] = await Promise.all([
        base44.entities.FleetEquipment.filter({ id }, "name", 1),
        base44.auth.me().catch(() => null),
      ]);
      const eq = (equipmentRows || [])[0] || null;
      setEquipment(eq);
      setCurrentUser(user || null);
      setTrips([]);
      if (!eq) {
        setWorkOrders([]); setTasks([]); setLogs([]); setLiveStates([]); setNotifications([]); setMetadata(null); setMetaForm({});
        return;
      }

      const vin = String(eq.vin || "").trim().toUpperCase();
      const [woRows, taskRows, logRows, liveRows, notifRows, metaRows] = await Promise.all([
        filterAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, { equipment_id: id }, "-created_date", { label: `${eq.name} Fleet work-order history` }),
        filterAllFleetRows(base44.entities.FleetMaintenanceTask, { equipment_id: id }, "start_date", { label: `${eq.name} maintenance schedules` }),
        filterAllFleetRows(base44.entities.FleetEquipmentLog, { equipment_id: id }, "-created_date", { label: `${eq.name} equipment usage history` }),
        vin ? base44.entities.BouncieVehicleLiveState.filter({ vehicle_vin: vin }, "-last_seen_at", 20) : Promise.resolve([]),
        vin ? base44.entities.BouncieNotification.filter({ vehicle_vin: vin }, "-timestamp", 100) : Promise.resolve([]),
        vin ? base44.entities.FleetVehicleMetadata.filter({ vehicle_vin: vin }, "-updated_date", 10) : Promise.resolve([]),
      ]);
      setWorkOrders(woRows || []);
      setTasks(taskRows || []);
      setLogs(logRows || []);
      setLiveStates(liveRows || []);
      setNotifications(notifRows || []);
      const meta = (metaRows || [])[0] || null;
      setMetadata(meta);
      setMetaForm(metadataSeed(meta, eq));
      if (eq.bouncie_imei && TRACKED_LINK.has(eq.bouncie_link_status)) loadTrips(eq.bouncie_imei);
    } catch (e) {
      setError(e?.message || "Unable to load Fleet equipment detail.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const loadTrips = async (imei) => {
    setTripsLoading(true);
    try {
      const ranges = buildWeeklyRanges(7);
      const results = await Promise.all(ranges.map(range => base44.functions.invoke("bouncieApi", { method: "GET", path: "/v1/trips", query: { imei, ...range, "gps-format": "geojson" } })));
      const all = results.flatMap(result => result?.data?.data || []).sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      setTrips(all);
    } catch {
      setTrips([]);
    } finally {
      setTripsLoading(false);
    }
  };

  const live = useMemo(() => liveStates.slice().sort((a, b) => new Date(b.last_seen_at || b.updated_date || 0) - new Date(a.last_seen_at || a.updated_date || 0))[0] || null, [liveStates]);
  const activeOrders = useMemo(() => workOrders.filter(row => ACTIVE.has(row.status)), [workOrders]);
  const completedOrders = useMemo(() => workOrders.filter(row => row.status === "completed"), [workOrders]);
  const isAdmin = currentUser?.role === "admin";
  const liveDriving = !!live?.is_trip_active && !hasDefinitiveTripEnd(live);

  const saveMetadata = async () => {
    setSavingMeta(true);
    setError("");
    try {
      const { data } = await base44.functions.invoke("fleetEquipmentAction", { action: "save_metadata", equipment_id: id, metadata_id: metadata?.id || "", expected_metadata_updated_date: metadata?.updated_date || "", metadata: metaForm });
      if (data?.error) throw new Error(data.error);
      setMetadata(data?.metadata || null);
      setMetaForm(metadataSeed(data?.metadata || null, equipment));
      setEditingMeta(false);
    } catch (e) {
      setError(e?.message || "Unable to save vehicle metadata.");
    } finally {
      setSavingMeta(false);
    }
  };

  if (loading) return <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950"><FleetModuleNav /><div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div></div>;

  if (!equipment) return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav /><div className="max-w-4xl mx-auto p-6"><Link to={createPageUrl("FleetEquipment")} className="inline-flex items-center gap-1 text-indigo-600"><ArrowLeft className="w-4 h-4" />Back to Equipment</Link><div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">Fleet equipment record not found.</div></div></div>;

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-start lg:justify-between">
          <div className="flex gap-4">
            <div className="w-24 h-24 rounded-xl bg-gray-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">{equipment.photo_url ? <img src={equipment.photo_url} alt={equipment.name} className="w-full h-full object-cover" /> : <Truck className="w-10 h-10 text-gray-300" />}</div>
            <div><Link to={createPageUrl("FleetEquipment")} className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-300"><ArrowLeft className="w-3.5 h-3.5" />Equipment</Link><h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100 mt-1">{equipment.name}</h1><p className="text-sm text-gray-500 dark:text-slate-400">{[equipment.year, equipment.make, equipment.model].filter(Boolean).join(" ") || pretty(equipment.type)}</p><div className="flex flex-wrap gap-2 mt-2"><Tag>{pretty(equipment.status)}</Tag><Tag>Bouncie: {pretty(equipment.bouncie_link_status)}</Tag>{equipment.vin && <Tag>VIN {equipment.vin}</Tag>}</div></div>
          </div>
          <div className="flex flex-wrap gap-2">{equipment.vin && TRACKED_LINK.has(equipment.bouncie_link_status) ? <Link to={`${createPageUrl("FleetTracking")}?vin=${encodeURIComponent(equipment.vin)}${equipment.bouncie_imei ? `&imei=${encodeURIComponent(equipment.bouncie_imei)}` : ""}`} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center gap-2 text-sm"><Navigation className="w-4 h-4" />Open Live Tracking</Link> : <Link to={createPageUrl("FleetTracking")} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center gap-2 text-sm"><Navigation className="w-4 h-4" />Tracking</Link>}<Link to={`${createPageUrl("FleetWorkOrders")}?equipment=${encodeURIComponent(equipment.id)}`} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center gap-2 text-sm"><ClipboardList className="w-4 h-4" />Work Orders</Link><Link to={`${createPageUrl("FleetWorkOrders")}?new=1&equipment=${encodeURIComponent(equipment.id)}`} className="px-3 py-2 rounded-lg bg-indigo-600 text-white inline-flex items-center gap-2 text-sm font-medium"><Plus className="w-4 h-4" />New Work Order</Link></div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Open work orders" value={activeOrders.length} />
          <Metric label="Maintenance schedules" value={tasks.length} />
          <Metric label="Usage logs" value={logs.length} />
          <Metric label="Trips · last 7 days" value={tripsLoading ? "…" : trips.length} />
        </div>

        <Card title="Asset Profile" icon={Truck}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ProfileField label="Asset type" value={pretty(equipment.type)} />
            <ProfileField label="Location" value={equipment.location || "—"} />
            <ProfileField label="Serial / original ID" value={equipment.serial_number || "—"} />
            <ProfileField label="Mileage / Hours" value={equipment.mileage_hours != null ? Number(equipment.mileage_hours).toLocaleString() : "—"} />
            <ProfileField label="Purchase date" value={equipment.purchase_date || "—"} />
            <ProfileField label="Last service" value={equipment.last_service_date || "—"} />
            <ProfileField label="Next service due" value={equipment.next_service_due || "—"} />
            <ProfileField label="License plate" value={metadata?.license_plate || equipment.license_plate || "—"} />
          </div>
          {equipment.engine_details && <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-1">Engine / Powertrain</div><div className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{equipment.engine_details}</div></div>}
          {equipment.notes && <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-1">Equipment Notes</div><div className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{equipment.notes}</div></div>}
        </Card>

        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">
            <Card title="Maintenance" icon={ClipboardList}>
              <div className="space-y-2">{activeOrders.map(order => <Link key={order.id} to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(order.id)}&equipment=${encodeURIComponent(equipment.id)}`} className="block rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:border-indigo-300 dark:hover:border-indigo-700"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium text-gray-900 dark:text-slate-100">{order.work_order_number} · {order.title}</div><Tag>{pretty(order.status)}</Tag></div><div className="text-xs text-gray-500 mt-1">{pretty(order.priority)} priority · {order.assigned_to || "Unassigned"}</div></Link>)}{activeOrders.length === 0 && <Empty>No active maintenance work orders.</Empty>}</div>
              {completedOrders.length > 0 && <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-2">Recent completed</div>{completedOrders.slice(0,5).map(order => <div key={order.id} className="py-2 flex justify-between gap-3 text-sm"><span className="text-gray-800 dark:text-slate-200">{order.work_order_number} · {order.title}</span><span className="text-gray-400 whitespace-nowrap">{order.completed_date || "—"}</span></div>)}</div>}
            </Card>

            <Card title="Scheduled Maintenance" icon={CalendarClock}>
              <div className="grid md:grid-cols-2 gap-3">{tasks.map(task => <div key={task.id} className="rounded-lg border border-gray-200 dark:border-slate-700 p-3"><div className="font-medium text-gray-900 dark:text-slate-100">{task.title}</div><div className="text-xs text-gray-500 mt-1">{task.type === "one_off" ? "One-time" : pretty(task.frequency)} · due {task.start_date || "—"} · {pretty(task.status)}</div></div>)}{tasks.length === 0 && <Empty>No maintenance schedules.</Empty>}</div>
            </Card>

            <Card title="Recent Equipment History" icon={History}>
              <div className="space-y-2">{logs.slice(0,10).map(log => <div key={log.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-slate-800 last:border-0"><div className="min-w-0"><div className="text-sm text-gray-800 dark:text-slate-200">{log.item_name} · {log.quantity_used} {log.unit || ""}</div><div className="text-xs text-gray-400">{pretty(log.item_type)}{log.recorded_by ? ` · ${log.recorded_by}` : ""}</div>{log.notes && <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{log.notes}</div>}{log.work_order_id && <Link to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(log.work_order_id)}&equipment=${encodeURIComponent(equipment.id)}`} className="inline-flex mt-1 text-xs text-indigo-600 dark:text-indigo-300 hover:underline">Open linked work order</Link>}</div><span className="text-xs text-gray-400 whitespace-nowrap">{log.created_date ? new Date(log.created_date).toLocaleDateString() : "—"}</span></div>)}{logs.length === 0 && <Empty>No parts/fluid usage history.</Empty>}</div>
              {logs.length > 10 && <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 text-xs text-gray-500 dark:text-slate-400">Showing the 10 most recent of {logs.length} usage records. Full history remains preserved and is included in this equipment record.</div>}
            </Card>
          </div>

          <div className="space-y-5">
            <Card title="Tracking State" icon={Navigation}>
              {TRACKED_LINK.has(equipment.bouncie_link_status) && live ? <div className="space-y-3"><Info label="Trip state" value={liveDriving ? "Driving" : "Parked"} icon={Activity} /><Info label="Speed" value={live.speed != null ? `${Math.round(live.speed)} mph` : "—"} icon={Gauge} /><Info label="Odometer" value={live.odometer != null ? `${Number(live.odometer).toLocaleString()} mi` : "—"} icon={Gauge} /><Info label="Last seen" value={live.last_seen_at ? formatDateTimeShort(live.last_seen_at) : "—"} icon={MapPin} />{live.latitude != null && live.longitude != null && <Info label="Coordinates" value={`${Number(live.latitude).toFixed(5)}, ${Number(live.longitude).toFixed(5)}`} icon={MapPin} />}{liveStates.length > 1 && <div className="text-xs text-amber-700 dark:text-amber-300 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2">{liveStates.length} Bouncie live-state rows exist for this VIN; this page uses the newest row only.</div>}</div> : <Empty>{equipment.bouncie_link_status === "not_applicable" ? "Bouncie tracking is not applicable to this asset." : "No proven Bouncie live state is linked."}</Empty>}
            </Card>

            <Card title="Recent Trips · 7 Days" icon={Navigation}>
              {tripsLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div> : <div className="space-y-2">{trips.slice(0,8).map(trip => <div key={trip.transactionId} className="py-2 border-b border-gray-100 dark:border-slate-800 last:border-0"><div className="text-sm text-gray-800 dark:text-slate-200">{trip.startTime ? new Date(trip.startTime).toLocaleString() : "Trip"}</div><div className="text-xs text-gray-400">{formatMiles(trip.distance || 0)} · avg {Math.round(trip.averageSpeed || 0)} mph</div></div>)}{trips.length === 0 && <Empty>No recent Bouncie trips.</Empty>}</div>}
            </Card>

            <Card title="Bouncie Notifications" icon={Bell}>
              <div className="space-y-2">{notifications.slice(0,8).map(note => <div key={note.id} className="py-2 border-b border-gray-100 dark:border-slate-800 last:border-0"><div className="text-sm text-gray-800 dark:text-slate-200">{note.title || pretty(note.event_type)}</div>{note.description && <div className="text-xs text-gray-500 mt-0.5">{note.description}</div>}<div className="text-xs text-gray-400 mt-1">{note.timestamp ? formatDateTimeShort(note.timestamp) : "—"}</div></div>)}{notifications.length === 0 && <Empty>No Bouncie notifications for this VIN.</Empty>}</div>
            </Card>
          </div>
        </div>

        <Card title="CCS Vehicle Metadata" icon={Truck} action={isAdmin ? (editingMeta ? null : <button onClick={() => { setMetaForm(metadataSeed(metadata, equipment)); setEditingMeta(true); }} className="inline-flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-300"><Pencil className="w-4 h-4" />Edit</button>) : null}>
          {!equipment.vin ? <Empty>This asset has no VIN, so VIN-keyed FleetVehicleMetadata does not apply.</Empty> : editingMeta ? <div className="space-y-4"><div className="grid md:grid-cols-3 gap-3">{META_FIELDS.map(field => <label key={field.key} className="text-sm"><span className="block text-xs text-gray-400 mb-1">{field.label}</span><input type={field.type || "text"} value={metaForm[field.key] || ""} onChange={e => setMetaForm(prev => ({ ...prev, [field.key]: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700" /></label>)}</div><label className="text-sm block"><span className="block text-xs text-gray-400 mb-1">Maintenance Notes</span><textarea rows="3" value={metaForm.maintenance_notes || ""} onChange={e => setMetaForm(prev => ({ ...prev, maintenance_notes: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700" /></label><label className="text-sm block"><span className="block text-xs text-gray-400 mb-1">General Notes</span><textarea rows="3" value={metaForm.notes || ""} onChange={e => setMetaForm(prev => ({ ...prev, notes: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700" /></label><div className="flex justify-end gap-2"><button onClick={() => setEditingMeta(false)} disabled={savingMeta} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center gap-1"><X className="w-4 h-4" />Cancel</button><button onClick={saveMetadata} disabled={savingMeta} className="px-3 py-2 rounded-lg bg-indigo-600 text-white inline-flex items-center gap-1 disabled:opacity-50">{savingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save Metadata</button></div></div> : <div className="space-y-4"><div className="grid md:grid-cols-4 gap-4">{META_FIELDS.map(field => <div key={field.key}><div className="text-xs text-gray-400">{field.label}</div><div className="text-sm text-gray-800 dark:text-slate-200 mt-1">{metadata?.[field.key] || (field.key === "license_plate" ? equipment.license_plate : "") || "—"}</div></div>)}</div>{metadata?.maintenance_notes && <div className="pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-1">Maintenance Notes</div><div className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{metadata.maintenance_notes}</div></div>}{metadata?.notes && <div className="pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-1">General Notes</div><div className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{metadata.notes}</div></div>}</div>}
        </Card>
      </div>
    </div>
  );
}

const META_FIELDS = [
  { key: "license_plate", label: "License Plate" },
  { key: "assigned_driver", label: "Assigned Driver" },
  { key: "department", label: "Department" },
  { key: "unit_number", label: "Unit Number" },
  { key: "registration_expiration_date", label: "Registration Expires", type: "date" },
  { key: "insurance_provider", label: "Insurance Provider" },
  { key: "insurance_policy_number", label: "Policy Number" },
  { key: "insurance_agent", label: "Insurance Agent" },
  { key: "insurance_agent_contact", label: "Agent Contact" },
  { key: "insurance_effective_date", label: "Insurance Effective", type: "date" },
  { key: "insurance_expiration_date", label: "Insurance Expires", type: "date" },
];

function metadataSeed(meta, equipment) {
  const seed = {};
  for (const field of META_FIELDS) seed[field.key] = meta?.[field.key] || (field.key === "license_plate" ? equipment?.license_plate || "" : "");
  seed.maintenance_notes = meta?.maintenance_notes || "";
  seed.notes = meta?.notes || "";
  return seed;
}
function Card({ title, icon: Icon, action, children }) { return <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm"><div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3"><h2 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2"><Icon className="w-4 h-4 text-indigo-500" />{title}</h2>{action}</div><div className="p-4">{children}</div></section>; }
function ProfileField({ label, value }) { return <div><div className="text-xs text-gray-400">{label}</div><div className="text-sm text-gray-800 dark:text-slate-200 mt-1">{value}</div></div>; }
function Metric({ label, value }) { return <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4"><div className="text-xs text-gray-400">{label}</div><div className="text-2xl font-bold text-gray-900 dark:text-slate-100 mt-1">{value}</div></div>; }
function Tag({ children }) { return <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 capitalize">{children}</span>; }
function Empty({ children }) { return <div className="text-sm text-gray-400 py-4">{children}</div>; }
function Info({ label, value, icon: Icon }) { return <div className="flex items-start gap-2"><Icon className="w-4 h-4 text-gray-400 mt-0.5" /><div><div className="text-xs text-gray-400">{label}</div><div className="text-sm text-gray-800 dark:text-slate-200 mt-0.5">{value}</div></div></div>; }
