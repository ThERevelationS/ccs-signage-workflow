import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { filterAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { buildWeeklyRanges, formatDateTimeShort, formatMiles } from "@/components/fleet/fleetHelpers";
import {
  Activity,
  ArrowLeft,
  Bell,
  CalendarClock,
  ClipboardList,
  Gauge,
  History,
  Loader2,
  MapPin,
  Navigation,
  PackageOpen,
  Pencil,
  Plus,
  Save,
  ShoppingCart,
  Truck,
  X,
} from "lucide-react";

const ACTIVE = new Set(["open", "assigned", "in_progress"]);
const TRACKED_LINK = new Set(["matched", "manual"]);
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "tracking", label: "Tracking" },
  { key: "maintenance", label: "Maintenance" },
  { key: "history", label: "History" },
  { key: "alerts", label: "Alerts" },
  { key: "details", label: "Details" },
];

const pretty = value => String(value || "—").replaceAll("_", " ");
const normalizeVin = value => String(value || "").trim().toUpperCase();
const normalizeImei = value => String(value || "").trim();
const hasDefinitiveTripEnd = row => {
  if (!row?.ended_at || String(row?.transaction_id || "").trim()) return false;
  const endedAt = Date.parse(row.ended_at) || 0;
  const startedAt = Date.parse(row.started_at || "") || 0;
  const lastEventAt = Date.parse(row.last_event_at || "") || 0;
  return endedAt > 0 && (!startedAt || endedAt >= startedAt) && (!lastEventAt || endedAt >= lastEventAt);
};

