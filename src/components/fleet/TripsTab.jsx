import { useState } from "react";
import { formatTime, formatMiles, groupTripsByDay, monthLabel, formatRelativeDay } from "./fleetHelpers";
import { Loader2, ChevronDown, Car, RefreshCw, Route } from "lucide-react";

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

export default function TripsTab({ vehicle, trips, loading, selectedTripId, onSelectTrip, daysBack, onDaysBackChange, onRefresh }) {
  const [collapsedMonths, setCollapsedMonths] = useState({});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const groups = groupTripsByDay(trips);
  const tz = vehicle?.stats?.localTimeZone;

  // group days by month
  const byMonth = {};
  groups.forEach(g => {
    const m = monthLabel(g.day);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(g);
  });

  const toggleMonth = (m) => setCollapsedMonths(s => ({ ...s, [m]: !s[m] }));

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Trips</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{trips.length} trip{trips.length === 1 ? "" : "s"} in the selected range</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={daysBack || 7}
            onChange={(event) => onDaysBackChange?.(Number(event.target.value))}
            className="min-h-11 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 sm:flex-none"
            aria-label="Trip history range"
          >
            {RANGES.map((range) => <option key={range.days} value={range.days}>{range.label}</option>)}
          </select>
          <button type="button" onClick={() => onRefresh?.()} className="min-h-11 min-w-11 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" title="Refresh trips" aria-label="Refresh trips"><RefreshCw className="mx-auto h-4 w-4" /></button>
        </div>
      </div>

      {groups.length === 0 && (
        <div className="text-center text-gray-400 py-12 text-sm">No trips recorded in this period.</div>
      )}

      {Object.entries(byMonth).map(([month, dayGroups]) => {
        const collapsed = collapsedMonths[month];
        const monthTotal = dayGroups.reduce((s, g) => s + g.totalMiles, 0);
        return (
          <div key={month} className="mb-4">
            <button type="button"
              onClick={() => toggleMonth(month)}
              className="min-h-11 w-full flex items-center justify-between py-2 text-sm font-semibold text-gray-600 dark:text-slate-300"
            >
              <span className="flex items-center gap-1">
                <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                {month}
              </span>
              <span className="text-xs text-gray-400">{Math.round(monthTotal)} miles</span>
            </button>
            {!collapsed && dayGroups.map((g) => (
              <div key={g.day} className="mb-3">
                <div className="flex items-center justify-between text-xs font-bold text-gray-500 dark:text-slate-400 py-1 border-b border-gray-100 dark:border-slate-800">
                  <span>{formatRelativeDay(g.day).toUpperCase()}</span>
                  <span>{Math.round(g.totalMiles)} miles</span>
                </div>
                {g.trips.map((t) => {
                  const id = t.transactionId;
                  const isActive = id === selectedTripId;
                  return (
                    <button
                      type="button"
                      key={id}
                      className={`min-h-14 w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg border-b border-gray-50 text-left transition-colors dark:border-slate-800 ${isActive ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950/40 dark:ring-indigo-800" : "hover:bg-gray-50 dark:hover:bg-slate-800/60"}`}
                      onClick={() => onSelectTrip?.(t)}
                      aria-pressed={isActive}
                    >
                      <Car className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-gray-800 dark:text-slate-200">
                          {formatTime(t.startTime, tz)} – {formatTime(t.endTime, tz)}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-400">Avg {Math.round(t.averageSpeed || 0)} mph</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold text-gray-700 dark:text-slate-300">{formatMiles(t.distance).replace(" miles", " mi")}</span>
                        <span className={`mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold ${isActive ? "text-indigo-700 dark:text-indigo-300" : "text-gray-400"}`}><Route className="h-3 w-3" />{isActive ? "Route shown" : "Show route"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}