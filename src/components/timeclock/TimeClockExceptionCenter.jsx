import { AlertTriangle, Briefcase, Clock3, Coffee, FileWarning, Pause, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";

const FIVE_MINUTES = 5 * 60 * 1000;
const TWO_HOURS = 2 * 60 * 60 * 1000;
const FOUR_HOURS = 4 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function ageMs(value, nowMs) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : null;
}

function formatAge(ms) {
  if (ms === null) return "unknown duration";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function severityClass(severity) {
  if (severity === "critical") return "border-red-300 bg-red-50 text-red-900";
  if (severity === "warning") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-blue-200 bg-blue-50 text-blue-900";
}

function severityBadge(severity) {
  if (severity === "critical") return "bg-red-100 text-red-800 border-red-200";
  if (severity === "warning") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-blue-100 text-blue-800 border-blue-200";
}

export default function TimeClockExceptionCenter({
  timeEntries = [],
  employeeStates = [],
  activeBreaks = [],
  activeWorkPauses = [],
  activeLaborSegments = [],
  correctionRequests = [],
  onReviewEntry,
  onRefresh,
}) {
  const nowMs = Date.now();
  const activeEntries = timeEntries.filter(entry => entry.status === "clocked_in" && !entry.archived_admin && !entry.archived_test_data);
  const activeEntryById = new Map(activeEntries.map(entry => [entry.id, entry]));
  const breakById = new Map(activeBreaks.map(row => [row.id, row]));
  const pauseById = new Map(activeWorkPauses.map(row => [row.id, row]));
  const referencedBreakIds = new Set(employeeStates.map(state => state.active_break_id).filter(Boolean));
  const referencedPauseIds = new Set(employeeStates.map(state => state.active_work_pause_id).filter(Boolean));
  const exceptions = [];

  const statesByEntryId = new Map();
  const statesByEmail = new Map();
  const activeEntriesByEmail = new Map();
  const breaksByEntryId = new Map();
  const pausesByEntryId = new Map();
  const laborByEntryId = new Map();

  const addGrouped = (map, key, row) => {
    if (!key) return;
    const rows = map.get(key) || [];
    rows.push(row);
    map.set(key, rows);
  };

  for (const state of employeeStates) {
    addGrouped(statesByEntryId, state.active_entry_id, state);
    addGrouped(statesByEmail, String(state.user_email || "").toLowerCase(), state);
  }
  for (const entry of activeEntries) addGrouped(activeEntriesByEmail, String(entry.user_email || "").toLowerCase(), entry);
  for (const row of activeBreaks) addGrouped(breaksByEntryId, row.time_entry_id, row);
  for (const row of activeWorkPauses) addGrouped(pausesByEntryId, row.time_entry_id, row);
  for (const row of activeLaborSegments) addGrouped(laborByEntryId, row.time_entry_id, row);

  const stateByEntryId = new Map([...statesByEntryId.entries()].filter(([, rows]) => rows.length === 1).map(([entryId, rows]) => [entryId, rows[0]]));

  for (const [email, rows] of statesByEmail.entries()) {
    if (rows.length > 1) {
      exceptions.push({
        key: `duplicate-state:${email}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Employee has multiple authoritative state rows",
        employee: rows[0]?.user_name || email,
        detail: `${rows.length} Time Clock employee-state rows exist for the same email. Do not punch or correct time until the duplicate state is reviewed.`,
      });
    }
  }

  for (const [email, rows] of activeEntriesByEmail.entries()) {
    if (rows.length > 1) {
      exceptions.push({
        key: `duplicate-active-entry:${email}`,
        severity: "critical",
        icon: Clock3,
        title: "Employee has multiple active shifts",
        employee: rows[0]?.user_name || email,
        detail: `${rows.length} non-archived TimeEntries are simultaneously clocked in for this employee. Nothing was changed automatically.`,
        entry: rows[0],
      });
    }
  }

  for (const [entryId, rows] of statesByEntryId.entries()) {
    if (rows.length > 1) {
      const entry = activeEntryById.get(entryId);
      exceptions.push({
        key: `duplicate-entry-state:${entryId}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Multiple employee states reference one active shift",
        employee: entry?.user_name || rows[0]?.user_name || rows[0]?.user_email,
        detail: `${rows.length} authoritative state rows point to the same TimeEntry. Review identity/state integrity before any manager action.`,
        entry,
      });
    }
  }

  for (const [entryId, rows] of breaksByEntryId.entries()) {
    if (rows.length > 1) {
      const entry = activeEntryById.get(entryId);
      exceptions.push({
        key: `duplicate-active-break:${entryId}`,
        severity: "critical",
        icon: Coffee,
        title: "Multiple active breaks exist for one shift",
        employee: entry?.user_name || rows[0]?.user_name || rows[0]?.user_email,
        detail: `${rows.length} active break records belong to the same TimeEntry. Review before ending the break or closing the shift.`,
        entry,
      });
    }
  }

  for (const [entryId, rows] of pausesByEntryId.entries()) {
    if (rows.length > 1) {
      const entry = activeEntryById.get(entryId);
      exceptions.push({
        key: `duplicate-active-pause:${entryId}`,
        severity: "critical",
        icon: Pause,
        title: "Multiple active Work Pauses exist for one shift",
        employee: entry?.user_name || rows[0]?.user_name || rows[0]?.user_email,
        detail: `${rows.length} active Work Pause records belong to the same TimeEntry. Review before resuming or closing the shift.`,
        entry,
      });
    }
  }

  for (const [entryId, rows] of laborByEntryId.entries()) {
    if (rows.length > 1) {
      const entry = activeEntryById.get(entryId);
      exceptions.push({
        key: `duplicate-active-labor:${entryId}`,
        severity: "critical",
        icon: Briefcase,
        title: "Multiple Current Work segments are active for one shift",
        employee: entry?.user_name || rows[0]?.user_name || rows[0]?.user_email,
        detail: `${rows.length} active labor segments belong to the same TimeEntry. Current Work must have at most one active segment.`,
        entry,
      });
    }
  }

  for (const entry of activeEntries) {
    const age = ageMs(entry.clock_in, nowMs);
    if (age !== null && age >= TWENTY_FOUR_HOURS) {
      exceptions.push({
        key: `forgotten:${entry.id}`,
        severity: "critical",
        icon: Clock3,
        title: "Possible missed clock-out",
        employee: entry.user_name || entry.user_email,
        detail: `Shift has remained active for ${formatAge(age)} since ${format(parseISO(entry.clock_in), "MMM d 'at' h:mm a")}. Nothing was changed automatically.`,
        entry,
      });
    }
    const linkedStates = statesByEntryId.get(entry.id) || [];
    if (linkedStates.length === 0) {
      exceptions.push({
        key: `entry-state:${entry.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Active shift is not linked to employee state",
        employee: entry.user_name || entry.user_email,
        detail: "The TimeEntry is active but no authoritative employee-state row references it. Review before another punch or correction.",
        entry,
      });
    } else if (linkedStates.length === 1 && String(linkedStates[0].user_email || "").toLowerCase() !== String(entry.user_email || "").toLowerCase()) {
      exceptions.push({
        key: `entry-state-owner:${entry.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Active shift and employee state belong to different users",
        employee: entry.user_name || entry.user_email,
        detail: `The TimeEntry belongs to ${entry.user_email}, but its authoritative state row belongs to ${linkedStates[0].user_email || "another user"}.`,
        entry,
      });
    }
  }

  for (const state of employeeStates) {
    const employee = state.user_name || state.user_email;
    if (state.status === "clocked_in" && state.active_entry_id && !activeEntryById.has(state.active_entry_id)) {
      exceptions.push({
        key: `state-entry:${state.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Employee state points to a missing active shift",
        employee,
        detail: "Authoritative employee state says Clocked In, but the referenced TimeEntry is not active or is unavailable.",
      });
    }

    const transitionTimestamp = ["clocking_in", "clocking_out"].includes(state.status)
      ? state.pending_started_at
      : ["starting_break", "ending_break"].includes(state.break_status)
        ? state.break_pending_started_at
        : ["pausing", "resuming"].includes(state.work_pause_status)
          ? state.work_pause_pending_started_at
          : null;
    const transitionAge = ageMs(transitionTimestamp, nowMs);
    if (transitionAge !== null && transitionAge >= FIVE_MINUTES) {
      exceptions.push({
        key: `transition:${state.id}`,
        severity: "warning",
        icon: RefreshCw,
        title: "Time Clock transition appears stuck",
        employee,
        detail: `${state.status !== "clocked_in" ? state.status.replaceAll("_", " ") : state.break_status !== "working" ? state.break_status.replaceAll("_", " ") : state.work_pause_status.replaceAll("_", " ")} has been pending for ${formatAge(transitionAge)}. Reload authoritative status before making manual changes.`,
      });
    }

    if (state.break_status === "on_break") {
      const breakRow = state.active_break_id ? breakById.get(state.active_break_id) : null;
      if (!breakRow) {
        exceptions.push({
          key: `missing-break:${state.id}`,
          severity: "critical",
          icon: Coffee,
          title: "Break state is missing its active break record",
          employee,
          detail: "Do not close or correct this shift until the break mismatch is reviewed.",
        });
      } else {
        const breakAge = ageMs(breakRow.started_at, nowMs);
        if (breakAge !== null && breakAge >= TWO_HOURS) {
          exceptions.push({
            key: `long-break:${breakRow.id}`,
            severity: "warning",
            icon: Coffee,
            title: "Long-running active break",
            employee,
            detail: `This break has remained active for ${formatAge(breakAge)}. This is a review reminder only; nothing is changed automatically.`,
          });
        }
      }
    }

    if (state.work_pause_status === "paused") {
      const pauseRow = state.active_work_pause_id ? pauseById.get(state.active_work_pause_id) : null;
      if (!pauseRow) {
        exceptions.push({
          key: `missing-pause:${state.id}`,
          severity: "critical",
          icon: Pause,
          title: "Work Pause state is missing its active pause record",
          employee,
          detail: "Resume/reconcile the pause before closing or correcting this shift.",
        });
      } else {
        const pauseAge = ageMs(pauseRow.started_at, nowMs);
        if (pauseAge !== null && pauseAge >= FOUR_HOURS) {
          exceptions.push({
            key: `long-pause:${pauseRow.id}`,
            severity: "warning",
            icon: Pause,
            title: "Long-running Work Pause",
            employee,
            detail: `Work Pause has remained active for ${formatAge(pauseAge)}. This is an operational reminder only and has no automatic payroll effect.`,
          });
        }
      }
    }
  }

  for (const row of activeBreaks) {
    if (!referencedBreakIds.has(row.id)) {
      exceptions.push({
        key: `orphan-break:${row.id}`,
        severity: "critical",
        icon: Coffee,
        title: "Orphaned active break record",
        employee: row.user_name || row.user_email,
        detail: "An active break exists without an authoritative employee-state reference.",
      });
    }
  }

  for (const row of activeWorkPauses) {
    if (!referencedPauseIds.has(row.id)) {
      exceptions.push({
        key: `orphan-pause:${row.id}`,
        severity: "critical",
        icon: Pause,
        title: "Orphaned active Work Pause record",
        employee: row.user_name || row.user_email,
        detail: "An active Work Pause exists without an authoritative employee-state reference.",
      });
    }
  }

  for (const request of correctionRequests) {
    exceptions.push({
      key: `correction:${request.id}`,
      severity: "info",
      icon: FileWarning,
      title: request.status === "reviewing" ? "Correction review in progress" : "Employee correction request pending",
      employee: request.user_name || request.user_email,
      detail: request.employee_reason || "A completed shift has a correction request awaiting manager review.",
    });
  }

  exceptions.sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 };
    return rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title);
  });

  const criticalCount = exceptions.filter(item => item.severity === "critical").length;
  const warningCount = exceptions.filter(item => item.severity === "warning").length;

  return (
    <div className="clay-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Needs Attention
          </h3>
          <p className="text-xs text-gray-500 mt-1">Derived from authoritative Time Clock records. Review items are never auto-corrected.</p>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">{criticalCount} critical</Badge>}
          {warningCount > 0 && <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">{warningCount} warning</Badge>}
          <Button type="button" size="sm" variant="outline" onClick={onRefresh} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {exceptions.length === 0 ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          No Time Clock exceptions currently need manager attention.
        </div>
      ) : (
        <div className="space-y-2">
          {exceptions.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.key} className={`rounded-xl border p-3 ${severityClass(item.severity)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-sm">{item.title}</p>
                        <Badge variant="outline" className={severityBadge(item.severity)}>{item.severity}</Badge>
                      </div>
                      <p className="text-xs font-medium mt-1">{item.employee}</p>
                      <p className="text-xs mt-1 opacity-90">{item.detail}</p>
                    </div>
                  </div>
                  {item.entry && typeof onReviewEntry === "function" && (
                    <Button type="button" size="sm" variant="outline" onClick={() => onReviewEntry(item.entry)} className="shrink-0 bg-white/80">
                      Review
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
