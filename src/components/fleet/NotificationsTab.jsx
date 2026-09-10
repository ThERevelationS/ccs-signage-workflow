import React, { useState } from "react";
import { notificationIcon, notificationIconColor, formatDateTimeShort } from "./fleetHelpers";
import { ExternalLink, Pin, Settings as SettingsIcon } from "lucide-react";

const SUB_TABS = [
  { key: "drive", label: "DRIVE" },
  { key: "vehicle", label: "VEHICLE" },
  { key: "care", label: "CARE" },
];

export default function NotificationsTab({ notifications, vehicle, onClearAll, onMarkRead, onOpenSettings, canManageAlerts = false }) {
  const [subTab, setSubTab] = useState("drive");

  const filtered = notifications
    .filter(n => !vehicle || n.vehicle_vin === vehicle.vin)
    .filter(n => n.category === subTab)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div className="flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex items-center gap-4 px-4 border-b border-gray-200 dark:border-slate-700">
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`py-3 text-xs font-semibold tracking-wide relative ${subTab === t.key ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-slate-400"}`}
          >
            {t.label}
            {subTab === t.key && <span className="absolute left-0 right-0 bottom-0 h-[3px] rounded-full" style={{ background: "#2b73ff" }} />}
          </button>
        ))}
        <Pin className="w-4 h-4 text-gray-400 ml-auto" />
      </div>

      <div className="px-4 pt-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Notifications</h2>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">No {subTab} notifications.</div>
        )}
        {filtered.map((n, idx) => {
          const Icon = notificationIcon(n.event_type);
          const iconColor = notificationIconColor(n.event_type, n.severity);
          return (
            <div
              key={n.id || idx}
              className="flex gap-3 py-3 border-b border-gray-100 dark:border-slate-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/60"
              onClick={() => !n.is_read && onMarkRead(n.id)}
            >
              <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: n.severity === "info" ? "#e0e0e0" : "#dc3545" }} />
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: iconColor }}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-slate-200">{n.title}</div>
                {n.description && <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{n.description}</div>}
                <div className="text-xs mt-1" style={{ color: "#2b73ff" }}>{formatDateTimeShort(n.timestamp)}</div>
              </div>
              {!n.is_read && <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#dc3545" }} />}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-950">
        <button onClick={onClearAll} className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">Mark Vehicle Read</button>
        <div className="flex items-center gap-3">
          {canManageAlerts && <button onClick={onOpenSettings} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300"><SettingsIcon className="w-4 h-4" />CCS Alerts</button>}
          <a href="https://www.bouncie.com/app" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300">Bouncie <ExternalLink className="w-3.5 h-3.5" /></a>
        </div>
      </div>
    </div>
  );
}