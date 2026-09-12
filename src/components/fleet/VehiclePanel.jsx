import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowRight,
  Battery,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Cpu,
  Fuel,
  Gauge,
  MapPin,
  Navigation,
  Plus,
  Route,
  Wrench,
  X,
} from "lucide-react";
import TripsTab from "./TripsTab";
import StatsTab from "./StatsTab";
import NotificationsTab from "./NotificationsTab";
import DetailsTab from "./DetailsTab";
import MaintenanceTab from "./MaintenanceTab";

const TABS = [
  { key: "live", label: "LIVE" },
  { key: "trips", label: "TRIPS" },
  { key: "maintenance", label: "MAINTENANCE" },
  { key: "alerts", label: "ALERTS" },
  { key: "details", label: "DETAILS" },
];

function speedOf(stats = {}) {
  const raw = typeof stats.speed === "number" ? stats.speed : stats.location?.speed;
  return Number.isFinite(Number(raw)) ? Math.max(0, Math.round(Number(raw))) : null;
}

function lastUpdateOf(vehicle) {
  const stats = vehicle?.stats || {};
  const raw = stats.lastUpdated || stats.lastUpdate || stats.timestamp || stats.location?.timestamp || vehicle?.updatedAt || vehicle?.updated_at;
  if (!raw) return "Bouncie live state";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "Bouncie live state" : date.toLocaleString();
}

function directionsUrl(stats = {}) {
  const loc = stats.location || {};
  if (loc.lat == null || loc.lon == null) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${loc.lat},${loc.lon}`)}`;
}