export default function FleetEquipmentDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || "";
  const requestedTab = params.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(TABS.some(tab => tab.key === requestedTab) ? requestedTab : "overview");
  const [equipment, setEquipment] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [liveStates, setLiveStates] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripIdentityWarning, setTripIdentityWarning] = useState("");
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
      setTripIdentityWarning("");
      if (!eq) {
        setWorkOrders([]); setTasks([]); setLogs([]); setRequests([]); setLiveStates([]); setNotifications([]); setMetadata(null); setMetaForm({});
        return;
      }

      const vin = normalizeVin(eq.vin);
      const [woRows, taskRows, logRows, requestRows, liveRows, notifRows, metaRows] = await Promise.all([
        filterAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, { equipment_id: id }, "-created_date", { label: `${eq.name} Fleet work-order history` }),
        filterAllFleetRows(base44.entities.FleetMaintenanceTask, { equipment_id: id }, "start_date", { label: `${eq.name} maintenance schedules` }),
        filterAllFleetRows(base44.entities.FleetEquipmentLog, { equipment_id: id }, "-created_date", { label: `${eq.name} equipment usage history` }),
        filterAllFleetRows(base44.entities.FleetPartFluidRequest, { equipment_id: id }, "-created_date", { label: `${eq.name} Fleet requests` }),
        vin ? base44.entities.BouncieVehicleLiveState.filter({ vehicle_vin: vin }, "-last_seen_at", 20) : Promise.resolve([]),
        vin ? base44.entities.BouncieNotification.filter({ vehicle_vin: vin }, "-timestamp", 100) : Promise.resolve([]),
        vin ? base44.entities.FleetVehicleMetadata.filter({ vehicle_vin: vin }, "-updated_date", 10) : Promise.resolve([]),
      ]);
      setWorkOrders(woRows || []);
      setTasks(taskRows || []);
      setLogs(logRows || []);
      setRequests(requestRows || []);
      setLiveStates(liveRows || []);
      setNotifications(notifRows || []);
      const meta = (metaRows || [])[0] || null;
      setMetadata(meta);
      setMetaForm(metadataSeed(meta, eq));
      if (eq.bouncie_imei && TRACKED_LINK.has(eq.bouncie_link_status)) loadTrips(eq);
    } catch (e) {
      setError(e?.message || "Unable to load Fleet equipment detail.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { setActiveTab(TABS.some(tab => tab.key === requestedTab) ? requestedTab : "overview"); }, [id, requestedTab]);

  const loadTrips = async (eq) => {
    setTripsLoading(true);
    setTripIdentityWarning("");
    try {
      const fleetVin = normalizeVin(eq?.vin);
      const fleetImei = normalizeImei(eq?.bouncie_imei);
      if (!fleetVin || !fleetImei) {
        setTrips([]);
        setTripIdentityWarning("Recent Bouncie trips are hidden because this Fleet record does not have both a VIN and a trusted Bouncie IMEI.");
        return;
      }

      const { data: vehicleResult } = await base44.functions.invoke("bouncieApi", { method: "GET", path: "/v1/vehicles", query: {} });
      const vehicles = vehicleResult?.data || [];
      const exactIdentity = vehicles.find(vehicle => normalizeVin(vehicle?.vin) === fleetVin && normalizeImei(vehicle?.imei) === fleetImei);
      if (!exactIdentity) {
        const currentImeiVehicle = vehicles.find(vehicle => normalizeImei(vehicle?.imei) === fleetImei);
        setTrips([]);
        setTripIdentityWarning(currentImeiVehicle?.vin && normalizeVin(currentImeiVehicle.vin) !== fleetVin
          ? `Bouncie device ${fleetImei} currently reports VIN ${normalizeVin(currentImeiVehicle.vin)}, not Fleet VIN ${fleetVin}. Trip history is hidden until an administrator confirms the device/vehicle identity.`
          : "CCS could not prove a current Bouncie VIN + IMEI match for this Fleet record. Trip history is hidden rather than risking another vehicle's trips.");
        return;
      }

      const ranges = buildWeeklyRanges(7);
      const results = await Promise.all(ranges.map(range => base44.functions.invoke("bouncieApi", { method: "GET", path: "/v1/trips", query: { imei: fleetImei, ...range, "gps-format": "geojson" } })));
      const all = results.flatMap(result => result?.data?.data || []).sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      setTrips(all);
    } catch {
      setTrips([]);
      setTripIdentityWarning("CCS could not verify the current Bouncie vehicle identity, so trip history is temporarily hidden.");
    } finally {
      setTripsLoading(false);
    }
  };

  const live = useMemo(() => liveStates.slice().sort((a, b) => new Date(b.last_seen_at || b.updated_date || 0) - new Date(a.last_seen_at || a.updated_date || 0))[0] || null, [liveStates]);
  const activeOrders = useMemo(() => workOrders.filter(row => ACTIVE.has(row.status)), [workOrders]);
  const completedOrders = useMemo(() => workOrders.filter(row => row.status === "completed"), [workOrders]);
  const activeRequests = useMemo(() => requests.filter(row => ["pending", "ordered"].includes(row.status)), [requests]);
  const pendingTasks = useMemo(() => tasks.filter(row => ["pending", "overdue", "in_progress"].includes(row.status)), [tasks]);
  const nextMaintenance = useMemo(() => pendingTasks.filter(row => row.start_date).slice().sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0] || null, [pendingTasks]);
  const isAdmin = currentUser?.role === "admin";
  const liveDriving = !!live?.is_trip_active && !hasDefinitiveTripEnd(live);
  const unreadAlerts = notifications.filter(note => !note.is_read).length;

  const selectTab = (tab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("id", id);
    if (tab === "overview") url.searchParams.delete("tab"); else url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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

  const trackingUrl = equipment.vin && TRACKED_LINK.has(equipment.bouncie_link_status)
    ? `${createPageUrl("FleetTracking")}?vin=${encodeURIComponent(equipment.vin)}${equipment.bouncie_imei ? `&imei=${encodeURIComponent(equipment.bouncie_imei)}` : ""}`
    : createPageUrl("FleetTracking");
  const maintenanceUrl = `${createPageUrl("FleetMaintenance")}?equipment=${encodeURIComponent(equipment.id)}`;

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col xl:flex-row gap-4 xl:items-start xl:justify-between">
          <div className="flex gap-4 min-w-0">
            <div className="w-24 h-24 rounded-xl bg-gray-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">{equipment.photo_url ? <img src={equipment.photo_url} alt={equipment.name} className="w-full h-full object-cover" /> : <Truck className="w-10 h-10 text-gray-300" />}</div>
            <div className="min-w-0"><Link to={createPageUrl("FleetEquipment")} className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-300"><ArrowLeft className="w-3.5 h-3.5" />Equipment</Link><h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100 mt-1 truncate">{equipment.name}</h1><p className="text-sm text-gray-500 dark:text-slate-400">{[equipment.year, equipment.make, equipment.model].filter(Boolean).join(" ") || pretty(equipment.type)}</p><div className="flex flex-wrap gap-2 mt-2"><Tag>{pretty(equipment.status)}</Tag><Tag>Bouncie: {pretty(equipment.bouncie_link_status)}</Tag>{equipment.vin && <Tag>VIN {equipment.vin}</Tag>}</div></div>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <Link to={trackingUrl} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center justify-center gap-2 text-sm"><Navigation className="w-4 h-4" />Tracking</Link>
            <Link to={maintenanceUrl} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center justify-center gap-2 text-sm"><CalendarClock className="w-4 h-4" />Maintenance</Link>
            <Link to={`${createPageUrl("FleetRequests")}?new=1&equipment=${encodeURIComponent(equipment.id)}`} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center justify-center gap-2 text-sm"><ShoppingCart className="w-4 h-4" />Request Item</Link>
            <Link to={`${createPageUrl("FleetWorkOrders")}?new=1&equipment=${encodeURIComponent(equipment.id)}`} className="px-3 py-2 rounded-lg bg-indigo-600 text-white inline-flex items-center justify-center gap-2 text-sm font-medium"><Plus className="w-4 h-4" />New Work Order</Link>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}
        {tripIdentityWarning && activeTab === "tracking" && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{tripIdentityWarning}</div>}

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex min-w-max sm:min-w-0">
            {TABS.map(tab => <button key={tab.key} onClick={() => selectTab(tab.key)} className={`relative px-4 py-2.5 text-sm font-semibold whitespace-nowrap rounded-lg ${activeTab === tab.key ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>{tab.label}{tab.key === "alerts" && unreadAlerts > 0 && <span className={`ml-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full px-1 text-[10px] ${activeTab === tab.key ? "bg-white text-indigo-700" : "bg-red-600 text-white"}`}>{unreadAlerts}</span>}</button>)}
          </div>
        </div>

        {activeTab === "overview" && <OverviewTab equipment={equipment} metadata={metadata} live={live} liveDriving={liveDriving} activeOrders={activeOrders} tasks={tasks} nextMaintenance={nextMaintenance} logs={logs} activeRequests={activeRequests} trips={trips} tripsLoading={tripsLoading} unreadAlerts={unreadAlerts} maintenanceUrl={maintenanceUrl} onSelectTab={selectTab} />}
        {activeTab === "tracking" && <TrackingTab equipment={equipment} live={live} liveStates={liveStates} liveDriving={liveDriving} trips={trips} tripsLoading={tripsLoading} tripIdentityWarning={tripIdentityWarning} trackingUrl={trackingUrl} />}
        {activeTab === "maintenance" && <MaintenanceTab equipment={equipment} activeOrders={activeOrders} completedOrders={completedOrders} tasks={tasks} maintenanceUrl={maintenanceUrl} />}
        {activeTab === "history" && <HistoryTab equipment={equipment} completedOrders={completedOrders} logs={logs} requests={requests} />}
        {activeTab === "alerts" && <AlertsTab notifications={notifications} />}
        {activeTab === "details" && <DetailsTab equipment={equipment} metadata={metadata} isAdmin={isAdmin} editingMeta={editingMeta} setEditingMeta={setEditingMeta} metaForm={metaForm} setMetaForm={setMetaForm} savingMeta={savingMeta} saveMetadata={saveMetadata} />}
      </div>
    </div>
  );
}

function OverviewTab({ equipment, metadata, live, liveDriving, activeOrders, tasks, nextMaintenance, logs, activeRequests, trips, tripsLoading, unreadAlerts, maintenanceUrl, onSelectTab }) {
  return <div className="space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
      <Metric label="Open work orders" value={activeOrders.length} attention={activeOrders.some(order => ["high", "critical"].includes(order.priority))} />
      <Metric label="Schedules" value={tasks.length} />
      <Metric label="Active requests" value={activeRequests.length} attention={activeRequests.length > 0} />
      <Metric label="Usage records" value={logs.length} />
      <Metric label="Trips · 7 days" value={tripsLoading ? "…" : trips.length} />
      <Metric label="Unread alerts" value={unreadAlerts} attention={unreadAlerts > 0} />
    </div>

    <div className="grid lg:grid-cols-3 gap-5">
      <Card title="Asset Snapshot" icon={Truck}>
        <div className="grid grid-cols-2 gap-4"><ProfileField label="Status" value={pretty(equipment.status)} /><ProfileField label="Asset type" value={pretty(equipment.type)} /><ProfileField label="Plate" value={metadata?.license_plate || equipment.license_plate || "—"} /><ProfileField label="VIN / Serial" value={equipment.vin || equipment.serial_number || "—"} /><ProfileField label="Last service" value={equipment.last_service_date || "—"} /><ProfileField label="Next service" value={equipment.next_service_due || nextMaintenance?.start_date || "—"} /></div>
      </Card>

      <Card title="Live Tracking" icon={Navigation} action={<button onClick={() => onSelectTab("tracking")} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Open tracking</button>}>
        {TRACKED_LINK.has(equipment.bouncie_link_status) && live ? <div className="grid grid-cols-2 gap-4"><ProfileField label="State" value={liveDriving ? "Driving" : "Parked"} /><ProfileField label="Speed" value={live.speed != null ? `${Math.round(live.speed)} mph` : "—"} /><ProfileField label="Odometer" value={live.odometer != null ? `${Number(live.odometer).toLocaleString()} mi` : "—"} /><ProfileField label="Last seen" value={live.last_seen_at ? formatDateTimeShort(live.last_seen_at) : "—"} /></div> : <Empty>{equipment.bouncie_link_status === "not_applicable" ? "This non-road asset does not use Bouncie." : "No proven Bouncie live state is linked."}</Empty>}
      </Card>

      <Card title="Next Maintenance" icon={CalendarClock} action={<Link to={maintenanceUrl} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Workspace</Link>}>
        {nextMaintenance ? <div><div className="font-semibold text-gray-900 dark:text-slate-100">{nextMaintenance.title}</div><div className="text-sm text-gray-500 dark:text-slate-400 mt-1">Due {nextMaintenance.start_date || "—"} · {pretty(nextMaintenance.status)}</div><div className="text-xs text-gray-400 mt-2">{nextMaintenance.type === "one_off" ? "One-time" : pretty(nextMaintenance.frequency)}</div></div> : <Empty>No pending maintenance schedule.</Empty>}
      </Card>
    </div>

    <div className="grid lg:grid-cols-2 gap-5">
      <Card title="Active Maintenance Work" icon={ClipboardList} action={<button onClick={() => onSelectTab("maintenance")} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">View all</button>}>
        <div className="space-y-2">{activeOrders.slice(0,4).map(order => <WorkOrderRow key={order.id} order={order} equipment={equipment} />)}{activeOrders.length === 0 && <Empty>No active Fleet maintenance work orders.</Empty>}</div>
      </Card>
      <Card title="Recent Fleet Activity" icon={History} action={<button onClick={() => onSelectTab("history")} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Full history</button>}>
        <div className="space-y-2">{logs.slice(0,5).map(log => <UsageRow key={log.id} log={log} equipment={equipment} />)}{logs.length === 0 && <Empty>No part/fluid usage history yet.</Empty>}</div>
      </Card>
    </div>
  </div>;
}

function TrackingTab({ equipment, live, liveStates, liveDriving, trips, tripsLoading, tripIdentityWarning, trackingUrl }) {
  return <div className="grid xl:grid-cols-3 gap-5">
    <Card title="Tracking State" icon={Navigation}>
      {TRACKED_LINK.has(equipment.bouncie_link_status) && live ? <div className="space-y-3"><Info label="Trip state" value={liveDriving ? "Driving" : "Parked"} icon={Activity} /><Info label="Speed" value={live.speed != null ? `${Math.round(live.speed)} mph` : "—"} icon={Gauge} /><Info label="Odometer" value={live.odometer != null ? `${Number(live.odometer).toLocaleString()} mi` : "—"} icon={Gauge} /><Info label="Last seen" value={live.last_seen_at ? formatDateTimeShort(live.last_seen_at) : "—"} icon={MapPin} />{live.latitude != null && live.longitude != null && <Info label="Coordinates" value={`${Number(live.latitude).toFixed(5)}, ${Number(live.longitude).toFixed(5)}`} icon={MapPin} />}{liveStates.length > 1 && <div className="text-xs text-amber-700 dark:text-amber-300 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2">{liveStates.length} live-state rows exist for this VIN; the newest row is used.</div>}<Link to={trackingUrl} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300">Open dispatch map <Navigation className="w-4 h-4" /></Link></div> : <Empty>{equipment.bouncie_link_status === "not_applicable" ? "Bouncie tracking is not applicable to this asset." : "No proven Bouncie live state is linked."}</Empty>}
    </Card>
    <div className="xl:col-span-2"><Card title="Recent Trips · 7 Days" icon={Navigation}>
      {tripIdentityWarning && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{tripIdentityWarning}</div>}
      {tripsLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div> : <div className="space-y-2">{trips.slice(0,12).map(trip => <div key={trip.transactionId} className="py-2 border-b border-gray-100 dark:border-slate-800 last:border-0"><div className="text-sm text-gray-800 dark:text-slate-200">{trip.startTime ? new Date(trip.startTime).toLocaleString() : "Trip"}</div><div className="text-xs text-gray-400">{formatMiles(trip.distance || 0)} · avg {Math.round(trip.averageSpeed || 0)} mph</div></div>)}{trips.length === 0 && !tripIdentityWarning && <Empty>No recent Bouncie trips.</Empty>}</div>}
    </Card></div>
  </div>;
}

function MaintenanceTab({ equipment, activeOrders, completedOrders, tasks, maintenanceUrl }) {
  return <div className="grid xl:grid-cols-2 gap-5">
    <Card title="Active Work Orders" icon={ClipboardList} action={<Link to={`${createPageUrl("FleetWorkOrders")}?new=1&equipment=${encodeURIComponent(equipment.id)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300"><Plus className="w-3.5 h-3.5" />New work order</Link>}>
      <div className="space-y-2">{activeOrders.map(order => <WorkOrderRow key={order.id} order={order} equipment={equipment} />)}{activeOrders.length === 0 && <Empty>No active work orders.</Empty>}</div>
      {completedOrders.length > 0 && <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs uppercase font-semibold text-gray-400 mb-2">Recent completed</div>{completedOrders.slice(0,5).map(order => <div key={order.id} className="py-2 flex justify-between gap-3 text-sm"><span>{order.work_order_number} · {order.title}</span><span className="text-gray-400 whitespace-nowrap">{order.completed_date || "—"}</span></div>)}</div>}
    </Card>
    <Card title="Maintenance Schedules" icon={CalendarClock} action={<Link to={maintenanceUrl} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Open maintenance workspace</Link>}>
      <div className="space-y-2">{tasks.map(task => <div key={task.id} className="rounded-lg border border-gray-200 dark:border-slate-700 p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-medium text-gray-900 dark:text-slate-100">{task.title}</div><div className="text-xs text-gray-500 mt-1">{task.type === "one_off" ? "One-time" : pretty(task.frequency)} · due {task.start_date || "—"}</div></div><Tag>{pretty(task.status)}</Tag></div></div>)}{tasks.length === 0 && <Empty>No maintenance schedules.</Empty>}</div>
    </Card>
  </div>;
}

function HistoryTab({ equipment, completedOrders, logs, requests }) {
  return <div className="grid xl:grid-cols-2 gap-5">
    <Card title="Maintenance History" icon={History}>
      <div className="space-y-2">{completedOrders.map(order => <Link key={order.id} to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(order.id)}&equipment=${encodeURIComponent(equipment.id)}`} className="block rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:border-indigo-300"><div className="font-medium text-gray-900 dark:text-slate-100">{order.work_order_number} · {order.title}</div><div className="text-xs text-gray-500 mt-1">Completed {order.completed_date || "—"}{order.total_cost != null ? ` · $${Number(order.total_cost).toFixed(2)}` : ""}</div></Link>)}{completedOrders.length === 0 && <Empty>No completed maintenance work orders.</Empty>}</div>
    </Card>
    <div className="space-y-5">
      <Card title="Parts & Fluids Usage" icon={PackageOpen}><div className="space-y-2">{logs.map(log => <UsageRow key={log.id} log={log} equipment={equipment} />)}{logs.length === 0 && <Empty>No usage history.</Empty>}</div></Card>
      <Card title="Requests" icon={ShoppingCart}><div className="space-y-2">{requests.map(request => <div key={request.id} className="rounded-lg border border-gray-200 dark:border-slate-700 p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-medium text-gray-900 dark:text-slate-100">{request.item_name}</div><div className="text-xs text-gray-500 mt-1">{pretty(request.item_type)} · qty {request.quantity_needed ?? "—"}{request.requested_by_person ? ` · ${request.requested_by_person}` : ""}</div></div><Tag>{pretty(request.status)}</Tag></div></div>)}{requests.length === 0 && <Empty>No Fleet requests linked to this asset.</Empty>}</div></Card>
    </div>
  </div>;
}

function AlertsTab({ notifications }) {
  return <Card title="Bouncie Alerts & Notifications" icon={Bell}><div className="space-y-2">{notifications.map(note => <div key={note.id} className={`rounded-lg border p-3 ${note.is_read ? "border-gray-200 dark:border-slate-700" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20"}`}><div className="flex items-start justify-between gap-3"><div><div className="font-medium text-gray-900 dark:text-slate-100">{note.title || pretty(note.event_type)}</div>{note.description && <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{note.description}</div>}</div>{!note.is_read && <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-300">Unread</span>}</div><div className="text-xs text-gray-400 mt-2">{note.timestamp ? formatDateTimeShort(note.timestamp) : "—"}</div></div>)}{notifications.length === 0 && <Empty>No Bouncie notifications for this VIN.</Empty>}</div></Card>;
}

function DetailsTab({ equipment, metadata, isAdmin, editingMeta, setEditingMeta, metaForm, setMetaForm, savingMeta, saveMetadata }) {
  return <div className="space-y-5">
    <Card title="Asset Profile" icon={Truck}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"><ProfileField label="Asset type" value={pretty(equipment.type)} /><ProfileField label="Location" value={equipment.location || "—"} /><ProfileField label="Serial / original ID" value={equipment.serial_number || "—"} /><ProfileField label="Mileage / Hours" value={equipment.mileage_hours != null ? Number(equipment.mileage_hours).toLocaleString() : "—"} /><ProfileField label="Purchase date" value={equipment.purchase_date || "—"} /><ProfileField label="Last service" value={equipment.last_service_date || "—"} /><ProfileField label="Next service due" value={equipment.next_service_due || "—"} /><ProfileField label="License plate" value={metadata?.license_plate || equipment.license_plate || "—"} /></div>
      {equipment.engine_details && <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-1">Engine / Powertrain</div><div className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{equipment.engine_details}</div></div>}
      {equipment.notes && <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-1">Equipment Notes</div><div className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{equipment.notes}</div></div>}
    </Card>

    <Card title="CCS Vehicle Metadata" icon={Truck} action={isAdmin && !editingMeta ? <button onClick={() => { setMetaForm(metadataSeed(metadata, equipment)); setEditingMeta(true); }} className="inline-flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-300"><Pencil className="w-4 h-4" />Edit</button> : null}>
      {!equipment.vin ? <Empty>This asset has no VIN, so VIN-keyed FleetVehicleMetadata does not apply.</Empty> : editingMeta ? <div className="space-y-4"><div className="grid md:grid-cols-3 gap-3">{META_FIELDS.map(field => <label key={field.key} className="text-sm"><span className="block text-xs text-gray-400 mb-1">{field.label}</span><input type={field.type || "text"} value={metaForm[field.key] || ""} onChange={event => setMetaForm(prev => ({ ...prev, [field.key]: event.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700" /></label>)}</div><label className="text-sm block"><span className="block text-xs text-gray-400 mb-1">Maintenance Notes</span><textarea rows="3" value={metaForm.maintenance_notes || ""} onChange={event => setMetaForm(prev => ({ ...prev, maintenance_notes: event.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700" /></label><label className="text-sm block"><span className="block text-xs text-gray-400 mb-1">General Notes</span><textarea rows="3" value={metaForm.notes || ""} onChange={event => setMetaForm(prev => ({ ...prev, notes: event.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700" /></label><div className="flex justify-end gap-2"><button onClick={() => setEditingMeta(false)} disabled={savingMeta} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center gap-1"><X className="w-4 h-4" />Cancel</button><button onClick={saveMetadata} disabled={savingMeta} className="px-3 py-2 rounded-lg bg-indigo-600 text-white inline-flex items-center gap-1 disabled:opacity-50">{savingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save Metadata</button></div></div> : <div className="space-y-4"><div className="grid md:grid-cols-4 gap-4">{META_FIELDS.map(field => <div key={field.key}><div className="text-xs text-gray-400">{field.label}</div><div className="text-sm text-gray-800 dark:text-slate-200 mt-1">{metadata?.[field.key] || (field.key === "license_plate" ? equipment.license_plate : "") || "—"}</div></div>)}</div>{metadata?.maintenance_notes && <div className="pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-1">Maintenance Notes</div><div className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{metadata.maintenance_notes}</div></div>}{metadata?.notes && <div className="pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-1">General Notes</div><div className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{metadata.notes}</div></div>}</div>}
    </Card>
  </div>;
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
function WorkOrderRow({ order, equipment }) { return <Link to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(order.id)}&equipment=${encodeURIComponent(equipment.id)}`} className="block rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:border-indigo-300 dark:hover:border-indigo-700"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium text-gray-900 dark:text-slate-100">{order.work_order_number} · {order.title}</div><Tag>{pretty(order.status)}</Tag></div><div className="text-xs text-gray-500 mt-1">{pretty(order.priority)} priority · {order.assigned_to || "Unassigned"}</div></Link>; }
function UsageRow({ log, equipment }) { return <div className="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-slate-800 last:border-0"><div className="min-w-0"><div className="text-sm text-gray-800 dark:text-slate-200">{log.item_name} · {log.quantity_used} {log.unit || ""}</div><div className="text-xs text-gray-400">{pretty(log.item_type)}{log.recorded_by ? ` · ${log.recorded_by}` : ""}</div>{log.notes && <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{log.notes}</div>}{log.work_order_id && <Link to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(log.work_order_id)}&equipment=${encodeURIComponent(equipment.id)}`} className="inline-flex mt-1 text-xs text-indigo-600 dark:text-indigo-300 hover:underline">Open linked work order</Link>}</div><span className="text-xs text-gray-400 whitespace-nowrap">{log.created_date ? new Date(log.created_date).toLocaleDateString() : "—"}</span></div>; }
function Card({ title, icon: Icon, action, children }) { return <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm"><div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3"><h2 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2"><Icon className="w-4 h-4 text-indigo-500" />{title}</h2>{action}</div><div className="p-4">{children}</div></section>; }
function ProfileField({ label, value }) { return <div><div className="text-xs text-gray-400">{label}</div><div className="text-sm text-gray-800 dark:text-slate-200 mt-1 break-words">{value}</div></div>; }
function Metric({ label, value, attention = false }) { return <div className={`rounded-xl border p-4 ${attention ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}><div className="text-xs text-gray-400">{label}</div><div className={`text-2xl font-bold mt-1 ${attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100"}`}>{value}</div></div>; }
function Tag({ children }) { return <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 capitalize">{children}</span>; }
function Empty({ children }) { return <div className="text-sm text-gray-400 py-4">{children}</div>; }
function Info({ label, value, icon: Icon }) { return <div className="flex items-start gap-2"><Icon className="w-4 h-4 text-gray-400 mt-0.5" /><div><div className="text-xs text-gray-400">{label}</div><div className="text-sm text-gray-800 dark:text-slate-200 mt-0.5">{value}</div></div></div>; }
