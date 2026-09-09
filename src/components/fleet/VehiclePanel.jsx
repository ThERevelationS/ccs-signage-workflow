import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { X, Fuel, Battery, Wrench, Cpu, CheckCircle2, ClipboardList, ArrowRight, Plus } from "lucide-react";
import TripsTab from "./TripsTab";
import StatsTab from "./StatsTab";
import NotificationsTab from "./NotificationsTab";
import DetailsTab from "./DetailsTab";

const TABS = [
  { key: "trips", label: "TRIPS" },
  { key: "stats", label: "STATS" },
  { key: "notifications", label: "NOTIFICATIONS" },
  { key: "details", label: "DETAILS" },
];

export default function VehiclePanel({
  vehicle, fleetEquipment, fleetOpenWorkOrders = [], trips, tripsLoading, notifications, onClearNotifications, onMarkNotificationRead,
  onOpenAlertSettings, onClose, daysBack, onDaysBackChange, avgBy, onAvgByChange,
  onTripsRefresh, selectedTripId, onSelectTrip
}) {
  const [activeTab, setActiveTab] = useState("trips");
  const stats = vehicle?.stats || {};

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const equipmentDetailUrl = fleetEquipment ? `${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(fleetEquipment.id)}` : createPageUrl("FleetEquipment");
  const newWorkOrderUrl = fleetEquipment ? `${createPageUrl("FleetWorkOrders")}?new=1&equipment=${encodeURIComponent(fleetEquipment.id)}` : createPageUrl("FleetWorkOrders");

  return (
    <div className="absolute top-4 right-4 bottom-4 z-20 flex flex-col bg-white rounded-lg shadow-2xl overflow-hidden"
      style={{ width: "min(440px, 92vw)", maxHeight: "calc(100% - 32px)" }}>
      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 px-2 pt-2 relative">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="px-4 py-3 text-xs font-semibold tracking-wide transition-colors relative"
            style={{ color: activeTab === t.key ? "#1a1a1a" : "#7f8897" }}
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
        <button onClick={onClose} className="ml-auto p-2 hover:bg-gray-100 rounded" title="Close">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className={`mx-3 mt-3 rounded-lg border p-3 ${fleetEquipment ? "border-indigo-200 bg-indigo-50" : "border-amber-200 bg-amber-50"}`}>
        {fleetEquipment ? <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="text-[10px] uppercase tracking-wide font-semibold text-indigo-500">CCS Fleet Maintenance</div><div className="font-semibold text-sm text-gray-900 truncate mt-0.5">{fleetEquipment.name}</div><div className="text-xs text-gray-600 mt-1 capitalize">{String(fleetEquipment.status || "unknown").replaceAll("_", " ")} · {fleetOpenWorkOrders.length} open work order{fleetOpenWorkOrders.length === 1 ? "" : "s"}</div></div>
            <ClipboardList className="w-5 h-5 text-indigo-500 shrink-0" />
          </div>
          {fleetOpenWorkOrders.length > 0 && <div className="mt-2 space-y-1">{fleetOpenWorkOrders.slice(0, 2).map(wo => <div key={wo.id} className="text-xs text-gray-700 truncate"><span className={`font-semibold ${["critical","high"].includes(wo.priority) ? "text-red-600" : ""}`}>{wo.work_order_number}</span> · {wo.title}</div>)}{fleetOpenWorkOrders.length > 2 && <div className="text-xs text-gray-500">+{fleetOpenWorkOrders.length - 2} more open</div>}</div>}
          <div className="mt-3 flex items-center gap-2"><Link to={equipmentDetailUrl} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline">Open maintenance record <ArrowRight className="w-3.5 h-3.5" /></Link><Link to={newWorkOrderUrl} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-600 text-white text-xs font-semibold"><Plus className="w-3.5 h-3.5" />Work order</Link></div>
        </> : <>
          <div className="text-[10px] uppercase tracking-wide font-semibold text-amber-600">CCS Fleet Maintenance</div>
          <div className="text-sm font-semibold text-gray-900 mt-0.5">No FleetEquipment VIN match</div>
          <div className="text-xs text-gray-600 mt-1">Tracking remains available, but maintenance is not linked until an exact FleetEquipment VIN match exists.</div>
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
            onOpenSettings={onOpenAlertSettings} />
        )}
        {activeTab === "details" && <DetailsTab vehicle={vehicle} fleetEquipment={fleetEquipment} />}
      </div>

      {/* Footer: status icons */}
      <div className="flex items-center justify-around border-t border-gray-200 py-3 px-2 bg-gray-50">
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
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#f3f4f6" }}>
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
      <span className="text-[10px] text-gray-500 font-medium">{label}</span>
      <span className="text-[10px] text-gray-700">{value}</span>
    </div>
  );
}