function streetViewUrl(stats = {}) {
  const loc = stats.location || {};
  if (loc.lat == null || loc.lon == null) return "";
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(`${loc.lat},${loc.lon}`)}`;
}

export default function VehiclePanel({
  vehicle,
  fleetEquipment,
  fleetLinkBasis = null,
  fleetOpenWorkOrders = [],
  fleetMaintenanceTasks = [],
  fleetEquipmentLogs = [],
  fleetMaintenanceLoading = false,
  trips,
  tripsLoading,
  notifications,
  onClearNotifications,
  onMarkNotificationRead,
  onOpenAlertSettings,
  canManageAlerts = false,
  onClose,
  daysBack,
  onDaysBackChange,
  avgBy,
  onAvgByChange,
  selectedTripId,
  onSelectTrip,
  docked = false,
}) {
  const [activeTab, setActiveTab] = useState("live");
  const stats = vehicle?.stats || {};
  const model = vehicle?.model || {};
  const loc = stats.location || {};

  useEffect(() => { setActiveTab("live"); }, [vehicle?.vin]);

  const unreadCount = notifications.filter(note => !note.is_read).length;
  const linkConflict = ["vin_conflict", "imei_conflict", "imei_vin_conflict"].includes(fleetLinkBasis);
  const equipmentDetailUrl = fleetEquipment ? `${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(fleetEquipment.id)}` : createPageUrl("FleetEquipment");
  const newWorkOrderUrl = fleetEquipment ? `${createPageUrl("FleetWorkOrders")}?new=1&equipment=${encodeURIComponent(fleetEquipment.id)}` : createPageUrl("FleetWorkOrders");
  const maintenanceUrl = fleetEquipment ? `${createPageUrl("FleetMaintenance")}?equipment=${encodeURIComponent(fleetEquipment.id)}` : createPageUrl("FleetMaintenance");
  const speed = speedOf(stats);
  const driving = !!stats.isRunning || (speed != null && speed > 0);
  const directionHref = directionsUrl(stats);
  const streetHref = streetViewUrl(stats);
  const displayName = vehicle?.nickName || model.name || "Vehicle";
  const vehicleDescription = [model.year, model.make, model.name].filter(Boolean).join(" ") || vehicle?.vin || "Bouncie vehicle";
  const engineWarning = !!stats.mil?.milOn;
  const dtcCount = stats.mil?.qualifiedDtcList?.length || 0;

  const shellClass = docked
    ? "h-full w-[410px] xl:w-[440px] shrink-0 flex flex-col bg-white dark:bg-slate-900 overflow-hidden border-l border-gray-200 dark:border-slate-700"
    : "absolute top-14 inset-x-2 bottom-2 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[440px] sm:max-w-[92vw] z-20 flex flex-col bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden border border-gray-200 dark:border-slate-700";

  return (
    <aside className={shellClass} aria-label={`${displayName} tracking panel`}>
      <div className="border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="p-3 sm:p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className={`mt-1 w-3 h-3 rounded-full shrink-0 ${driving ? "bg-emerald-500" : "bg-blue-500"}`} title={driving ? "Driving" : "Parked"} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 truncate">{displayName}</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate">{vehicleDescription}</p></div>
                {onClose && <button type="button" onClick={onClose} className="min-h-11 min-w-11 p-2 -mr-2 -mt-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" title="Close vehicle panel" aria-label="Close vehicle panel"><X className="w-4 h-4 text-gray-500 dark:text-slate-400 mx-auto" /></button>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-slate-300">
                <span className={`font-semibold ${driving ? "text-emerald-700 dark:text-emerald-300" : "text-blue-700 dark:text-blue-300"}`}>{driving ? "Driving" : "Parked"}</span>
                <span>{speed != null ? `${speed} mph` : "Speed —"}</span>
                <span>{stats.odometer != null ? `${Math.round(Number(stats.odometer)).toLocaleString()} mi` : "Mileage —"}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-1.5 text-xs">
            <div className="flex items-start gap-2 text-gray-600 dark:text-slate-300"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" /><span className="line-clamp-2">{loc.address || (loc.lat != null && loc.lon != null ? `${Number(loc.lat).toFixed(5)}, ${Number(loc.lon).toFixed(5)}` : "Location unavailable")}</span></div>
            <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400"><Clock3 className="w-3.5 h-3.5 shrink-0" /><span>Last update: {lastUpdateOf(vehicle)}</span></div>
            <div className={`flex items-center gap-2 ${engineWarning ? "text-red-700 dark:text-red-300 font-semibold" : "text-gray-500 dark:text-slate-400"}`}><Wrench className="w-3.5 h-3.5 shrink-0" /><span>{engineWarning ? `Check engine ON${dtcCount ? ` · ${dtcCount} DTC${dtcCount === 1 ? "" : "s"}` : ""}` : "Engine/MIL normal"}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link to={equipmentDetailUrl} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-2 text-xs font-semibold text-white"><ArrowRight className="w-3.5 h-3.5" />Open Vehicle</Link>
            {fleetEquipment && fleetEquipment.status !== "retired" ? <Link to={newWorkOrderUrl} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-300 px-2.5 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:text-indigo-300"><Plus className="w-3.5 h-3.5" />New Work Order</Link> : <span className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-semibold text-gray-400 dark:border-slate-700" title={fleetEquipment?.status === "retired" ? "Reactivate this Fleet equipment before creating new work." : "A proven FleetEquipment link is required before creating a prelinked Fleet work order."}><Plus className="w-3.5 h-3.5" />New Work Order</span>}
            {directionHref ? <a href={directionHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-2.5 py-2 text-xs font-semibold text-gray-700 dark:text-slate-200"><Route className="w-3.5 h-3.5" />Directions</a> : <span className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-2.5 py-2 text-xs text-gray-400"><Route className="w-3.5 h-3.5" />Directions</span>}
            {streetHref ? <a href={streetHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-2.5 py-2 text-xs font-semibold text-gray-700 dark:text-slate-200"><Navigation className="w-3.5 h-3.5" />Street View</a> : <span className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-2.5 py-2 text-xs text-gray-400"><Navigation className="w-3.5 h-3.5" />Street View</span>}
          </div>
        </div>

        <div role="tablist" aria-label="Vehicle detail sections" className="flex items-center overflow-x-auto overscroll-x-contain border-t border-gray-100 dark:border-slate-800 px-1 sm:px-2">
          {TABS.map(tab => (
            <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} onClick={() => setActiveTab(tab.key)} className={`relative shrink-0 min-h-11 px-2 sm:px-2.5 py-3 text-[10px] font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${activeTab === tab.key ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-slate-400"}`}>
              {tab.label}
              {tab.key === "alerts" && unreadCount > 0 && <span className="ml-1 inline-flex min-w-[17px] h-[17px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] text-white">{unreadCount}</span>}
              {activeTab === tab.key && <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-full bg-blue-600" />}
            </button>
          ))}
        </div>
      </div>

      {!fleetEquipment && (
        <div className={`mx-3 mt-3 rounded-lg border p-3 ${linkConflict ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"}`}>
          <div className={`text-[10px] uppercase tracking-wide font-semibold ${linkConflict ? "text-red-600" : "text-amber-600"}`}>CCS Fleet Maintenance</div>
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-0.5">{linkConflict ? "Fleet identity conflict" : "No proven FleetEquipment link"}</div>
          <div className="text-xs text-gray-600 dark:text-slate-300 mt-1">{fleetLinkBasis === "imei_vin_conflict" ? "This Bouncie IMEI matches a Fleet record, but the current Bouncie VIN conflicts with that Fleet VIN. Maintenance remains intentionally unlinked." : linkConflict ? "Multiple Fleet equipment records match this Bouncie identity. Maintenance remains intentionally unlinked until an admin resolves the conflict." : "Tracking remains available. CCS will not guess which maintenance record belongs to this Bouncie vehicle."}</div>
          <Link to={equipmentDetailUrl} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Review Fleet equipment <ArrowRight className="w-3.5 h-3.5" /></Link>
        </div>
      )}

      {fleetEquipment && fleetLinkBasis === "imei" && <div className="mx-3 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Linked by unique trusted Bouncie IMEI because no contradictory non-empty VIN evidence was found. VIN remains the primary Fleet identity.</div>}

      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "live" && <LiveTab stats={stats} fleetEquipment={fleetEquipment} fleetOpenWorkOrders={fleetOpenWorkOrders} fleetMaintenanceTasks={fleetMaintenanceTasks} maintenanceUrl={maintenanceUrl} trips={trips} tripsLoading={tripsLoading} daysBack={daysBack} onDaysBackChange={onDaysBackChange} avgBy={avgBy} onAvgByChange={onAvgByChange} />}
        {activeTab === "trips" && <TripsTab vehicle={vehicle} trips={trips} loading={tripsLoading} selectedTripId={selectedTripId} onSelectTrip={onSelectTrip} />}
        {activeTab === "maintenance" && <MaintenanceTab equipment={fleetEquipment} openWorkOrders={fleetOpenWorkOrders} tasks={fleetMaintenanceTasks} logs={fleetEquipmentLogs} loading={fleetMaintenanceLoading} />}
        {activeTab === "alerts" && <NotificationsTab notifications={notifications} vehicle={vehicle} onClearAll={onClearNotifications} onMarkRead={onMarkNotificationRead} onOpenSettings={onOpenAlertSettings} canManageAlerts={canManageAlerts} />}
        {activeTab === "details" && <DetailsTab vehicle={vehicle} fleetEquipment={fleetEquipment} />}
      </div>

      <div className="flex items-center justify-around border-t border-gray-200 dark:border-slate-700 py-3 px-2 bg-gray-50 dark:bg-slate-950">
        <StatusIcon icon={Fuel} label="Fuel" value={stats.fuelLevel != null ? `${Math.round(stats.fuelLevel)}%` : "--"} ok={stats.fuelLevel == null || stats.fuelLevel > 25} />
        <StatusIcon icon={Battery} label="Battery" value={stats.mil?.battery?.status || "--"} ok={stats.mil?.battery?.status !== "low" && stats.mil?.battery?.status !== "critical"} />
        <StatusIcon icon={Wrench} label="Engine" value={stats.mil?.milOn ? "On" : "OK"} ok={!stats.mil?.milOn} badge={stats.mil?.milOn ? dtcCount : 0} />
        <StatusIcon icon={Cpu} label="Device" value={driving ? "Driving" : "Parked"} ok />
      </div>
    </aside>
  );
}

