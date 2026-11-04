import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  startOfMonth, startOfWeek, subMonths,
} from "date-fns";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function TimeClockCalendar({
  timeEntries = [],
  punchExceptions = [],
  correctionRequests = [],
  currentDate,
  onSelectDate,
}) {
  const [viewMonth, setViewMonth] = useState(() => currentDate || new Date());

  const dayMap = useMemo(() => {
    const map = new Map();
    const bucket = (key) => {
      const row = map.get(key) || { hours: 0, shifts: 0, review: 0, issues: 0 };
      map.set(key, row);
      return row;
    };
    for (const entry of timeEntries) {
      if (!entry?.clock_in) continue;
      const row = bucket(format(new Date(entry.clock_in), "yyyy-MM-dd"));
      row.hours += entry.total_hours || 0;
      row.shifts += 1;
      const status = entry.approval_status || "unreviewed";
      if (entry.status === "clocked_out" && status !== "approved") row.review += 1;
      if (entry.status === "needs_resolution") row.issues += 1;
    }
    for (const punchCase of punchExceptions) {
      if (!["open", "pending_manager_review", "rejected"].includes(punchCase?.status)) continue;
      const ts = punchCase.submitted_at || punchCase.created_date;
      if (!ts) continue;
      bucket(format(new Date(ts), "yyyy-MM-dd")).issues += 1;
    }
    for (const request of correctionRequests) {
      if (!["pending", "reviewing"].includes(request?.status)) continue;
      const ts = request.created_date;
      if (!ts) continue;
      bucket(format(new Date(ts), "yyyy-MM-dd")).issues += 1;
    }
    return map;
  }, [timeEntries, punchExceptions, correctionRequests]);

  const monthStart = startOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 });
  const weeks = [];
  for (let day = gridStart; day <= gridEnd; day = new Date(day.getTime() + DAY_MS)) {
    if (weeks.length === 0 || weeks[weeks.length - 1].length === 7) weeks.push([]);
    weeks[weeks.length - 1].push(day);
  }

  const selected = currentDate || null;

  return (
    <div className="clay-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-600" />
            Time Clock Calendar
          </h3>
          <p className="text-xs text-gray-500 mt-1">Click a day to load that day's Time Clock report below.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setViewMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="min-w-28 text-center text-sm font-semibold">{format(viewMonth, "MMMM yyyy")}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setViewMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setViewMonth(new Date())}>Today</Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-gray-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="space-y-1">
        {weeks.map((week, i) => (
          <div key={i} className="grid grid-cols-7 gap-1">
            {week.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const data = dayMap.get(key);
              const inMonth = isSameMonth(day, viewMonth);
              const isSelected = selected && isSameDay(day, selected);
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => typeof onSelectDate === "function" && onSelectDate(day)}
                  className={`min-h-14 rounded-lg border p-1 text-left align-top transition-colors ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                      : inMonth
                        ? "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                        : "border-gray-100 bg-gray-50/60 text-gray-300 hover:border-blue-200"
                  }`}
                >
                  <div className={`text-xs font-semibold ${inMonth ? "text-gray-800" : "text-gray-400"}`}>
                    {format(day, "d")}
                  </div>
                  {data && (
                    <div className="mt-0.5 space-y-0.5">
                      {data.hours > 0 && (
                        <div className="text-[10px] font-medium text-blue-700">{data.hours.toFixed(1)}h · {data.shifts} shift{data.shifts === 1 ? "" : "s"}</div>
                      )}
                      <div className="flex flex-wrap gap-0.5">
                        {data.issues > 0 && <Badge className="h-3.5 px-1 text-[9px] bg-red-100 text-red-700 border-red-200" variant="outline">{data.issues} issue{data.issues === 1 ? "" : "s"}</Badge>}
                        {data.review > 0 && <Badge className="h-3.5 px-1 text-[9px] bg-amber-100 text-amber-700 border-amber-200" variant="outline">{data.review} review</Badge>}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
