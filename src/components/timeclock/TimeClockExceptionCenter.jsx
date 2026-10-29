import { AlertTriangle, Briefcase, Clock3, Coffee, FileWarning, Pause, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";

const FIVE_MINUTES = 5 * 60 * 1000;
const TWO_HOURS = 2 * 60 * 60 * 1000;
const FOUR_HOURS = 4 * 60 * 60 * 1000;
const EIGHT_HOURS = 8 * 60 * 60 * 1000;
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

function formatPunchTime(value) {
  if (!value) return "not supplied";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? format(date, "MMM d 'at' h:mm a") : "invalid reported time";
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
  punchExceptions = [],
  onReviewEntry,
  onReviewCorrection,
  onApproveEntry,
  onRefresh,
}) {
  const nowMs = Date.now();
  const activeEntries = timeEntries.filter(entry => entry.status === "clocked_in" && !entry.archived_admin && !entry.archived_test_data);
  const unresolvedPunchEntries = timeEntries.filter(entry => entry.status === "needs_resolution" && !entry.archived_admin && !entry.archived_test_data);
  const correctedNeedsReviewEntries = timeEntries.filter(entry =>
    entry.status === "clocked_out" && entry.approval_status === "needs_review" &&
    Boolean(String(entry.last_correction_request_id || "").trim()) &&
    !entry.archived_admin && !entry.archived_test_data && !entry.pay_period_id
  );
  const allEntryById = new Map(timeEntries.filter(entry => !entry.archived_admin && !entry.archived_test_data).map(entry => [entry.id, entry]));
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
  const punchCasesByEntryId = new Map();
  const pendingCorrectionByEntryId = new Map();

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
  for (const row of punchExceptions) addGrouped(punchCasesByEntryId, row.time_entry_id, row);
  for (const request of correctionRequests) {
    if (request?.time_entry_id && ["pending", "reviewing"].includes(request.status)) {
      pendingCorrectionByEntryId.set(request.time_entry_id, request);
    }
  }

  for (const entry of unresolvedPunchEntries) {
    const correctionRequest = pendingCorrectionByEntryId.get(entry.id) || null;
    exceptions.push({
      key: `punch-resolution:${entry.id}`,
      severity: "critical",
      icon: FileWarning,
      title: "Missed punch awaiting manager review",
      employee: entry.user_name || entry.user_email,
      detail: "The employee reported a missed Clock Out. The old shift is preserved with no fabricated Clock Out and is excluded from active work while its correction awaits manager review. Pay-period finalization remains blocked until it is resolved.",
      entry,
      correctionRequest,
    });
  }

  for (const entry of correctedNeedsReviewEntries) {
    exceptions.push({
      key: `corrected-shift-review:${entry.id}`,
      severity: "warning",
      icon: FileWarning,
      title: "Corrected shift awaits final approval",
      employee: entry.user_name || entry.user_email,
      detail: "The employee correction has been applied and the missed-punch review is complete, but this completed shift is still Needs Review. A separate manager shift approval is required before pay-period finalization.",
      approvalEntry: entry,
    });
  }

  for (const punchCase of punchExceptions) {
    if (!["open", "pending_manager_review", "rejected"].includes(punchCase.status)) continue;
    const entry = allEntryById.get(punchCase.time_entry_id) || null;
    if (punchCase.exception_type === "missed_clock_out" && entry?.status === "needs_resolution") continue;

    const isLateClockIn = punchCase.exception_type === "late_clock_in";
    const isMissingEntry = !entry;
    const isScheduledDetection = punchCase.exception_type === "missed_clock_out" && punchCase.status === "open" && !punchCase.employee_response && !punchCase.submitted_at;
    const title = isMissingEntry
      ? "Punch exception is missing its linked shift"
      : isLateClockIn
        ? "Missed Clock In awaiting manager review"
        : isScheduledDetection
          ? "Long-running shift detected"
          : "Missed Clock Out report needs manager follow-up";
    const detail = isMissingEntry
      ? "An auditable punch exception exists but its linked TimeEntry is not available in management data. Investigate before approving or finalizing the affected period."
      : isLateClockIn
        ? `Employee reported an earlier arrival of ${formatPunchTime(punchCase.claimed_clock_in)}. The reconstructed shift must remain Needs Review until a manager verifies it.`
        : isScheduledDetection
          ? "The scheduled monitor detected a long-running active shift. No Clock Out was created or changed; confirm with the employee before any correction."
          : `Employee reported a Clock Out of ${formatPunchTime(punchCase.claimed_clock_out)}. Review the linked shift and correction history before approval.`;

    const canApproveLateClockIn = isLateClockIn && punchCase.status === "pending_manager_review" &&
      entry?.status === "clocked_out" && entry?.approval_status === "needs_review" && !entry?.pay_period_id;
    exceptions.push({
      key: `punch-case:${punchCase.id || punchCase.case_key}`,
      severity: isMissingEntry || punchCase.status === "open" ? "critical" : "warning",
      icon: FileWarning,
      title,
      employee: punchCase.user_name || punchCase.user_email,
      detail,
      entry: canApproveLateClockIn ? null : entry,
      approvalEntry: canApproveLateClockIn ? entry : null,
    });
  }

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
    const linkedPunchCases = punchCasesByEntryId.get(entry.id) || [];
    const hasActionableMissedClockOutCase = linkedPunchCases.some(row =>
      row.exception_type === "missed_clock_out" && ["open", "pending_manager_review", "rejected"].includes(row.status)
    );
    const entryAcknowledgedMs = new Date(String(entry.stale_shift_acknowledged_at || "")).getTime();
    const hasFreshWorkedThrough = linkedPunchCases.some(row => {
      if (row.exception_type !== "missed_clock_out" || row.status !== "worked_through") return false;
      const untilMs = new Date(String(row.acknowledged_until || "")).getTime();
      return Number.isFinite(untilMs) && untilMs > nowMs;
    }) || (Number.isFinite(entryAcknowledgedMs) && (nowMs - entryAcknowledgedMs) < EIGHT_HOURS);
    if (age === null) {
      exceptions.push({
        key: `invalid-clock-in:${entry.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Active shift has an invalid clock-in time",
        employee: entry.user_name || entry.user_email,
        detail: "An unarchived TimeEntry is marked active, but its original clock-in timestamp is missing or invalid. Pay-period finalization is blocked until a manager investigates its original record. Nothing was corrected automatically.",
        entry,
      });
    }
    if (age !== null && age >= TWENTY_FOUR_HOURS && !hasActionableMissedClockOutCase && !hasFreshWorkedThrough) {
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
    const entry = state.active_entry_id ? activeEntryById.get(state.active_entry_id) : null;

    if (state.status === "clocked_in" && !state.active_entry_id) {
      exceptions.push({
        key: `state-missing-entry-id:${state.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Clocked-in state has no active shift id",
        employee,
        detail: "Authoritative employee state says Clocked In but does not reference a TimeEntry. Do not punch or correct time until reviewed.",
      });
    } else if (state.status === "clocked_in" && state.active_entry_id && !entry) {
      exceptions.push({
        key: `state-entry:${state.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Employee state points to a missing active shift",
        employee,
        detail: "Authoritative employee state says Clocked In, but the referenced TimeEntry is not active or is unavailable.",
      });
    }

    if (state.status === "clocked_out" && state.active_entry_id) {
      exceptions.push({
        key: `clocked-out-entry-ref:${state.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Clocked-out state still references a shift",
        employee,
        detail: "Employee state is Clocked Out but active_entry_id is still populated. Review the state before the next punch.",
        entry,
      });
    }

    if (entry && String(entry.user_email || "").toLowerCase() !== String(state.user_email || "").toLowerCase()) {
      exceptions.push({
        key: `state-entry-user:${state.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Employee state references another user's shift",
        employee,
        detail: `State belongs to ${state.user_email || "this employee"}, but the referenced TimeEntry belongs to ${entry.user_email || "another user"}.`,
        entry,
      });
    }

    const transitionParts = [];
    if (["clocking_in", "clocking_out"].includes(state.status)) transitionParts.push({ label: state.status, timestamp: state.pending_started_at });
    if (["starting_break", "ending_break"].includes(state.break_status)) transitionParts.push({ label: state.break_status, timestamp: state.break_pending_started_at });
    if (["pausing", "resuming"].includes(state.work_pause_status)) transitionParts.push({ label: state.work_pause_status, timestamp: state.work_pause_pending_started_at });
    if (["starting", "changing", "stopping"].includes(state.labor_status)) transitionParts.push({ label: `current work ${state.labor_status}`, timestamp: state.labor_pending_started_at });

    if (transitionParts.length > 1) {
      exceptions.push({
        key: `overlapping-transition:${state.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Multiple Time Clock transitions are active",
        employee,
        detail: `Authoritative state has overlapping transitions (${transitionParts.map(part => part.label.replaceAll("_", " ")).join(", ")}). These actions should be serialized.`,
        entry,
      });
    }

    for (const transitionPart of transitionParts) {
      const transitionAge = ageMs(transitionPart.timestamp, nowMs);
      if (transitionAge !== null && transitionAge >= FIVE_MINUTES) {
        exceptions.push({
          key: `transition:${state.id}:${transitionPart.label}`,
          severity: "warning",
          icon: RefreshCw,
          title: "Time Clock transition appears stuck",
          employee,
          detail: `${transitionPart.label.replaceAll("_", " ")} has been pending for ${formatAge(transitionAge)}. Reload authoritative status before making manual changes.`,
          entry,
        });
      }
    }

    if (state.break_status === "on_break" && state.work_pause_status === "paused") {
      exceptions.push({
        key: `break-pause-overlap:${state.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Break and Work Pause are active together",
        employee,
        detail: "Break and Work Pause are mutually exclusive. Review the authoritative records before resuming or closing this shift.",
        entry,
      });
    }

    if (state.break_status === "working" && state.active_break_id) {
      exceptions.push({
        key: `working-break-ref:${state.id}`,
        severity: "critical",
        icon: Coffee,
        title: "Working state still references an active break",
        employee,
        detail: "Break status is Working but active_break_id is still populated. Review the break/state relationship before the next action.",
        entry,
      });
    }

    if (state.work_pause_status === "working" && state.active_work_pause_id) {
      exceptions.push({
        key: `working-pause-ref:${state.id}`,
        severity: "critical",
        icon: Pause,
        title: "Working state still references an active Work Pause",
        employee,
        detail: "Work Pause status is Working but active_work_pause_id is still populated. Review the pause/state relationship before the next action.",
        entry,
      });
    }

    if (state.status !== "clocked_in" && (state.active_break_id || state.active_work_pause_id)) {
      exceptions.push({
        key: `nonactive-substate-ref:${state.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Non-active shift state still references Break/Work Pause",
        employee,
        detail: "Break or Work Pause references remain while the employee is not in stable Clocked In state.",
        entry,
      });
    }

    const activeLaborRows = state.active_entry_id ? (laborByEntryId.get(state.active_entry_id) || []) : [];
    if (activeLaborRows.length > 0 && (state.break_status === "on_break" || state.work_pause_status === "paused")) {
      exceptions.push({
        key: `labor-substate-overlap:${state.id}`,
        severity: "critical",
        icon: Briefcase,
        title: "Current Work remained active during Break/Work Pause",
        employee,
        detail: "Break and Work Pause must end the active Current Work segment. An active labor segment still exists for this shift.",
        entry,
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
      } else if (String(breakRow.user_email || "").toLowerCase() !== String(state.user_email || "").toLowerCase() || breakRow.time_entry_id !== state.active_entry_id) {
        exceptions.push({
          key: `break-owner:${state.id}`,
          severity: "critical",
          icon: Coffee,
          title: "Break record does not match its employee shift",
          employee,
          detail: "The referenced active break belongs to a different employee or TimeEntry than the authoritative state row.",
          entry,
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
            entry,
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
      } else if (String(pauseRow.user_email || "").toLowerCase() !== String(state.user_email || "").toLowerCase() || pauseRow.time_entry_id !== state.active_entry_id) {
        exceptions.push({
          key: `pause-owner:${state.id}`,
          severity: "critical",
          icon: Pause,
          title: "Work Pause record does not match its employee shift",
          employee,
          detail: "The referenced active Work Pause belongs to a different employee or TimeEntry than the authoritative state row.",
          entry,
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
            entry,
          });
        }
      }
    }
  }

  for (const row of activeBreaks) {
    const entry = activeEntryById.get(row.time_entry_id);
    const referencingState = employeeStates.find(state => state.active_break_id === row.id) || null;
    if (!referencedBreakIds.has(row.id)) {
      exceptions.push({
        key: `orphan-break:${row.id}`,
        severity: "critical",
        icon: Coffee,
        title: "Orphaned active break record",
        employee: row.user_name || row.user_email,
        detail: "An active break exists without an authoritative employee-state reference.",
        entry,
      });
    }
    if (!entry || String(entry.user_email || "").toLowerCase() !== String(row.user_email || "").toLowerCase()) {
      exceptions.push({
        key: `break-entry:${row.id}`,
        severity: "critical",
        icon: Coffee,
        title: "Active break is not linked to its employee's active shift",
        employee: row.user_name || row.user_email,
        detail: "The active break references a missing/inactive TimeEntry or a TimeEntry owned by another employee.",
        entry,
      });
    }
    if (referencingState && (referencingState.active_entry_id !== row.time_entry_id || String(referencingState.user_email || "").toLowerCase() !== String(row.user_email || "").toLowerCase())) {
      exceptions.push({
        key: `break-state-link:${row.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Active break and employee state linkage disagree",
        employee: row.user_name || row.user_email,
        detail: "The state row referencing this break points to a different TimeEntry or employee.",
        entry,
      });
    }
  }

  for (const row of activeWorkPauses) {
    const entry = activeEntryById.get(row.time_entry_id);
    const referencingState = employeeStates.find(state => state.active_work_pause_id === row.id) || null;
    if (!referencedPauseIds.has(row.id)) {
      exceptions.push({
        key: `orphan-pause:${row.id}`,
        severity: "critical",
        icon: Pause,
        title: "Orphaned active Work Pause record",
        employee: row.user_name || row.user_email,
        detail: "An active Work Pause exists without an authoritative employee-state reference.",
        entry,
      });
    }
    if (!entry || String(entry.user_email || "").toLowerCase() !== String(row.user_email || "").toLowerCase()) {
      exceptions.push({
        key: `pause-entry:${row.id}`,
        severity: "critical",
        icon: Pause,
        title: "Active Work Pause is not linked to its employee's active shift",
        employee: row.user_name || row.user_email,
        detail: "The active Work Pause references a missing/inactive TimeEntry or a TimeEntry owned by another employee.",
        entry,
      });
    }
    if (referencingState && (referencingState.active_entry_id !== row.time_entry_id || String(referencingState.user_email || "").toLowerCase() !== String(row.user_email || "").toLowerCase())) {
      exceptions.push({
        key: `pause-state-link:${row.id}`,
        severity: "critical",
        icon: ShieldAlert,
        title: "Active Work Pause and employee state linkage disagree",
        employee: row.user_name || row.user_email,
        detail: "The state row referencing this Work Pause points to a different TimeEntry or employee.",
        entry,
      });
    }
  }

  for (const row of activeLaborSegments) {
    const entry = activeEntryById.get(row.time_entry_id);
    const linkedStates = statesByEntryId.get(row.time_entry_id) || [];
    if (!entry || String(entry.user_email || "").toLowerCase() !== String(row.user_email || "").toLowerCase()) {
      exceptions.push({
        key: `orphan-labor:${row.id}`,
        severity: "critical",
        icon: Briefcase,
        title: "Orphaned active Current Work segment",
        employee: row.user_name || row.user_email,
        detail: "An active labor segment references a missing/inactive TimeEntry or a TimeEntry owned by another employee.",
        entry,
      });
      continue;
    }
    if (linkedStates.length === 0) {
      exceptions.push({
        key: `labor-state:${row.id}`,
        severity: "critical",
        icon: Briefcase,
        title: "Active Current Work has no authoritative employee state",
        employee: row.user_name || row.user_email,
        detail: "The labor segment belongs to an active shift, but no employee-state row references that TimeEntry.",
        entry,
      });
    } else if (linkedStates.length === 1) {
      const state = linkedStates[0];
      if (state.status !== "clocked_in") {
        exceptions.push({
          key: `labor-nonactive-state:${row.id}`,
          severity: "critical",
          icon: Briefcase,
          title: "Current Work remains active while shift state is not Clocked In",
          employee: row.user_name || row.user_email,
          detail: `Authoritative state is ${String(state.status || "unknown").replaceAll("_", " ")} while this labor segment remains active.`,
          entry,
        });
      }
      if (state.break_status === "on_break" || state.work_pause_status === "paused") {
        exceptions.push({
          key: `labor-stable-substate:${row.id}`,
          severity: "critical",
          icon: Briefcase,
          title: "Current Work conflicts with Break/Work Pause state",
          employee: row.user_name || row.user_email,
          detail: "An active labor segment exists while authoritative state says the employee is on Break or Work Paused.",
          entry,
        });
      }
    }
  }

  for (const request of correctionRequests) {
    if (request?.time_entry_id && unresolvedPunchEntries.some(entry => entry.id === request.time_entry_id)) continue;
    exceptions.push({
      key: `correction:${request.id}`,
      severity: "info",
      icon: FileWarning,
      title: request.status === "reviewing" ? "Correction review in progress" : "Employee correction request pending",
      employee: request.user_name || request.user_email,
      detail: request.employee_reason || "A completed shift has a correction request awaiting manager review.",
      correctionRequest: request,
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
                        {(() => {
                          const ageTs = Date.parse(item.correctionRequest?.created_date || item.punchCase?.submitted_at || item.punchCase?.created_date || item.entry?.clock_in || item.approvalEntry?.clock_in || "");
                          if (!Number.isFinite(ageTs) || (nowMs - ageTs) <= 48 * 3600e3) return null;
                          const days = Math.floor((nowMs - ageTs) / 86400e3);
                          return <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-900">{days >= 1 ? `${days}d` : "48h+"} unreviewed</Badge>;
                        })()}
                      </div>
                      <p className="text-xs font-medium mt-1">{item.employee}</p>
                      <p className="text-xs mt-1 opacity-90">{item.detail}</p>
                    </div>
                  </div>
                  {item.correctionRequest && typeof onReviewCorrection === "function" ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => onReviewCorrection(item.correctionRequest)} className="shrink-0 bg-white/80">
                      Review Correction
                    </Button>
                  ) : item.approvalEntry && typeof onApproveEntry === "function" ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => onApproveEntry(item.approvalEntry)} className="shrink-0 bg-white/80 text-green-700">
                      Approve Shift
                    </Button>
                  ) : item.entry && typeof onReviewEntry === "function" ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => onReviewEntry(item.entry)} className="shrink-0 bg-white/80">
                      Review Shift
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}