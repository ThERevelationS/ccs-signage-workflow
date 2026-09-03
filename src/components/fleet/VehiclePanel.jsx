import React, { useState } from "react";
import { X, Fuel, Battery, Wrench, Cpu, CheckCircle2 } from "lucide-react";
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
  vehicle, trips, tripsLoading, notifications, onClearNotifications, onMarkNotificationRead,
  onOpenAlertSettings, onClose, daysBack, onDaysBackChange, avgBy, onAvgByChange,
  onTripsRefresh
}) {
  const [activeTab, setActiveTab] = useState("trips");
  const stats = vehicle?.stats || {};

  const unreadCount = notifications.filter(n => !n.is_read).length;

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

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "trips" && (
          <TripsTab vehicle={vehicle} trips={trips} loading={tripsLoading} onRefresh={onTripsRefresh} />
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
        {activeTab === "details" && <DetailsTab vehicle={vehicle} />}
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