import { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { X, Fuel, Battery, Wrench, Cpu, CheckCircle2, ClipboardList, ArrowRight, Plus } from "lucide-react";
import TripsTab from "./TripsTab";
import StatsTab from "./StatsTab";
import NotificationsTab from "./NotificationsTab";
import DetailsTab from "./DetailsTab";
import MaintenanceTab from "./MaintenanceTab";

const TABS = [
  { key: "trips", label: "TRIPS" },
  { key: "stats", label: "STATS" },
  { key: "notifications", label: "ALERTS" },
  { key: "maintenance", label: "MAINT" },
  { key: "details", label: "DETAILS" },
];

export default function VehiclePanel({
  vehicle, fleetEquipment, fleetLinkBasis = null, fleetOpenWorkOrders = [], fleetMaintenanceTasks = [], fleetEquipmentLogs = [], fleetMaintenanceLoading = false, trips, tripsLoading, notifications, onClearNotifications, onMarkNotificationRead,
  onOpenAlertSettings, canManageAlerts = false, onClose, daysBack, onDaysBackChange, avgBy, onAvgByChange,
  onTripsRefresh, selectedTripId, onSelectTrip
}) {
  const [activeTab, setActiveTab] = useState("trips");
  const stats = vehicle?.stats || {};

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const linkConflict = ["vin_conflict", "imei_conflict", "imei_vin_conflict"].includes(fleetLinkBasis);
  const equipmentDetailUrl = fleetEquipment ? `${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(fleetEquipment.id)}` : createPageUrl("FleetEquipment");
  const newWorkOrderUrl = fleetEquipment ? `${createPageUrl("FleetWorkOrders")}?new=1&equipment=${encodeURIComponent(fleetEquipment.id)}` : createPageUrl("FleetWorkOrders");

  return (
    <div className="absolute top-14 inset-x-2 bottom-2 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[440px] sm:max-w-[92vw] z-20 flex flex-col bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden border border-gray-200 dark:border-slate-700">
      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 dark:border-slate-700 px-1 sm:px-2 pt-2 relative">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 px-1 sm:px-3 py-3 text-[10px] sm:text-xs font-semibold tracking-wide transition-colors relative ${activeTab === t.key ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-slate-400"}`}
          >
            {t.label}
            {t.key === "notifications" && unreadCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white" style={{ background: "#dc3545" }}>
                {unreadCount}
              </span>
            )}
            {activeTab === t.key && (
              <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-full" style={{ background: "#2b73ff" }} />
            )}
          </button>
        ))}
        <button onClick={onClose} className="ml-1 p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded" title="Close">
          <X className="w-4 h-4 text-gray-500 dark:text-slate-400" />
        </button>
      </div>

      <div className={`mx-3 mt-3 rounded-lg border p-3 ${fleetEquipment ? "border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/30" : linkConflict ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"}`}>
        {fleetEquipment ? <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="text-[10px] uppercase tracking-wide font-semibold text-indigo-500">CCS Fleet Maintenance</div><div className="font-semibold text-sm text-gray-900 dark:text-slate-100 truncate mt-0.5">{fleetEquipment.name}</div><div className="text-xs text-gray-600 dark:text-slate-300 mt-1 capitalize">{String(fleetEquipment.status || "unknown").replaceAll("_", " ")} · {fleetOpenWorkOrders.length} open work order{fleetOpenWorkOrders.length === 1 ? "" : "s"}</div>{fleetLinkBasis === "imei" && <div className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">Linked by unique Bouncie IMEI because the current Bouncie VIN ({vehicle?.vin || "—"}) differs from the Fleet VIN ({fleetEquipment.vin || "—"}).</div>}</div>
            <ClipboardList className="w-5 h-5 text-indigo-500 shrink-0" />
          </div>
          {fleetOpenWorkOrders.length > 0 && <div className="mt-2 space-y-1">{fleetOpenWorkOrders.slice(0, 2).map(wo => <Link key={wo.id} to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(wo.id)}&equipment=${encodeURIComponent(fleetEquipment.id)}`} className="block text-xs text-gray-700 dark:text-slate-300 truncate hover:text-indigo-700 dark:hover:text-indigo-300"><span className={`font-semibold ${["critical","high"].includes(wo.priority) ? "text-red-600" : ""}`}>{wo.work_order_number}</span> · {wo.title}</Link>)}{fleetOpenWorkOrders.length > 2 && <Link to={`${createPageUrl("FleetWorkOrders")}?equipment=${encodeURIComponent(fleetEquipment.id)}`} className="block text-xs text-indigo-600 hover:underline">+{fleetOpenWorkOrders.length - 2} more open</Link>}</div>}
          <div className="mt-3 flex items-center gap-2"><Link to={equipmentDetailUrl} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline">Open maintenance record <ArrowRight className="w-3.5 h-3.5" /></Link><Link to={newWorkOrderUrl} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-600 text-white text-xs font-semibold"><Plus className="w-3.5 h-3.5" />Work order</Link></div>
        </> : <>
          <div className={`text-[10px] uppercase tracking-wide font-semibold ${linkConflict ? "text-red-600" : "text-amber-600"}`}>CCS Fleet Maintenance</div>
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-0.5">{linkConflict ? "Fleet identity conflict" : "No proven FleetEquipment link"}</div>
          <div className="text-xs text-gray-600 dark:text-slate-300 mt-1">{fleetLinkBasis === "imei_vin_conflict" ? "This Bouncie device IMEI matches a Fleet record, but the current Bouncie VIN conflicts with that Fleet VIN. Maintenance stays intentionally unlinked until an admin confirms the device/vehicle identity." : linkConflict ? "Multiple Fleet equipment records match this Bouncie identity. Maintenance stays intentionally unlinked until an admin resolves the duplicate identity." : "Tracking remains available. Maintenance links by one exact Fleet VIN match, or by a previously proven Fleet IMEI only when it does not contradict VIN evidence."}</div>
          <Link to={equipmentDetailUrl} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline">Review Fleet equipment <ArrowRight className="w-3.5 h-3.5" /></Link>
        </>}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "trips" && (
          <TripsTab vehicle={vehicle} trips={trips} loading={tripsLoading} onRefresh={onTripsRefresh}
            selectedTripId={selectedTripId} onSelectTrip={onSelectTrip} />
        )}
        {activeTab === "stats" && (
          <StatsTab vehicle={vehicle} trips={trips} loading={tripsLoading}
            daysBack={daysBack} onDaysBackChange={onDaysBackChange}
            avgBy={avgBy} onAvgByChange={onAvgByChange} />
        )}
        {activeTab === "notifications" && (
          <NotificationsTab notifications={notifications} vehicle={vehicle}
            onClearAll={onClearNotifications} onMarkRead={onMarkNotificationRead}
            onOpenSettings={onOpenAlertSettings} canManageAlerts={canManageAlerts} />
        )}
        {activeTab === "maintenance" && (
          <MaintenanceTab
            equipment={fleetEquipment}
            openWorkOrders={fleetOpenWorkOrders}
            tasks={fleetMaintenanceTasks}
            logs={fleetEquipmentLogs}
            loading={fleetMaintenanceLoading}
          />
        )}
        {activeTab === "details" && <DetailsTab vehicle={vehicle} fleetEquipment={fleetEquipment} />}
      </div>

      {/* Footer: status icons */}
      <div className="flex items-center justify-around border-t border-gray-200 dark:border-slate-700 py-3 px-2 bg-gray-50 dark:bg-slate-950">
        <StatusIcon icon={Fuel} label="Fuel" value={stats.fuelLevel != null ? `${Math.round(stats.fuelLevel)}%` : "--"} ok={stats.fuelLevel == null || stats.fuelLevel > 25} />
        <StatusIcon icon={Battery} label="Battery" value={stats.mil?.battery?.status || "--"} ok={stats.mil?.battery?.status !== "low" && stats.mil?.battery?.status !== "critical"} />
        <StatusIcon icon={Wrench} label="Engine" value={stats.mil?.milOn ? "On" : "OK"} ok={!stats.mil?.milOn} badge={stats.mil?.milOn ? (stats.mil?.qualifiedDtcList?.length || 0) : 0} />
        <StatusIcon icon={Cpu} label="Device" value={stats.isRunning ? "Running" : "Parked"} ok={true} />
      </div>
    </div>
  );
}

function StatusIcon({ icon: Icon, label, value, ok, badge }) {
  return (
    <div className="flex flex-col items-center gap-1 relative">
      <div className="relative">
        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-slate-800">
          <Icon className="w-5 h-5" style={{ color: ok ? "#6b7280" : "#dc3545" }} />
        </div>
        {ok && (
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "#28a745" }}>
            <CheckCircle2 className="w-3 h-3 text-white" />
          </span>
        )}
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center" style={{ background: "#ff9800" }}>
            {badge}
          </span>
        )}
      </div>
      <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">{label}</span>
      <span className="text-[10px] text-gray-700 dark:text-slate-300">{value}</span>
    </div>
  );
}