import { useState } from "react";
import { notificationIcon, notificationIconColor, formatDateTimeShort } from "./fleetHelpers";
import { ExternalLink, Settings as SettingsIcon } from "lucide-react";

const SUB_TABS = [
  { key: "drive", label: "DRIVE" },
  { key: "vehicle", label: "VEHICLE" },
  { key: "care", label: "CARE" },
];

export default function NotificationsTab({ notifications, onClearAll, onMarkRead, onOpenSettings, canManageAlerts = false }) {
  const [subTab, setSubTab] = useState("drive");

  // FleetTracking already resolves the selected vehicle notification set using
  // normalized, fail-closed VIN linkage. Do not narrow it again with exact VIN
  // string equality here or legitimate selected-vehicle alerts can disappear.
  const filtered = notifications
    .filter(n => n.category === subTab)
    .sort((a, b) => (Date.parse(b?.timestamp || "") || 0) - (Date.parse(a?.timestamp || "") || 0));
  const categoryCounts = notifications.reduce((counts, note) => ({ ...counts, [note.category]: (counts[note.category] || 0) + 1 }), {});
  const unreadCount = notifications.filter(note => !note.is_read).length;

  return (
    <div className="flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex items-center px-2 border-b border-gray-200 dark:border-slate-700" role="tablist" aria-label="Notification categories">
        {SUB_TABS.map(t => (
          <button
            type="button"
            role="tab"
            aria-selected={subTab === t.key}
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`relative min-h-11 flex-1 px-2 py-3 text-xs font-semibold tracking-wide ${subTab === t.key ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-slate-400"}`}
          >
            {t.label}<span className="ml-1 text-[10px] text-gray-400">{categoryCounts[t.key] || 0}</span>
            {subTab === t.key && <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-full" style={{ background: "#2b73ff" }} />}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Notifications</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{filtered.length} {subTab} alert{filtered.length === 1 ? "" : "s"}</p>
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
            <button
              type="button"
              key={n.id || idx}
              className="min-h-14 w-full flex gap-3 rounded-lg border-b border-gray-100 px-1 py-3 text-left transition-colors hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
              onClick={() => !n.is_read && onMarkRead(n.id)}
              aria-label={`${n.is_read ? "Read" : "Unread"} notification: ${n.title || "Fleet alert"}`}
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
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-950">
        <button type="button" onClick={onClearAll} disabled={!unreadCount} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-indigo-600 disabled:text-gray-400 dark:text-indigo-300 dark:disabled:text-slate-600">Mark Vehicle Read{unreadCount ? ` (${unreadCount})` : ""}</button>
        <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2">
          {canManageAlerts && <button type="button" onClick={onOpenSettings} className="min-h-11 inline-flex items-center gap-1 rounded-lg px-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30"><SettingsIcon className="w-4 h-4" />CCS Alerts</button>}
          <a href="https://www.bouncie.com/app" target="_blank" rel="noreferrer" className="min-h-11 inline-flex items-center gap-1 rounded-lg px-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30">Bouncie <ExternalLink className="w-3.5 h-3.5" /></a>
        </div>
      </div>
    </div>
  );
}