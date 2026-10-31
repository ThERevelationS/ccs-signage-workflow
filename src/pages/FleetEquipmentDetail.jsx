import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetEquipmentTimeline from "@/components/fleet/FleetEquipmentTimeline";
import FleetEquipmentDocuments from "@/components/fleet/FleetEquipmentDocuments";
import FleetLifecyclePanel from "@/components/fleet/FleetLifecyclePanel";
import { filterAllFleetRows, listAllFleetRows, readFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { buildWeeklyRanges, formatDateTimeShort, formatMiles } from "@/components/fleet/fleetHelpers";
import { fleetHealthScore } from "@/components/fleet/fleetHealth";
import {
  Activity,
  ArrowLeft,
  Bell,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  Fuel,
  History,
  Loader2,
  MapPin,
  Navigation,
  PackageOpen,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  ShoppingCart,
  Truck,
  X,
} from "lucide-react";
import { invokeFleet } from "@/components/fleet/fleetInvoke";
import { getSessionUser } from "@/components/auth/EmailGate";

const ACTIVE = new Set(["open", "assigned", "in_progress"]);
const TRACKED_LINK = new Set(["matched", "manual"]);
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "tracking", label: "Tracking" },
  { key: "maintenance", label: "Maintenance" },
  { key: "inspections", label: "Inspections" },
  { key: "parts", label: "Parts" },
  { key: "fuel", label: "Fuel & Costs" },
  { key: "warranties", label: "Warranties" },
  { key: "assignments", label: "Assignments" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "history", label: "History" },
  { key: "timeline", label: "Timeline" },
  { key: "documents", label: "Documents" },
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
  const [inspections, setInspections] = useState([]);
  const [parts, setParts] = useState([]);
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

  const loadSequenceRef = useRef(0);

  const load = async () => {
    const requestSequence = ++loadSequenceRef.current;
    setLoading(true);
    setError("");
    try {
      const [equipmentRows, user] = await Promise.all([
        readFleetRows("FleetEquipment", { query: { id }, sort: "name", limit: 1 }),
        Promise.resolve(getSessionUser()),
      ]);
      const eq = (equipmentRows || [])[0] || null;
      if (requestSequence !== loadSequenceRef.current) return;
      setEquipment(eq);
      setCurrentUser(user || null);
      setTrips([]);
      setTripIdentityWarning("");
      setTripsLoading(false);
      if (!eq) {
        setWorkOrders([]); setTasks([]); setLogs([]); setInspections([]); setParts([]); setRequests([]); setLiveStates([]); setNotifications([]); setMetadata(null); setMetaForm({});
        return;
      }

      const vin = normalizeVin(eq.vin);
      const [woRows, taskRows, logRows, inspectionRows, partRows, requestRows, liveRows, notifRows, metaRows] = await Promise.all([
        filterAllFleetRows("FleetMaintenanceWorkOrder", { equipment_id: id }, "-created_date", { label: `${eq.name} Fleet work-order history` }),
        filterAllFleetRows("FleetMaintenanceTask", { equipment_id: id }, "start_date", { label: `${eq.name} maintenance schedules` }),
        filterAllFleetRows("FleetEquipmentLog", { equipment_id: id }, "-created_date", { label: `${eq.name} equipment usage history` }),
        filterAllFleetRows("FleetInspection", { equipment_id: id }, "-created_date", { label: `${eq.name} Fleet inspections` }).catch(() => []),
        listAllFleetRows("FleetPart", "part_name", { label: "Fleet parts for equipment hub" }),
        filterAllFleetRows("FleetPartFluidRequest", { equipment_id: id }, "-created_date", { label: `${eq.name} Fleet requests` }),
        vin ? readFleetRows("BouncieVehicleLiveState", { query: { vehicle_vin: vin }, sort: "-last_seen_at", limit: 20 }) : Promise.resolve([]),
        vin ? readFleetRows("BouncieNotification", { query: { vehicle_vin: vin }, sort: "-timestamp", limit: 100 }) : Promise.resolve([]),
        vin ? readFleetRows("FleetVehicleMetadata", { query: { vehicle_vin: vin }, sort: "-updated_date", limit: 10 }) : Promise.resolve([]),
      ]);
      if (requestSequence !== loadSequenceRef.current) return;
      setWorkOrders(woRows || []);
      setTasks(taskRows || []);
      setLogs(logRows || []);
      setInspections(inspectionRows || []);
      setParts((partRows || []).filter(part => part.compatible_equipment_ids?.includes(id)));
      setRequests(requestRows || []);
      setLiveStates(liveRows || []);
      setNotifications(notifRows || []);
      const meta = (metaRows || [])[0] || null;
      setMetadata(meta);
      setMetaForm(metadataSeed(meta, eq));
      if (eq.bouncie_imei && TRACKED_LINK.has(eq.bouncie_link_status)) loadTrips(eq);
    } catch (e) {
      if (requestSequence === loadSequenceRef.current) setError(e?.message || "Unable to load Fleet equipment detail.");
    } finally {
      if (requestSequence === loadSequenceRef.current) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { setActiveTab(TABS.some(tab => tab.key === requestedTab) ? requestedTab : "overview"); }, [id, requestedTab]);

  const loadTrips = async (eq) => {
    const requestSequence = loadSequenceRef.current;
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

      const { data: vehicleResult } = await invokeFleet("bouncieApi", { method: "GET", path: "/v1/vehicles", query: {} });
      if (requestSequence !== loadSequenceRef.current) return;
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
      const results = await Promise.all(ranges.map(range => invokeFleet("bouncieApi", { method: "GET", path: "/v1/trips", query: { imei: fleetImei, ...range, "gps-format": "geojson" } })));
      if (requestSequence !== loadSequenceRef.current) return;
      const all = results.flatMap(result => result?.data?.data || []).sort((a, b) => (Date.parse(b?.startTime || "") || 0) - (Date.parse(a?.startTime || "") || 0));
      setTrips(all);
    } catch {
      if (requestSequence === loadSequenceRef.current) {
        setTrips([]);
        setTripIdentityWarning("CCS could not verify the current Bouncie vehicle identity, so trip history is temporarily hidden.");
      }
    } finally {
      if (requestSequence === loadSequenceRef.current) setTripsLoading(false);
    }
  };

  const live = useMemo(() => liveStates.slice().sort((a, b) => (Date.parse(b.last_seen_at || b.updated_date || "") || 0) - (Date.parse(a.last_seen_at || a.updated_date || "") || 0))[0] || null, [liveStates]);
  const activeOrders = useMemo(() => workOrders.filter(row => ACTIVE.has(row.status)), [workOrders]);
  const completedOrders = useMemo(() => workOrders.filter(row => row.status === "completed"), [workOrders]);
  const activeRequests = useMemo(() => requests.filter(row => ["pending", "ordered"].includes(row.status)), [requests]);
  const pendingTasks = useMemo(() => tasks.filter(row => ["pending", "overdue", "in_progress"].includes(row.status)), [tasks]);
  const nextMaintenance = useMemo(() => pendingTasks.filter(row => row.start_date).slice().sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0] || null, [pendingTasks]);
  const isAdmin = currentUser?.role === "admin";
  const visibleTabs = TABS.filter(tab => tab.key !== "lifecycle" || isAdmin);
  const retired = equipment?.status === "retired";
  const liveDriving = !!live?.is_trip_active && !hasDefinitiveTripEnd(live);
  const unreadAlerts = notifications.filter(note => !note.is_read).length;
  const health = useMemo(() => fleetHealthScore({ equipment, tasks, workOrders, notifications }), [equipment, tasks, workOrders, notifications]);

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
      const { data } = await invokeFleet("fleetEquipmentAction", { action: "save_metadata", equipment_id: id, metadata_id: metadata?.id || "", expected_metadata_updated_date: metadata?.updated_date || "", metadata: metaForm });
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
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-gray-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">{equipment.photo_url ? <img src={equipment.photo_url} alt={equipment.name} className="w-full h-full object-cover" /> : <Truck className="w-9 h-9 sm:w-10 sm:h-10 text-gray-300" />}</div>
            <div className="min-w-0 flex-1"><Link to={createPageUrl("FleetEquipment")} className="min-h-11 -ml-2 px-2 rounded-lg inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30"><ArrowLeft className="w-3.5 h-3.5" />Equipment</Link><h1 className="text-2xl sm:text-3xl font-bold leading-tight text-gray-900 dark:text-slate-100 break-words">{equipment.name}</h1><p className="text-sm leading-relaxed text-gray-500 dark:text-slate-400 mt-1 break-words">{[equipment.year, equipment.make, equipment.model].filter(Boolean).join(" ") || pretty(equipment.type)}</p><div className="flex flex-wrap gap-2 mt-2"><Tag>{pretty(equipment.status)}</Tag><HealthTag health={health} /><Tag>{activeOrders.length} open WO{activeOrders.length === 1 ? "" : "s"}</Tag>{nextMaintenance?.start_date && <Tag>Service {nextMaintenance.start_date}</Tag>}<Tag>Bouncie: {pretty(equipment.bouncie_link_status)}</Tag>{equipment.vin && <Tag>VIN {equipment.vin}</Tag>}</div></div>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <Link to={trackingUrl} className="min-h-11 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center justify-center gap-2 text-sm"><Navigation className="w-4 h-4" />Tracking</Link>
            <Link to={maintenanceUrl} className="min-h-11 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center justify-center gap-2 text-sm"><CalendarClock className="w-4 h-4" />Maintenance</Link>
            {!retired && <Link to={`${createPageUrl("FleetRequests")}?new=1&equipment=${encodeURIComponent(equipment.id)}`} className="min-h-11 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center justify-center gap-2 text-sm"><ShoppingCart className="w-4 h-4" />Request Item</Link>}
            {!retired && <Link to={`${createPageUrl("FleetWorkOrders")}?new=1&equipment=${encodeURIComponent(equipment.id)}`} className="min-h-11 px-3 py-2 rounded-lg bg-indigo-600 text-white inline-flex items-center justify-center gap-2 text-sm font-medium"><Plus className="w-4 h-4" />New Work Order</Link>}
          </div>
        </div>

        {retired && <div className="rounded-lg border border-gray-200 bg-gray-50 dark:bg-slate-900 dark:border-slate-700 px-4 py-3 text-sm text-gray-700 dark:text-slate-300"><b>Retired Fleet archive:</b> tracking references, documents, maintenance history, usage, requests, alerts, and timeline remain preserved. New work orders, requests, schedules, and public reports are disabled until this equipment is reactivated.</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}
        {tripIdentityWarning && activeTab === "tracking" && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{tripIdentityWarning}</div>}

        <div className="sticky top-[69px] lg:top-[61px] z-20 rounded-xl border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="lg:hidden p-1">
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-slate-400">Section</span>
              <select value={activeTab} onChange={event => selectTab(event.target.value)} aria-label={`${equipment.name} Fleet section`} className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                {visibleTabs.map(tab => <option key={tab.key} value={tab.key}>{tab.label}{tab.key === "alerts" && unreadAlerts > 0 ? ` (${unreadAlerts} unread)` : ""}</option>)}
              </select>
            </label>
          </div>
          <div className="hidden lg:block overflow-x-auto overscroll-x-contain">
            <div role="tablist" aria-label={`${equipment.name} Fleet sections`} className="flex min-w-max">
              {visibleTabs.map(tab => <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} onClick={() => selectTab(tab.key)} className={`relative min-h-11 px-4 py-2.5 text-sm font-semibold whitespace-nowrap rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${activeTab === tab.key ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>{tab.label}{tab.key === "alerts" && unreadAlerts > 0 && <span className={`ml-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full px-1 text-[10px] ${activeTab === tab.key ? "bg-white text-indigo-700" : "bg-red-600 text-white"}`}>{unreadAlerts}</span>}</button>)}
            </div>
          </div>
        </div>

        {activeTab === "overview" && <OverviewTab equipment={equipment} metadata={metadata} live={live} liveDriving={liveDriving} activeOrders={activeOrders} tasks={tasks} nextMaintenance={nextMaintenance} logs={logs} activeRequests={activeRequests} trips={trips} tripsLoading={tripsLoading} unreadAlerts={unreadAlerts} health={health} maintenanceUrl={maintenanceUrl} onSelectTab={selectTab} />}
        {activeTab === "tracking" && <TrackingTab equipment={equipment} live={live} liveStates={liveStates} liveDriving={liveDriving} trips={trips} tripsLoading={tripsLoading} tripIdentityWarning={tripIdentityWarning} trackingUrl={trackingUrl} />}
        {activeTab === "maintenance" && <MaintenanceTab equipment={equipment} activeOrders={activeOrders} completedOrders={completedOrders} tasks={tasks} maintenanceUrl={maintenanceUrl} retired={retired} />}
        {activeTab === "inspections" && <InspectionsTab equipment={equipment} inspections={inspections} retired={retired} />}
        {activeTab === "parts" && <PartsTab equipment={equipment} parts={parts} retired={retired} />}
        {activeTab === "fuel" && <FuelTab equipment={equipment} retired={retired} />}
        {activeTab === "warranties" && <WarrantyTab equipment={equipment} retired={retired} isAdmin={isAdmin} />}
        {activeTab === "assignments" && <AssignmentsTab equipment={equipment} retired={retired} />}
        {activeTab === "lifecycle" && <FleetLifecyclePanel equipment={equipment} isAdmin={isAdmin} />}
        {activeTab === "history" && <HistoryTab equipment={equipment} completedOrders={completedOrders} logs={logs} requests={requests} />}
        {activeTab === "timeline" && <FleetEquipmentTimeline equipment={equipment} workOrders={workOrders} logs={logs} notifications={notifications} requests={requests} inspections={inspections} />}
        {activeTab === "documents" && <FleetEquipmentDocuments equipment={equipment} isAdmin={isAdmin} />}
        {activeTab === "alerts" && <AlertsTab notifications={notifications} />}
        {activeTab === "details" && <DetailsTab equipment={equipment} metadata={metadata} isAdmin={isAdmin} editingMeta={editingMeta} setEditingMeta={setEditingMeta} metaForm={metaForm} setMetaForm={setMetaForm} savingMeta={savingMeta} saveMetadata={saveMetadata} />}
      </div>
    </div>
  );
}

function OverviewTab({ equipment, metadata, live, liveDriving, activeOrders, tasks, nextMaintenance, logs, activeRequests, trips, tripsLoading, unreadAlerts, health, maintenanceUrl, onSelectTab }) {
  return <div className="space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
      <Metric label="Fleet health" value={health?.score == null ? "N/A" : `${health.score}%`} attention={health?.score != null && health.score < 75} />
      <Metric label="Open work orders" value={activeOrders.length} attention={activeOrders.some(order => ["high", "critical"].includes(order.priority))} />
      <Metric label="Schedules" value={tasks.length} />
      <Metric label="Active requests" value={activeRequests.length} attention={activeRequests.length > 0} />
      <Metric label="Usage records" value={logs.length} />
      <Metric label="Trips · 7 days" value={tripsLoading ? "…" : trips.length} />
      <Metric label="Unread alerts" value={unreadAlerts} attention={unreadAlerts > 0} />
    </div>

    <div className="grid lg:grid-cols-3 gap-5">
      <Card title="Asset Snapshot" icon={Truck}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><ProfileField label="Status" value={pretty(equipment.status)} /><ProfileField label="Asset type" value={pretty(equipment.type)} /><ProfileField label="Plate" value={metadata?.license_plate || equipment.license_plate || "—"} /><ProfileField label="VIN / Serial" value={equipment.vin || equipment.serial_number || "—"} /><ProfileField label="Last service" value={equipment.last_service_date || "—"} /><ProfileField label="Next service" value={equipment.next_service_due || nextMaintenance?.start_date || "—"} /></div>
      </Card>

      <Card title="Live Tracking" icon={Navigation} action={<button type="button" onClick={() => onSelectTab("tracking")} className="min-h-11 px-3 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center">Open tracking</button>}>
        {TRACKED_LINK.has(equipment.bouncie_link_status) && live ? <div className="grid grid-cols-2 gap-4"><ProfileField label="State" value={liveDriving ? "Driving" : "Parked"} /><ProfileField label="Speed" value={live.speed != null ? `${Math.round(live.speed)} mph` : "—"} /><ProfileField label="Odometer" value={live.odometer != null ? `${Number(live.odometer).toLocaleString()} mi` : "—"} /><ProfileField label="Last seen" value={live.last_seen_at ? formatDateTimeShort(live.last_seen_at) : "—"} /></div> : <Empty>{equipment.bouncie_link_status === "not_applicable" ? "This non-road asset does not use Bouncie." : "No proven Bouncie live state is linked."}</Empty>}
      </Card>

      <Card title="Next Maintenance" icon={CalendarClock} action={<Link to={maintenanceUrl} className="min-h-11 px-3 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center">Workspace</Link>}>
        {nextMaintenance ? <div><div className="font-semibold text-gray-900 dark:text-slate-100">{nextMaintenance.title}</div><div className="text-sm text-gray-500 dark:text-slate-400 mt-1">Due {nextMaintenance.start_date || "—"} · {pretty(nextMaintenance.status)}</div><div className="text-xs text-gray-400 mt-2">{nextMaintenance.type === "one_off" ? "One-time" : pretty(nextMaintenance.frequency)}</div></div> : <Empty>No pending maintenance schedule.</Empty>}
      </Card>
    </div>

    <div className="grid lg:grid-cols-2 gap-5">
      <Card title="Active Maintenance Work" icon={ClipboardList} action={<button type="button" onClick={() => onSelectTab("maintenance")} className="min-h-11 px-3 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center">View all</button>}>
        <div className="space-y-2">{activeOrders.slice(0,4).map(order => <WorkOrderRow key={order.id} order={order} equipment={equipment} />)}{activeOrders.length === 0 && <Empty>No active Fleet maintenance work orders.</Empty>}</div>
      </Card>
      <Card title="Recent Fleet Activity" icon={History} action={<button type="button" onClick={() => onSelectTab("history")} className="min-h-11 px-3 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center">Full history</button>}>
        <div className="space-y-2">{logs.slice(0,5).map(log => <UsageRow key={log.id} log={log} equipment={equipment} />)}{logs.length === 0 && <Empty>No part/fluid usage history yet.</Empty>}</div>
      </Card>
    </div>
  </div>;
}

function TrackingTab({ equipment, live, liveStates, liveDriving, trips, tripsLoading, tripIdentityWarning, trackingUrl }) {
  return <div className="grid xl:grid-cols-3 gap-5">
    <Card title="Tracking State" icon={Navigation}>
      {TRACKED_LINK.has(equipment.bouncie_link_status) && live ? <div className="space-y-3"><Info label="Trip state" value={liveDriving ? "Driving" : "Parked"} icon={Activity} /><Info label="Speed" value={live.speed != null ? `${Math.round(live.speed)} mph` : "—"} icon={Gauge} /><Info label="Odometer" value={live.odometer != null ? `${Number(live.odometer).toLocaleString()} mi` : "—"} icon={Gauge} /><Info label="Last seen" value={live.last_seen_at ? formatDateTimeShort(live.last_seen_at) : "—"} icon={MapPin} />{live.latitude != null && live.longitude != null && <Info label="Coordinates" value={`${Number(live.latitude).toFixed(5)}, ${Number(live.longitude).toFixed(5)}`} icon={MapPin} />}{liveStates.length > 1 && <div className="text-xs leading-relaxed text-amber-700 dark:text-amber-300 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3">{liveStates.length} live-state rows exist for this VIN; the newest row is used.</div>}<Link to={trackingUrl} className="mt-3 min-h-11 w-full sm:w-auto px-3 rounded-lg inline-flex items-center justify-center gap-1 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30">Open dispatch map <Navigation className="w-4 h-4" /></Link></div> : <Empty>{equipment.bouncie_link_status === "not_applicable" ? "Bouncie tracking is not applicable to this asset." : "No proven Bouncie live state is linked."}</Empty>}
    </Card>
    <div className="xl:col-span-2"><Card title="Recent Trips · 7 Days" icon={Navigation}>
      {tripIdentityWarning && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{tripIdentityWarning}</div>}
      {tripsLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div> : <div className="space-y-2">{trips.slice(0,12).map(trip => <div key={trip.transactionId} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40"><div className="text-sm font-medium leading-snug text-gray-800 dark:text-slate-200 break-words">{trip.startTime ? new Date(trip.startTime).toLocaleString() : "Trip"}</div><div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1">{formatMiles(trip.distance || 0)} · avg {Math.round(trip.averageSpeed || 0)} mph</div></div>)}{trips.length === 0 && !tripIdentityWarning && <Empty>No recent Bouncie trips.</Empty>}</div>}
    </Card></div>
  </div>;
}

function MaintenanceTab({ equipment, activeOrders, completedOrders, tasks, maintenanceUrl, retired = false }) {
  return <div className="grid xl:grid-cols-2 gap-5">
    <Card title="Active Work Orders" icon={ClipboardList} action={!retired ? <Link to={`${createPageUrl("FleetWorkOrders")}?new=1&equipment=${encodeURIComponent(equipment.id)}`} className="min-h-11 px-2 rounded-lg inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30"><Plus className="w-3.5 h-3.5" />New work order</Link> : null}>
      <div className="space-y-2">{activeOrders.map(order => <WorkOrderRow key={order.id} order={order} equipment={equipment} />)}{activeOrders.length === 0 && <Empty>No active work orders.</Empty>}</div>
      {completedOrders.length > 0 && <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs uppercase font-semibold text-gray-400 mb-2">Recent completed</div><div className="space-y-1">{completedOrders.slice(0,5).map(order => <div key={order.id} className="py-2 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3 text-sm"><span className="leading-snug text-gray-800 dark:text-slate-200 break-words">{order.work_order_number} · {order.title}</span><span className="text-xs text-gray-400 sm:whitespace-nowrap">{order.completed_date || "—"}</span></div>)}</div></div>}
    </Card>
    <Card title="Maintenance Schedules" icon={CalendarClock} action={<Link to={maintenanceUrl} className="min-h-11 px-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center">Open maintenance workspace</Link>}>
      <div className="space-y-2">{tasks.map(task => <div key={task.id} className="rounded-xl border border-gray-200 dark:border-slate-700 p-3"><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"><div className="min-w-0"><div className="font-medium leading-snug text-gray-900 dark:text-slate-100 break-words">{task.title}</div><div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1">{task.type === "one_off" ? "One-time" : pretty(task.frequency)} · due {task.start_date || "—"}</div></div><div className="self-start shrink-0"><Tag>{pretty(task.status)}</Tag></div></div></div>)}{tasks.length === 0 && <Empty>No maintenance schedules.</Empty>}</div>
    </Card>
  </div>;
}

function InspectionsTab({ equipment, inspections, retired = false }) {
  const passed = inspections.filter(item => item.status === "passed").length;
  const failed = inspections.filter(item => item.status === "failed").length;
  const open = inspections.filter(item => !item.completed_at && ["draft","needs_attention"].includes(item.status)).length;
  const generated = inspections.reduce((sum, item) => sum + (item.generated_work_order_ids?.length || 0), 0);
  const historyUrl = `${createPageUrl("FleetInspections")}?equipment=${encodeURIComponent(equipment.id)}`;
  const startUrl = `${historyUrl}&new=1`;
  return <div className="space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Metric label="Inspections" value={inspections.length} /><Metric label="Passed" value={passed} /><Metric label="Failed" value={failed} attention={failed > 0} /><Metric label="Generated WOs" value={generated} attention={generated > 0} /></div>
    <Card title={`${equipment.name} Inspections`} icon={ClipboardCheck} action={!retired ? <Link to={startUrl} className="min-h-11 px-2 rounded-lg inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30"><Plus className="w-3.5 h-3.5" />Start inspection</Link> : null}>
      <div className="space-y-2">{inspections.slice(0,20).map(inspection => <Link key={inspection.id} to={historyUrl} className={`block min-h-11 rounded-xl border p-3 hover:border-indigo-300 dark:hover:border-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${inspection.status === "failed" ? "border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/10" : inspection.status === "needs_attention" ? "border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/10" : "border-gray-200 dark:border-slate-700"}`}><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"><div className="min-w-0"><div className="font-semibold leading-snug text-gray-900 dark:text-slate-100 break-words">{inspection.template_name}</div><div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1 break-words">{inspection.inspector_name || inspection.inspector_email || "Unknown inspector"}{inspection.failed_item_count ? ` · ${inspection.failed_item_count} failed` : ""}{inspection.generated_work_order_ids?.length ? ` · ${inspection.generated_work_order_ids.length} WO` : ""}</div></div><div className="self-start shrink-0"><Tag>{pretty(inspection.status)}</Tag></div></div><div className="text-xs text-gray-400 mt-2">{inspection.completed_at ? new Date(inspection.completed_at).toLocaleString() : inspection.started_at ? `Started ${new Date(inspection.started_at).toLocaleString()}` : "—"}</div></Link>)}{inspections.length === 0 && <Empty>No Fleet inspections recorded for this asset yet.</Empty>}</div>
      {open > 0 && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">{open} inspection{open === 1 ? "" : "s"} can be resumed from the Fleet Inspections page.</div>}
    </Card>
  </div>;
}

function PartsTab({ equipment, parts, retired = false }) {
  const low = parts.filter(part => part.enable_low_stock_alerts !== false && Number(part.quantity_on_hand ?? 0) <= Number(part.minimum_stock ?? 0));
  const lookupUrl = `${createPageUrl("FleetParts")}?identify=1&equipment=${encodeURIComponent(equipment.id)}`;
  const organizeUrl = `${createPageUrl("FleetParts")}?organize=1&equipment=${encodeURIComponent(equipment.id)}`;
  return <div className="space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Metric label="Compatible parts" value={parts.length} /><Metric label="Low stock" value={low.length} attention={low.length > 0} /><Metric label="Verified identity" value={parts.filter(part => part.identity_status === "verified").length} /><Metric label="Located" value={parts.filter(part => part.storage_bin || part.storage_shelf || part.location).length} /></div>
    <Card title={`${equipment.name} Parts`} icon={PackageOpen} action={!retired ? <div className="flex flex-wrap gap-2"><a href={lookupUrl} target="_blank" rel="noreferrer" className="min-h-11 px-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center">Identify part</a><a href={organizeUrl} target="_blank" rel="noreferrer" className="min-h-11 px-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center">Organize parts</a></div> : null}>
      <div className="grid md:grid-cols-2 gap-3">{parts.map(part => { const photo = part.primary_photo_url || part.photo_urls?.[0]; const location = [part.storage_zone, part.storage_cabinet, part.storage_shelf, part.storage_bin].filter(Boolean).join(" · ") || part.location || "Unlocated"; const isLow = part.enable_low_stock_alerts !== false && Number(part.quantity_on_hand ?? 0) <= Number(part.minimum_stock ?? 0); return <Link key={part.id} to={`${createPageUrl("FleetParts")}?search=${encodeURIComponent(part.part_number || part.part_name || "")}`} className={`min-h-11 rounded-xl border p-3 flex gap-3 hover:border-indigo-300 dark:hover:border-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isLow ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/10" : "border-gray-200 dark:border-slate-700"}`}><div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">{photo ? <img src={photo} alt={part.part_name} className="w-full h-full object-cover" /> : <PackageOpen className="w-5 h-5 text-gray-300" />}</div><div className="min-w-0 flex-1"><div className="font-semibold text-sm leading-snug text-gray-900 dark:text-slate-100 break-words">{part.part_name}</div><div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1 break-words">{part.manufacturer || "—"}{part.part_number ? ` · ${part.part_number}` : ""}</div><div className={`text-xs leading-relaxed mt-1 break-words ${location === "Unlocated" ? "text-amber-700 dark:text-amber-300" : "text-gray-500 dark:text-slate-400"}`}>{location}</div><div className={`mt-1 text-xs font-semibold ${isLow ? "text-amber-700 dark:text-amber-300" : "text-gray-700 dark:text-slate-300"}`}>Stock {part.quantity_on_hand ?? 0}{isLow ? " · low" : ""}</div></div></Link>; })}{parts.length === 0 && <div className="md:col-span-2"><Empty>No Fleet parts are specifically assigned to this equipment yet.</Empty>{!retired && <a href={lookupUrl} target="_blank" rel="noreferrer" className="min-h-11 mt-2 px-3 rounded-lg inline-flex items-center text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30">Identify and assign the first part</a>}</div>}</div>
    </Card>
  </div>;
}

function FuelTab({ equipment, retired = false }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const year = new Date().getFullYear();
  useEffect(() => {
    let mounted = true;
    setLoading(true); setError("");
    invokeFleet("fleetFuelAction", { action: "summary", equipment_id: equipment.id, start_date: `${year}-01-01`, end_date: `${year}-12-31` })
      .then(({ data }) => { if (!mounted) return; if (data?.error) throw new Error(data.error); setSummary(data || null); })
      .catch(err => mounted && setError(err?.message || "Unable to load this asset's fuel history."))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [equipment.id, year]);
  const metrics = summary?.metrics || {};
  const fuelUrl = `${createPageUrl("FleetFuel")}?equipment=${encodeURIComponent(equipment.id)}&year=${year}`;
  const recordUrl = `${createPageUrl("FleetFuel")}?equipment=${encodeURIComponent(equipment.id)}&new=1`;
  const money = value => Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
  const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return <div className="space-y-5">
    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
    {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> : <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Metric label={`${year} fuel spend`} value={money(metrics.fuel_cost)} /><Metric label="Gallons" value={number(metrics.gallons)} /><Metric label="Fill-to-fill MPG" value={metrics.fill_to_fill_mpg == null ? "—" : number(metrics.fill_to_fill_mpg)} /><Metric label="Fuel + maintenance" value={money(metrics.total_operating_cost)} /></div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">MPG and per-mile figures are fill-to-fill estimates from consecutive fuel-entry odometer readings. Fuel + maintenance is recorded operating cost, not total cost of ownership.</div>
      <Card title={`${equipment.name} Fuel · ${year}`} icon={Fuel} action={<div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto"><Link to={fuelUrl} className="min-h-11 px-3 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center">Full fuel history</Link>{!retired && <Link to={recordUrl} className="min-h-11 px-3 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center">Record fuel</Link>}</div>}>
        <div className="space-y-2">{(summary?.entries || []).slice().sort((a,b)=>(Date.parse(b.fueled_at || "")||0)-(Date.parse(a.fueled_at || "")||0)).slice(0,8).map(entry => <div key={entry.id} className="rounded-xl border border-gray-200 dark:border-slate-700 p-3"><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"><div className="min-w-0"><div className="font-medium leading-snug text-gray-900 dark:text-slate-100 break-words">{entry.fueled_at ? new Date(entry.fueled_at).toLocaleString() : "Fuel entry"}{entry.vendor ? ` · ${entry.vendor}` : ""}</div><div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1 break-words">{number(entry.gallons)} gal · {money(entry.total_cost)} · {money(entry.price_per_gallon)}/gal{entry.odometer != null ? ` · ${Number(entry.odometer).toLocaleString()} mi` : ""}</div></div>{entry.receipt_url && <a href={entry.receipt_url} target="_blank" rel="noreferrer" className="min-h-11 self-start px-3 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center">Receipt</a>}</div></div>)}{!(summary?.entries || []).length && <Empty>No fuel entries are recorded for this asset in {year}.</Empty>}</div>
      </Card>
    </>}
  </div>;
}

function WarrantyTab({ equipment, retired = false, isAdmin = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    setLoading(true); setError("");
    invokeFleet("fleetWarrantyAction", { action: "portfolio", equipment_id: equipment.id })
      .then(({ data }) => { if (!mounted) return; if (data?.error) throw new Error(data.error); setRows(data?.rows || []); })
      .catch(err => mounted && setError(err?.message || "Unable to load this asset's warranties."))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [equipment.id]);
  const attention = rows.filter(row => ["expired","orphaned","expiring_soon"].includes(row.effective_status)).length;
  const active = rows.filter(row => row.effective_status === "active").length;
  const claimed = rows.filter(row => row.effective_status === "claimed").length;
  const listUrl = `${createPageUrl("FleetWarranties")}?equipment=${encodeURIComponent(equipment.id)}`;
  const addUrl = `${createPageUrl("FleetWarranties")}?equipment=${encodeURIComponent(equipment.id)}&new=1`;
  return <div className="space-y-5">
    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
    {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> : <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Metric label="Warranties" value={rows.length} /><Metric label="Active" value={active} /><Metric label="Needs attention" value={attention} attention={attention>0} /><Metric label="Claimed" value={claimed} /></div>
      <Card title={`${equipment.name} Warranties`} icon={ShieldCheck} action={<div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto"><Link to={listUrl} className="min-h-11 px-3 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center">Warranty center</Link>{isAdmin&&!retired&&<Link to={addUrl} className="min-h-11 px-3 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center">Add warranty</Link>}</div>}>
        <div className="space-y-2">{rows.map(row=>{const warranty=row.warranty||{};const danger=['expired','orphaned'].includes(row.effective_status);const warn=row.effective_status==='expiring_soon';return <Link key={warranty.id} to={listUrl} className={`block min-h-11 rounded-xl border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${danger?"border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/10":warn?"border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/10":"border-gray-200 dark:border-slate-700"}`}><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"><div className="min-w-0"><div className="font-semibold leading-snug text-gray-900 dark:text-slate-100 break-words">{warranty.name}</div><div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1 break-words">{pretty(warranty.category)}{warranty.provider?` · ${warranty.provider}`:""}{warranty.end_date?` · ends ${warranty.end_date}`:""}</div></div><div className="self-start shrink-0"><Tag>{pretty(row.effective_status)}</Tag></div></div>{row.reasons?.[0]&&<div className={`text-xs leading-relaxed mt-2 break-words ${danger?"text-red-700 dark:text-red-300":warn?"text-amber-700 dark:text-amber-300":"text-gray-500 dark:text-slate-400"}`}>{row.reasons[0]}</div>}</Link>})}{rows.length===0&&<Empty>No warranty coverage is recorded for this asset.</Empty>}</div>
      </Card>
    </>}
  </div>;
}

function AssignmentsTab({ equipment, retired = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    setLoading(true); setError("");
    invokeFleet("fleetReservationAction", { action: "list", equipment_id: equipment.id })
      .then(({ data }) => { if (!mounted) return; if (data?.error) throw new Error(data.error); setRows(data?.reservations || []); })
      .catch(err => mounted && setError(err?.message || "Unable to load this asset's assignments."))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [equipment.id]);
  const now = Date.now();
  const current = rows.filter(row => row.status === "checked_out" || (row.status === "reserved" && Date.parse(row.start_at || "") <= now && Date.parse(row.end_at || "") >= now));
  const upcoming = rows.filter(row => row.status === "reserved" && Date.parse(row.start_at || "") > now).sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at));
  const history = rows.filter(row => ["returned","cancelled"].includes(row.status)).sort((a,b)=>(Date.parse(b.returned_at||b.end_at||"")||0)-(Date.parse(a.returned_at||a.end_at||"")||0));
  const pastDue = rows.filter(row => row.status === "reserved" && Date.parse(row.end_at || "") < now);
  const centerUrl = `${createPageUrl("FleetReservations")}?equipment=${encodeURIComponent(equipment.id)}`;
  const reserveUrl = `${createPageUrl("FleetReservations")}?equipment=${encodeURIComponent(equipment.id)}&new=1`;
  return <div className="space-y-5">
    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
    {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> : <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Metric label="Current / checked out" value={current.length} attention={current.length>0} /><Metric label="Upcoming" value={upcoming.length} /><Metric label="Past due" value={pastDue.length} attention={pastDue.length>0} /><Metric label="History" value={history.length} /></div>
      <Card title={`${equipment.name} Assignments`} icon={CalendarDays} action={<div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto"><Link to={centerUrl} className="min-h-11 px-3 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center">Assignment center</Link>{!retired&&<Link to={reserveUrl} className="min-h-11 px-3 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center">Reserve</Link>}</div>}>
        <div className="space-y-3">{[...current,...pastDue,...upcoming.slice(0,6)].map(row=>{const start=new Date(row.start_at);const end=new Date(row.end_at);const overdue=row.status==='reserved'&&end.getTime()<now;return <Link key={row.id} to={centerUrl} className={`block min-h-11 rounded-xl border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${overdue?"border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/10":row.status==='checked_out'?"border-indigo-200 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/10":"border-gray-200 dark:border-slate-700"}`}><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"><div className="min-w-0"><div className="font-semibold leading-snug text-gray-900 dark:text-slate-100 break-words">{row.reserved_by_name||row.reserved_by_email}</div><div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1 break-words">{row.assignment_label||"Fleet assignment"}{row.job_site?` · ${row.job_site}`:""}</div></div><div className="self-start shrink-0"><Tag>{overdue?"past due":pretty(row.status)}</Tag></div></div><div className="text-xs leading-relaxed text-gray-400 mt-2 break-words">{Number.isNaN(start.getTime())?row.start_at:start.toLocaleString()} → {Number.isNaN(end.getTime())?row.end_at:end.toLocaleString()}</div></Link>})}{current.length===0&&pastDue.length===0&&upcoming.length===0&&<Empty>No active or upcoming assignments for this asset.</Empty>}</div>
      </Card>
    </>}
  </div>;
}

function HistoryTab({ equipment, completedOrders, logs, requests }) {
  return <div className="grid xl:grid-cols-2 gap-5">
    <Card title="Maintenance History" icon={History}>
      <div className="space-y-2">{completedOrders.map(order => <Link key={order.id} to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(order.id)}&equipment=${encodeURIComponent(equipment.id)}`} className="block min-h-11 rounded-xl border border-gray-200 dark:border-slate-700 p-3 hover:border-indigo-300 dark:hover:border-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><div className="font-medium leading-snug text-gray-900 dark:text-slate-100 break-words">{order.work_order_number} · {order.title}</div><div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1">Completed {order.completed_date || "—"}{order.total_cost != null ? ` · $${Number(order.total_cost).toFixed(2)}` : ""}</div></Link>)}{completedOrders.length === 0 && <Empty>No completed maintenance work orders.</Empty>}</div>
    </Card>
    <div className="space-y-5">
      <Card title="Parts & Fluids Usage" icon={PackageOpen}><div className="space-y-2">{logs.map(log => <UsageRow key={log.id} log={log} equipment={equipment} />)}{logs.length === 0 && <Empty>No usage history.</Empty>}</div></Card>
      <Card title="Requests" icon={ShoppingCart}><div className="space-y-2">{requests.map(request => <div key={request.id} className="rounded-xl border border-gray-200 dark:border-slate-700 p-3"><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"><div className="min-w-0"><div className="font-medium leading-snug text-gray-900 dark:text-slate-100 break-words">{request.item_name}</div><div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1 break-words">{pretty(request.item_type)} · qty {request.quantity_needed ?? "—"}{request.requested_by_person ? ` · ${request.requested_by_person}` : ""}</div></div><div className="self-start shrink-0"><Tag>{pretty(request.status)}</Tag></div></div></div>)}{requests.length === 0 && <Empty>No Fleet requests linked to this asset.</Empty>}</div></Card>
    </div>
  </div>;
}

function AlertsTab({ notifications }) {
  const unread = notifications.filter(note => !note.is_read).length;
  return <Card title="Bouncie Alerts & Notifications" icon={Bell} action={unread > 0 ? <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{unread} unread</span> : null}><div className="space-y-2">{notifications.map(note => <div key={note.id} className={`min-h-11 rounded-xl border p-3 ${note.is_read ? "border-gray-200 dark:border-slate-700" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20"}`}><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"><div className="min-w-0"><div className="font-medium leading-snug text-gray-900 dark:text-slate-100 break-words">{note.title || pretty(note.event_type)}</div>{note.description && <div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1 whitespace-pre-wrap break-words">{note.description}</div>}</div>{!note.is_read && <span className="self-start shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] uppercase font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">Unread</span>}</div><div className="text-xs text-gray-400 mt-2">{note.timestamp ? formatDateTimeShort(note.timestamp) : "—"}</div></div>)}{notifications.length === 0 && <Empty>No Bouncie notifications for this VIN.</Empty>}</div></Card>;
}

function DetailsTab({ equipment, metadata, isAdmin, editingMeta, setEditingMeta, metaForm, setMetaForm, savingMeta, saveMetadata }) {
  return <div className="space-y-5">
    <Card title="Asset Profile" icon={Truck}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"><ProfileField label="Asset type" value={pretty(equipment.type)} /><ProfileField label="Location" value={equipment.location || "—"} /><ProfileField label="Serial / original ID" value={equipment.serial_number || "—"} /><ProfileField label="Mileage / Hours" value={equipment.mileage_hours != null ? Number(equipment.mileage_hours).toLocaleString() : "—"} /><ProfileField label="Purchase date" value={equipment.purchase_date || "—"} /><ProfileField label="Last service" value={equipment.last_service_date || "—"} /><ProfileField label="Next service due" value={equipment.next_service_due || "—"} /><ProfileField label="License plate" value={metadata?.license_plate || equipment.license_plate || "—"} /></div>
      {equipment.engine_details && <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-1">Engine / Powertrain</div><div className="text-sm leading-relaxed text-gray-700 dark:text-slate-300 whitespace-pre-wrap break-words">{equipment.engine_details}</div></div>}
      {equipment.notes && <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-1">Equipment Notes</div><div className="text-sm leading-relaxed text-gray-700 dark:text-slate-300 whitespace-pre-wrap break-words">{equipment.notes}</div></div>}
    </Card>

    <Card title="CCS Vehicle Metadata" icon={Truck} action={isAdmin && !editingMeta ? <button type="button" onClick={() => { setMetaForm(metadataSeed(metadata, equipment)); setEditingMeta(true); }} className="min-h-11 px-3 rounded-lg inline-flex items-center justify-center gap-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30"><Pencil className="w-4 h-4" />Edit metadata</button> : null}>
      {!equipment.vin ? <Empty>This asset has no VIN, so VIN-keyed FleetVehicleMetadata does not apply.</Empty> : editingMeta ? <div className="space-y-4">
        {META_GROUPS.map(group => <section key={group.title} className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden"><div className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40"><h3 className="font-semibold text-gray-900 dark:text-slate-100">{group.title}</h3><p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-slate-400">{group.description}</p></div><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">{group.keys.map(key => { const field = META_FIELDS.find(item => item.key === key); return field ? <label key={field.key} className="text-sm"><span className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{field.label}</span><input type={field.type || "text"} value={metaForm[field.key] || ""} onChange={event => setMetaForm(prev => ({ ...prev, [field.key]: event.target.value }))} className="w-full min-h-11 px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700" /></label> : null; })}</div></section>)}
        <section className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden"><div className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40"><h3 className="font-semibold text-gray-900 dark:text-slate-100">Vehicle notes</h3><p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-slate-400">Administrative Fleet notes only; this does not change Bouncie vehicle identity or telemetry.</p></div><div className="p-4 space-y-4"><label className="text-sm block"><span className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Maintenance Notes</span><textarea rows={3} value={metaForm.maintenance_notes || ""} onChange={event => setMetaForm(prev => ({ ...prev, maintenance_notes: event.target.value }))} className="w-full min-h-11 px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700 resize-y" /></label><label className="text-sm block"><span className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">General Notes</span><textarea rows={3} value={metaForm.notes || ""} onChange={event => setMetaForm(prev => ({ ...prev, notes: event.target.value }))} className="w-full min-h-11 px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700 resize-y" /></label></div></section>
        <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 pt-1"><button type="button" onClick={() => setEditingMeta(false)} disabled={savingMeta} className="min-h-11 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center justify-center gap-1 disabled:opacity-50"><X className="w-4 h-4" />Cancel</button><button type="button" onClick={saveMetadata} disabled={savingMeta} className="min-h-11 px-3 py-2 rounded-lg bg-indigo-600 text-white inline-flex items-center justify-center gap-1 disabled:opacity-50">{savingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save Metadata</button></div>
      </div> : <div className="space-y-4">{META_GROUPS.map(group => <section key={group.title} className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden"><div className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40"><h3 className="font-semibold text-gray-900 dark:text-slate-100">{group.title}</h3><p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-slate-400">{group.description}</p></div><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-4">{group.keys.map(key => { const field = META_FIELDS.find(item => item.key === key); return field ? <ProfileField key={field.key} label={field.label} value={metadata?.[field.key] || (field.key === "license_plate" ? equipment.license_plate : "") || "—"} /> : null; })}</div></section>)}{metadata?.maintenance_notes && <div className="pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-1">Maintenance Notes</div><div className="text-sm leading-relaxed text-gray-700 dark:text-slate-300 whitespace-pre-wrap break-words">{metadata.maintenance_notes}</div></div>}{metadata?.notes && <div className="pt-4 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase text-gray-400 mb-1">General Notes</div><div className="text-sm leading-relaxed text-gray-700 dark:text-slate-300 whitespace-pre-wrap break-words">{metadata.notes}</div></div>}</div>}
    </Card>
  </div>;
}

const META_GROUPS = [
  { title: "Assignment & registration", description: "CCS administrative identity, assignment, and registration details for this VIN.", keys: ["license_plate", "assigned_driver", "department", "unit_number", "registration_expiration_date"] },
  { title: "Insurance", description: "Policy, carrier, agent, and coverage dates kept with the Fleet vehicle record.", keys: ["insurance_provider", "insurance_policy_number", "insurance_agent", "insurance_agent_contact", "insurance_effective_date", "insurance_expiration_date"] },
];

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
function WorkOrderRow({ order, equipment }) { return <Link to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(order.id)}&equipment=${encodeURIComponent(equipment.id)}`} className="block min-h-11 rounded-xl border border-gray-200 dark:border-slate-700 p-3 hover:border-indigo-300 dark:hover:border-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"><div className="min-w-0"><div className="font-medium leading-snug text-gray-900 dark:text-slate-100 break-words">{order.work_order_number} · {order.title}</div><div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1 break-words">{pretty(order.priority)} priority · {order.assigned_to || "Unassigned"}</div></div><div className="self-start shrink-0"><Tag>{pretty(order.status)}</Tag></div></div></Link>; }
function UsageRow({ log, equipment }) { return <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 py-2 border-b border-gray-100 dark:border-slate-800 last:border-0"><div className="min-w-0"><div className="text-sm leading-snug text-gray-800 dark:text-slate-200 break-words">{log.item_name} · {log.quantity_used} {log.unit || ""}</div><div className="text-xs text-gray-400 break-words">{pretty(log.item_type)}{log.recorded_by ? ` · ${log.recorded_by}` : ""}</div>{log.notes && <div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1 whitespace-pre-wrap break-words">{log.notes}</div>}{log.work_order_id && <Link to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(log.work_order_id)}&equipment=${encodeURIComponent(equipment.id)}`} className="min-h-11 -ml-2 px-2 rounded-lg inline-flex items-center mt-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30">Open linked work order</Link>}</div><span className="text-xs text-gray-400 sm:whitespace-nowrap">{log.created_date ? new Date(log.created_date).toLocaleDateString() : "—"}</span></div>; }
function Card({ title, icon: Icon, action = null, children }) { return <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm"><div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"><h2 className="font-semibold leading-snug text-gray-900 dark:text-slate-100 flex items-start gap-2 break-words"><Icon className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />{title}</h2>{action && <div className="flex flex-wrap items-center gap-1 sm:justify-end">{action}</div>}</div><div className="p-4">{children}</div></section>; }
function ProfileField({ label, value }) { return <div><div className="text-xs text-gray-400">{label}</div><div className="text-sm text-gray-800 dark:text-slate-200 mt-1 break-words">{value}</div></div>; }
function Metric({ label, value, attention = false }) { return <div className={`rounded-xl border p-4 ${attention ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}><div className="text-xs text-gray-400">{label}</div><div className={`text-2xl font-bold mt-1 ${attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100"}`}>{value}</div></div>; }
function HealthTag({ health }) { const style = health?.score == null ? "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300" : health.score >= 90 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : health.score >= 75 ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" : health.score >= 60 ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"; return <span title={health?.signals?.join(" · ") || "Fleet health"} className={`text-xs px-2 py-1 rounded-full font-semibold ${style}`}>{health?.score == null ? "Health N/A" : `Health ${health.score} · ${health.label}`}</span>; }
function Tag({ children }) { return <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 capitalize">{children}</span>; }
function Empty({ children }) { return <div className="text-sm text-gray-400 py-4">{children}</div>; }
function Info({ label, value, icon: Icon }) { return <div className="flex items-start gap-2"><Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /><div className="min-w-0"><div className="text-xs text-gray-400">{label}</div><div className="text-sm leading-relaxed text-gray-800 dark:text-slate-200 mt-0.5 break-words">{value}</div></div></div>; }
