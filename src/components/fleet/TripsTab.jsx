import { useState } from "react";
import { formatTime, formatMiles, groupTripsByDay, monthLabel, formatRelativeDay } from "./fleetHelpers";
import { Loader2, ChevronDown, Car } from "lucide-react";

export default function TripsTab({ vehicle, trips, loading, selectedTripId, onSelectTrip }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState({});
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Trips</h2>
        <button
          onClick={() => setSelectMode(!selectMode)}
          className="px-3 py-1.5 rounded text-xs font-semibold border border-indigo-500 text-indigo-600 dark:text-indigo-300 dark:border-indigo-500"
        >
          {selectMode ? "Done" : "Select"}
        </button>
      </div>

      {groups.length === 0 && (
        <div className="text-center text-gray-400 py-12 text-sm">No trips recorded in this period.</div>
      )}

      {Object.entries(byMonth).map(([month, dayGroups]) => {
        const collapsed = collapsedMonths[month];
        const monthTotal = dayGroups.reduce((s, g) => s + g.totalMiles, 0);
        return (
          <div key={month} className="mb-4">
            <button
              onClick={() => toggleMonth(month)}
              className="w-full flex items-center justify-between py-2 text-sm font-semibold text-gray-600 dark:text-slate-300"
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
                  const isSel = selected[id];
                  const isActive = id === selectedTripId;
                  return (
                    <div
                      key={id}
                      className={`flex items-center gap-3 py-2.5 px-2 -mx-2 rounded border-b border-gray-50 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/60 cursor-pointer ${isActive ? "bg-indigo-50 dark:bg-indigo-950/40" : ""}`}
                      onClick={() => selectMode ? setSelected(s => ({ ...s, [id]: !s[id] })) : onSelectTrip?.(t)}
                    >
                      {selectMode && (
                        <input type="checkbox" checked={!!isSel} readOnly className="w-4 h-4" />
                      )}
                      <Car className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 dark:text-slate-200">
                          {formatTime(t.startTime, tz)} – {formatTime(t.endTime, tz)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {Math.round(t.distance || 0)} mi · avg {Math.round(t.averageSpeed || 0)} mph
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-gray-700 dark:text-slate-300">{formatMiles(t.distance).replace(" miles", " mi")}</div>
                    </div>
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