function LiveTab({ stats, fleetEquipment, fleetOpenWorkOrders, fleetMaintenanceTasks, maintenanceUrl, trips, tripsLoading, daysBack, onDaysBackChange, avgBy, onAvgByChange }) {
  const pendingSchedules = useMemo(() => fleetMaintenanceTasks.filter(task => ["pending", "overdue", "in_progress"].includes(task.status)), [fleetMaintenanceTasks]);
  const next = pendingSchedules.filter(task => task.start_date).slice().sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0] || null;
  return (
    <div>
      <div className="p-4 grid grid-cols-2 gap-3">
        <LiveMetric icon={Gauge} label="Odometer" value={stats.odometer != null ? `${Math.round(Number(stats.odometer)).toLocaleString()} mi` : "—"} />
        <LiveMetric icon={Fuel} label="Fuel" value={stats.fuelLevel != null ? `${Math.round(stats.fuelLevel)}%` : "—"} />
        <LiveMetric icon={ClipboardList} label="Active Fleet WOs" value={fleetEquipment ? fleetOpenWorkOrders.length : "—"} attention={fleetOpenWorkOrders.some(order => ["high", "critical"].includes(order.priority))} />
        <LiveMetric icon={Wrench} label="Next maintenance" value={fleetEquipment ? (next?.start_date || "None scheduled") : "Unlinked"} attention={next?.status === "overdue"} />
      </div>
      {fleetEquipment && <div className="px-4 pb-3"><Link to={maintenanceUrl} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">Open {fleetEquipment.name} maintenance workspace <ArrowRight className="w-3.5 h-3.5" /></Link></div>}
      <div className="border-t border-gray-100 dark:border-slate-800"><StatsTab trips={trips} loading={tripsLoading} daysBack={daysBack} onDaysBackChange={onDaysBackChange} avgBy={avgBy} onAvgByChange={onAvgByChange} /></div>
    </div>
  );
}

function LiveMetric({ icon: Icon, label, value, attention = false }) {
  return <div className={`rounded-xl border p-3 ${attention ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/60"}`}><Icon className="w-4 h-4 text-gray-400" /><div className="text-[10px] uppercase font-semibold tracking-wide text-gray-400 mt-2">{label}</div><div className={`text-sm font-bold mt-1 ${attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100"}`}>{value}</div></div>;
}

function StatusIcon({ icon: Icon, label, value, ok, badge = 0 }) {
  return (
    <div className="flex flex-col items-center gap-1 relative">
      <div className="relative">
        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-slate-800"><Icon className="w-5 h-5" style={{ color: ok ? "#6b7280" : "#dc3545" }} /></div>
        {ok && <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center bg-emerald-600"><CheckCircle2 className="w-3 h-3 text-white" /></span>}
        {badge > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center bg-amber-500">{badge}</span>}
      </div>
      <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">{label}</span>
      <span className="text-[10px] text-gray-700 dark:text-slate-300">{value}</span>
    </div>
  );
}
