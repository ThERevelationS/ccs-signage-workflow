import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock3, Coffee, History, Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { isFleetCoolingDown } from "@/components/fleet/fleetInvoke";

function formatDuration(totalMinutes) {
  const minutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function safeDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

export default function EmployeeTodayCard({
  user,
  sessionToken,
  timeEntries = [],
  correctionRequests = [],
  onRefresh,
}) {
  const [statusData, setStatusData] = useState(null);
  const [statusError, setStatusError] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const statusSeqRef = useRef(0);
  const statusScopeRef = useRef("");
  statusScopeRef.current = `${sessionToken || ""}|${String(user?.email || "").trim().toLowerCase()}`;

  const loadStatus = useCallback(async () => {
    const requestEmail = String(user?.email || "").trim().toLowerCase();
    if (!requestEmail || !sessionToken) return;
    const requestScope = statusScopeRef.current;
    const requestSeq = ++statusSeqRef.current;
    setLoading(true);
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "status",
        session_token: sessionToken,
        target_email: user.email,
      });
      const data = response?.data || response;
      if (requestSeq !== statusSeqRef.current || statusScopeRef.current !== requestScope) return;
      if (!data?.success) throw new Error(data?.error || "Current Time Clock status could not be verified.");
      if (String(data?.user?.email || "").trim().toLowerCase() !== requestEmail) return;
      setStatusData(data);
      setStatusError("");
    } catch (err) {
      if (requestSeq !== statusSeqRef.current || statusScopeRef.current !== requestScope) return;
      setStatusError(err?.response?.data?.error || err?.message || "Current Time Clock status could not be verified.");
    } finally {
      if (requestSeq === statusSeqRef.current) setLoading(false);
    }
  }, [sessionToken, user?.email]);

  // An employee/session switch must drop the previous employee's status immediately.
  useEffect(() => {
    statusSeqRef.current += 1;
    setStatusData(null);
    setStatusError("");
    setLoading(false);
  }, [sessionToken, user?.email]);

  useEffect(() => {
    loadStatus();
    const poll = setInterval(() => { if (!document.hidden && !isFleetCoolingDown()) loadStatus(); }, 60000);
    const tick = setInterval(() => setNow(new Date()), 1000);
    const onPauseChanged = () => loadStatus();
    window.addEventListener("ccs-timeclock-work-pause-changed", onPauseChanged);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("ccs-timeclock-work-pause-changed", onPauseChanged);
    };
  }, [loadStatus]);

  const todayEntries = useMemo(() => {
    return timeEntries.filter(entry => {
      const date = safeDate(entry.clock_in);
      return date && isSameDay(date, now);
    });
  }, [timeEntries, now]);

  const completedTodayMinutes = todayEntries
    .filter(entry => entry.status === "clocked_out")
    .reduce((sum, entry) => sum + Math.max(0, Math.round(Number(entry.total_hours || 0) * 60)), 0);
  const completedPauseMinutes = todayEntries
    .filter(entry => entry.status === "clocked_out")
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.tracked_work_pause_minutes || 0)), 0);
  const completedBreakMinutes = todayEntries
    .filter(entry => entry.status === "clocked_out")
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.tracked_break_minutes || 0)), 0);

  const activeEntry = statusData?.status === "clocked_in" ? statusData.entry : null;
  const activeClockIn = safeDate(activeEntry?.clock_in);
  const activeSpanMinutes = activeClockIn ? Math.max(0, Math.floor((now.getTime() - activeClockIn.getTime()) / 60000)) : 0;
  const completedActiveUnpaidBreak = Math.max(0, Number(statusData?.break_summary?.unpaid_minutes || 0));
  const completedActiveBreak = Math.max(0, Number(statusData?.break_summary?.total_minutes || 0));
  const completedActivePause = Math.max(0, Number(statusData?.work_pause_summary?.total_minutes || 0));
  const activeBreakStart = safeDate(statusData?.active_break?.started_at);
  const activeBreakElapsed = activeBreakStart ? Math.max(0, Math.floor((now.getTime() - activeBreakStart.getTime()) / 60000)) : 0;
  const activePauseStart = safeDate(statusData?.active_work_pause?.started_at);
  const activePauseElapsed = activePauseStart ? Math.max(0, Math.floor((now.getTime() - activePauseStart.getTime()) / 60000)) : 0;
  const activeUnpaidBreakElapsed = statusData?.break_status === "on_break" && statusData?.active_break?.is_paid !== true ? activeBreakElapsed : 0;
  const activeWorkedMinutes = activeEntry
    ? Math.max(0, activeSpanMinutes - completedActiveUnpaidBreak - completedActivePause - activeUnpaidBreakElapsed - activePauseElapsed)
    : 0;
  const todayWorkedMinutes = completedTodayMinutes + activeWorkedMinutes;
  const todayPauseMinutes = completedPauseMinutes + completedActivePause + activePauseElapsed;
  const todayBreakMinutes = completedBreakMinutes + completedActiveBreak + activeBreakElapsed;

  const pendingCorrections = correctionRequests.filter(request => ["pending", "reviewing"].includes(request.status));
  const pendingShiftReviewCount = Math.max(0, Number(statusData?.pending_shift_review?.count || 0));
  const pendingShiftReviewIntegrity = statusData?.pending_shift_review?.has_integrity_issue === true;
  const multipleActiveEntries = timeEntries.filter(entry => entry.status === "clocked_in").length > 1;
  const activeShiftAgeMs = activeClockIn ? now.getTime() - activeClockIn.getTime() : 0;
  const activeShiftOver24h = activeShiftAgeMs >= 24 * 60 * 60 * 1000;
  const hasProblem = multipleActiveEntries || activeShiftOver24h || pendingCorrections.length > 0 || pendingShiftReviewCount > 0 || Boolean(statusError);

  let statusLabel = "Clocked Out";
  let statusClass = "bg-gray-100 text-gray-700 border-gray-200";
  let StatusIcon = Clock3;
  if (statusData?.status === "clocked_in") {
    if (statusData.work_pause_status === "paused") {
      statusLabel = "Work Paused";
      statusClass = "bg-purple-100 text-purple-800 border-purple-200";
      StatusIcon = Pause;
    } else if (statusData.break_status === "on_break") {
      statusLabel = statusData.active_break?.is_paid ? "Paid Break" : statusData.active_break?.break_type === "lunch" ? "Unpaid Lunch" : "Unpaid Break";
      statusClass = "bg-amber-100 text-amber-800 border-amber-200";
      StatusIcon = Coffee;
    } else {
      statusLabel = "Working";
      statusClass = "bg-green-100 text-green-800 border-green-200";
      StatusIcon = Play;
    }
  }

  const recentActivity = [];
  for (const entry of todayEntries) {
    if (entry.clock_in) recentActivity.push({ key: `${entry.id}:in`, at: new Date(entry.clock_in), label: "Clocked in" });
    if (entry.clock_out) recentActivity.push({ key: `${entry.id}:out`, at: new Date(entry.clock_out), label: "Clocked out" });
  }
  if (statusData?.break_status === "on_break" && activeBreakStart) {
    recentActivity.push({ key: "active-break", at: activeBreakStart, label: statusLabel });
  }
  if (statusData?.work_pause_status === "paused" && activePauseStart) {
    recentActivity.push({ key: "active-pause", at: activePauseStart, label: "Work Paused" });
  }
  recentActivity.sort((a, b) => b.at - a.at);

  const handleRefresh = async () => {
    await Promise.all([loadStatus(), typeof onRefresh === "function" ? onRefresh() : Promise.resolve()]);
  };

  if (!user?.email || !sessionToken) return null;

  return (
    <div className="clay-card p-4 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-lg">Today</h2>
            <Badge variant="outline" className={statusClass}>
              <StatusIcon className="w-3 h-3 mr-1" />{statusLabel}
            </Badge>
            {statusData?.break_status === "on_break" && activeBreakElapsed > 60 && (
              <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700" title="Break has run over the standard hour">
                {activeBreakElapsed}m - over
              </Badge>
            )}
            {activeSpanMinutes > 300 && completedActiveUnpaidBreak === 0 && statusData?.break_status === "working" && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800" title="Over 5 hours worked without a lunch break">
                no lunch yet
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">Live operational time from authoritative Time Clock state.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-3">
          <p className="text-xs text-green-700">Actual Work Today</p>
          <p className="text-xl font-bold text-green-800">{formatDuration(todayWorkedMinutes)}</p>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-3">
          <p className="text-xs text-purple-700">Work Pause</p>
          <p className="text-xl font-bold text-purple-800">{formatDuration(todayPauseMinutes)}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-700">Break / Lunch</p>
          <p className="text-xl font-bold text-amber-800">{formatDuration(todayBreakMinutes)}</p>
        </div>
        <div className={`rounded-xl border p-3 ${hasProblem ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"}`}>
          <p className={hasProblem ? "text-xs text-red-700" : "text-xs text-blue-700"}>Open Issues</p>
          <p className={hasProblem ? "text-xl font-bold text-red-800" : "text-xl font-bold text-blue-800"}>{(multipleActiveEntries ? 1 : 0) + (activeShiftOver24h ? 1 : 0) + pendingCorrections.length + pendingShiftReviewCount + (statusError ? 1 : 0)}</p>
        </div>
      </div>

      {user.employment_type === "salary" && (
        <p className="mt-3 text-xs text-purple-700">For salary employees, these are tracked operational work hours only and do not determine pay or overtime.</p>
      )}

      {hasProblem && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="w-4 h-4" />Needs attention</div>
          <div className="mt-1 space-y-1 text-xs">
            {multipleActiveEntries && <p>Multiple active TimeEntries were found. An admin should review the duplicate state.</p>}
            {activeShiftOver24h && <p>Your active shift has been open for more than 24 hours. Verify that a clock-out was not missed.</p>}
            {pendingCorrections.length > 0 && <p>{pendingCorrections.length} correction request{pendingCorrections.length === 1 ? " is" : "s are"} awaiting manager review.</p>}
            {pendingShiftReviewCount > 0 && (
              <p>{pendingShiftReviewIntegrity
                ? `${pendingShiftReviewCount} reviewed shift${pendingShiftReviewCount === 1 ? " needs" : "s need"} manager investigation before approval.`
                : `${pendingShiftReviewCount} reviewed shift${pendingShiftReviewCount === 1 ? " still needs" : "s still need"} final manager shift approval before pay-period finalization.`}</p>
            )}
            {statusError && <p>{statusError}</p>}
          </div>
        </div>
      )}

      <div className="mt-4 border-t pt-3">
        <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-700"><History className="w-4 h-4" />Recent Activity</div>
        {recentActivity.length === 0 ? (
          <p className="text-xs text-gray-500">No Time Clock activity recorded today.</p>
        ) : (
          <div className="space-y-1.5">
            {recentActivity.slice(0, 6).map(item => (
              <div key={item.key} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                <span>{item.label}</span>
                <span className="text-gray-500">{format(item.at, "h:mm a")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}