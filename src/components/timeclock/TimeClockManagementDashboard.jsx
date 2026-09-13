import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Briefcase, CheckCircle2, Clock3, Coffee, FileWarning, Pause, Play, Users } from "lucide-react";
import { isSameDay, isWithinInterval, startOfWeek, endOfWeek } from "date-fns";

function hoursLabel(value) {
  return `${Number(value || 0).toFixed(2)} hrs`;
}

export default function TimeClockManagementDashboard({
  timeEntries = [],
  employeeStates = [],
  correctionRequests = [],
}) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 0 });

  const completedEntries = timeEntries.filter(entry => entry.status === "clocked_out" && entry.clock_out && !entry.archived_admin && !entry.archived_test_data);
  const todayEntries = completedEntries.filter(entry => {
    const date = entry.clock_in ? new Date(entry.clock_in) : null;
    return date && Number.isFinite(date.getTime()) && isSameDay(date, now);
  });
  const weekEntries = completedEntries.filter(entry => {
    const date = entry.clock_in ? new Date(entry.clock_in) : null;
    return date && Number.isFinite(date.getTime()) && isWithinInterval(date, { start: weekStart, end: weekEnd });
  });

  const todayHours = todayEntries.reduce((sum, entry) => sum + Number(entry.total_hours || 0), 0);
  const weekHours = weekEntries.reduce((sum, entry) => sum + Number(entry.total_hours || 0), 0);
  const pendingCorrections = correctionRequests.filter(request => ["pending", "reviewing"].includes(request.status)).length;
  const needsReview = completedEntries.filter(entry => ["unreviewed", "needs_review"].includes(entry.approval_status || "unreviewed")).length;

  const clockedIn = employeeStates.filter(state => state.status === "clocked_in");
  const working = clockedIn.filter(state => (state.break_status || "working") === "working" && (state.work_pause_status || "working") === "working");
  const onBreak = clockedIn.filter(state => state.break_status === "on_break");
  const paused = clockedIn.filter(state => state.work_pause_status === "paused");

  const laborTotals = useMemo(() => {
    const byKey = new Map();
    for (const entry of weekEntries) {
      for (const allocation of entry.job_allocations || []) {
        const minutes = Number.isFinite(Number(allocation.minutes))
          ? Number(allocation.minutes)
          : Math.round(Number(allocation.hours || 0) * 60);
        if (minutes <= 0) continue;
        const key = allocation.is_inhouse
          ? `inhouse:${allocation.inhouse_task || "In House"}`
          : allocation.work_order_id || `job:${allocation.client_name || "Unknown"}:${allocation.work_order_title || ""}`;
        const existing = byKey.get(key) || {
          key,
          label: allocation.is_inhouse
            ? allocation.inhouse_task || "In House"
            : allocation.client_name || allocation.work_order_title || "WorkOrder",
          detail: allocation.is_inhouse ? "In House" : allocation.work_order_title || "WorkOrder labor",
          minutes: 0,
        };
        existing.minutes += minutes;
        byKey.set(key, existing);
      }
    }
    return [...byKey.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 5);
  }, [weekEntries]);

  return (
    <div className="clay-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-purple-600" />Management Overview</h3>
          <p className="text-xs text-gray-500 mt-1">Operational Time Clock status. Tracked hours are not automatically payroll-finalized.</p>
        </div>
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Live + completed records</Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-3">
          <div className="flex items-center gap-2 text-xs text-green-700"><Play className="w-3.5 h-3.5" />Working Now</div>
          <p className="text-2xl font-bold text-green-800">{working.length}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-xs text-amber-700"><Coffee className="w-3.5 h-3.5" />On Break</div>
          <p className="text-2xl font-bold text-amber-800">{onBreak.length}</p>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-3">
          <div className="flex items-center gap-2 text-xs text-purple-700"><Pause className="w-3.5 h-3.5" />Work Paused</div>
          <p className="text-2xl font-bold text-purple-800">{paused.length}</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center gap-2 text-xs text-blue-700"><Clock3 className="w-3.5 h-3.5" />Clocked In</div>
          <p className="text-2xl font-bold text-blue-800">{clockedIn.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
        <div className="rounded-xl border bg-white p-3">
          <p className="text-xs text-gray-500">Completed Work Today</p>
          <p className="text-xl font-bold text-gray-900">{hoursLabel(todayHours)}</p>
        </div>
        <div className="rounded-xl border bg-white p-3">
          <p className="text-xs text-gray-500">Completed Work This Week</p>
          <p className="text-xl font-bold text-gray-900">{hoursLabel(weekHours)}</p>
        </div>
        <div className={`rounded-xl border p-3 ${pendingCorrections ? "border-amber-300 bg-amber-50" : "bg-white"}`}>
          <div className="flex items-center gap-2 text-xs text-gray-600"><FileWarning className="w-3.5 h-3.5" />Pending Corrections</div>
          <p className="text-xl font-bold text-gray-900">{pendingCorrections}</p>
        </div>
        <div className={`rounded-xl border p-3 ${needsReview ? "border-amber-300 bg-amber-50" : "bg-white"}`}>
          <div className="flex items-center gap-2 text-xs text-gray-600"><CheckCircle2 className="w-3.5 h-3.5" />Shifts To Review</div>
          <p className="text-xl font-bold text-gray-900">{needsReview}</p>
        </div>
      </div>

      <div className="mt-4 border-t pt-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2"><Briefcase className="w-4 h-4 text-blue-600" />Top Labor This Week</h4>
            <p className="text-xs text-gray-500 mt-0.5">Derived from TimeEntry job allocations; WorkOrder records are not modified.</p>
          </div>
        </div>
        {laborTotals.length === 0 ? (
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">No completed allocated labor has been recorded this week.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {laborTotals.map(item => (
              <div key={item.key} className="rounded-lg border bg-white px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.label}</p>
                  <p className="text-xs text-gray-500 truncate">{item.detail}</p>
                </div>
                <span className="text-sm font-bold text-blue-700 shrink-0">{(item.minutes / 60).toFixed(2)} hrs</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
